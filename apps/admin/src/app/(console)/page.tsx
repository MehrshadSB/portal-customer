'use client';

import { useI18n } from '@portal/i18n/react';
import {
  PERMISSIONS,
  type AuditLogDto,
  type CustomerDto,
  type EmployeeDto,
  type OrderDto,
  type TicketDto,
} from '@portal/types';
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
import { ClipboardList, LifeBuoy, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useAdminSession } from '@/hooks/use-admin-session';
import { adminApi } from '@/lib/api';

export default function AdminDashboardHomePage() {
  const { user, hasPermission } = useAdminSession(false);
  const { t, formatDate, formatNumber, formatDateTime, translateError, translateRole, translateStatus } =
    useI18n();

  const canReadCustomers =
    hasPermission(PERMISSIONS.CUSTOMER_READ_ALL) ||
    hasPermission(PERMISSIONS.CUSTOMER_READ_ASSIGNED);
  const canReadOrders =
    hasPermission(PERMISSIONS.ORDER_READ_ALL) || hasPermission(PERMISSIONS.ORDER_READ_DEPARTMENT);
  const canReadTickets =
    hasPermission(PERMISSIONS.TICKET_READ_ALL) || hasPermission(PERMISSIONS.TICKET_READ_DEPARTMENT);
  const canReadAudit = hasPermission(PERMISSIONS.AUDIT_LOG_READ);

  const ordersQuery = useQuery({
    queryKey: ['admin', 'overview', 'orders'],
    queryFn: () => adminApi.get<OrderDto[]>('/orders?limit=5&operationalState=active'),
    enabled: Boolean(user) && canReadOrders,
  });

  const ticketsQuery = useQuery({
    queryKey: ['admin', 'overview', 'tickets'],
    queryFn: () => adminApi.get<TicketDto[]>('/tickets?limit=5&status=open'),
    enabled: Boolean(user) && canReadTickets,
  });

  const customersQuery = useQuery({
    queryKey: ['admin', 'overview', 'customers'],
    queryFn: () => adminApi.get<CustomerDto[]>('/customers?limit=1'),
    enabled: Boolean(user) && canReadCustomers,
  });

  const employeesQuery = useQuery({
    queryKey: ['admin', 'overview', 'employees'],
    queryFn: () => adminApi.get<EmployeeDto[]>('/employees?limit=1'),
    enabled: Boolean(user),
  });

  const auditQuery = useQuery({
    queryKey: ['admin', 'overview', 'audit'],
    queryFn: () => adminApi.get<AuditLogDto[]>('/audit-logs?limit=6'),
    enabled: Boolean(user) && canReadAudit,
  });

  const summaryLoading =
    (canReadOrders && ordersQuery.isLoading) ||
    (canReadTickets && ticketsQuery.isLoading) ||
    (canReadCustomers && customersQuery.isLoading) ||
    employeesQuery.isLoading;

  const hasError =
    ordersQuery.isError ||
    ticketsQuery.isError ||
    customersQuery.isError ||
    employeesQuery.isError ||
    auditQuery.isError;

  const activeOrders = ordersQuery.data?.data ?? [];
  const openTickets = ticketsQuery.data?.data ?? [];
  const auditEntries = auditQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.admin.overview.eyebrow}
        title={`${t.admin.overview.welcomePrefix} ${user?.fullName ?? ''}`}
        description={t.admin.overview.description}
        actions={
          <StatusBadge
            label={user?.roles.map((r) => translateRole(r)).join(', ') || 'employee'}
            tone="amber"
          />
        }
      />

      {hasError ? (
        <AlertBanner tone="crimson">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {(() => {
                const err =
                  ordersQuery.error ??
                  ticketsQuery.error ??
                  customersQuery.error ??
                  employeesQuery.error ??
                  auditQuery.error;
                const code =
                  typeof err === 'object' && err !== null && 'code' in err
                    ? String(err.code)
                    : undefined;
                return translateError(code, err instanceof Error ? err.message : t.common.noData);
              })()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void ordersQuery.refetch();
                void ticketsQuery.refetch();
                void customersQuery.refetch();
                void employeesQuery.refetch();
                void auditQuery.refetch();
              }}
            >
              {t.common.retry}
            </Button>
          </div>
        </AlertBanner>
      ) : null}

      {summaryLoading ? (
        <SkeletonStatStrip items={4} />
      ) : (
        <section
          aria-label={t.admin.nav.operations}
          className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-rule)] bg-[var(--color-rule)] sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="flex flex-col justify-between gap-3 bg-[var(--color-cotton)] px-5 py-4">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-[var(--color-muted)]">
                {t.admin.overview.activeOrdersCardTitle}
              </p>
              <p className="text-xs text-[var(--color-muted)]">
                {t.admin.overview.activeOrdersCardDesc}
              </p>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono-tabular text-2xl font-semibold text-[var(--color-ink)]">
                {ordersQuery.data?.meta?.total !== undefined
                  ? formatNumber(ordersQuery.data.meta.total)
                  : '0'}
              </span>
              {canReadOrders ? (
                <Link
                  href="/orders"
                  className="text-xs font-medium text-[var(--color-accent-2)] hover:underline"
                >
                  {t.admin.overview.activeOrdersAction}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 bg-[var(--color-cotton)] px-5 py-4">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-[var(--color-muted)]">
                {t.admin.overview.openTicketsCardTitle}
              </p>
              <p className="text-xs text-[var(--color-muted)]">
                {t.admin.overview.openTicketsCardDesc}
              </p>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono-tabular text-2xl font-semibold text-[var(--color-ink)]">
                {ticketsQuery.data?.meta?.total !== undefined
                  ? formatNumber(ticketsQuery.data.meta.total)
                  : '0'}
              </span>
              {canReadTickets ? (
                <Link
                  href="/tickets"
                  className="text-xs font-medium text-[var(--color-accent-2)] hover:underline"
                >
                  {t.admin.overview.openTicketsAction}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 bg-[var(--color-cotton)] px-5 py-4">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-[var(--color-muted)]">
                {t.admin.overview.customersCardTitle}
              </p>
              <p className="text-xs text-[var(--color-muted)]">
                {t.admin.overview.customersCardDesc}
              </p>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono-tabular text-2xl font-semibold text-[var(--color-ink)]">
                {customersQuery.data?.meta?.total !== undefined
                  ? formatNumber(customersQuery.data.meta.total)
                  : '0'}
              </span>
              {canReadCustomers ? (
                <Link
                  href="/customers"
                  className="text-xs font-medium text-[var(--color-accent-2)] hover:underline"
                >
                  {t.admin.overview.customersAction}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 bg-[var(--color-cotton)] px-5 py-4">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-[var(--color-muted)]">
                {t.admin.overview.employeesCardTitle}
              </p>
              <p className="text-xs text-[var(--color-muted)]">
                {t.admin.overview.employeesCardDesc}
              </p>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono-tabular text-2xl font-semibold text-[var(--color-ink)]">
                {employeesQuery.data?.meta?.total !== undefined
                  ? formatNumber(employeesQuery.data.meta.total)
                  : '0'}
              </span>
              <Link
                href="/employees"
                className="text-xs font-medium text-[var(--color-accent-2)] hover:underline"
              >
                {t.admin.overview.employeesAction}
              </Link>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          {canReadOrders ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{t.orders.title}</CardTitle>
                    <CardDescription>{t.admin.overview.activeOrdersCardDesc}</CardDescription>
                  </div>
                  <Link
                    href="/orders"
                    className="text-xs font-medium text-[var(--color-accent-2)] hover:underline"
                  >
                    {t.admin.overview.activeOrdersAction}
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {ordersQuery.isLoading ? (
                  <SkeletonTable rows={4} columns={4} />
                ) : ordersQuery.isError ? null : activeOrders.length === 0 ? (
                  <EmptyState
                    embedded
                    headingLevel="h3"
                    icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />}
                    title={t.orders.emptyTitle}
                    description={t.orders.emptyDesc}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-start text-xs">
                      <thead>
                        <tr className="border-b border-[var(--color-rule)] bg-[var(--color-paper-2)]/75 text-[var(--color-muted)]">
                          <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                            {t.orders.orderNumber}
                          </th>
                          <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                            {t.orders.customer}
                          </th>
                          <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                            {t.orders.currentStage}
                          </th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-end font-medium">
                            {t.orders.expectedCompletion}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-rule)]">
                        {activeOrders.map((order) => (
                          <tr key={order.id} className="hover:bg-[var(--color-paper)]">
                            <td className="px-4 py-3">
                              <Link
                                href={`/orders/${order.id}`}
                                dir="ltr"
                                className="font-mono-tabular font-semibold text-[var(--color-accent-2)] hover:underline"
                              >
                                {order.orderNumber}
                              </Link>
                              <span className="block truncate font-medium text-[var(--color-ink)]">
                                {order.title}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[var(--color-ink-2)]">
                              <Link
                                href={`/customers/${order.customerId}`}
                                className="hover:underline"
                              >
                                {order.customerName}
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge
                                label={order.currentStageName}
                                tone={order.currentStageColor}
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
            </Card>
          ) : null}

          {canReadAudit ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{t.admin.overview.auditCardTitle}</CardTitle>
                    <CardDescription>{t.admin.overview.auditCardDesc}</CardDescription>
                  </div>
                  <Link
                    href="/audit-logs"
                    className="text-xs font-medium text-[var(--color-accent-2)] hover:underline"
                  >
                    {t.admin.overview.auditAction}
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {auditQuery.isLoading ? (
                  <SkeletonTable rows={4} columns={3} />
                ) : auditQuery.isError ? null : auditEntries.length === 0 ? (
                  <EmptyState
                    embedded
                    headingLevel="h3"
                    icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                    title={t.admin.audit.emptyTitle}
                    description={t.admin.overview.noAudit}
                  />
                ) : (
                  <div className="divide-y divide-[var(--color-rule)] text-xs">
                    {auditEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="truncate font-medium text-[var(--color-ink)]">
                            {entry.summary}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
                            <StatusBadge label={entry.action} tone="slate" mono />
                            {entry.actorEmail ? (
                              <span dir="ltr" className="font-mono-tabular truncate inline-block">
                                {entry.actorEmail}
                              </span>
                            ) : (
                              <span className="truncate">{translateStatus(entry.actorType)}</span>
                            )}
                          </div>
                        </div>
                        <time className="font-mono-tabular shrink-0 text-xs text-[var(--color-muted)]">
                          {formatDateTime(entry.createdAt)}
                        </time>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6 lg:col-span-5">
          {canReadTickets ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{t.tickets.title}</CardTitle>
                    <CardDescription>{t.admin.overview.openTicketsCardDesc}</CardDescription>
                  </div>
                  <Link
                    href="/tickets"
                    className="text-xs font-medium text-[var(--color-accent-2)] hover:underline"
                  >
                    {t.admin.overview.openTicketsAction}
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {ticketsQuery.isLoading ? (
                  <SkeletonTable rows={4} columns={3} />
                ) : ticketsQuery.isError ? null : openTickets.length === 0 ? (
                  <EmptyState
                    embedded
                    headingLevel="h3"
                    icon={<LifeBuoy className="h-4 w-4" aria-hidden="true" />}
                    title={t.tickets.emptyTitle}
                    description={t.tickets.emptyDesc}
                  />
                ) : (
                  <div className="divide-y divide-[var(--color-rule)] text-xs">
                    {openTickets.map((tk) => (
                      <Link
                        key={tk.id}
                        href={`/tickets/${tk.id}`}
                        className="block px-5 py-3.5 transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper)]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                dir="ltr"
                                className="font-mono-tabular font-semibold text-[var(--color-accent-2)]"
                              >
                                {tk.ticketNumber}
                              </span>
                              <span className="truncate font-medium text-[var(--color-ink)]">
                                {tk.subject}
                              </span>
                            </div>
                            <p className="text-xs text-[var(--color-muted)]">
                              {tk.customerName}
                              {tk.categoryName ? `, ${tk.categoryName}` : ''}
                            </p>
                          </div>
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
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
