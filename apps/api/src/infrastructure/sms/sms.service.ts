import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppLocale } from '@portal/types';
import Redis from 'ioredis';
import type { AppEnv } from '../config/env.schema';
import { REDIS_CLIENT } from '../redis/redis.module';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider: AppEnv['SMS_PROVIDER'];
  private readonly webhookUrl: string;
  private readonly apiKey: string;
  private readonly template: string;
  private readonly nodeEnv: AppEnv['NODE_ENV'];
  private readonly otpTtlSeconds: number;

  constructor(
    config: ConfigService<AppEnv, true>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.provider = config.get('SMS_PROVIDER', { infer: true });
    this.webhookUrl = config.get('SMS_WEBHOOK_URL', { infer: true }) ?? '';
    this.apiKey = config.get('SMS_API_KEY', { infer: true }) ?? '';
    this.template = config.get('SMS_TEMPLATE', { infer: true });
    this.nodeEnv = config.get('NODE_ENV', { infer: true });
    this.otpTtlSeconds = config.get('OTP_TTL_SECONDS', { infer: true });
  }

  async sendOtp(phone: string, code: string, locale: AppLocale): Promise<void> {
    if (this.nodeEnv === 'test') {
      await this.redis.set(`test:last_otp:${phone}`, code, 'EX', this.otpTtlSeconds);
      return;
    }

    if (this.provider === 'console') {
      this.logger.log(`[DEV SMS OTP] to=${phone} locale=${locale} code=${code}`);
      return;
    }

    if (this.provider === 'kavenegar') {
      const url = new URL(
        `https://api.kavenegar.com/v1/${encodeURIComponent(this.apiKey)}/verify/lookup.json`,
      );
      url.searchParams.set('receptor', phone);
      url.searchParams.set('token', code);
      url.searchParams.set('template', this.template);
      const res = await fetch(url.toString(), {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        throw new Error(`Kavenegar SMS dispatch failed (${res.status})`);
      }
      return;
    }

    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        phone,
        code,
        template: this.template,
        locale,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new Error(`SMS webhook dispatch failed (${res.status})`);
    }
  }
}
