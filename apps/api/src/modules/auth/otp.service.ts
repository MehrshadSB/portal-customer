import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppSurface, OtpRequestResponseDto } from '@portal/types';
import { and, eq, isNull } from 'drizzle-orm';
import Redis from 'ioredis';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { expectedUserTypeForSurface, type RequestMetadata } from '../../common/types/auth-context';
import type { AppEnv } from '../../infrastructure/config/env.schema';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import { users } from '../../infrastructure/database/schema';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { SmsService } from '../../infrastructure/sms/sms.service';
import { AuditService } from '../audit/audit.service';
import { AuthStateService } from './auth-state.service';

interface OtpChallengeRecord {
  userId: string;
  codeHash: string;
  attempts: number;
}

const OTP_REQ_RATE_LIMIT_MAX = 5;
const OTP_VERIFY_RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_SECONDS = 900;
const OTP_MAX_ATTEMPTS = 5;

export function maskPhoneNumber(phone: string): string {
  if (phone.length <= 6) return '***';
  return `${phone.slice(0, 5)}***${phone.slice(-3)}`;
}

@Injectable()
export class OtpService {
  private readonly otpTtlSeconds: number;
  private readonly resendCooldownSeconds: number;
  private readonly hmacSecret: string;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly authStateService: AuthStateService,
    private readonly smsService: SmsService,
    private readonly auditService: AuditService,
  ) {
    this.otpTtlSeconds = config.get('OTP_TTL_SECONDS', { infer: true });
    this.resendCooldownSeconds = config.get('OTP_RESEND_COOLDOWN_SECONDS', { infer: true });
    this.hmacSecret = config.get('OTP_HMAC_SECRET', { infer: true });
  }

  private otpKey(surface: AppSurface, phone: string): string {
    return `otp:${surface}:${phone}`;
  }

  private cooldownKey(surface: AppSurface, phone: string): string {
    return `otp:cd:${surface}:${phone}`;
  }

  private reqRateLimitKey(surface: AppSurface, ip: string | null, phone: string): string {
    return `rl:otp_req:${surface}:${ip ?? 'unknown'}:${phone}`;
  }

  private verifyRateLimitKey(surface: AppSurface, ip: string | null, phone: string): string {
    return `rl:otp_verify:${surface}:${ip ?? 'unknown'}:${phone}`;
  }

  private hashOtp(surface: AppSurface, phone: string, code: string): string {
    return createHmac('sha256', this.hmacSecret)
      .update(`${surface}:${phone}:${code}`)
      .digest('hex');
  }

  async requestOtp(
    surface: AppSurface,
    phone: string,
    meta: RequestMetadata,
  ): Promise<OtpRequestResponseDto> {
    const rlKey = this.reqRateLimitKey(surface, meta.ipAddress, phone);
    const reqCount = Number((await this.redis.get(rlKey)) ?? '0');
    if (reqCount >= OTP_REQ_RATE_LIMIT_MAX) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many OTP requests. Please wait 15 minutes before retrying.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const expectedType = expectedUserTypeForSurface(surface);
    const [user] = await this.db
      .select()
      .from(users)
      .where(
        and(eq(users.phone, phone), eq(users.userType, expectedType), isNull(users.deletedAt)),
      );

    if (!user) {
      const next = await this.redis.incr(rlKey);
      if (next === 1) await this.redis.expire(rlKey, RATE_LIMIT_WINDOW_SECONDS);

      await this.auditService.record({
        actorUserId: null,
        actorType: expectedType,
        action: 'auth.otp_rejected_unprovisioned',
        entityType: 'user',
        summary: `Rejected ${surface} OTP request for unprovisioned phone ${maskPhoneNumber(phone)}`,
        meta,
      });

      throw new ForbiddenException({
        code: 'PROFILE_NOT_PROVISIONED',
        message: 'No active profile exists for this mobile number. Please contact an administrator.',
      });
    }

    await this.authStateService.invalidateUser(user.id);
    const actor = await this.authStateService.getActiveActor(user.id, surface);
    if (!actor) {
      await this.auditService.record({
        actorUserId: user.id,
        actorType: expectedType,
        action: 'auth.otp_rejected_inactive',
        entityType: 'user',
        entityId: user.id,
        summary: `Rejected ${surface} OTP request for inactive/suspended profile`,
        meta,
      });

      throw new ForbiddenException({
        code: 'PROFILE_NOT_PROVISIONED',
        message: 'Your profile or organization is inactive. Please contact an administrator.',
      });
    }

    const cdKey = this.cooldownKey(surface, phone);
    const cooldownTtl = await this.redis.ttl(cdKey);
    if (cooldownTtl > 0) {
      throw new HttpException(
        {
          code: 'OTP_COOLDOWN',
          message: `Please wait ${cooldownTtl} seconds before requesting another verification code.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(randomInt(100000, 1000000));
    const record: OtpChallengeRecord = {
      userId: user.id,
      codeHash: this.hashOtp(surface, phone, code),
      attempts: 0,
    };

    const nextRl = await this.redis.incr(rlKey);
    if (nextRl === 1) await this.redis.expire(rlKey, RATE_LIMIT_WINDOW_SECONDS);

    await this.redis.set(
      this.otpKey(surface, phone),
      JSON.stringify(record),
      'EX',
      this.otpTtlSeconds,
    );
    await this.redis.set(cdKey, '1', 'EX', this.resendCooldownSeconds);

    await this.smsService.sendOtp(phone, code, actor.locale);

    await this.auditService.record({
      actorUserId: user.id,
      actorType: user.userType,
      customerId: actor.customerId,
      action: 'auth.otp_requested',
      entityType: 'user',
      entityId: user.id,
      summary: `Issued ${surface} SMS OTP to ${maskPhoneNumber(phone)}`,
      meta,
    });

    return {
      expiresInSeconds: this.otpTtlSeconds,
      resendAfterSeconds: this.resendCooldownSeconds,
      maskedPhone: maskPhoneNumber(phone),
    };
  }

  async verifyOtp(
    surface: AppSurface,
    phone: string,
    code: string,
    meta: RequestMetadata,
  ): Promise<string> {
    const verifyRlKey = this.verifyRateLimitKey(surface, meta.ipAddress, phone);
    const failedCount = Number((await this.redis.get(verifyRlKey)) ?? '0');
    if (failedCount >= OTP_VERIFY_RATE_LIMIT_MAX) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many failed verification attempts. Please wait 15 minutes before retrying.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const key = this.otpKey(surface, phone);
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new UnauthorizedException({
        code: 'OTP_EXPIRED',
        message: 'Verification code is missing or expired. Please request a new code.',
      });
    }

    const record = JSON.parse(raw) as OtpChallengeRecord;
    const expectedHash = this.hashOtp(surface, phone, code);
    const match =
      record.codeHash.length === expectedHash.length &&
      timingSafeEqual(Buffer.from(record.codeHash), Buffer.from(expectedHash));

    if (!match) {
      const nextVerifyFail = await this.redis.incr(verifyRlKey);
      if (nextVerifyFail === 1) await this.redis.expire(verifyRlKey, RATE_LIMIT_WINDOW_SECONDS);

      const nextAttempts = record.attempts + 1;
      if (nextAttempts >= OTP_MAX_ATTEMPTS) {
        await this.redis.del(key);
      } else {
        const ttl = await this.redis.ttl(key);
        if (ttl > 0) {
          await this.redis.set(
            key,
            JSON.stringify({ ...record, attempts: nextAttempts }),
            'EX',
            ttl,
          );
        }
      }

      await this.auditService.record({
        actorUserId: record.userId,
        actorType: expectedUserTypeForSurface(surface),
        action: 'auth.otp_verify_failed',
        entityType: 'user',
        entityId: record.userId,
        summary: `Invalid ${surface} OTP attempt for ${maskPhoneNumber(phone)}`,
        meta,
      });

      throw new UnauthorizedException({
        code: 'OTP_INVALID',
        message:
          nextAttempts >= OTP_MAX_ATTEMPTS
            ? 'Maximum verification attempts exceeded. Please request a new code.'
            : 'Verification code is invalid.',
      });
    }

    await this.redis.del(key, this.cooldownKey(surface, phone), verifyRlKey, this.reqRateLimitKey(surface, meta.ipAddress, phone));
    return record.userId;
  }
}
