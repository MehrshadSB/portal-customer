'use client';

import { useI18n } from '@portal/i18n/react';
import type { AuditLogDto } from '@portal/types';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  ModalDialog,
  PageHeader,
  StatusBadge,
} from '@portal/ui';
import { useQuery } from '@tanstack/react-query';
import { Search, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { adminApi } from '@/lib/api';

export default function AdminAuditLogsPage() {
  const { t, formatDateTime, formatNumber, interpolate, translateStatus } = useI18n();
  const [search, setSearch] = React.useState('');
  const [entityType, setEntityType] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<AuditLogDto | null>(null);

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

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-[var(--ink-muted)]" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
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
          placeholder={t.admin.audit.entityPlaceholder}
          className="w-64 text-start"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<ShieldCheck className="h-4 w-4" />}
                title={t.admin.audit.emptyTitle}
                description={t.admin.audit.emptyDesc}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--ink-muted)]">
                    <th className="px-4 py-2.5 font-medium">{t.common.timestamp}</th>
                    <th className="px-4 py-2.5 font-medium">{t.admin.audit.colAction}</th>
                    <th className="px-4 py-2.5 font-medium">{t.admin.audit.colActor}</th>
                    <th className="px-4 py-2.5 font-medium">{t.admin.audit.colEntity}</th>
                    <th className="px-4 py-2.5 font-medium">{t.admin.audit.colSummary}</th>
                    <th className="px-4 py-2.5 text-end font-medium">{t.admin.audit.colDiff}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {items.map((entry) => (
                    <tr key={entry.id} className="hover:bg-[var(--bg-subtle)]/50">
                      <td className="font-mono-tabular whitespace-nowrap px-4 py-2.5 text-[11px] text-[var(--ink-muted)]">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge label={entry.action} tone="cobalt" mono />
                      </td>
                      <td className="px-4 py-2.5">
                        <span dir="ltr" className="font-mono-tabular font-medium">
                          {entry.actorEmail ?? translateStatus(entry.actorType)}
                        </span>
                        <span className="ms-1.5 text-[11px] text-[var(--ink-muted)]">
                          ({translateStatus(entry.actorType)})
                        </span>
                      </td>
                      <td dir="ltr" className="font-mono-tabular px-4 py-2.5 text-start text-[var(--ink-muted)]">
                        {entry.entityType}
                      </td>
                      <td className="px-4 py-2.5">{entry.summary}</td>
                      <td className="px-4 py-2.5 text-end">
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
      </Card>

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between text-xs text-[var(--ink-muted)]">
          <span>
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

      <ModalDialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.action ?? ''}
        description={selected?.summary}
        className="max-w-2xl"
      >
        {selected ? (
          <div className="space-y-4 text-xs">
            <div
              dir="ltr"
              className="grid gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 font-mono-tabular text-start text-[11px] sm:grid-cols-2"
            >
              <div>{t.admin.audit.actorLabel}: {selected.actorEmail ?? selected.actorType}</div>
              <div>{t.admin.audit.ipLabel}: {selected.ipAddress ?? '—'}</div>
              <div>{t.admin.audit.entityIdLabel}: {selected.entityId ?? '—'}</div>
              <div>{t.admin.audit.requestIdLabel}: {selected.requestId ?? '—'}</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 font-semibold">{t.admin.audit.beforeLabel}</p>
                <pre
                  dir="ltr"
                  className="max-h-60 overflow-auto rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-2.5 font-mono-tabular text-start text-[11px]"
                >
                  {JSON.stringify(selected.beforeJson, null, 2) || 'null'}
                </pre>
              </div>
              <div>
                <p className="mb-1 font-semibold">{t.admin.audit.afterLabel}</p>
                <pre
                  dir="ltr"
                  className="max-h-60 overflow-auto rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-2.5 font-mono-tabular text-start text-[11px]"
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
