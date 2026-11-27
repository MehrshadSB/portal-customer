'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useI18n } from '@portal/i18n/react';
import type { AuthMethodsDto, OtpRequestResponseDto, WorkflowColorToken } from '@portal/types';
import {
  requestOtpSchema,
  verifyOtpSchema,
  type RequestOtpInput,
  type VerifyOtpInput,
} from '@portal/validators';
import { KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { AlertBanner } from './alert-banner';
import { Button } from './button';
import { Input, Label } from './input';
import { LocaleSwitcher } from './locale-switcher';
import { StatusBadge } from './status-badge';

interface SurfaceAuthHeaderProps {
  eyebrow: string;
  badgeLabel: string;
  badgeTone: WorkflowColorToken;
  title: string;
  description: string;
}

export function AuthCardShell({
  eyebrow: _eyebrow,
  badgeLabel,
  badgeTone,
  title,
  description,
  children,
}: SurfaceAuthHeaderProps & { children: React.ReactNode }) {
  const { brandName, t } = useI18n();

  return (
    <div className="app-desk-band flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-rule-2)] bg-[var(--color-cotton)] shadow-[var(--cast-stock)] lg:grid-cols-12">
        <aside className="flex flex-col justify-between gap-6 bg-[var(--color-board)] p-6 text-[var(--color-board-type)] sm:p-8 lg:col-span-5">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span
                data-brand-mark="logo"
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-input)] border border-[var(--color-rule-2)]/30 bg-[var(--color-ink-2)]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <rect x="4" y="4.5" width="16" height="3.5" rx="1" fill="var(--color-board-type)" />
                  <rect x="4" y="10.25" width="12.5" height="3.5" rx="1" fill="var(--color-accent)" />
                  <rect x="4" y="16" width="9" height="3.5" rx="1" fill="var(--color-paper-3)" />
                </svg>
              </span>
              <p className="min-w-0 truncate text-sm font-semibold text-[var(--color-board-type)]">
                {brandName}
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <h1 className="text-xl font-semibold tracking-tight text-[var(--color-board-type)] sm:text-2xl">
                {title}
              </h1>
              <p className="max-w-prose text-sm leading-relaxed text-[var(--color-paper-3)]">
                {description}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--color-ink-2)] pt-4">
            <StatusBadge label={badgeLabel} tone={badgeTone} />
            <span className="font-mono-tabular text-xs text-[var(--color-paper-3)]">OTP / OIDC</span>
          </div>
        </aside>

        <section className="flex flex-col justify-between p-6 sm:p-8 lg:col-span-7">
          <div className="mb-6 flex items-center justify-between gap-3 border-b border-[var(--color-rule)] pb-4">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">{t.common.signIn}</h2>
            <LocaleSwitcher />
          </div>
          <div className="flex-1">{children}</div>
        </section>
      </div>
    </div>
  );
}

export interface SsoOtpLoginCardProps extends SurfaceAuthHeaderProps {
  authMethods?: AuthMethodsDto | null;
  ssoStartHref: string;
  initialErrorCode?: string | null;
  onRequestOtp: (values: RequestOtpInput) => Promise<OtpRequestResponseDto>;
  onVerifyOtp: (values: VerifyOtpInput) => Promise<void>;
  footer?: React.ReactNode;
}

export function SsoOtpLoginCard({
  authMethods,
  ssoStartHref,
  initialErrorCode,
  onRequestOtp,
  onVerifyOtp,
  footer,
  ...header
}: SsoOtpLoginCardProps) {
  const { t, translateError, interpolate, formatNumber } = useI18n();
  const [step, setStep] = React.useState<'phone' | 'otp'>('phone');
  const [normalizedPhone, setNormalizedPhone] = React.useState('');
  const [maskedPhone, setMaskedPhone] = React.useState('');
  const [resendSeconds, setResendSeconds] = React.useState(0);
  const [error, setError] = React.useState<string | null>(() =>
    initialErrorCode ? translateError(initialErrorCode, initialErrorCode) : null,
  );

  React.useEffect(() => {
    if (initialErrorCode) {
      setError(translateError(initialErrorCode, initialErrorCode));
    }
  }, [initialErrorCode, translateError]);

  React.useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setResendSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  const phoneForm = useForm<RequestOtpInput>({
    resolver: zodResolver(requestOtpSchema),
  });

  const otpForm = useForm<VerifyOtpInput>({
    resolver: zodResolver(verifyOtpSchema),
    defaultValues: { phone: '', code: '' },
  });

  const extractErr = (err: unknown, fallback: string) => {
    const code =
      typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
    const msg = err instanceof Error ? err.message : fallback;
    return translateError(code, msg);
  };

  const handleRequestOtp = async (values: RequestOtpInput) => {
    setError(null);
    try {
      const res = await onRequestOtp(values);
      setNormalizedPhone(values.phone);
      setMaskedPhone(res.maskedPhone);
      setResendSeconds(res.resendAfterSeconds);
      otpForm.reset({ phone: values.phone, code: '' });
      setStep('otp');
    } catch (err) {
      setError(extractErr(err, 'Failed to request verification code'));
    }
  };

  const handleResend = async () => {
    if (resendSeconds > 0 || !normalizedPhone) return;
    setError(null);
    try {
      const res = await onRequestOtp({ phone: normalizedPhone });
      setResendSeconds(res.resendAfterSeconds);
    } catch (err) {
      setError(extractErr(err, 'Failed to resend verification code'));
    }
  };

  const handleVerifyOtp = async (values: VerifyOtpInput) => {
    setError(null);
    try {
      await onVerifyOtp(values);
    } catch (err) {
      setError(extractErr(err, 'Verification failed'));
    }
  };

  const ssoEnabled = Boolean(authMethods?.ssoEnabled);
  const providerLabel = authMethods?.providerLabel || 'SSO';

  return (
    <AuthCardShell {...header}>
      <div className="space-y-5">
        {error ? <AlertBanner tone="crimson">{error}</AlertBanner> : null}

        {step === 'phone' ? (
          <form onSubmit={phoneForm.handleSubmit(handleRequestOtp)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="otp-phone">{t.auth.mobilePhoneLabel}</Label>
              <Input
                id="otp-phone"
                type="tel"
                dir="ltr"
                autoComplete="tel"
                aria-invalid={Boolean(phoneForm.formState.errors.phone)}
                aria-describedby="otp-phone-help"
                placeholder={t.auth.mobilePhonePlaceholder}
                {...phoneForm.register('phone')}
              />
              <p
                id="otp-phone-help"
                className={
                  phoneForm.formState.errors.phone
                    ? 'min-h-[1lh] text-xs text-[var(--color-error)]'
                    : 'min-h-[1lh] text-xs text-[var(--color-muted)]'
                }
              >
                {phoneForm.formState.errors.phone?.message ?? t.auth.mobilePhoneHint}
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={phoneForm.formState.isSubmitting}
            >
              <Smartphone className="h-4 w-4" aria-hidden="true" />
              {phoneForm.formState.isSubmitting ? t.auth.sendingOtp : t.auth.sendOtp}
            </Button>
          </form>
        ) : (
          <form onSubmit={otpForm.handleSubmit(handleVerifyOtp)} className="space-y-4">
            <input type="hidden" {...otpForm.register('phone')} />
            <AlertBanner tone="cobalt">
              {interpolate(t.auth.otpSentDesc, { phone: maskedPhone || normalizedPhone })}
            </AlertBanner>

            <div className="space-y-1.5">
              <Label htmlFor="otp-code">{t.auth.otpCodeLabel}</Label>
              <Input
                id="otp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                dir="ltr"
                maxLength={6}
                placeholder="123456"
                aria-invalid={Boolean(otpForm.formState.errors.code)}
                aria-describedby="otp-code-help"
                className="font-mono-tabular text-center text-base tracking-[0.3em]"
                {...otpForm.register('code')}
              />
              <p id="otp-code-help" className="min-h-[1lh] text-xs text-[var(--color-error)]">
                {otpForm.formState.errors.code?.message ?? ''}
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={otpForm.formState.isSubmitting}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {otpForm.formState.isSubmitting ? t.auth.verifyingOtp : t.auth.verifyOtp}
            </Button>

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                className="cursor-pointer text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:underline"
                onClick={() => {
                  setStep('phone');
                  setError(null);
                }}
              >
                {t.auth.changePhone}
              </button>

              <button
                type="button"
                disabled={resendSeconds > 0}
                onClick={() => void handleResend()}
                className="cursor-pointer font-medium text-[var(--color-accent-2)] hover:underline disabled:cursor-not-allowed disabled:opacity-55"
              >
                {resendSeconds > 0
                  ? interpolate(t.auth.resendWait, { seconds: formatNumber(resendSeconds) })
                  : t.auth.resendOtp}
              </button>
            </div>
          </form>
        )}

        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-[var(--color-rule)]" />
          <span className="mx-3 shrink-0 text-xs text-[var(--color-muted)]">{t.auth.orDivider}</span>
          <div className="flex-grow border-t border-[var(--color-rule)]" />
        </div>

        {ssoEnabled ? (
          <a
            href={ssoStartHref}
            className="app-btn app-btn-outline h-9 w-full px-4 text-xs"
          >
            <ShieldCheck className="h-4 w-4 text-[var(--color-accent-2)]" aria-hidden="true" />
            {interpolate(t.auth.signInWithSso, { provider: providerLabel })}
          </a>
        ) : (
          <div className="rounded-[var(--radius-input)] border border-dashed border-[var(--color-rule-2)] bg-[var(--color-paper)] px-3.5 py-2.5 text-center text-xs text-[var(--color-muted)]">
            <span className="flex items-center justify-center gap-1.5 font-medium text-[var(--color-ink)]">
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-muted)]" aria-hidden="true" />
              {interpolate(t.auth.signInWithSso, { provider: providerLabel })}
            </span>
            <p className="mt-0.5">{t.auth.ssoUnavailableHint}</p>
          </div>
        )}

        <p className="text-center text-xs leading-relaxed text-[var(--color-muted)]">
          {t.auth.provisionRequiredNotice}
        </p>
      </div>

      {footer ? (
        <div className="mt-5 border-t border-[var(--color-rule)] pt-4">{footer}</div>
      ) : null}
    </AuthCardShell>
  );
}
