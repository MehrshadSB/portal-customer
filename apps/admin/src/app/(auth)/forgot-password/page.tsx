'use client';

import { useI18n } from '@portal/i18n/react';
import { ForgotPasswordCard } from '@portal/ui';
import Link from 'next/link';
import { adminApi } from '@/lib/api';

export default function AdminForgotPasswordPage() {
  const { t } = useI18n();
  return (
    <ForgotPasswordCard
      eyebrow={t.auth.adminEyebrow}
      badgeLabel={t.auth.adminBadge}
      badgeTone="amber"
      title={t.auth.forgotTitle}
      description={t.auth.forgotDesc}
      onSubmitForgot={async (values) => {
        await adminApi.post('/auth/admin/forgot-password', values);
      }}
      footer={
        <div className="text-center text-xs">
          <Link href="/login" className="text-[var(--accent-cobalt)] hover:underline">
            {t.auth.backToSignIn}
          </Link>
        </div>
      }
    />
  );
}
