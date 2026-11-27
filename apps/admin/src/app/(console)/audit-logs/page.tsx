'use client';

import { useI18n } from '@portal/i18n/react';
import type { AuditLogDto } from '@portal/types';
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  ModalDialog,
  PageHeader,
  SkeletonTable,
  StatusBadge,
} from '@portal/ui';
import { useQuery } from '@tanstack/react-query';
import { Search, ShieldCheck } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { adminApi } from '@/lib/api';

function AdminAuditLogsContent() {
  const { t, formatDateTime, formatNumber, interpolate, translateError, translateStatus } =
    useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(() => searchParams.get('search') ?? '');
  const [entityType, setEntityType] = React.useState(() => searchParams.get('entity') ?? '');
  const [page, setPage] = React.useState(() =>
    Math.max(1, Number(searchParams.get('page') ?? '1') || 1),
  );
  const [selected, setSelected] = React.useState<AuditLogDto | null>(null);

  React.useEffect(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set('search', search.trim());
    if (entityType.trim()) p.set('entity', entityType.trim());
    if (page > 1) p.set('page', String(page));
    const qs = p.toString();
    if (qs !== searchParams.toString()) {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [search, entityType, page, pathname, router, searchParams]);

  const query = useQuery({
    queryKey: ['admin', 'audit-logs', { search, entityType, page }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (search.trim()) params.set('search', search.trim());
      if (entityType.trim()) params.set('entityType', entityType.trim());
      return adminApi.get<AuditLogDto[]>(`/audit-logs?${params.toString()}`);
    },
  });

  const items = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.admin.audit.eyebrow}
        title={t.admin.audit.title}
        description={t.admin.audit.description}
      />

      {query.isError ? (
        <AlertBanner tone="crimson">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {translateError(
                typeof query.error === 'object' && query.error !== null && 'code' in query.error
                  ? String(query.error.code)
                  : undefined,
                query.error instanceof Error ? query.error.message : t.common.noData,
              )}
            </span>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              {t.common.retry}
            </Button>
          </div>
        </AlertBanner>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-3 border-b border-[var(--color-rule)] bg-[var(--color-paper-2)]/65 p-4">
          <div className="relative min-w-60 flex-1">
            <Search
              className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-[var(--color-muted)]"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label={t.admin.audit.searchPlaceholder}
              placeholder={t.admin.audit.searchPlaceholder}
              className="ps-9"
            />
          </div>
          <Input
            value={entityType}
            dir="ltr"
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
            aria-label={t.admin.audit.entityPlaceholder}
            placeholder={t.admin.audit.entityPlaceholder}
            className="w-64 text-start"
          />
        </div>

        <CardContent className="p-0">
          {query.isLoading ? (
            <SkeletonTable rows={6} columns={6} />
          ) : query.isError ? null : items.length === 0 ? (
            <EmptyState
              embedded
              headingLevel="h2"
              icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              title={t.admin.audit.emptyTitle}
              description={t.admin.audit.emptyDesc}
              action={
                search || entityType ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setEntityType('');
                      setPage(1);
                    }}
                  >
                    {t.common.clearFilters}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-rule)] bg-[var(--color-paper-2)]/75 text-[var(--color-muted)]">
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.common.timestamp}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.admin.audit.colAction}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.admin.audit.colActor}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.admin.audit.colEntity}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.admin.audit.colSummary}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-end font-medium">
                      {t.admin.audit.colDiff}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-rule)]">
                  {items.map((entry) => (
                    <tr
                      key={entry.id}
                      className="transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper)]"
                    >
                      <td className="font-mono-tabular whitespace-nowrap px-4 py-3 text-xs text-[var(--color-muted)]">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={entry.action} tone="cobalt" mono />
                      </td>
                      <td className="px-4 py-3">
                        {entry.actorEmail ? (
                          <>
                            <span
                              dir="ltr"
                              className="font-mono-tabular inline-block font-medium text-[var(--color-ink)]"
                            >
                              {entry.actorEmail}
                            </span>
                            <span className="ms-1.5 text-xs text-[var(--color-muted)]">
                              ({translateStatus(entry.actorType)})
                            </span>
                          </>
                        ) : (
                          <span className="font-medium text-[var(--color-ink)]">
                            {translateStatus(entry.actorType)}
                          </span>
                        )}
                      </td>
                      <td className="font-mono-tabular px-4 py-3 text-start text-[var(--color-muted)]">
                        <span dir="ltr" className="inline-block">
                          {entry.entityType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-ink)]">{entry.summary}</td>
                      <td className="px-4 py-3 text-end">
                        <Button variant="outline" size="sm" onClick={() => setSelected(entry)}>
                          {t.common.inspect}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>

        {meta && meta.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-[var(--color-rule)] bg-[var(--color-paper-2)]/50 px-4 py-3 text-xs text-[var(--color-muted)]">
            <span className="font-mono-tabular">
              {interpolate(t.common.pageOf, {
                page: formatNumber(meta.page),
                totalPages: formatNumber(meta.totalPages),
              })}{' '}
              {interpolate(t.common.totalItems, { total: formatNumber(meta.total) })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t.common.previous}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t.common.next}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <ModalDialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.action ?? ''}
        description={selected?.summary}
        className="max-w-2xl"
      >
        {selected ? (
          <div className="space-y-4 text-xs">
            <div className="grid gap-2 rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-3 text-start text-xs sm:grid-cols-2">
              <div>
                <span>{t.admin.audit.actorLabel}: </span>
                <span dir="ltr" className="font-mono-tabular inline-block font-medium">
                  {selected.actorEmail ?? selected.actorType}
                </span>
              </div>
              <div>
                <span>{t.admin.audit.ipLabel}: </span>
                <span dir="ltr" className="font-mono-tabular inline-block font-medium">
                  {selected.ipAddress ?? '-'}
                </span>
              </div>
              <div>
                <span>{t.admin.audit.entityIdLabel}: </span>
                <span dir="ltr" className="font-mono-tabular inline-block font-medium">
                  {selected.entityId ?? '-'}
                </span>
              </div>
              <div>
                <span>{t.admin.audit.requestIdLabel}: </span>
                <span dir="ltr" className="font-mono-tabular inline-block font-medium">
                  {selected.requestId ?? '-'}
                </span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 font-semibold text-[var(--color-ink)]">
                  {t.admin.audit.beforeLabel}
                </p>
                <pre
                  dir="ltr"
                  className="font-mono-tabular max-h-60 overflow-auto rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-3 text-start text-xs"
                >
                  {JSON.stringify(selected.beforeJson, null, 2) || 'null'}
                </pre>
              </div>
              <div>
                <p className="mb-1.5 font-semibold text-[var(--color-ink)]">
                  {t.admin.audit.afterLabel}
                </p>
                <pre
                  dir="ltr"
                  className="font-mono-tabular max-h-60 overflow-auto rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-3 text-start text-xs"
                >
                  {JSON.stringify(selected.afterJson, null, 2) || 'null'}
                </pre>
              </div>
            </div>
          </div>
        ) : null}
      </ModalDialog>
    </div>
  );
}

export default function AdminAuditLogsPage() {
  return (
    <React.Suspense fallback={<SkeletonTable rows={6} columns={6} />}>
      <AdminAuditLogsContent />
    </React.Suspense>
  );
}
