import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { resolveLocale } from '@portal/i18n';
import type { AppSurface } from '@portal/types';
import type {
  AcceptInviteInput,
  ChangePasswordInput,
  LoginInput,
  ResetPasswordInput,
  UpdateProfileInput,
} from '@portal/validators';
import * as argon2 from 'argon2';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Response } from 'express';
import Redis from 'ioredis';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AccessJwtPayload } from '../../common/guards/jwt-auth.guard';
import {
  type AuthenticatedActor,
  expectedUserTypeForSurface,
  type RequestMetadata,
} from '../../common/types/auth-context';
import type { AppEnv } from '../../infrastructure/config/env.schema';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import { authTokens, customerMembers, users } from '../../infrastructure/database/schema';
import { MailService } from '../../infrastructure/mail/mail.service';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { AuthStateService } from './auth-state.service';

interface RefreshSessionRecord {
  userId: string;
  tokenHash: string;
  tokenVersion: number;
}

const LOGIN_RATE_LIMIT_MAX = 5;
const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 900;

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
    private readonly config: ConfigService<AppEnv, true>,
    private readonly rbacService: RbacService,
    private readonly authStateService: AuthStateService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
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

  private rateLimitKey(surface: AppSurface, ip: string | null, email: string): string {
    return `rl:login:${surface}:${ip ?? 'unknown'}:${email}`;
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

  async login(
    surface: AppSurface,
    dto: LoginInput,
    res: Response,
    meta: RequestMetadata,
  ): Promise<AuthenticatedActor> {
    const rlKey = this.rateLimitKey(surface, meta.ipAddress, dto.email);
    const failedCount = Number((await this.redis.get(rlKey)) ?? '0');
    if (failedCount >= LOGIN_RATE_LIMIT_MAX) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many failed login attempts. Please wait 15 minutes before retrying.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const expectedType = expectedUserTypeForSurface(surface);
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(sql`lower(${users.email}) = ${dto.email}`, isNull(users.deletedAt)));

    const passwordValid =
      user && user.passwordHash && user.userType === expectedType && user.status === 'active'
        ? await argon2.verify(user.passwordHash, dto.password)
        : false;

    if (!user || !passwordValid) {
      const nextCount = await this.redis.incr(rlKey);
      if (nextCount === 1) {
        await this.redis.expire(rlKey, LOGIN_RATE_LIMIT_WINDOW_SECONDS);
      }
      await this.auditService.record({
        actorUserId: user?.id ?? null,
        actorType: expectedType,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user?.id ?? null,
        summary: `Failed ${surface} login attempt for ${dto.email}`,
        meta,
      });
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    await this.redis.del(rlKey);
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await this.authStateService.invalidateUser(user.id);
    const actor = await this.authStateService.getActiveActor(user.id, surface);
    if (!actor) {
      throw new ForbiddenException({
        code: 'ACCOUNT_INACTIVE',
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
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      summary: `Signed in to ${surface} surface`,
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

  async forgotPassword(surface: AppSurface, email: string): Promise<void> {
    const expectedType = expectedUserTypeForSurface(surface);
    const [user] = await this.db
      .select()
      .from(users)
      .where(
        and(
          sql`lower(${users.email}) = ${email}`,
          eq(users.userType, expectedType),
          eq(users.status, 'active'),
          isNull(users.deletedAt),
        ),
      );

    if (!user) return;

    const rawToken = generateOpaqueToken();
    await this.db.insert(authTokens).values({
      userId: user.id,
      purpose: 'password_reset',
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await this.mailService.enqueuePasswordReset({
      to: user.email,
      fullName: user.fullName,
      surface,
      token: rawToken,
      locale: resolveLocale(user.locale),
    });
  }

  async resetPassword(
    surface: AppSurface,
    dto: ResetPasswordInput,
    meta: RequestMetadata,
  ): Promise<void> {
    const tokenHashValue = hashToken(dto.token);
    const expectedType = expectedUserTypeForSurface(surface);

    const [record] = await this.db
      .select({
        tokenId: authTokens.id,
        userId: users.id,
        userType: users.userType,
      })
      .from(authTokens)
      .innerJoin(users, eq(authTokens.userId, users.id))
      .where(
        and(
          eq(authTokens.tokenHash, tokenHashValue),
          eq(authTokens.purpose, 'password_reset'),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, new Date()),
          isNull(users.deletedAt),
        ),
      );

    if (!record || record.userType !== expectedType) {
      throw new BadRequestException({
        code: 'INVALID_RESET_TOKEN',
        message: 'Password reset link is invalid or expired',
      });
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash,
          tokenVersion: sql`${users.tokenVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, record.userId));

      await tx
        .update(authTokens)
        .set({ usedAt: new Date() })
        .where(eq(authTokens.id, record.tokenId));

      await this.auditService.record(
        {
          actorUserId: record.userId,
          actorType: expectedType,
          action: 'auth.password_reset',
          entityType: 'user',
          entityId: record.userId,
          summary: `Completed password reset via ${surface}`,
          meta,
        },
        tx,
      );
    });

    await this.authStateService.invalidateUser(record.userId);
  }

  async acceptInvite(
    surface: AppSurface,
    dto: AcceptInviteInput,
    meta: RequestMetadata,
  ): Promise<{ email: string }> {
    const tokenHashValue = hashToken(dto.token);
    const expectedType = expectedUserTypeForSurface(surface);

    const [record] = await this.db
      .select({
        tokenId: authTokens.id,
        userId: users.id,
        email: users.email,
        fullName: users.fullName,
        userType: users.userType,
        status: users.status,
      })
      .from(authTokens)
      .innerJoin(users, eq(authTokens.userId, users.id))
      .where(
        and(
          eq(authTokens.tokenHash, tokenHashValue),
          eq(authTokens.purpose, 'invite'),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, new Date()),
          isNull(users.deletedAt),
        ),
      );

    if (!record || record.userType !== expectedType) {
      throw new BadRequestException({
        code: 'INVALID_INVITE_TOKEN',
        message: 'Invitation link is invalid or expired',
      });
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash,
          fullName: dto.fullName ?? record.fullName,
          phone: dto.phone ?? null,
          timezone: dto.timezone,
          locale: dto.locale,
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(users.id, record.userId));

      if (expectedType === 'customer') {
        await tx
          .update(customerMembers)
          .set({ joinedAt: new Date(), updatedAt: new Date() })
          .where(eq(customerMembers.userId, record.userId));
      }

      await tx
        .update(authTokens)
        .set({ usedAt: new Date() })
        .where(eq(authTokens.id, record.tokenId));

      await this.auditService.record(
        {
          actorUserId: record.userId,
          actorType: expectedType,
          action: 'user.invite_accepted',
          entityType: 'user',
          entityId: record.userId,
          summary: `Accepted ${surface} invitation and activated account`,
          meta,
        },
        tx,
      );
    });

    await this.authStateService.invalidateUser(record.userId);
    return { email: record.email };
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
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
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

  async changePassword(
    actor: AuthenticatedActor,
    dto: ChangePasswordInput,
    res: Response,
    meta: RequestMetadata,
  ): Promise<void> {
    const [user] = await this.db.select().from(users).where(eq(users.id, actor.id));
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException();
    }

    const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!valid) {
      throw new BadRequestException({
        code: 'INCORRECT_PASSWORD',
        message: 'Current password is incorrect',
      });
    }

    const nextHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    const [updatedUser] = await this.db
      .update(users)
      .set({
        passwordHash: nextHash,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, actor.id))
      .returning();

    await this.authStateService.invalidateUser(actor.id);
    if (updatedUser) {
      await this.issueCookiesForUser(res, actor.surface, {
        id: updatedUser.id,
        userType: updatedUser.userType,
        tokenVersion: updatedUser.tokenVersion,
      });
    }

    await this.auditService.record({
      actorUserId: actor.id,
      actorType: actor.userType,
      customerId: actor.customerId,
      action: 'profile.password_changed',
      entityType: 'user',
      entityId: actor.id,
      summary: 'Changed account password',
      meta,
    });
  }

  async createInviteToken(userId: string): Promise<string> {
    const rawToken = generateOpaqueToken();
    await this.db.insert(authTokens).values({
      userId,
      purpose: 'invite',
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    });
    return rawToken;
  }
}
