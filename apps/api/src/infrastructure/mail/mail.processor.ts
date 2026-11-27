import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getDirection, resolveLocale } from '@portal/i18n';
import type { AppLocale, AppSurface } from '@portal/types';
import type { Job } from 'bullmq';
import nodemailer, { type Transporter } from 'nodemailer';
import type { AppEnv } from '../config/env.schema';

export const MAIL_QUEUE_NAME = 'mail';

export interface ProfileProvisionedMailJob {
  kind: 'profile_provisioned';
  to: string;
  fullName: string;
  surface: AppSurface;
  phone: string;
  companyName?: string;
  locale?: AppLocale;
}

export interface NotificationMailJob {
  kind: 'notification';
  to: string;
  fullName: string;
  surface: AppSurface;
  title: string;
  body: string;
  actionPath?: string;
  locale?: AppLocale;
}

export type MailJobPayload = ProfileProvisionedMailJob | NotificationMailJob;

function escapeHtml(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

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

    if (this.isTest) {
      this.logger.debug(`Skipped SMTP delivery in test env for ${data.kind} -> ${data.to}`);
      return;
    }

    const fontStack =
      locale === 'fa'
        ? 'Vazirmatn, Tahoma, Arial, sans-serif'
        : "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";

    if (data.kind === 'profile_provisioned') {
      const loginUrl = `${baseUrl}/login`;
      const subject =
        locale === 'fa'
          ? data.surface === 'portal'
            ? `پروفایل شما در پورتال مشتریان ${data.companyName ?? ''} فعال شد`
            : 'پروفایل شما در کنسول عملیات داخلی فعال شد'
          : data.surface === 'portal'
            ? `Your ${data.companyName ?? ''} Customer Portal profile is active`
            : 'Your Operations Admin Console profile is active';
      const greeting =
        locale === 'fa' ? `${escapeHtml(data.fullName)} عزیز، سلام` : `Hello ${escapeHtml(data.fullName)},`;
      const bodyText =
        locale === 'fa'
          ? `پروفایل کاربری شما با شماره موبایل ${escapeHtml(data.phone)} ایجاد و فعال شده است. اکنون می‌توانید از طریق کد یکبار مصرف (OTP) یا ورود یکپارچه سازمانی (SSO) وارد شوید.`
          : `Your account profile has been provisioned with mobile number ${escapeHtml(data.phone)}. You can now sign in via SMS OTP or Company SSO.`;
      const cta = locale === 'fa' ? 'ورود به سامانه' : 'Sign in';

      await this.transporter.sendMail({
        from: this.fromAddress,
        to: data.to,
        subject,
        text: `${greeting}\n\n${bodyText}\n${loginUrl}`,
        html: `<div dir="${dir}" lang="${locale}" style="font-family:${fontStack};line-height:1.8;color:#111827;"><p>${greeting}</p><p>${bodyText}</p><p><a href="${loginUrl}" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;">${cta}</a></p></div>`,
      });
      return;
    }

    const targetUrl = data.actionPath ? `${baseUrl}${data.actionPath}` : baseUrl;
    const greeting =
      locale === 'fa' ? `${escapeHtml(data.fullName)} عزیز،` : `Hello ${escapeHtml(data.fullName)},`;
    const cta = locale === 'fa' ? 'مشاهده در سامانه' : 'Open in portal';

    await this.transporter.sendMail({
      from: this.fromAddress,
      to: data.to,
      subject: data.title,
      text: `${greeting}\n\n${data.body}\n${targetUrl}`,
      html: `<div dir="${dir}" lang="${locale}" style="font-family:${fontStack};line-height:1.8;color:#111827;"><p>${greeting}</p><p><strong>${escapeHtml(data.title)}</strong></p><p>${escapeHtml(data.body)}</p><p><a href="${targetUrl}" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;">${cta}</a></p></div>`,
    });
  }
}
