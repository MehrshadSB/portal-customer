'use client';

import { useI18n } from '@portal/i18n/react';
import {
  ORDER_OPERATIONAL_STATES,
  ORDER_PRIORITIES,
  PERMISSIONS,
  type OrderDto,
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
import { ClipboardList, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useAdminSession } from '@/hooks/use-admin-session';
import { adminApi } from '@/lib/api';

function AdminOrdersContent() {
  const { hasPermission } = useAdminSession(false);
  const { t, formatDate, formatNumber, interpolate, translateError, translateStatus } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(() => searchParams.get('search') ?? '');
  const [stateFilter, setStateFilter] = React.useState(() => searchParams.get('state') ?? '');
  const [priorityFilter, setPriorityFilter] = React.useState(
    () => searchParams.get('priority') ?? '',
  );
  const [overdueOnly, setOverdueOnly] = React.useState(
    () => searchParams.get('overdue') === 'true',
  );
  const [page, setPage] = React.useState(() =>
    Math.max(1, Number(searchParams.get('page') ?? '1') || 1),
  );

  React.useEffect(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set('search', search.trim());
    if (stateFilter) p.set('state', stateFilter);
    if (priorityFilter) p.set('priority', priorityFilter);
    if (overdueOnly) p.set('overdue', 'true');
    if (page > 1) p.set('page', String(page));
    const qs = p.toString();
    if (qs !== searchParams.toString()) {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [search, stateFilter, priorityFilter, overdueOnly, page, pathname, router, searchParams]);

  const canCreate = hasPermission(PERMISSIONS.ORDER_CREATE);

  const ordersQuery = useQuery({
    queryKey: ['admin', 'orders', { search, stateFilter, priorityFilter, overdueOnly, page }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search.trim()) params.set('search', search.trim());
      if (stateFilter) params.set('operationalState', stateFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (overdueOnly) params.set('overdueOnly', 'true');
      return adminApi.get<OrderDto[]>(`/orders?${params.toString()}`);
    },
  });

  const items = ordersQuery.data?.data ?? [];
  const meta = ordersQuery.data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.orders.eyebrow}
        title={t.orders.title}
        description={t.orders.adminDescription}
        actions={
          canCreate ? (
            <Button size="sm" asChild>
              <Link href="/orders/new">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t.orders.newOrder}
              </Link>
            </Button>
          ) : null
        }
      />

      {ordersQuery.isError ? (
        <AlertBanner tone="crimson">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {translateError(
                typeof ordersQuery.error === 'object' &&
                  ordersQuery.error !== null &&
                  'code' in ordersQuery.error
                  ? String(ordersQuery.error.code)
                  : undefined,
                ordersQuery.error instanceof Error ? ordersQuery.error.message : t.common.noData,
              )}
            </span>
            <Button variant="outline" size="sm" onClick={() => void ordersQuery.refetch()}>
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
              aria-label={t.orders.searchPlaceholder}
              placeholder={t.orders.searchPlaceholder}
              className="ps-9"
            />
          </div>
          <Select
            value={stateFilter}
            aria-label={t.orders.operationalState}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setPage(1);
            }}
            className="w-44"
          >
            <option value="">{t.common.allStatuses}</option>
            {ORDER_OPERATIONAL_STATES.map((s) => (
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
            {ORDER_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {translateStatus(p)}
              </option>
            ))}
          </Select>
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-input)] border border-[var(--color-muted)] bg-[var(--color-cotton)] px-3 text-xs font-medium text-[var(--color-ink)]">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => {
                setOverdueOnly(e.target.checked);
                setPage(1);
              }}
              className="accent-[var(--color-board)]"
            />
            <span>{t.orders.overdueBadge}</span>
          </label>
        </div>

        <CardContent className="p-0">
          {ordersQuery.isLoading ? (
            <SkeletonTable rows={6} columns={6} />
          ) : ordersQuery.isError ? null : items.length === 0 ? (
            <EmptyState
              embedded
              headingLevel="h2"
              icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />}
              title={t.orders.emptyTitle}
              description={t.orders.emptyDesc}
              action={
                search || stateFilter || priorityFilter || overdueOnly ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setStateFilter('');
                      setPriorityFilter('');
                      setOverdueOnly(false);
                      setPage(1);
                    }}
                  >
                    {t.common.clearFilters}
                  </Button>
                ) : canCreate ? (
                  <Button size="sm" asChild>
                    <Link href="/orders/new">{t.orders.newOrder}</Link>
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
                      {t.orders.orderNumber}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.orders.customer}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.tickets.subject}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.orders.currentStage}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.orders.operationalState}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-end font-medium">
                      {t.orders.expectedCompletion}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-rule)]">
                  {items.map((order) => (
                    <tr
                      key={order.id}
                      className="transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper)]"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/orders/${order.id}`}
                          dir="ltr"
                          className="font-mono-tabular font-semibold text-[var(--color-accent-2)] hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/customers/${order.customerId}`}
                          className="font-medium text-[var(--color-ink)] hover:underline"
                        >
                          {order.customerName}
                        </Link>
                        <span
                          dir="ltr"
                          className="font-mono-tabular block text-xs text-[var(--color-muted)]"
                        >
                          {order.customerCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                        <Link href={`/orders/${order.id}`} className="hover:underline">
                          {order.title}
                        </Link>
                        {order.poNumber ? (
                          <span
                            dir="ltr"
                            className="font-mono-tabular block text-xs font-normal text-[var(--color-muted)]"
                          >
                            PO: {order.poNumber}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={order.currentStageName}
                          tone={order.currentStageColor}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={translateStatus(order.operationalState)}
                          tone={
                            order.operationalState === 'completed'
                              ? 'emerald'
                              : order.operationalState === 'on_hold'
                                ? 'amber'
                                : order.operationalState === 'cancelled'
                                  ? 'crimson'
                                  : 'cobalt'
                          }
                        />
                      </td>
                      <td className="font-mono-tabular px-4 py-3 text-end text-[var(--color-muted)]">
                        {order.expectedCompletionDate
                          ? formatDate(order.expectedCompletionDate)
                          : '-'}
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

export default function AdminOrdersPage() {
  return (
    <React.Suspense fallback={<SkeletonTable rows={6} columns={6} />}>
      <AdminOrdersContent />
    </React.Suspense>
  );
}
