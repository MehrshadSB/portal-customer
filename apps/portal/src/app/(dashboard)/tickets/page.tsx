'use client';

import { useI18n } from '@portal/i18n/react';
import {
  PERMISSIONS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketDto,
} from '@portal/types';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  PageHeader,
  Select,
  StatusBadge,
} from '@portal/ui';
import { useQuery } from '@tanstack/react-query';
import { LifeBuoy, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { usePortalSession } from '@/hooks/use-portal-session';
import { portalApi } from '@/lib/api';

export default function PortalTicketsPage() {
  const { hasPermission } = usePortalSession(false);
  const { t, formatDateTime, formatNumber, interpolate, translateStatus } = useI18n();
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [priorityFilter, setPriorityFilter] = React.useState('');
  const [page, setPage] = React.useState(1);

  const canCreate = hasPermission(PERMISSIONS.TICKET_CREATE_COMPANY);

  const ticketsQuery = useQuery({
    queryKey: ['portal', 'tickets', { search, statusFilter, priorityFilter, page }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      return portalApi.get<TicketDto[]>(`/tickets?${params.toString()}`);
    },
  });

  const items = ticketsQuery.data?.data ?? [];
  const meta = ticketsQuery.data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.tickets.eyebrow}
        title={t.tickets.title}
        description={t.tickets.portalDescription}
        actions={
          canCreate ? (
            <Link
              href="/tickets/new"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--accent-cobalt)] px-3 text-xs font-medium text-white hover:bg-[var(--accent-cobalt-hover)]"
            >
              <Plus className="h-3.5 w-3.5" />
              {t.tickets.newTicket}
            </Link>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-[var(--ink-muted)]" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t.tickets.searchPlaceholder}
            className="ps-9"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="w-44"
        >
          <option value="">{t.common.allStatuses}</option>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {translateStatus(s)}
            </option>
          ))}
        </Select>
        <Select
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(e.target.value);
            setPage(1);
          }}
          className="w-40"
        >
          <option value="">{t.common.priority}</option>
          {TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {translateStatus(p)}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {ticketsQuery.isLoading ? (
            <p className="p-6 text-xs text-[var(--ink-muted)]">{t.common.loading}</p>
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<LifeBuoy className="h-4 w-4" />}
                title={t.tickets.emptyTitle}
                description={t.tickets.emptyDesc}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--ink-muted)]">
                    <th className="px-4 py-2.5 font-medium">{t.tickets.ticketNumber}</th>
                    <th className="px-4 py-2.5 font-medium">{t.tickets.subject}</th>
                    <th className="px-4 py-2.5 font-medium">{t.tickets.category}</th>
                    <th className="px-4 py-2.5 font-medium">{t.common.status}</th>
                    <th className="px-4 py-2.5 font-medium">{t.common.priority}</th>
                    <th className="px-4 py-2.5 text-end font-medium">{t.common.timestamp}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {items.map((tk) => (
                    <tr key={tk.id} className="hover:bg-[var(--bg-subtle)]/50">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/tickets/${tk.id}`}
                          dir="ltr"
                          className="font-mono-tabular font-semibold text-[var(--accent-cobalt)] hover:underline"
                        >
                          {tk.ticketNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[var(--ink-primary)]">
                        <Link href={`/tickets/${tk.id}`} className="hover:underline">
                          {tk.subject}
                        </Link>
                        {tk.orderNumber ? (
                          <span className="block text-[11px] font-normal text-[var(--ink-muted)]">
                            {tk.orderNumber} · {tk.orderTitle}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--ink-muted)]">{tk.categoryName}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          label={translateStatus(tk.status)}
                          tone={
                            tk.status === 'resolved' || tk.status === 'closed'
                              ? 'emerald'
                              : tk.status === 'waiting_for_customer'
                                ? 'amber'
                                : 'cobalt'
                          }
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          label={translateStatus(tk.priority)}
                          tone={
                            tk.priority === 'urgent'
                              ? 'crimson'
                              : tk.priority === 'high'
                                ? 'amber'
                                : 'slate'
                          }
                        />
                      </td>
                      <td className="font-mono-tabular px-4 py-2.5 text-end text-[var(--ink-muted)]">
                        {formatDateTime(tk.lastMessageAt ?? tk.createdAt)}
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
            })}
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
    </div>
  );
}
