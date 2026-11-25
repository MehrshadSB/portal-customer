import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getDictionary, getDirection, interpolate, resolveLocale } from '@portal/i18n';
import type { AppLocale, AppSurface } from '@portal/types';
import type { Job } from 'bullmq';
import nodemailer, { type Transporter } from 'nodemailer';
import type { AppEnv } from '../config/env.schema';

export const MAIL_QUEUE_NAME = 'mail';

export interface InviteMailJob {
  kind: 'invite';
  to: string;
  fullName: string;
  surface: AppSurface;
  token: string;
  companyName?: string;
  locale?: AppLocale;
}

export interface PasswordResetMailJob {
  kind: 'password_reset';
  to: string;
  fullName: string;
  surface: AppSurface;
  token: string;
  locale?: AppLocale;
}

export type MailJobPayload = InviteMailJob | PasswordResetMailJob;

@Injectable()
@Processor(MAIL_QUEUE_NAME)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);
  private readonly transporter: Transporter;
  private readonly fromAddress: string;
  private readonly portalUrl: string;
  private readonly adminUrl: string;
  private readonly isTest: boolean;

  constructor(config: ConfigService<AppEnv, true>) {
    super();
    this.fromAddress = config.get('SMTP_FROM', { infer: true });
    this.portalUrl = config.get('PORTAL_URL', { infer: true });
    this.adminUrl = config.get('ADMIN_URL', { infer: true });
    this.isTest = config.get('NODE_ENV', { infer: true }) === 'test';

    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure: config.get('SMTP_SECURE', { infer: true }),
    });
  }

  async process(job: Job<MailJobPayload>): Promise<void> {
    const data = job.data;
    const baseUrl = data.surface === 'portal' ? this.portalUrl : this.adminUrl;
    const locale = resolveLocale(data.locale);
    const dir = getDirection(locale);
    const dict = getDictionary(locale).email;

    if (this.isTest) {
      this.logger.debug(`Skipped SMTP delivery in test env for ${data.kind} -> ${data.to}`);
      return;
    }

    const fontStack =
      locale === 'fa'
        ? 'Vazirmatn, Tahoma, Arial, sans-serif'
        : "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";

    if (data.kind === 'invite') {
      const inviteUrl = `${baseUrl}/accept-invite?token=${encodeURIComponent(data.token)}`;
      const company = data.companyName ?? '';
      const subject =
        data.surface === 'portal'
          ? interpolate(dict.inviteSubjectPortal, { company })
          : dict.inviteSubjectAdmin;
      const greeting = interpolate(dict.inviteGreeting, { name: data.fullName });
      const body =
        data.surface === 'portal'
          ? interpolate(dict.inviteBodyPortal, { company })
          : dict.inviteBodyAdmin;

      await this.transporter.sendMail({
        from: this.fromAddress,
        to: data.to,
        subject,
        text: `${greeting}\n\n${body}\n${inviteUrl}\n\n${dict.inviteExpiry}`,
        html: `<div dir="${dir}" lang="${locale}" style="font-family:${fontStack};line-height:1.8;color:#111827;"><p>${greeting}</p><p>${body}</p><p><a href="${inviteUrl}" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;">${dict.inviteCta}</a></p><p style="color:#526075;font-size:12px;">${dict.inviteExpiry}</p></div>`,
      });
      return;
    }

    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(data.token)}`;
    const greeting = interpolate(dict.inviteGreeting, { name: data.fullName });

    await this.transporter.sendMail({
      from: this.fromAddress,
      to: data.to,
      subject: dict.resetSubject,
      text: `${greeting}\n\n${dict.resetBody}\n${resetUrl}\n\n${dict.resetExpiry}`,
      html: `<div dir="${dir}" lang="${locale}" style="font-family:${fontStack};line-height:1.8;color:#111827;"><p>${greeting}</p><p>${dict.resetBody}</p><p><a href="${resetUrl}" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;">${dict.resetCta}</a></p><p style="color:#526075;font-size:12px;">${dict.resetExpiry}</p></div>`,
    });
  }
}
