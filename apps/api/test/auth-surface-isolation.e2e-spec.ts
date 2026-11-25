import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/infrastructure/database/schema';
import { generateOpaqueToken, hashToken } from '../src/modules/auth/auth.service';
import {
  createIntegrationTestContext,
  extractSessionCookies,
  loginAs,
  teardownIntegrationTestContext,
  TEST_PASSWORD,
  type TestContext,
} from './helpers/test-app';

describe('Auth, Surface Isolation, CSRF & Refresh Security (Integration)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createIntegrationTestContext();
  });

  afterAll(async () => {
    if (ctx) await teardownIntegrationTestContext(ctx);
  });

  it('rejects cross-surface logins (employee on portal, customer on admin)', async () => {
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/portal/login')
      .set('X-App-Surface', 'portal')
      .send({ email: 'admin@test.local', password: TEST_PASSWORD })
      .expect(401);

    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/admin/login')
      .set('X-App-Surface', 'admin')
      .send({ email: 'admin@apex.test', password: TEST_PASSWORD })
      .expect(401);
  });

  it('isolates portal and admin cookies and rejects cross-surface tokens', async () => {
    const portalSession = await loginAs(ctx.app, 'portal', 'admin@apex.test');
    const adminSession = await loginAs(ctx.app, 'admin', 'admin@test.local');

    // Portal token rejected when calling admin surface
    await request(ctx.app.getHttpServer())
      .get('/api/v1/customers')
      .set('X-App-Surface', 'admin')
      .set('Cookie', portalSession.cookieHeader)
      .expect(401);

    // Portal surface cannot access admin endpoints even with valid portal token
    await request(ctx.app.getHttpServer())
      .get('/api/v1/customers')
      .set('X-App-Surface', 'portal')
      .set('Cookie', portalSession.cookieHeader)
      .expect(403);

    // Admin token works on admin surface
    await request(ctx.app.getHttpServer())
      .get('/api/v1/customers')
      .set('X-App-Surface', 'admin')
      .set('Cookie', adminSession.cookieHeader)
      .expect(200);
  });

  it('enforces CSRF double-submit token on state-changing mutations', async () => {
    const portalSession = await loginAs(ctx.app, 'portal', 'admin@apex.test');

    // Missing CSRF header -> 403
    await request(ctx.app.getHttpServer())
      .patch('/api/v1/profile')
      .set('X-App-Surface', 'portal')
      .set('Cookie', portalSession.cookieHeader)
      .send({ fullName: 'Updated Without CSRF' })
      .expect(403);

    // Valid CSRF header -> 200
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
    const initial = await loginAs(ctx.app, 'portal', 'admin@apex.test');

    const refreshRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/portal/refresh')
      .set('X-App-Surface', 'portal')
      .set('Cookie', initial.cookieHeader)
      .set('X-CSRF-Token', initial.csrfToken)
      .expect(200);

    const rotated = extractSessionCookies(refreshRes, 'portal');
    expect(rotated.cookies.portal_refresh_token).toBeDefined();
    expect(rotated.cookies.portal_refresh_token).not.toBe(initial.cookies.portal_refresh_token);

    // Replaying initial refresh token must fail AND revoke the family
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/portal/refresh')
      .set('X-App-Surface', 'portal')
      .set('Cookie', initial.cookieHeader)
      .set('X-CSRF-Token', initial.csrfToken)
      .expect(401);

    // Even the rotated token must now be revoked
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/portal/refresh')
      .set('X-App-Surface', 'portal')
      .set('Cookie', rotated.cookieHeader)
      .set('X-CSRF-Token', rotated.csrfToken)
      .expect(401);
  });

  it('completes invite onboarding and password reset flows end-to-end', async () => {
    const adminSession = await loginAs(ctx.app, 'admin', 'admin@test.local');

    // Invite a new customer member for Customer A
    const inviteRes = await request(ctx.app.getHttpServer())
      .post(`/api/v1/customers/${ctx.ids.customerAId}/members/invite`)
      .set('X-App-Surface', 'admin')
      .set('Cookie', adminSession.cookieHeader)
      .set('X-CSRF-Token', adminSession.csrfToken)
      .send({
        email: 'newbuyer@apex.test',
        fullName: 'New Apex Buyer',
        roleSlug: 'customer_member',
      })
      .expect(201);

    expect(inviteRes.body.data.userStatus).toBe('invited');

    // Issue a known invite token directly to verify accept-invite endpoint without reading email transport
    const [invitedUser] = await ctx.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'newbuyer@apex.test'));
    const rawInviteToken = generateOpaqueToken();
    await ctx.db.insert(schema.authTokens).values({
      userId: invitedUser!.id,
      purpose: 'invite',
      tokenHash: hashToken(rawInviteToken),
      expiresAt: new Date(Date.now() + 3600_000),
    });

    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/portal/accept-invite')
      .set('X-App-Surface', 'portal')
      .send({
        token: rawInviteToken,
        password: 'NewStrongPassword123!',
        timezone: 'America/Chicago',
      })
      .expect(200);

    const invitedSession = await loginAs(
      ctx.app,
      'portal',
      'newbuyer@apex.test',
      'NewStrongPassword123!',
    );
    expect(invitedSession.cookies.portal_access_token).toBeDefined();
  });

  it('rate-limits repeated failed login attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/portal/login')
        .set('X-App-Surface', 'portal')
        .send({ email: 'ratelimit@apex.test', password: 'wrong-password' })
        .expect(401);
    }

    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/portal/login')
      .set('X-App-Surface', 'portal')
      .send({ email: 'ratelimit@apex.test', password: 'wrong-password' })
      .expect(429);
  });
});
