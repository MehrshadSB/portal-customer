'use client';

import { useI18n } from '@portal/i18n/react';
import {
  ORDER_OPERATIONAL_STATES,
  ORDER_PRIORITIES,
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
import { FileText, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { portalApi } from '@/lib/api';

function PortalOrdersContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t, formatDate, formatNumber, interpolate, translateError, translateStatus } = useI18n();

  const [search, setSearch] = React.useState(() => searchParams.get('search') ?? '');
  const [stateFilter, setStateFilter] = React.useState(() => searchParams.get('state') ?? '');
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
    if (stateFilter) qs.set('state', stateFilter);
    if (priorityFilter) qs.set('priority', priorityFilter);
    if (page > 1) qs.set('page', String(page));
    const query = qs.toString();
    if (query !== searchParams.toString()) {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
  }, [search, stateFilter, priorityFilter, page, pathname, router, searchParams]);

  const ordersQuery = useQuery({
    queryKey: ['portal', 'orders', { search, stateFilter, priorityFilter, page }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search.trim()) params.set('search', search.trim());
      if (stateFilter) params.set('operationalState', stateFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      return portalApi.get<OrderDto[]>(`/orders?${params.toString()}`);
    },
  });

  const items = ordersQuery.data?.data ?? [];
  const meta = ordersQuery.data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.orders.eyebrow}
        title={t.orders.title}
        description={t.orders.portalDescription}
        actions={
          <Link href="/tickets/new" className="app-btn app-btn-outline h-8 px-3 text-xs">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t.tickets.newTicket}
          </Link>
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
              placeholder={t.orders.searchPlaceholder}
              aria-label={t.orders.searchPlaceholder}
              className="ps-9"
            />
          </div>
          <Select
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setPage(1);
            }}
            aria-label={t.orders.operationalState}
            className="w-44"
          >
            <option value="">{t.common.allStatuses}</option>
            {ORDER_OPERATIONAL_STATES.filter((s) => s !== 'draft').map((s) => (
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
            {ORDER_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {translateStatus(p)}
              </option>
            ))}
          </Select>
        </div>

        <CardContent className="p-0">
          {ordersQuery.isLoading ? (
            <SkeletonTable rows={6} columns={6} />
          ) : ordersQuery.isError ? null : items.length === 0 ? (
            <EmptyState
              embedded
              headingLevel="h2"
              icon={<FileText className="h-4 w-4" />}
              title={t.orders.emptyTitle}
              description={t.orders.emptyDesc}
              action={
                search || stateFilter || priorityFilter ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setStateFilter('');
                      setPriorityFilter('');
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
                  <tr className="border-b border-[var(--color-rule)] bg-[var(--color-paper-2)] text-[var(--color-muted)]">
                    <th className="px-4 py-2.5 font-medium">{t.orders.orderNumber}</th>
                    <th className="px-4 py-2.5 font-medium">{t.tickets.subject}</th>
                    <th className="px-4 py-2.5 font-medium">{t.orders.currentStage}</th>
                    <th className="px-4 py-2.5 font-medium">{t.orders.operationalState}</th>
                    <th className="px-4 py-2.5 font-medium">{t.common.priority}</th>
                    <th className="px-4 py-2.5 text-end font-medium">
                      {t.orders.expectedCompletion}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-rule)]">
                  {items.map((order) => (
                    <tr
                      key={order.id}
                      className="transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper-2)]/60"
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/orders/${order.id}`}
                          dir="ltr"
                          className="font-mono-tabular font-semibold text-[var(--color-accent-2)] hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[var(--color-ink)]">
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
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge
                            label={order.currentStageName}
                            tone={order.currentStageColor}
                          />
                          <span className="font-mono-tabular text-xs text-[var(--color-muted)]">
                            {interpolate(t.orders.stageStepOf, {
                              current: formatNumber(order.currentStageOrder),
                              total: formatNumber(order.totalVisibleStages),
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
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
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          label={translateStatus(order.priority)}
                          tone={
                            order.priority === 'rush'
                              ? 'crimson'
                              : order.priority === 'high'
                                ? 'amber'
                                : 'slate'
                          }
                        />
                      </td>
                      <td className="font-mono-tabular px-4 py-2.5 text-end text-[var(--color-muted)]">
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-rule)] bg-[var(--color-paper-2)]/40 px-4 py-2.5 text-xs text-[var(--color-muted)]">
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
    </div>
  );
}

export default function PortalOrdersPage() {
  return (
    <React.Suspense fallback={<SkeletonTable rows={6} columns={6} />}>
      <PortalOrdersContent />
    </React.Suspense>
  );
}
