'use client';

import { useI18n } from '@portal/i18n/react';
import type { AuthMethodsDto, OtpRequestResponseDto } from '@portal/types';
import { SsoOtpLoginCard } from '@portal/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { ADMIN_SESSION_KEY } from '@/hooks/use-admin-session';
import { adminApi } from '@/lib/api';

function AdminLoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { t, setLocale } = useI18n();

  const methodsQuery = useQuery({
    queryKey: ['admin', 'auth-methods'],
    queryFn: async () => (await adminApi.get<AuthMethodsDto>('/auth/admin/methods')).data,
  });

  const ssoError = params.get('error');

  return (
    <SsoOtpLoginCard
      eyebrow={t.auth.adminEyebrow}
      badgeLabel={t.auth.adminBadge}
      badgeTone="amber"
      title={t.auth.adminLoginTitle}
      description={t.auth.adminLoginDesc}
      authMethods={methodsQuery.data}
      ssoStartHref="/api/v1/auth/admin/sso/start"
      initialErrorCode={ssoError}
      onRequestOtp={async (values) =>
        (await adminApi.post<OtpRequestResponseDto>('/auth/admin/otp/request', values)).data
      }
      onVerifyOtp={async (values) => {
        const res = await adminApi.post<{ locale?: 'fa' | 'en' }>('/auth/admin/otp/verify', values);
        if (res.data?.locale) setLocale(res.data.locale);
        await queryClient.invalidateQueries({ queryKey: ADMIN_SESSION_KEY });
        router.push('/');
      }}
      footer={
        <div className="flex items-center justify-between text-xs text-[var(--ink-muted)]">
          <span>{t.meta.adminTitle}</span>
          <span dir="ltr" className="font-mono-tabular">
            :3001
          </span>
        </div>
      }
    />
  );
}

export default function AdminLoginPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-[var(--bg-canvas)]" />}>
      <AdminLoginContent />
    </React.Suspense>
  );
}
