'use client';

import { useI18n } from '@portal/i18n/react';
import { LoginCard } from '@portal/ui';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ADMIN_SESSION_KEY } from '@/hooks/use-admin-session';
import { adminApi } from '@/lib/api';

export default function AdminLoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, setLocale } = useI18n();

  return (
    <LoginCard
      eyebrow={t.auth.adminEyebrow}
      badgeLabel={t.auth.adminBadge}
      badgeTone="amber"
      title={t.auth.adminLoginTitle}
      description={t.auth.adminLoginDesc}
      submitLabel={t.common.signIn}
      emailLabel={t.auth.employeeEmailLabel}
      emailPlaceholder={t.auth.adminEmailPlaceholder}
      onSubmitLogin={async (values) => {
        const res = await adminApi.post<{ locale?: 'fa' | 'en' }>('/auth/admin/login', values);
        if (res.data?.locale) setLocale(res.data.locale);
        await queryClient.invalidateQueries({ queryKey: ADMIN_SESSION_KEY });
        router.push('/');
      }}
      footer={
        <div className="flex items-center justify-between text-xs">
          <Link href="/forgot-password" className="text-[var(--accent-cobalt)] hover:underline">
            {t.auth.forgotPasswordLink}
          </Link>
          <span dir="ltr" className="font-mono-tabular text-[var(--ink-muted)]">:3001</span>
        </div>
      }
    />
  );
}
