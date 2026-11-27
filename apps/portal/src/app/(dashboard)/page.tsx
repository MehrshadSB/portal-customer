'use client';

import { useI18n } from '@portal/i18n/react';
import type { CustomerDto, OrderDto, TicketDto } from '@portal/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  StatusBadge,
} from '@portal/ui';
import { useQuery } from '@tanstack/react-query';
import { FileText, LifeBuoy } from 'lucide-react';
import Link from 'next/link';
import { usePortalSession } from '@/hooks/use-portal-session';
import { portalApi } from '@/lib/api';

export default function CustomerPortalHomePage() {
  const { user } = usePortalSession(false);
  const { t, formatDate, formatNumber, interpolate, translateStatus } = useI18n();

  const companyQuery = useQuery({
    queryKey: ['portal', 'my-company'],
    queryFn: async () => (await portalApi.get<CustomerDto>('/customers/my-company')).data,
    enabled: Boolean(user),
  });

  const ordersQuery = useQuery({
    queryKey: ['portal', 'overview', 'orders'],
    queryFn: () => portalApi.get<OrderDto[]>('/orders?limit=6'),
    enabled: Boolean(user),
  });

  const ticketsQuery = useQuery({
    queryKey: ['portal', 'overview', 'tickets'],
    queryFn: () => portalApi.get<TicketDto[]>('/tickets?limit=5'),
    enabled: Boolean(user),
  });

  const company = companyQuery.data;
  const orders = ordersQuery.data?.data ?? [];
  const ordersTotal = ordersQuery.data?.meta?.total ?? orders.length;
  const tickets = ticketsQuery.data?.data ?? [];
  const ticketsTotal = ticketsQuery.data?.meta?.total ?? tickets.length;

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
          <div className="flex items-center gap-2">
            {company ? (
              <StatusBadge
                label={translateStatus(company.status)}
                tone={company.status === 'active' ? 'emerald' : 'amber'}
              />
            ) : null}
            <Link
              href="/tickets/new"
              className="inline-flex h-8 items-center rounded-md bg-[var(--accent-cobalt)] px-3 text-xs font-medium text-white hover:bg-[var(--accent-cobalt-hover)]"
            >
              {t.tickets.newTicket}
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t.portal.overview.activeOrdersCard}</CardTitle>
            <CardDescription>{t.portal.overview.recentOrdersDesc}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <span className="font-mono-tabular text-2xl font-semibold">
              {formatNumber(ordersTotal)}
            </span>
            <Link href="/orders" className="text-xs text-[var(--accent-cobalt)] hover:underline">
              {t.portal.overview.viewAllOrders}
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.portal.overview.openTicketsCard}</CardTitle>
            <CardDescription>{t.tickets.portalDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <span className="font-mono-tabular text-2xl font-semibold">
              {formatNumber(ticketsTotal)}
            </span>
            <Link href="/tickets" className="text-xs text-[var(--accent-cobalt)] hover:underline">
              {t.portal.overview.viewAllTickets}
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.portal.overview.accountCardTitle}</CardTitle>
            <CardDescription>{t.portal.overview.accountCardDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--ink-muted)]">{t.portal.overview.companyCode}</span>
              <span dir="ltr" className="font-mono-tabular font-medium">
                {company?.customerCode ?? '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--ink-muted)]">{t.portal.overview.accountManager}</span>
              <span>{company?.accountManagerName ?? t.common.unassigned}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>{t.portal.overview.recentOrdersTitle}</CardTitle>
              <CardDescription>{t.portal.overview.recentOrdersDesc}</CardDescription>
            </div>
            <Link href="/orders" className="text-xs text-[var(--accent-cobalt)] hover:underline">
              {t.portal.overview.viewAllOrders}
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {orders.length === 0 ? (
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
                    <th className="px-4 py-2.5 text-end font-medium">
                      {t.orders.expectedCompletion}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {orders.map((order) => (
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>{t.tickets.title}</CardTitle>
              <CardDescription>{t.tickets.portalDescription}</CardDescription>
            </div>
            <Link href="/tickets" className="text-xs text-[var(--accent-cobalt)] hover:underline">
              {t.portal.overview.viewAllTickets}
            </Link>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-[var(--border-hairline)]">
          {tickets.length === 0 ? (
            <EmptyState
              icon={<LifeBuoy className="h-4 w-4" />}
              title={t.tickets.emptyTitle}
              description={t.tickets.emptyDesc}
            />
          ) : (
            tickets.map((tk) => (
              <Link
                key={tk.id}
                href={`/tickets/${tk.id}`}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs hover:bg-[var(--bg-subtle)]/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span dir="ltr" className="font-mono-tabular font-semibold text-[var(--accent-cobalt)]">
                      {tk.ticketNumber}
                    </span>
                    <span className="truncate font-medium text-[var(--ink-primary)]">
                      {tk.subject}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--ink-muted)]">
                    {tk.categoryName}
                    {tk.orderNumber ? ` · ${tk.orderNumber}` : ''}
                  </p>
                </div>
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
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
