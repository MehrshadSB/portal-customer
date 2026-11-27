import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppSurface, AuthMethodsDto } from '@portal/types';
import { and, eq, isNull, sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import {
  type AuthenticatedActor,
  expectedUserTypeForSurface,
  type RequestMetadata,
} from '../../common/types/auth-context';
import type { AppEnv } from '../../infrastructure/config/env.schema';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import { userIdentities, users } from '../../infrastructure/database/schema';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { AuditService } from '../audit/audit.service';
import { AuthStateService } from './auth-state.service';

interface OidcDiscoveryDoc {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

interface OidcTransaction {
  surface: AppSurface;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  issuer: string;
}

const OIDC_TX_TTL_SECONDS = 300;
const DISCOVERY_CACHE_MS = 5 * 60 * 1000;

@Injectable()
export class OidcService {
  private readonly discoveryCache = new Map<
    string,
    { doc: OidcDiscoveryDoc; jwks: ReturnType<typeof createRemoteJWKSet>; fetchedAt: number }
  >();

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly authStateService: AuthStateService,
    private readonly auditService: AuditService,
  ) {}

  private isEnabled(): boolean {
    const enabled = this.config.get('OIDC_ENABLED', { infer: true });
    const issuer = this.config.get('OIDC_ISSUER_URL', { infer: true });
    const clientId = this.config.get('OIDC_CLIENT_ID', { infer: true });
    return Boolean(enabled && issuer && clientId);
  }

  getAuthMethods(): AuthMethodsDto {
    return {
      ssoEnabled: this.isEnabled(),
      otpEnabled: true,
      providerLabel: this.config.get('OIDC_PROVIDER_LABEL', { infer: true }),
    };
  }

  getSurfaceBaseUrl(surface: AppSurface): string {
    return surface === 'portal'
      ? this.config.get('PORTAL_URL', { infer: true })
      : this.config.get('ADMIN_URL', { infer: true });
  }

  private getCallbackUrl(surface: AppSurface): string {
    return `${this.getSurfaceBaseUrl(surface).replace(/\/$/, '')}/api/v1/auth/${surface}/sso/callback`;
  }

  private txKey(state: string): string {
    return `oidc:tx:${state}`;
  }

  private async getDiscovery(): Promise<{
    doc: OidcDiscoveryDoc;
    jwks: ReturnType<typeof createRemoteJWKSet>;
  }> {
    const issuerUrl = (this.config.get('OIDC_ISSUER_URL', { infer: true }) ?? '').replace(/\/$/, '');
    if (!this.isEnabled() || !issuerUrl) {
      throw new ServiceUnavailableException({
        code: 'SSO_NOT_CONFIGURED',
        message: 'OIDC Single Sign-On is not configured on this server',
      });
    }

    const cached = this.discoveryCache.get(issuerUrl);
    if (cached && Date.now() - cached.fetchedAt < DISCOVERY_CACHE_MS) {
      return { doc: cached.doc, jwks: cached.jwks };
    }

    const discoveryUrl = `${issuerUrl}/.well-known/openid-configuration`;
    const res = await fetch(discoveryUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      throw new ServiceUnavailableException({
        code: 'SSO_DISCOVERY_FAILED',
        message: 'Unable to contact SSO identity provider',
      });
    }
    const doc = (await res.json()) as OidcDiscoveryDoc;
    if (!doc.issuer || !doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
      throw new ServiceUnavailableException({
        code: 'SSO_DISCOVERY_INVALID',
        message: 'SSO discovery document is missing required endpoints',
      });
    }

    const jwks = createRemoteJWKSet(new URL(doc.jwks_uri));
    this.discoveryCache.set(issuerUrl, { doc, jwks, fetchedAt: Date.now() });
    return { doc, jwks };
  }

  async startAuthorization(surface: AppSurface): Promise<string> {
    const { doc } = await this.getDiscovery();
    const clientId = this.config.get('OIDC_CLIENT_ID', { infer: true }) ?? '';
    const scopes = this.config.get('OIDC_SCOPES', { infer: true });
    const redirectUri = this.getCallbackUrl(surface);

    const state = randomBytes(24).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

    const tx: OidcTransaction = {
      surface,
      codeVerifier,
      nonce,
      redirectUri,
      issuer: doc.issuer,
    };

    await this.redis.set(this.txKey(state), JSON.stringify(tx), 'EX', OIDC_TX_TTL_SECONDS);

    const authUrl = new URL(doc.authorization_endpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    return authUrl.toString();
  }

  async verifyCallback(
    surface: AppSurface,
    query: { code?: string; state?: string; error?: string },
    meta: RequestMetadata,
  ): Promise<{
    user: { id: string; userType: 'employee' | 'customer'; tokenVersion: number };
    actor: AuthenticatedActor;
  }> {
    if (query.error) {
      throw new UnauthorizedException({
        code: 'SSO_FAILED',
        message: `SSO provider returned error: ${query.error}`,
      });
    }

    if (!query.code || !query.state) {
      throw new UnauthorizedException({
        code: 'SSO_INVALID_CALLBACK',
        message: 'Missing authorization code or state parameter',
      });
    }

    const rawTx = await this.redis.getdel(this.txKey(query.state));
    if (!rawTx) {
      throw new UnauthorizedException({
        code: 'SSO_STATE_INVALID',
        message: 'SSO login session expired or already used',
      });
    }

    const tx = JSON.parse(rawTx) as OidcTransaction;
    if (tx.surface !== surface) {
      throw new UnauthorizedException({
        code: 'SSO_SURFACE_MISMATCH',
        message: 'SSO callback surface does not match initiating surface',
      });
    }

    const { doc, jwks } = await this.getDiscovery();
    const clientId = this.config.get('OIDC_CLIENT_ID', { infer: true }) ?? '';
    const clientSecret = this.config.get('OIDC_CLIENT_SECRET', { infer: true }) ?? '';

    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: query.code,
      redirect_uri: tx.redirectUri,
      client_id: clientId,
      code_verifier: tx.codeVerifier,
    });
    if (clientSecret) {
      tokenBody.set('client_secret', clientSecret);
    }

    const tokenRes = await fetch(doc.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
      signal: AbortSignal.timeout(8000),
    });

    if (!tokenRes.ok) {
      throw new UnauthorizedException({
        code: 'SSO_TOKEN_EXCHANGE_FAILED',
        message: 'Failed to exchange SSO authorization code',
      });
    }

    const tokenJson = (await tokenRes.json()) as { id_token?: string };
    if (!tokenJson.id_token) {
      throw new UnauthorizedException({
        code: 'SSO_MISSING_ID_TOKEN',
        message: 'SSO provider did not return an ID token',
      });
    }

    const { payload } = await jwtVerify(tokenJson.id_token, jwks, {
      issuer: doc.issuer,
      audience: clientId,
    });

    if (payload.nonce !== tx.nonce) {
      throw new UnauthorizedException({
        code: 'SSO_NONCE_INVALID',
        message: 'SSO ID token nonce verification failed',
      });
    }

    if (Array.isArray(payload.aud) && payload.azp !== clientId) {
      throw new UnauthorizedException({
        code: 'SSO_AUDIENCE_INVALID',
        message: 'SSO authorized party mismatch',
      });
    }

    const subject = typeof payload.sub === 'string' ? payload.sub : '';
    if (!subject) {
      throw new UnauthorizedException({
        code: 'SSO_SUBJECT_MISSING',
        message: 'SSO token is missing subject identifier',
      });
    }

    const emailClaim = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
    const emailVerified = payload.email_verified === true;
    const expectedType = expectedUserTypeForSurface(surface);

    const [linked] = await this.db
      .select()
      .from(userIdentities)
      .where(
        and(
          eq(userIdentities.provider, 'oidc'),
          eq(userIdentities.issuer, doc.issuer),
          eq(userIdentities.subject, subject),
        ),
      );

    let matchedUser: typeof users.$inferSelect | undefined;
    if (linked) {
      const [found] = await this.db
        .select()
        .from(users)
        .where(
          and(
            eq(users.id, linked.userId),
            eq(users.userType, expectedType),
            isNull(users.deletedAt),
          ),
        );
      matchedUser = found;
    } else if (emailClaim && emailVerified) {
      const [found] = await this.db
        .select()
        .from(users)
        .where(
          and(
            sql`lower(${users.email}) = ${emailClaim}`,
            eq(users.userType, expectedType),
            isNull(users.deletedAt),
          ),
        );
      matchedUser = found;
    }

    if (!matchedUser) {
      await this.auditService.record({
        actorUserId: null,
        actorType: expectedType,
        action: 'auth.sso_rejected_unprovisioned',
        entityType: 'user',
        summary: `Rejected ${surface} SSO sign-in for unprovisioned identity (${emailClaim ?? subject})`,
        meta,
      });

      throw new ForbiddenException({
        code: 'PROFILE_NOT_PROVISIONED',
        message: 'No active profile exists for this SSO account. Contact an administrator.',
      });
    }

    await this.authStateService.invalidateUser(matchedUser.id);
    const actor = await this.authStateService.getActiveActor(matchedUser.id, surface);
    if (!actor) {
      await this.auditService.record({
        actorUserId: matchedUser.id,
        actorType: expectedType,
        action: 'auth.sso_rejected_inactive',
        entityType: 'user',
        entityId: matchedUser.id,
        summary: `Rejected ${surface} SSO sign-in for inactive/suspended profile`,
        meta,
      });

      throw new ForbiddenException({
        code: 'PROFILE_NOT_PROVISIONED',
        message: 'Your profile or organization is inactive. Contact an administrator.',
      });
    }

    if (linked) {
      await this.db
        .update(userIdentities)
        .set({ lastUsedAt: new Date() })
        .where(eq(userIdentities.id, linked.id));
    } else {
      await this.db
        .insert(userIdentities)
        .values({
          userId: matchedUser.id,
          provider: 'oidc',
          issuer: doc.issuer,
          subject,
          emailAtLink: emailClaim,
          lastUsedAt: new Date(),
        })
        .onConflictDoNothing();
    }

    return {
      user: {
        id: matchedUser.id,
        userType: matchedUser.userType,
        tokenVersion: matchedUser.tokenVersion,
      },
      actor,
    };
  }
}
