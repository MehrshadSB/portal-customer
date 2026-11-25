'use client';

import { useI18n } from '@portal/i18n/react';
import { ResetPasswordCard } from '@portal/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { adminApi } from '@/lib/api';

function ResetContent() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const { t } = useI18n();

  return (
    <ResetPasswordCard
      eyebrow={t.auth.adminEyebrow}
      badgeLabel={t.auth.adminBadge}
      badgeTone="amber"
      title={t.auth.resetTitle}
      description={t.auth.resetDesc}
      token={token}
      onSubmitReset={async (values) => {
        await adminApi.post('/auth/admin/reset-password', values);
      }}
      footer={
        <div className="text-center text-xs">
          <Link href="/login" className="text-[var(--accent-cobalt)] hover:underline">
            {t.auth.proceedToSignIn}
          </Link>
        </div>
      }
    />
  );
}

export default function AdminResetPasswordPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-[var(--bg-canvas)]" />}>
      <ResetContent />
    </React.Suspense>
  );
}
