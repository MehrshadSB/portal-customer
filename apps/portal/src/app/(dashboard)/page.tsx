'use client';

import { useI18n } from '@portal/i18n/react';
import type { CustomerDto } from '@portal/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, StatusBadge } from '@portal/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePortalSession } from '@/hooks/use-portal-session';
import { portalApi } from '@/lib/api';

export default function CustomerPortalHomePage() {
  const { user } = usePortalSession(false);
  const { t, translateStatus } = useI18n();

  const companyQuery = useQuery({
    queryKey: ['portal', 'my-company'],
    queryFn: async () => (await portalApi.get<CustomerDto>('/customers/my-company')).data,
    enabled: Boolean(user),
  });

  const company = companyQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          company
            ? `${company.customerCode} · ${t.portal.overview.eyebrow}`
            : t.portal.overview.eyebrow
        }
        title={
          company
            ? `${t.portal.overview.welcomePrefix} ${company.companyName}`
            : t.portal.overview.fallbackTitle
        }
        description={t.portal.overview.description}
        actions={
          company ? (
            <StatusBadge
              label={translateStatus(company.status)}
              tone={company.status === 'active' ? 'emerald' : 'amber'}
            />
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t.portal.overview.accountCardTitle}</CardTitle>
            <CardDescription>{t.portal.overview.accountCardDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--ink-muted)]">{t.portal.overview.companyCode}</span>
              <span dir="ltr" className="font-mono-tabular font-medium">
                {company?.customerCode ?? '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--ink-muted)]">{t.portal.overview.industry}</span>
              <span>{company?.industry ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--ink-muted)]">{t.portal.overview.accountManager}</span>
              <span>{company?.accountManagerName ?? t.common.unassigned}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.portal.overview.teamCardTitle}</CardTitle>
            <CardDescription>{t.portal.overview.teamCardDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-[var(--ink-muted)]">
            <p>{t.portal.overview.teamCardBody}</p>
            <Link
              href="/team"
              className="inline-block font-medium text-[var(--accent-cobalt)] hover:underline"
            >
              {t.portal.overview.teamCardAction}
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.portal.overview.securityCardTitle}</CardTitle>
            <CardDescription>{t.portal.overview.securityCardDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-[var(--ink-muted)]">
            <p>{t.portal.overview.securityCardBody}</p>
            <Link
              href="/profile"
              className="inline-block font-medium text-[var(--accent-cobalt)] hover:underline"
            >
              {t.portal.overview.securityCardAction}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
