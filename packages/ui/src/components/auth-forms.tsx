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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
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
  eyebrow,
  badgeLabel,
  badgeTone,
  title,
  description,
  children,
}: SurfaceAuthHeaderProps & { children: React.ReactNode }) {
  return (
    <div className="blueprint-grid flex min-h-screen items-center justify-center bg-[var(--bg-canvas)] px-4 py-8">
      <Card className="w-full max-w-md shadow-xs">
        <CardHeader>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--ink-muted)]">{eyebrow}</span>
              <StatusBadge label={badgeLabel} tone={badgeTone} />
            </div>
            <LocaleSwitcher />
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
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
      <div className="space-y-4">
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
                placeholder={t.auth.mobilePhonePlaceholder}
                {...phoneForm.register('phone')}
              />
              {phoneForm.formState.errors.phone ? (
                <p className="text-xs text-[var(--signal-crimson)]">
                  {phoneForm.formState.errors.phone.message}
                </p>
              ) : (
                <p className="text-[11px] text-[var(--ink-muted)]">{t.auth.mobilePhoneHint}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={phoneForm.formState.isSubmitting}
            >
              <Smartphone className="h-4 w-4" />
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
                className="font-mono-tabular text-center text-base tracking-[0.35em]"
                {...otpForm.register('code')}
              />
              {otpForm.formState.errors.code ? (
                <p className="text-xs text-[var(--signal-crimson)]">
                  {otpForm.formState.errors.code.message}
                </p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={otpForm.formState.isSubmitting}>
              <KeyRound className="h-4 w-4" />
              {otpForm.formState.isSubmitting ? t.auth.verifyingOtp : t.auth.verifyOtp}
            </Button>

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                className="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:underline"
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
                className="font-medium text-[var(--accent-cobalt)] disabled:cursor-not-allowed disabled:opacity-50 hover:underline"
              >
                {resendSeconds > 0
                  ? interpolate(t.auth.resendWait, { seconds: formatNumber(resendSeconds) })
                  : t.auth.resendOtp}
              </button>
            </div>
          </form>
        )}

        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-[var(--border-hairline)]" />
          <span className="mx-3 shrink-0 text-[11px] text-[var(--ink-muted)]">
            {t.auth.orDivider}
          </span>
          <div className="flex-grow border-t border-[var(--border-hairline)]" />
        </div>

        {ssoEnabled ? (
          <a
            href={ssoStartHref}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 text-xs font-medium text-[var(--ink-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
          >
            <ShieldCheck className="h-4 w-4 text-[var(--accent-cobalt)]" />
            {interpolate(t.auth.signInWithSso, { provider: providerLabel })}
          </a>
        ) : (
          <div className="rounded-md border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)]/50 px-3 py-2.5 text-center text-[11px] text-[var(--ink-muted)]">
            <span className="flex items-center justify-center gap-1.5 font-medium text-[var(--ink-primary)]">
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--ink-muted)]" />
              {interpolate(t.auth.signInWithSso, { provider: providerLabel })}
            </span>
            <p className="mt-0.5">{t.auth.ssoUnavailableHint}</p>
          </div>
        )}

        <p className="text-center text-[11px] text-[var(--ink-muted)]">
          {t.auth.provisionRequiredNotice}
        </p>
      </div>

      {footer ? (
        <div className="mt-4 border-t border-[var(--border-hairline)] pt-3">{footer}</div>
      ) : null}
    </AuthCardShell>
  );
}
