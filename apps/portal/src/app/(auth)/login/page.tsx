'use client';

import { useI18n } from '@portal/i18n/react';
import type { AuthMethodsDto, OtpRequestResponseDto } from '@portal/types';
import { SsoOtpLoginCard } from '@portal/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { PORTAL_SESSION_KEY } from '@/hooks/use-portal-session';
import { portalApi } from '@/lib/api';

function PortalLoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { t, setLocale } = useI18n();

  const methodsQuery = useQuery({
    queryKey: ['portal', 'auth-methods'],
    queryFn: async () => (await portalApi.get<AuthMethodsDto>('/auth/portal/methods')).data,
  });

  const ssoError = params.get('error');

  return (
    <SsoOtpLoginCard
      eyebrow={t.auth.portalEyebrow}
      badgeLabel={t.auth.portalBadge}
      badgeTone="cobalt"
      title={t.auth.portalLoginTitle}
      description={t.auth.portalLoginDesc}
      authMethods={methodsQuery.data}
      ssoStartHref="/api/v1/auth/portal/sso/start"
      initialErrorCode={ssoError}
      onRequestOtp={async (values) =>
        (await portalApi.post<OtpRequestResponseDto>('/auth/portal/otp/request', values)).data
      }
      onVerifyOtp={async (values) => {
        const res = await portalApi.post<{ locale?: 'fa' | 'en' }>('/auth/portal/otp/verify', values);
        if (res.data?.locale) setLocale(res.data.locale);
        await queryClient.invalidateQueries({ queryKey: PORTAL_SESSION_KEY });
        router.push('/');
      }}
    />
  );
}

export default function PortalLoginPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-[var(--bg-canvas)]" />}>
      <PortalLoginContent />
    </React.Suspense>
  );
}
