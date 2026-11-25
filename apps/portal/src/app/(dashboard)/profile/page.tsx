'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useI18n } from '@portal/i18n/react';
import { SUPPORTED_LOCALES } from '@portal/types';
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  Select,
} from '@portal/ui';
import {
  changePasswordSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type UpdateProfileInput,
} from '@portal/validators';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { PORTAL_SESSION_KEY, usePortalSession } from '@/hooks/use-portal-session';
import { portalApi } from '@/lib/api';

export default function PortalProfilePage() {
  const { user } = usePortalSession(false);
  const { t, locale, enabledLocales, setLocale, translateError } = useI18n();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [profileMsg, setProfileMsg] = React.useState<string | null>(null);
  const [passwordMsg, setPasswordMsg] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const profileForm = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    values: {
      fullName: user?.fullName ?? '',
      phone: user?.phone ?? '',
      timezone: user?.timezone ?? 'Asia/Tehran',
      locale: user?.locale ?? locale,
    },
  });

  const passwordForm = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSaveProfile = async (values: UpdateProfileInput) => {
    setErrorMsg(null);
    setProfileMsg(null);
    try {
      await portalApi.patch('/profile', values);
      if (values.locale) setLocale(values.locale);
      await queryClient.invalidateQueries({ queryKey: PORTAL_SESSION_KEY });
      setProfileMsg(t.portal.profile.savedNotice);
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      setErrorMsg(translateError(code, err instanceof Error ? err.message : 'Unable to save profile'));
    }
  };

  const onChangePassword = async (values: ChangePasswordInput) => {
    setErrorMsg(null);
    setPasswordMsg(null);
    try {
      await portalApi.patch('/profile/password', values);
      passwordForm.reset();
      setPasswordMsg(t.portal.profile.passwordSavedNotice);
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      setErrorMsg(translateError(code, err instanceof Error ? err.message : 'Unable to update password'));
    }
  };

  const handleLogoutAll = async () => {
    await portalApi.post('/auth/portal/logout-all');
    queryClient.clear();
    router.replace('/login');
  };

  const availableLocales = enabledLocales.length > 0 ? enabledLocales : [...SUPPORTED_LOCALES];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.portal.profile.eyebrow}
        title={t.portal.profile.title}
        description={t.portal.profile.description}
      />

      {errorMsg ? <AlertBanner tone="crimson">{errorMsg}</AlertBanner> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.portal.profile.personalTitle}</CardTitle>
            <CardDescription>{t.portal.profile.personalDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="fullName">{t.common.fullName}</Label>
                <Input id="fullName" {...profileForm.register('fullName')} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">{t.common.phone}</Label>
                  <Input id="phone" dir="ltr" {...profileForm.register('phone')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-locale">{t.portal.profile.languageLabel}</Label>
                  <Select id="profile-locale" {...profileForm.register('locale')}>
                    {availableLocales.map((code) => (
                      <option key={code} value={code}>
                        {code === 'fa' ? t.meta.persianLabel : t.meta.englishLabel}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timezone">{t.common.timezone}</Label>
                <Input id="timezone" dir="ltr" {...profileForm.register('timezone')} />
              </div>
              {profileMsg ? <AlertBanner tone="emerald">{profileMsg}</AlertBanner> : null}
              <Button type="submit" disabled={profileForm.formState.isSubmitting}>
                {t.common.save}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.portal.profile.passwordCardTitle}</CardTitle>
            <CardDescription>{t.portal.profile.passwordCardDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">{t.auth.currentPasswordLabel}</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  dir="ltr"
                  {...passwordForm.register('currentPassword')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">{t.auth.newPasswordLabel}</Label>
                <Input id="newPassword" type="password" dir="ltr" {...passwordForm.register('newPassword')} />
              </div>
              {passwordMsg ? <AlertBanner tone="emerald">{passwordMsg}</AlertBanner> : null}
              <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
                {t.auth.updatePassword}
              </Button>
            </form>

            <div className="border-t border-[var(--border-hairline)] pt-4">
              <Button type="button" variant="destructive" size="sm" onClick={handleLogoutAll}>
                {t.common.signOutAll}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
