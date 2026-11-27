import { eq } from 'drizzle-orm';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createServer, type Server as HttpServer } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/infrastructure/database/schema';
import {
  createIntegrationTestContext,
  extractSessionCookies,
  loginAsOtp,
  teardownIntegrationTestContext,
  TEST_PHONES,
  type TestContext,
} from './helpers/test-app';

async function startMockOidcProvider(opts: {
  email: string;
  emailVerified: boolean;
  sub: string;
}) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'test-key-1';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';

  const authCodes = new Map<string, { nonce: string }>();
  let issuerUrl = '';

  const server: HttpServer = createServer(async (req, res) => {
    const reqUrl = new URL(req.url ?? '/', issuerUrl || 'http://127.0.0.1');

    if (reqUrl.pathname === '/.well-known/openid-configuration') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          issuer: issuerUrl,
          authorization_endpoint: `${issuerUrl}/authorize`,
          token_endpoint: `${issuerUrl}/token`,
          jwks_uri: `${issuerUrl}/jwks`,
        }),
      );
      return;
    }

    if (reqUrl.pathname === '/jwks') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }

    if (reqUrl.pathname === '/token' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const bodyParams = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      const code = bodyParams.get('code') ?? '';
      const stored = authCodes.get(code);
      if (!stored) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }
      authCodes.delete(code);

      const idToken = await new SignJWT({
        email: opts.email,
        email_verified: opts.emailVerified,
        nonce: stored.nonce,
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
        .setIssuer(issuerUrl)
        .setAudience('test-portal-client')
        .setSubject(opts.sub)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'Bearer',
          id_token: idToken,
        }),
      );
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  issuerUrl = `http://127.0.0.1:${port}`;

  return {
    issuerUrl,
    issueAuthCode: (nonce: string) => {
      const code = `mock-code-${Math.random().toString(36).slice(2)}`;
      authCodes.set(code, { nonce });
      return code;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe('Auth (OIDC SSO + SMS OTP), Provisioning Gating, Surface Isolation & CSRF (Integration)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createIntegrationTestContext();
  });

  afterAll(async () => {
    if (ctx) await teardownIntegrationTestContext(ctx);
  });

  it('blocks unprovisioned phone numbers and cross-surface actors from requesting OTP', async () => {
    // Unknown phone cannot request OTP -> 403 PROFILE_NOT_PROVISIONED
    const unknownRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/portal/otp/request')
      .set('X-App-Surface', 'portal')
      .send({ phone: '+989129999999' })
      .expect(403);
    expect(unknownRes.body.error.code).toBe('PROFILE_NOT_PROVISIONED');
    expect(await ctx.redis.get('test:last_otp:+989129999999')).toBeNull();

    // Employee phone rejected on portal surface -> 403
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/portal/otp/request')
      .set('X-App-Surface', 'portal')
      .send({ phone: TEST_PHONES.admin })
      .expect(403);

    // Customer phone rejected on admin surface -> 403
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/admin/otp/request')
      .set('X-App-Surface', 'admin')
      .send({ phone: TEST_PHONES.custAAdmin })
      .expect(403);
  });

  it('rejects suspended profiles from requesting OTP', async () => {
    await ctx.db
      .update(schema.users)
      .set({ status: 'suspended' })
      .where(eq(schema.users.id, ctx.ids.custBAdminUserId));

    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/portal/otp/request')
      .set('X-App-Surface', 'portal')
      .send({ phone: TEST_PHONES.custBAdmin })
      .expect(403);

    await ctx.db
      .update(schema.users)
      .set({ status: 'active' })
      .where(eq(schema.users.id, ctx.ids.custBAdminUserId));
  });

  it('isolates portal and admin cookies and rejects cross-surface tokens', async () => {
    const portalSession = await loginAsOtp(ctx, 'portal', TEST_PHONES.custAAdmin);
    const adminSession = await loginAsOtp(ctx, 'admin', TEST_PHONES.admin);

    await request(ctx.app.getHttpServer())
      .get('/api/v1/customers')
      .set('X-App-Surface', 'admin')
      .set('Cookie', portalSession.cookieHeader)
      .expect(401);

    await request(ctx.app.getHttpServer())
      .get('/api/v1/customers')
      .set('X-App-Surface', 'portal')
      .set('Cookie', portalSession.cookieHeader)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get('/api/v1/customers')
      .set('X-App-Surface', 'admin')
      .set('Cookie', adminSession.cookieHeader)
      .expect(200);
  });

  it('enforces CSRF double-submit token on state-changing mutations', async () => {
    const portalSession = await loginAsOtp(ctx, 'portal', TEST_PHONES.custAAdmin);

    await request(ctx.app.getHttpServer())
      .patch('/api/v1/profile')
      .set('X-App-Surface', 'portal')
      .set('Cookie', portalSession.cookieHeader)
      .send({ fullName: 'Updated Without CSRF' })
      .expect(403);

    const okRes = await request(ctx.app.getHttpServer())
      .patch('/api/v1/profile')
      .set('X-App-Surface', 'portal')
      .set('Cookie', portalSession.cookieHeader)
      .set('X-CSRF-Token', portalSession.csrfToken)
      .send({ fullName: 'Apex Admin Verified' })
      .expect(200);

    expect(okRes.body.data.fullName).toBe('Apex Admin Verified');
  });

  it('rotates refresh tokens and revokes entire session family on replay', async () => {
    const initial = await loginAsOtp(ctx, 'portal', TEST_PHONES.custAAdmin);

    const refreshRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/portal/refresh')
      .set('X-App-Surface', 'portal')
      .set('Cookie', initial.cookieHeader)
      .set('X-CSRF-Token', initial.csrfToken)
      .expect(200);

    const rotated = extractSessionCookies(refreshRes, 'portal');
    expect(rotated.cookies.portal_refresh_token).toBeDefined();
    expect(rotated.cookies.portal_refresh_token).not.toBe(initial.cookies.portal_refresh_token);

    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/portal/refresh')
      .set('X-App-Surface', 'portal')
      .set('Cookie', initial.cookieHeader)
      .set('X-CSRF-Token', initial.csrfToken)
      .expect(401);

    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/portal/refresh')
      .set('X-App-Surface', 'portal')
      .set('Cookie', rotated.cookieHeader)
      .set('X-CSRF-Token', rotated.csrfToken)
      .expect(401);
  });

  it('invalidates OTP after 5 failed attempts and rate-limits repeated OTP requests', async () => {
    const targetPhone = '+989120000004';
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/portal/otp/request')
      .set('X-App-Surface', 'portal')
      .send({ phone: targetPhone })
      .expect(200);

    // Resend immediately -> 429 OTP_COOLDOWN
    const cooldownRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/portal/otp/request')
      .set('X-App-Surface', 'portal')
      .send({ phone: targetPhone })
      .expect(429);
    expect(cooldownRes.body.error.code).toBe('OTP_COOLDOWN');

    // 5 wrong OTP attempts invalidate the code
    for (let i = 0; i < 5; i++) {
      await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/portal/otp/verify')
        .set('X-App-Surface', 'portal')
        .send({ phone: targetPhone, code: '000000' })
        .expect(401);
    }

    const expiredRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/portal/otp/verify')
      .set('X-App-Surface', 'portal')
      .send({ phone: targetPhone, code: '000000' })
      .expect(401);
    expect(expiredRes.body.error.code).toBe('OTP_EXPIRED');

    // Repeated unprovisioned OTP requests rate-limit at 429
    for (let i = 0; i < 5; i++) {
      await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/portal/otp/request')
        .set('X-App-Surface', 'portal')
        .send({ phone: '+989128888888' })
        .expect(403);
    }
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/portal/otp/request')
      .set('X-App-Surface', 'portal')
      .send({ phone: '+989128888888' })
      .expect(429);
  });

  it('completes OIDC PKCE SSO for provisioned user and rejects unprovisioned SSO identity', async () => {
    const provisionedIdp = await startMockOidcProvider({
      email: 'admin@apex.test',
      emailVerified: true,
      sub: 'oidc-sub-apex-admin',
    });

    const oidcCtx = await createIntegrationTestContext({
      oidc: {
        enabled: true,
        issuerUrl: provisionedIdp.issuerUrl,
        clientId: 'test-portal-client',
      },
    });

    try {
      const methodsRes = await request(oidcCtx.app.getHttpServer())
        .get('/api/v1/auth/portal/methods')
        .expect(200);
      expect(methodsRes.body.data.ssoEnabled).toBe(true);

      const startRes = await request(oidcCtx.app.getHttpServer())
        .get('/api/v1/auth/portal/sso/start')
        .expect(302);
      const authRedirect = new URL(startRes.headers.location as string);
      const state = authRedirect.searchParams.get('state')!;
      const nonce = authRedirect.searchParams.get('nonce')!;
      const code = provisionedIdp.issueAuthCode(nonce);

      const cbRes = await request(oidcCtx.app.getHttpServer())
        .get(`/api/v1/auth/portal/sso/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`)
        .expect(302);
      expect(cbRes.headers.location).toBe('http://localhost:3000/');

      const ssoSession = extractSessionCookies(cbRes, 'portal');
      expect(ssoSession.cookies.portal_access_token).toBeDefined();

      const meRes = await request(oidcCtx.app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('X-App-Surface', 'portal')
        .set('Cookie', ssoSession.cookieHeader)
        .expect(200);
      expect(meRes.body.data.email).toBe('admin@apex.test');
    } finally {
      await teardownIntegrationTestContext(oidcCtx);
      await provisionedIdp.close();
    }

    // Now test unprovisioned OIDC user -> rejected cleanly with PROFILE_NOT_PROVISIONED
    const unprovisionedIdp = await startMockOidcProvider({
      email: 'outsider@stranger.test',
      emailVerified: true,
      sub: 'oidc-sub-outsider',
    });
    const unprovCtx = await createIntegrationTestContext({
      oidc: {
        enabled: true,
        issuerUrl: unprovisionedIdp.issuerUrl,
        clientId: 'test-portal-client',
      },
    });

    try {
      const startRes = await request(unprovCtx.app.getHttpServer())
        .get('/api/v1/auth/portal/sso/start')
        .expect(302);
      const authRedirect = new URL(startRes.headers.location as string);
      const state = authRedirect.searchParams.get('state')!;
      const nonce = authRedirect.searchParams.get('nonce')!;
      const code = unprovisionedIdp.issueAuthCode(nonce);

      const cbRes = await request(unprovCtx.app.getHttpServer())
        .get(`/api/v1/auth/portal/sso/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`)
        .expect(302);
      expect(cbRes.headers.location).toContain('/login?error=PROFILE_NOT_PROVISIONED');
      const cookies = extractSessionCookies(cbRes, 'portal');
      expect(cookies.cookies.portal_access_token).toBeUndefined();
    } finally {
      await teardownIntegrationTestContext(unprovCtx);
      await unprovisionedIdp.close();
    }
  });
});
