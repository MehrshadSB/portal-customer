'use client';

import { useI18n } from '@portal/i18n/react';
import {
  ORDER_OPERATIONAL_STATES,
  ORDER_PRIORITIES,
  type OrderDto,
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
import { FileText, Search } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { portalApi } from '@/lib/api';

export default function PortalOrdersPage() {
  const { t, formatDate, formatNumber, interpolate, translateStatus } = useI18n();
  const [search, setSearch] = React.useState('');
  const [stateFilter, setStateFilter] = React.useState('');
  const [priorityFilter, setPriorityFilter] = React.useState('');
  const [page, setPage] = React.useState(1);

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
          <Link
            href="/tickets/new"
            className="inline-flex h-8 items-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-xs font-medium hover:bg-[var(--bg-subtle)]"
          >
            {t.tickets.newTicket}
          </Link>
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
            placeholder={t.orders.searchPlaceholder}
            className="ps-9"
          />
        </div>
        <Select
          value={stateFilter}
          onChange={(e) => {
            setStateFilter(e.target.value);
            setPage(1);
          }}
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

      <Card>
        <CardContent className="p-0">
          {ordersQuery.isLoading ? (
            <p className="p-6 text-xs text-[var(--ink-muted)]">{t.common.loading}</p>
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<FileText className="h-4 w-4" />}
                title={t.orders.emptyTitle}
                description={t.orders.emptyDesc}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--ink-muted)]">
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
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {items.map((order) => (
                    <tr key={order.id} className="hover:bg-[var(--bg-subtle)]/50">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/orders/${order.id}`}
                          dir="ltr"
                          className="font-mono-tabular font-semibold text-[var(--accent-cobalt)] hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[var(--ink-primary)]">
                        <Link href={`/orders/${order.id}`} className="hover:underline">
                          {order.title}
                        </Link>
                        {order.poNumber ? (
                          <span
                            dir="ltr"
                            className="font-mono-tabular block text-[11px] font-normal text-[var(--ink-muted)]"
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
                          <span className="font-mono-tabular text-[11px] text-[var(--ink-muted)]">
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
                      <td className="font-mono-tabular px-4 py-2.5 text-end text-[var(--ink-muted)]">
                        {order.expectedCompletionDate
                          ? formatDate(order.expectedCompletionDate)
                          : '—'}
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
    </div>
  );
}
