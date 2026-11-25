'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useI18n } from '@portal/i18n/react';
import { SUPPORTED_LOCALES, type WorkflowColorToken } from '@portal/types';
import {
  acceptInviteSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  type AcceptInviteInput,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
} from '@portal/validators';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { AlertBanner } from './alert-banner';
import { Button } from './button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Input, Label } from './input';
import { LocaleSwitcher } from './locale-switcher';
import { Select } from './select';
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

export interface LoginCardProps extends SurfaceAuthHeaderProps {
  submitLabel: string;
  emailLabel?: string;
  emailPlaceholder?: string;
  onSubmitLogin: (values: LoginInput) => Promise<void>;
  footer?: React.ReactNode;
}

export function LoginCard({
  submitLabel,
  emailLabel,
  emailPlaceholder = 'name@company.ir',
  onSubmitLogin,
  footer,
  ...header
}: LoginCardProps) {
  const { t, translateError } = useI18n();
  const [error, setError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const submit = async (values: LoginInput) => {
    setError(null);
    try {
      await onSubmitLogin(values);
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      const msg = err instanceof Error ? err.message : t.errorCodes.INVALID_CREDENTIALS ?? 'Sign in failed';
      setError(translateError(code, msg));
    }
  };

  return (
    <AuthCardShell {...header}>
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">{emailLabel ?? t.auth.workEmailLabel}</Label>
          <Input
            id="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            placeholder={emailPlaceholder}
            {...register('email')}
          />
          {errors.email ? (
            <p className="text-xs text-[var(--signal-crimson)]">{errors.email.message}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">{t.auth.passwordLabel}</Label>
          <Input
            id="password"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            placeholder="••••••••••••"
            {...register('password')}
          />
          {errors.password ? (
            <p className="text-xs text-[var(--signal-crimson)]">{errors.password.message}</p>
          ) : null}
        </div>

        {error ? <AlertBanner tone="crimson">{error}</AlertBanner> : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? t.common.signingIn : submitLabel}
        </Button>
      </form>
      {footer ? (
        <div className="mt-4 border-t border-[var(--border-hairline)] pt-3">{footer}</div>
      ) : null}
    </AuthCardShell>
  );
}

export interface ForgotPasswordCardProps extends SurfaceAuthHeaderProps {
  onSubmitForgot: (values: ForgotPasswordInput) => Promise<void>;
  footer?: React.ReactNode;
}

export function ForgotPasswordCard({
  onSubmitForgot,
  footer,
  ...header
}: ForgotPasswordCardProps) {
  const { t, translateError } = useI18n();
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const submit = async (values: ForgotPasswordInput) => {
    setError(null);
    try {
      await onSubmitForgot(values);
      setSent(true);
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      setError(translateError(code, err instanceof Error ? err.message : 'Request failed'));
    }
  };

  return (
    <AuthCardShell {...header}>
      {sent ? (
        <AlertBanner tone="emerald" title={t.auth.forgotSentTitle}>
          {t.auth.forgotSentDesc}
        </AlertBanner>
      ) : (
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t.auth.accountEmailLabel}</Label>
            <Input id="email" type="email" dir="ltr" placeholder="name@company.ir" {...register('email')} />
            {errors.email ? (
              <p className="text-xs text-[var(--signal-crimson)]">{errors.email.message}</p>
            ) : null}
          </div>
          {error ? <AlertBanner tone="crimson">{error}</AlertBanner> : null}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t.auth.sendingLink : t.auth.sendResetLink}
          </Button>
        </form>
      )}
      {footer ? (
        <div className="mt-4 border-t border-[var(--border-hairline)] pt-3">{footer}</div>
      ) : null}
    </AuthCardShell>
  );
}

export interface ResetPasswordCardProps extends SurfaceAuthHeaderProps {
  token: string;
  onSubmitReset: (values: ResetPasswordInput) => Promise<void>;
  footer?: React.ReactNode;
}

export function ResetPasswordCard({
  token,
  onSubmitReset,
  footer,
  ...header
}: ResetPasswordCardProps) {
  const { t, translateError } = useI18n();
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  const submit = async (values: ResetPasswordInput) => {
    setError(null);
    try {
      await onSubmitReset(values);
      setDone(true);
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      setError(translateError(code, err instanceof Error ? err.message : 'Reset failed'));
    }
  };

  return (
    <AuthCardShell {...header}>
      {done ? (
        <AlertBanner tone="emerald" title={t.auth.resetDoneTitle}>
          {t.auth.resetDoneDesc}
        </AlertBanner>
      ) : (
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <input type="hidden" {...register('token')} />
          {!token ? <AlertBanner tone="amber">{t.auth.missingTokenWarning}</AlertBanner> : null}
          <div className="space-y-1.5">
            <Label htmlFor="password">{t.auth.newPasswordLabel}</Label>
            <Input id="password" type="password" dir="ltr" {...register('password')} />
            {errors.password ? (
              <p className="text-xs text-[var(--signal-crimson)]">{errors.password.message}</p>
            ) : null}
          </div>
          {error ? <AlertBanner tone="crimson">{error}</AlertBanner> : null}
          <Button type="submit" className="w-full" disabled={isSubmitting || !token}>
            {isSubmitting ? t.auth.updatingPassword : t.auth.updatePassword}
          </Button>
        </form>
      )}
      {footer ? (
        <div className="mt-4 border-t border-[var(--border-hairline)] pt-3">{footer}</div>
      ) : null}
    </AuthCardShell>
  );
}

export interface AcceptInviteCardProps extends SurfaceAuthHeaderProps {
  token: string;
  onSubmitAccept: (values: AcceptInviteInput) => Promise<void>;
  footer?: React.ReactNode;
}

export function AcceptInviteCard({
  token,
  onSubmitAccept,
  footer,
  ...header
}: AcceptInviteCardProps) {
  const { t, locale, translateError } = useI18n();
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { token, timezone: 'Asia/Tehran', locale },
  });

  const submit = async (values: AcceptInviteInput) => {
    setError(null);
    try {
      await onSubmitAccept(values);
      setDone(true);
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      setError(translateError(code, err instanceof Error ? err.message : 'Activation failed'));
    }
  };

  return (
    <AuthCardShell {...header}>
      {done ? (
        <AlertBanner tone="emerald" title={t.auth.inviteDoneTitle}>
          {t.auth.inviteDoneDesc}
        </AlertBanner>
      ) : (
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <input type="hidden" {...register('token')} />
          {!token ? <AlertBanner tone="amber">{t.auth.missingTokenWarning}</AlertBanner> : null}
          <div className="space-y-1.5">
            <Label htmlFor="fullName">{t.auth.optionalNameLabel}</Label>
            <Input id="fullName" type="text" {...register('fullName')} />
            {errors.fullName ? (
              <p className="text-xs text-[var(--signal-crimson)]">{errors.fullName.message}</p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="phone">{t.auth.optionalPhoneLabel}</Label>
              <Input id="phone" type="tel" dir="ltr" placeholder="+98 21 ..." {...register('phone')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-locale">{t.auth.preferredLanguageLabel}</Label>
              <Select id="invite-locale" {...register('locale')}>
                {SUPPORTED_LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {code === 'fa' ? t.meta.persianLabel : t.meta.englishLabel}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t.auth.createPasswordLabel}</Label>
            <Input id="password" type="password" dir="ltr" {...register('password')} />
            {errors.password ? (
              <p className="text-xs text-[var(--signal-crimson)]">{errors.password.message}</p>
            ) : null}
          </div>
          {error ? <AlertBanner tone="crimson">{error}</AlertBanner> : null}
          <Button type="submit" className="w-full" disabled={isSubmitting || !token}>
            {isSubmitting ? t.auth.activatingAccount : t.auth.activateAccount}
          </Button>
        </form>
      )}
      {footer ? (
        <div className="mt-4 border-t border-[var(--border-hairline)] pt-3">{footer}</div>
      ) : null}
    </AuthCardShell>
  );
}
