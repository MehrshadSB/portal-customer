'use client';

import { useI18n } from '@portal/i18n/react';
import {
  PERMISSIONS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketDto,
} from '@portal/types';
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  PageHeader,
  Select,
  SkeletonTable,
  StatusBadge,
} from '@portal/ui';
import { useQuery } from '@tanstack/react-query';
import { LifeBuoy, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { usePortalSession } from '@/hooks/use-portal-session';
import { portalApi } from '@/lib/api';

function PortalTicketsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasPermission } = usePortalSession(false);
  const { t, formatDateTime, formatNumber, interpolate, translateError, translateStatus } =
    useI18n();

  const [search, setSearch] = React.useState(() => searchParams.get('search') ?? '');
  const [statusFilter, setStatusFilter] = React.useState(() => searchParams.get('status') ?? '');
  const [priorityFilter, setPriorityFilter] = React.useState(
    () => searchParams.get('priority') ?? '',
  );
  const [page, setPage] = React.useState(() => {
    const parsed = Number(searchParams.get('page') ?? '1');
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
  });

  React.useEffect(() => {
    const qs = new URLSearchParams();
    if (search.trim()) qs.set('search', search.trim());
    if (statusFilter) qs.set('status', statusFilter);
    if (priorityFilter) qs.set('priority', priorityFilter);
    if (page > 1) qs.set('page', String(page));
    const query = qs.toString();
    if (query !== searchParams.toString()) {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
  }, [search, statusFilter, priorityFilter, page, pathname, router, searchParams]);

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
            <Link href="/tickets/new" className="app-btn app-btn-primary h-8 px-3 text-xs">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t.tickets.newTicket}
            </Link>
          ) : null
        }
      />

      {ticketsQuery.isError ? (
        <AlertBanner tone="crimson">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {translateError(
                typeof ticketsQuery.error === 'object' &&
                  ticketsQuery.error !== null &&
                  'code' in ticketsQuery.error
                  ? String(ticketsQuery.error.code)
                  : undefined,
                ticketsQuery.error instanceof Error ? ticketsQuery.error.message : t.common.noData,
              )}
            </span>
            <Button variant="outline" size="sm" onClick={() => void ticketsQuery.refetch()}>
              {t.common.retry}
            </Button>
          </div>
        </AlertBanner>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-rule)] bg-[var(--color-paper-2)]/60 px-4 py-3">
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
              placeholder={t.tickets.searchPlaceholder}
              aria-label={t.tickets.searchPlaceholder}
              className="ps-9"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label={t.common.status}
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
            aria-label={t.common.priority}
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

        <CardContent className="p-0">
          {ticketsQuery.isLoading ? (
            <SkeletonTable rows={6} columns={6} />
          ) : ticketsQuery.isError ? null : items.length === 0 ? (
            <EmptyState
              embedded
              headingLevel="h2"
              icon={<LifeBuoy className="h-4 w-4" />}
              title={t.tickets.emptyTitle}
              description={t.tickets.emptyDesc}
              action={
                search || statusFilter || priorityFilter ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setStatusFilter('');
                      setPriorityFilter('');
                      setPage(1);
                    }}
                  >
                    {t.common.clearFilters}
                  </Button>
                ) : canCreate ? (
                  <Button size="sm" asChild>
                    <Link href="/tickets/new">{t.tickets.newTicket}</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-rule)] bg-[var(--color-paper-2)] text-[var(--color-muted)]">
                    <th className="px-4 py-2.5 font-medium">{t.tickets.ticketNumber}</th>
                    <th className="px-4 py-2.5 font-medium">{t.tickets.subject}</th>
                    <th className="px-4 py-2.5 font-medium">{t.tickets.category}</th>
                    <th className="px-4 py-2.5 font-medium">{t.common.status}</th>
                    <th className="px-4 py-2.5 font-medium">{t.common.priority}</th>
                    <th className="px-4 py-2.5 text-end font-medium">{t.common.timestamp}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-rule)]">
                  {items.map((tk) => (
                    <tr
                      key={tk.id}
                      className="transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper-2)]/60"
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/tickets/${tk.id}`}
                          dir="ltr"
                          className="font-mono-tabular font-semibold text-[var(--color-accent-2)] hover:underline"
                        >
                          {tk.ticketNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[var(--color-ink)]">
                        <Link href={`/tickets/${tk.id}`} className="hover:underline">
                          {tk.subject}
                        </Link>
                        {tk.orderNumber ? (
                          <span className="block text-xs font-normal text-[var(--color-muted)]">
                            {tk.orderNumber}: {tk.orderTitle}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{tk.categoryName}</td>
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
                      <td className="font-mono-tabular px-4 py-2.5 text-end text-[var(--color-muted)]">
                        {formatDateTime(tk.lastMessageAt ?? tk.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>

        {meta && meta.totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-rule)] bg-[var(--color-paper-2)]/40 px-4 py-2.5 text-xs text-[var(--color-muted)]">
            <span className="font-mono-tabular">
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
      </Card>
    </div>
  );
}

export default function PortalTicketsPage() {
  return (
    <React.Suspense fallback={<SkeletonTable rows={6} columns={6} />}>
      <PortalTicketsContent />
    </React.Suspense>
  );
}
