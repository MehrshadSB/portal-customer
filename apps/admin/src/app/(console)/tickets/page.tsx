'use client';

import { useI18n } from '@portal/i18n/react';
import {
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
import { LifeBuoy, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { adminApi } from '@/lib/api';

function AdminTicketsContent() {
  const { t, formatDateTime, formatNumber, interpolate, translateError, translateStatus } =
    useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(() => searchParams.get('search') ?? '');
  const [statusFilter, setStatusFilter] = React.useState(() => searchParams.get('status') ?? '');
  const [priorityFilter, setPriorityFilter] = React.useState(
    () => searchParams.get('priority') ?? '',
  );
  const [unassignedOnly, setUnassignedOnly] = React.useState(
    () => searchParams.get('unassigned') === 'true',
  );
  const [page, setPage] = React.useState(() =>
    Math.max(1, Number(searchParams.get('page') ?? '1') || 1),
  );

  React.useEffect(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set('search', search.trim());
    if (statusFilter) p.set('status', statusFilter);
    if (priorityFilter) p.set('priority', priorityFilter);
    if (unassignedOnly) p.set('unassigned', 'true');
    if (page > 1) p.set('page', String(page));
    const qs = p.toString();
    if (qs !== searchParams.toString()) {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [search, statusFilter, priorityFilter, unassignedOnly, page, pathname, router, searchParams]);

  const ticketsQuery = useQuery({
    queryKey: ['admin', 'tickets', { search, statusFilter, priorityFilter, unassignedOnly, page }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (unassignedOnly) params.set('unassignedOnly', 'true');
      return adminApi.get<TicketDto[]>(`/tickets?${params.toString()}`);
    },
  });

  const items = ticketsQuery.data?.data ?? [];
  const meta = ticketsQuery.data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.tickets.eyebrow}
        title={t.tickets.title}
        description={t.tickets.adminDescription}
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

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-rule)] bg-[var(--color-paper-2)]/65 p-4">
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
              aria-label={t.tickets.searchPlaceholder}
              placeholder={t.tickets.searchPlaceholder}
              className="ps-9"
            />
          </div>
          <Select
            value={statusFilter}
            aria-label={t.common.status}
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
            aria-label={t.common.priority}
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
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-input)] border border-[var(--color-muted)] bg-[var(--color-cotton)] px-3 text-xs font-medium text-[var(--color-ink)]">
            <input
              type="checkbox"
              checked={unassignedOnly}
              onChange={(e) => {
                setUnassignedOnly(e.target.checked);
                setPage(1);
              }}
              className="accent-[var(--color-board)]"
            />
            <span>{t.tickets.unassignedOnly}</span>
          </label>
        </div>

        <CardContent className="p-0">
          {ticketsQuery.isLoading ? (
            <SkeletonTable rows={6} columns={7} />
          ) : ticketsQuery.isError ? null : items.length === 0 ? (
            <EmptyState
              embedded
              headingLevel="h2"
              icon={<LifeBuoy className="h-4 w-4" aria-hidden="true" />}
              title={t.tickets.emptyTitle}
              description={t.tickets.emptyDesc}
              action={
                search || statusFilter || priorityFilter || unassignedOnly ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setStatusFilter('');
                      setPriorityFilter('');
                      setUnassignedOnly(false);
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
                      {t.tickets.ticketNumber}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.orders.customer}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.tickets.subject}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.tickets.assignee}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.common.status}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.common.priority}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-end font-medium">
                      {t.common.timestamp}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-rule)]">
                  {items.map((tk) => (
                    <tr
                      key={tk.id}
                      className="transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper)]"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/tickets/${tk.id}`}
                          dir="ltr"
                          className="font-mono-tabular font-semibold text-[var(--color-accent-2)] hover:underline"
                        >
                          {tk.ticketNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/customers/${tk.customerId}`}
                          className="font-medium text-[var(--color-ink)] hover:underline"
                        >
                          {tk.customerName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                        <Link href={`/tickets/${tk.id}`} className="hover:underline">
                          {tk.subject}
                        </Link>
                        {tk.orderNumber ? (
                          <span className="font-mono-tabular block text-xs font-normal text-[var(--color-muted)]">
                            {tk.orderNumber}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">
                        {tk.assignedEmployeeName ?? tk.assignedDepartmentName ?? t.common.unassigned}
                      </td>
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3">
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
                      <td className="font-mono-tabular px-4 py-3 text-end text-[var(--color-muted)]">
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
          <div className="flex items-center justify-between border-t border-[var(--color-rule)] bg-[var(--color-paper-2)]/50 px-4 py-3 text-xs text-[var(--color-muted)]">
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

export default function AdminTicketsPage() {
  return (
    <React.Suspense fallback={<SkeletonTable rows={6} columns={7} />}>
      <AdminTicketsContent />
    </React.Suspense>
  );
}
