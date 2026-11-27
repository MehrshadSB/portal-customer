import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AppSurface, AuthMethodsDto, OtpRequestResponseDto } from '@portal/types';
import type { RequestOtpInput, UpdateProfileInput, VerifyOtpInput } from '@portal/validators';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Response } from 'express';
import Redis from 'ioredis';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AccessJwtPayload } from '../../common/guards/jwt-auth.guard';
import {
  type AuthenticatedActor,
  expectedUserTypeForSurface,
  type RequestMetadata,
} from '../../common/types/auth-context';
import type { AppEnv } from '../../infrastructure/config/env.schema';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import { users } from '../../infrastructure/database/schema';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { AuditService } from '../audit/audit.service';
import { AuthStateService } from './auth-state.service';
import { OidcService } from './oidc.service';
import { OtpService } from './otp.service';
import { createHash } from 'node:crypto';

interface RefreshSessionRecord {
  userId: string;
  tokenHash: string;
  tokenVersion: number;
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class AuthService {
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;
  private readonly cookieSecure: boolean;
  private readonly jwtSecret: string;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly jwtService: JwtService,
    config: ConfigService<AppEnv, true>,
    private readonly authStateService: AuthStateService,
    private readonly auditService: AuditService,
    private readonly otpService: OtpService,
    private readonly oidcService: OidcService,
  ) {
    this.accessTtlSeconds = config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
    this.refreshTtlSeconds = config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true });
    this.cookieSecure = config.get('COOKIE_SECURE', { infer: true });
    this.jwtSecret = config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  private refreshKey(surface: AppSurface, familyId: string): string {
    return `refresh:${surface}:${familyId}`;
  }

  private familySetKey(surface: AppSurface, userId: string): string {
    return `refresh_families:${surface}:${userId}`;
  }

  getAuthMethods(): AuthMethodsDto {
    return this.oidcService.getAuthMethods();
  }

  getSurfaceBaseUrl(surface: AppSurface): string {
    return this.oidcService.getSurfaceBaseUrl(surface);
  }

  private async issueCookiesForUser(
    res: Response,
    surface: AppSurface,
    user: { id: string; userType: 'employee' | 'customer'; tokenVersion: number },
    existingFamilyId?: string,
  ): Promise<void> {
    const familyId = existingFamilyId ?? randomUUID();
    const secret = generateOpaqueToken();
    const record: RefreshSessionRecord = {
      userId: user.id,
      tokenHash: hashToken(secret),
      tokenVersion: user.tokenVersion,
    };

    await this.redis.set(
      this.refreshKey(surface, familyId),
      JSON.stringify(record),
      'EX',
      this.refreshTtlSeconds,
    );
    await this.redis.sadd(this.familySetKey(surface, user.id), familyId);
    await this.redis.expire(this.familySetKey(surface, user.id), this.refreshTtlSeconds);

    const payload: AccessJwtPayload = {
      sub: user.id,
      aud: surface,
      userType: user.userType,
      tokenVersion: user.tokenVersion,
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.jwtSecret,
      expiresIn: this.accessTtlSeconds,
    });
    const csrfToken = randomBytes(24).toString('hex');

    const baseOpts = {
      sameSite: 'lax' as const,
      secure: this.cookieSecure,
      path: '/',
    };

    res.cookie(`${surface}_access_token`, accessToken, {
      ...baseOpts,
      httpOnly: true,
      maxAge: this.accessTtlSeconds * 1000,
    });
    res.cookie(`${surface}_refresh_token`, `${familyId}.${secret}`, {
      ...baseOpts,
      httpOnly: true,
      maxAge: this.refreshTtlSeconds * 1000,
    });
    res.cookie(`${surface}_csrf_token`, csrfToken, {
      ...baseOpts,
      httpOnly: false,
      maxAge: this.refreshTtlSeconds * 1000,
    });
  }

  clearSurfaceCookies(res: Response, surface: AppSurface): void {
    const baseOpts = {
      sameSite: 'lax' as const,
      secure: this.cookieSecure,
      path: '/',
    };
    res.clearCookie(`${surface}_access_token`, { ...baseOpts, httpOnly: true });
    res.clearCookie(`${surface}_refresh_token`, { ...baseOpts, httpOnly: true });
    res.clearCookie(`${surface}_csrf_token`, { ...baseOpts, httpOnly: false });
  }

  async requestOtp(
    surface: AppSurface,
    dto: RequestOtpInput,
    meta: RequestMetadata,
  ): Promise<OtpRequestResponseDto> {
    return this.otpService.requestOtp(surface, dto.phone, meta);
  }

  async verifyOtp(
    surface: AppSurface,
    dto: VerifyOtpInput,
    res: Response,
    meta: RequestMetadata,
  ): Promise<AuthenticatedActor> {
    const userId = await this.otpService.verifyOtp(surface, dto.phone, dto.code, meta);
    const expectedType = expectedUserTypeForSurface(surface);

    const [user] = await this.db
      .select()
      .from(users)
      .where(
        and(eq(users.id, userId), eq(users.userType, expectedType), isNull(users.deletedAt)),
      );

    if (!user) {
      throw new ForbiddenException({
        code: 'PROFILE_NOT_PROVISIONED',
        message: 'No active profile exists for this mobile number',
      });
    }

    await this.db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await this.authStateService.invalidateUser(user.id);
    const actor = await this.authStateService.getActiveActor(user.id, surface);
    if (!actor) {
      throw new ForbiddenException({
        code: 'PROFILE_NOT_PROVISIONED',
        message: 'Your organization or account is currently inactive',
      });
    }

    await this.issueCookiesForUser(res, surface, {
      id: user.id,
      userType: user.userType,
      tokenVersion: user.tokenVersion,
    });

    await this.auditService.record({
      actorUserId: user.id,
      actorType: user.userType,
      customerId: actor.customerId,
      action: 'auth.otp_login',
      entityType: 'user',
      entityId: user.id,
      summary: `Signed in to ${surface} surface via SMS OTP`,
      meta,
    });

    return actor;
  }

  async startSso(surface: AppSurface): Promise<string> {
    return this.oidcService.startAuthorization(surface);
  }

  async completeSsoCallback(
    surface: AppSurface,
    query: { code?: string; state?: string; error?: string },
    res: Response,
    meta: RequestMetadata,
  ): Promise<AuthenticatedActor> {
    const { user, actor } = await this.oidcService.verifyCallback(surface, query, meta);

    await this.db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await this.issueCookiesForUser(res, surface, user);

    await this.auditService.record({
      actorUserId: user.id,
      actorType: user.userType,
      customerId: actor.customerId,
      action: 'auth.sso_login',
      entityType: 'user',
      entityId: user.id,
      summary: `Signed in to ${surface} surface via OIDC SSO`,
      meta,
    });

    return actor;
  }

  async refresh(
    surface: AppSurface,
    rawRefreshCookie: string | undefined,
    res: Response,
    meta: RequestMetadata,
  ): Promise<AuthenticatedActor> {
    if (!rawRefreshCookie || !rawRefreshCookie.includes('.')) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh session is missing',
      });
    }

    const [familyId, secret] = rawRefreshCookie.split('.', 2);
    if (!familyId || !secret) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Malformed refresh session',
      });
    }

    const key = this.refreshKey(surface, familyId);
    const rawStored = await this.redis.get(key);
    if (!rawStored) {
      this.clearSurfaceCookies(res, surface);
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh session expired or revoked',
      });
    }

    const stored = JSON.parse(rawStored) as RefreshSessionRecord;
    const incomingHash = hashToken(secret);
    const match = timingSafeEqual(Buffer.from(stored.tokenHash), Buffer.from(incomingHash));

    if (!match) {
      await this.redis.del(key);
      await this.redis.srem(this.familySetKey(surface, stored.userId), familyId);
      this.clearSurfaceCookies(res, surface);

      await this.auditService.record({
        actorUserId: stored.userId,
        actorType: expectedUserTypeForSurface(surface),
        action: 'auth.refresh_reuse_detected',
        entityType: 'user',
        entityId: stored.userId,
        summary: `Revoked ${surface} refresh token family after suspected token replay`,
        meta,
      });

      throw new UnauthorizedException({
        code: 'SESSION_COMPROMISED',
        message: 'Session invalidated due to token reuse detection',
      });
    }

    const actor = await this.authStateService.getActiveActor(stored.userId, surface);
    if (!actor || actor.tokenVersion !== stored.tokenVersion) {
      await this.redis.del(key);
      this.clearSurfaceCookies(res, surface);
      throw new UnauthorizedException({
        code: 'SESSION_REVOKED',
        message: 'Session has been revoked',
      });
    }

    await this.issueCookiesForUser(
      res,
      surface,
      {
        id: actor.id,
        userType: actor.userType,
        tokenVersion: actor.tokenVersion,
      },
      familyId,
    );

    return actor;
  }

  async logout(
    surface: AppSurface,
    rawRefreshCookie: string | undefined,
    res: Response,
  ): Promise<void> {
    if (rawRefreshCookie && rawRefreshCookie.includes('.')) {
      const [familyId] = rawRefreshCookie.split('.', 2);
      if (familyId) {
        const rawStored = await this.redis.get(this.refreshKey(surface, familyId));
        if (rawStored) {
          const parsed = JSON.parse(rawStored) as RefreshSessionRecord;
          await this.redis.srem(this.familySetKey(surface, parsed.userId), familyId);
        }
        await this.redis.del(this.refreshKey(surface, familyId));
      }
    }
    this.clearSurfaceCookies(res, surface);
  }

  async logoutAll(
    surface: AppSurface,
    actor: AuthenticatedActor,
    res: Response,
    meta: RequestMetadata,
  ): Promise<void> {
    await this.db
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, actor.id));

    const familyIds = await this.redis.smembers(this.familySetKey(surface, actor.id));
    if (familyIds.length > 0) {
      await this.redis.del(...familyIds.map((id) => this.refreshKey(surface, id)));
    }
    await this.redis.del(this.familySetKey(surface, actor.id));
    await this.authStateService.invalidateUser(actor.id);
    this.clearSurfaceCookies(res, surface);

    await this.auditService.record({
      actorUserId: actor.id,
      actorType: actor.userType,
      customerId: actor.customerId,
      action: 'auth.logout_all',
      entityType: 'user',
      entityId: actor.id,
      summary: `Revoked all active ${surface} sessions`,
      meta,
    });
  }

  async updateProfile(
    actor: AuthenticatedActor,
    dto: UpdateProfileInput,
    meta: RequestMetadata,
  ): Promise<AuthenticatedActor> {
    await this.db
      .update(users)
      .set({
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, actor.id));

    await this.auditService.record({
      actorUserId: actor.id,
      actorType: actor.userType,
      customerId: actor.customerId,
      action: 'profile.updated',
      entityType: 'user',
      entityId: actor.id,
      summary: 'Updated user profile settings',
      afterJson: dto,
      meta,
    });

    await this.authStateService.invalidateUser(actor.id);
    const updated = await this.authStateService.getActiveActor(actor.id, actor.surface);
    if (!updated) {
      throw new UnauthorizedException();
    }
    return updated;
  }
}
