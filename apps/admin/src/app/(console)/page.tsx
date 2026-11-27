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
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, StatusBadge } from '@portal/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useAdminSession } from '@/hooks/use-admin-session';
import { adminApi } from '@/lib/api';

export default function AdminDashboardHomePage() {
  const { user, hasPermission } = useAdminSession(false);
  const { t, formatNumber, formatDateTime, translateRole } = useI18n();

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
    queryFn: () => adminApi.get<OrderDto[]>('/orders?limit=1&operationalState=active'),
    enabled: Boolean(user) && canReadOrders,
  });

  const ticketsQuery = useQuery({
    queryKey: ['admin', 'overview', 'tickets'],
    queryFn: () => adminApi.get<TicketDto[]>('/tickets?limit=1&status=open'),
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.admin.overview.eyebrow}
        title={`${t.admin.overview.welcomePrefix} ${user?.fullName ?? ''}`}
        description={t.admin.overview.description}
        actions={
          <StatusBadge
            label={user?.roles.map((r) => translateRole(r)).join(' · ') || 'employee'}
            tone="amber"
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>{t.admin.overview.activeOrdersCardTitle}</CardTitle>
            <CardDescription>{t.admin.overview.activeOrdersCardDesc}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <span className="font-mono-tabular text-2xl font-semibold">
              {ordersQuery.data?.meta?.total !== undefined
                ? formatNumber(ordersQuery.data.meta.total)
                : '—'}
            </span>
            {canReadOrders ? (
              <Link href="/orders" className="text-xs text-[var(--accent-cobalt)] hover:underline">
                {t.admin.overview.activeOrdersAction}
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.admin.overview.openTicketsCardTitle}</CardTitle>
            <CardDescription>{t.admin.overview.openTicketsCardDesc}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <span className="font-mono-tabular text-2xl font-semibold">
              {ticketsQuery.data?.meta?.total !== undefined
                ? formatNumber(ticketsQuery.data.meta.total)
                : '—'}
            </span>
            {canReadTickets ? (
              <Link href="/tickets" className="text-xs text-[var(--accent-cobalt)] hover:underline">
                {t.admin.overview.openTicketsAction}
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.admin.overview.customersCardTitle}</CardTitle>
            <CardDescription>{t.admin.overview.customersCardDesc}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <span className="font-mono-tabular text-2xl font-semibold">
              {customersQuery.data?.meta?.total !== undefined
                ? formatNumber(customersQuery.data.meta.total)
                : '—'}
            </span>
            {canReadCustomers ? (
              <Link href="/customers" className="text-xs text-[var(--accent-cobalt)] hover:underline">
                {t.admin.overview.customersAction}
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.admin.overview.employeesCardTitle}</CardTitle>
            <CardDescription>{t.admin.overview.employeesCardDesc}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <span className="font-mono-tabular text-2xl font-semibold">
              {employeesQuery.data?.meta?.total !== undefined
                ? formatNumber(employeesQuery.data.meta.total)
                : '—'}
            </span>
            <Link href="/employees" className="text-xs text-[var(--accent-cobalt)] hover:underline">
              {t.admin.overview.employeesAction}
            </Link>
          </CardContent>
        </Card>
      </div>

      {canReadAudit ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t.admin.overview.auditCardTitle}</CardTitle>
                <CardDescription>{t.admin.overview.auditCardDesc}</CardDescription>
              </div>
              <Link href="/audit-logs" className="text-xs text-[var(--accent-cobalt)] hover:underline">
                {t.admin.overview.auditAction}
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-[var(--border-hairline)] text-xs">
              {auditQuery.data?.data.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--ink-primary)]">{entry.summary}</p>
                    <p
                      dir="ltr"
                      className="font-mono-tabular truncate text-start text-[11px] text-[var(--ink-muted)]"
                    >
                      {entry.action} · {entry.actorEmail ?? entry.actorType}
                    </p>
                  </div>
                  <span className="font-mono-tabular shrink-0 text-[11px] text-[var(--ink-muted)]">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </div>
              ))}
              {(auditQuery.data?.data.length ?? 0) === 0 ? (
                <p className="py-4 text-[var(--ink-muted)]">{t.admin.overview.noAudit}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
