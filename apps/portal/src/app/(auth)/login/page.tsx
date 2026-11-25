'use client';

import { useI18n } from '@portal/i18n/react';
import { LoginCard } from '@portal/ui';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PORTAL_SESSION_KEY } from '@/hooks/use-portal-session';
import { portalApi } from '@/lib/api';

export default function PortalLoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, setLocale } = useI18n();

  return (
    <LoginCard
      eyebrow={t.auth.portalEyebrow}
      badgeLabel={t.auth.portalBadge}
      badgeTone="cobalt"
      title={t.auth.portalLoginTitle}
      description={t.auth.portalLoginDesc}
      submitLabel={t.common.signIn}
      emailLabel={t.auth.workEmailLabel}
      emailPlaceholder={t.auth.portalEmailPlaceholder}
      onSubmitLogin={async (values) => {
        const res = await portalApi.post<{ locale?: 'fa' | 'en' }>('/auth/portal/login', values);
        if (res.data?.locale) setLocale(res.data.locale);
        await queryClient.invalidateQueries({ queryKey: PORTAL_SESSION_KEY });
        router.push('/');
      }}
      footer={
        <div className="flex items-center justify-between text-xs">
          <Link href="/forgot-password" className="text-[var(--accent-cobalt)] hover:underline">
            {t.auth.forgotPasswordLink}
          </Link>
          <span dir="ltr" className="font-mono-tabular text-[var(--ink-muted)]">:3000</span>
        </div>
      }
    />
  );
}
