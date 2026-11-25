'use client';

import { useI18n } from '@portal/i18n/react';
import { ForgotPasswordCard } from '@portal/ui';
import Link from 'next/link';
import { portalApi } from '@/lib/api';

export default function PortalForgotPasswordPage() {
  const { t } = useI18n();
  return (
    <ForgotPasswordCard
      eyebrow={t.auth.portalEyebrow}
      badgeLabel={t.auth.portalBadge}
      badgeTone="slate"
      title={t.auth.forgotTitle}
      description={t.auth.forgotDesc}
      onSubmitForgot={async (values) => {
        await portalApi.post('/auth/portal/forgot-password', values);
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
