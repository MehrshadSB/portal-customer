'use client';

import { useI18n } from '@portal/i18n/react';
import type { CustomerDto, OrderDto, TicketDto } from '@portal/types';
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  SkeletonStatStrip,
  SkeletonTable,
  StatusBadge,
} from '@portal/ui';
import { useQuery } from '@tanstack/react-query';
import { FileText, LifeBuoy, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePortalSession } from '@/hooks/use-portal-session';
import { portalApi } from '@/lib/api';

export default function CustomerPortalHomePage() {
  const { user } = usePortalSession(false);
  const { t, formatDate, formatNumber, interpolate, translateError, translateStatus } = useI18n();

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

  const firstError = companyQuery.error ?? ordersQuery.error ?? ticketsQuery.error;
  const isStripLoading = companyQuery.isLoading || ordersQuery.isLoading || ticketsQuery.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          company ? `${company.customerCode}: ${t.portal.overview.eyebrow}` : t.portal.overview.eyebrow
        }
        title={
          company
            ? `${t.portal.overview.welcomePrefix} ${company.companyName}`
            : t.portal.overview.fallbackTitle
        }
        description={t.portal.overview.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {company ? (
              <StatusBadge
                label={translateStatus(company.status)}
                tone={company.status === 'active' ? 'emerald' : 'amber'}
              />
            ) : null}
            <Link href="/tickets/new" className="app-btn app-btn-primary h-8 px-3 text-xs">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t.tickets.newTicket}
            </Link>
          </div>
        }
      />

      {firstError ? (
        <AlertBanner tone="crimson">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {translateError(
                typeof firstError === 'object' && firstError !== null && 'code' in firstError
                  ? String(firstError.code)
                  : undefined,
                firstError instanceof Error ? firstError.message : t.common.noData,
              )}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void companyQuery.refetch();
                void ordersQuery.refetch();
                void ticketsQuery.refetch();
              }}
            >
              {t.common.retry}
            </Button>
          </div>
        </AlertBanner>
      ) : null}

      {isStripLoading ? (
        <SkeletonStatStrip items={3} />
      ) : (
        <section className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-rule)] bg-[var(--color-rule)] md:grid-cols-3">
          <div className="flex flex-col justify-between gap-3 bg-[var(--color-cotton)] px-5 py-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--color-muted)]">
                {t.portal.overview.activeOrdersCard}
              </p>
              <p className="font-mono-tabular text-2xl font-semibold text-[var(--color-ink)]">
                {formatNumber(ordersTotal)}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-[var(--color-muted)]">
                {t.portal.overview.recentOrdersDesc}
              </span>
              <Link
                href="/orders"
                className="shrink-0 font-medium text-[var(--color-accent-2)] hover:underline"
              >
                {t.portal.overview.viewAllOrders}
              </Link>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 bg-[var(--color-cotton)] px-5 py-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--color-muted)]">
                {t.portal.overview.openTicketsCard}
              </p>
              <p className="font-mono-tabular text-2xl font-semibold text-[var(--color-ink)]">
                {formatNumber(ticketsTotal)}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-[var(--color-muted)]">
                {t.tickets.portalDescription}
              </span>
              <Link
                href="/tickets"
                className="shrink-0 font-medium text-[var(--color-accent-2)] hover:underline"
              >
                {t.portal.overview.viewAllTickets}
              </Link>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-2 bg-[var(--color-cotton)] px-5 py-4">
            <div>
              <p className="text-xs font-medium text-[var(--color-muted)]">
                {t.portal.overview.accountCardTitle}
              </p>
              <p className="text-xs text-[var(--color-muted)]">{t.portal.overview.accountCardDesc}</p>
            </div>
            <dl className="space-y-1 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--color-muted)]">{t.portal.overview.companyCode}</dt>
                <dd className="font-mono-tabular font-medium text-[var(--color-ink)]">
                  {company?.customerCode ? (
                    <span dir="ltr" className="inline-block">
                      {company.customerCode}
                    </span>
                  ) : (
                    '-'
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--color-muted)]">{t.portal.overview.accountManager}</dt>
                <dd className="truncate font-medium text-[var(--color-ink)]">
                  {company?.accountManagerName ?? t.common.unassigned}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{t.portal.overview.recentOrdersTitle}</CardTitle>
              <CardDescription>{t.portal.overview.recentOrdersDesc}</CardDescription>
            </div>
            <Link
              href="/orders"
              className="text-xs font-medium text-[var(--color-accent-2)] hover:underline"
            >
              {t.portal.overview.viewAllOrders}
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {ordersQuery.isLoading ? (
            <SkeletonTable rows={4} columns={5} />
          ) : ordersQuery.isError ? null : orders.length === 0 ? (
            <EmptyState
              embedded
              headingLevel="h3"
              icon={<FileText className="h-4 w-4" />}
              title={t.orders.emptyTitle}
              description={t.orders.emptyDesc}
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
                    <th className="px-4 py-2.5 text-end font-medium">
                      {t.orders.expectedCompletion}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-rule)]">
                  {orders.map((order) => (
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
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{t.tickets.title}</CardTitle>
              <CardDescription>{t.tickets.portalDescription}</CardDescription>
            </div>
            <Link
              href="/tickets"
              className="text-xs font-medium text-[var(--color-accent-2)] hover:underline"
            >
              {t.portal.overview.viewAllTickets}
            </Link>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-[var(--color-rule)] p-0">
          {ticketsQuery.isLoading ? (
            <SkeletonTable rows={3} columns={3} />
          ) : ticketsQuery.isError ? null : tickets.length === 0 ? (
            <EmptyState
              embedded
              headingLevel="h3"
              icon={<LifeBuoy className="h-4 w-4" />}
              title={t.tickets.emptyTitle}
              description={t.tickets.emptyDesc}
            />
          ) : (
            tickets.map((tk) => (
              <Link
                key={tk.id}
                href={`/tickets/${tk.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper-2)]/60"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      dir="ltr"
                      className="font-mono-tabular font-semibold text-[var(--color-accent-2)]"
                    >
                      {tk.ticketNumber}
                    </span>
                    <span className="truncate font-medium text-[var(--color-ink)]">{tk.subject}</span>
                  </div>
                  <p className="text-xs text-[var(--color-muted)]">
                    {tk.categoryName}
                    {tk.orderNumber ? ` (${tk.orderNumber})` : ''}
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
