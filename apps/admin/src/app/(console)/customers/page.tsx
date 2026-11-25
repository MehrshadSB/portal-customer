'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useI18n } from '@portal/i18n/react';
import {
  CUSTOMER_STATUSES,
  PERMISSIONS,
  type CustomerDto,
  type EmployeeDto,
} from '@portal/types';
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  Label,
  ModalDialog,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
} from '@portal/ui';
import { createCustomerSchema, type CreateCustomerInput } from '@portal/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useAdminSession } from '@/hooks/use-admin-session';
import { adminApi } from '@/lib/api';

export default function AdminCustomersPage() {
  const { hasPermission } = useAdminSession(false);
  const { t, formatNumber, interpolate, translateError, translateStatus } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const canCreate = hasPermission(PERMISSIONS.CUSTOMER_CREATE);

  const query = useQuery({
    queryKey: ['admin', 'customers', { search, statusFilter, page }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      return adminApi.get<CustomerDto[]>(`/customers?${params.toString()}`);
    },
  });

  const employeesQuery = useQuery({
    queryKey: ['admin', 'employees', 'lookup'],
    queryFn: () => adminApi.get<EmployeeDto[]>('/employees?limit=100&isActive=true'),
    enabled: createOpen,
  });

  const form = useForm({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: { status: 'active' },
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateCustomerInput) =>
      adminApi.post<CustomerDto>('/customers', {
        ...body,
        accountManagerId: body.accountManagerId || null,
      }),
    onSuccess: async () => {
      setErrorMsg(null);
      setCreateOpen(false);
      form.reset({ status: 'active' });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] });
    },
    onError: (err) => {
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      setErrorMsg(translateError(code, err instanceof Error ? err.message : 'Unable to create customer'));
    },
  });

  const items = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.admin.customers.eyebrow}
        title={t.admin.customers.title}
        description={t.admin.customers.description}
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t.admin.customers.newCustomer}
            </Button>
          ) : null
        }
      />

      {errorMsg ? <AlertBanner tone="crimson">{errorMsg}</AlertBanner> : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-[var(--ink-muted)]" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t.admin.customers.searchPlaceholder}
            className="ps-9"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="w-48"
          aria-label={t.common.status}
        >
          <option value="">{t.common.allStatuses}</option>
          {CUSTOMER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {translateStatus(s)}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <p className="p-6 text-xs text-[var(--ink-muted)]">{t.admin.customers.loading}</p>
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Building2 className="h-4 w-4" />}
                title={t.admin.customers.emptyTitle}
                description={t.admin.customers.emptyDesc}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--ink-muted)]">
                    <th className="px-4 py-2.5 font-medium">{t.admin.customers.colCode}</th>
                    <th className="px-4 py-2.5 font-medium">{t.admin.customers.colCompany}</th>
                    <th className="px-4 py-2.5 font-medium">{t.admin.customers.colIndustry}</th>
                    <th className="px-4 py-2.5 font-medium">{t.admin.customers.colManager}</th>
                    <th className="px-4 py-2.5 font-medium">{t.common.status}</th>
                    <th className="px-4 py-2.5 text-end font-medium">{t.admin.customers.colWorkspace}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {items.map((c) => (
                    <tr key={c.id} className="hover:bg-[var(--bg-subtle)]/50">
                      <td dir="ltr" className="font-mono-tabular px-4 py-2.5 text-start font-medium">
                        {c.customerCode}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[var(--ink-primary)]">
                        {c.companyName}
                        {c.legalName ? (
                          <span className="block text-[11px] font-normal text-[var(--ink-muted)]">
                            {c.legalName}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--ink-muted)]">{c.industry ?? '—'}</td>
                      <td className="px-4 py-2.5">{c.accountManagerName ?? t.common.unassigned}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          label={translateStatus(c.status)}
                          tone={
                            c.status === 'active'
                              ? 'emerald'
                              : c.status === 'on_hold'
                                ? 'amber'
                                : c.status === 'archived'
                                  ? 'crimson'
                                  : 'slate'
                          }
                        />
                      </td>
                      <td className="px-4 py-2.5 text-end">
                        <Link
                          href={`/customers/${c.id}`}
                          className="font-medium text-[var(--accent-cobalt)] hover:underline"
                        >
                          {t.admin.customers.open360}
                        </Link>
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

      <ModalDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t.admin.customers.createTitle}
        description={t.admin.customers.createDesc}
      >
        <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cust-companyName">{t.admin.customers.companyName}</Label>
            <Input id="cust-companyName" {...form.register('companyName')} />
            {form.formState.errors.companyName ? (
              <p className="text-xs text-[var(--signal-crimson)]">
                {form.formState.errors.companyName.message}
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cust-legalName">{t.admin.customers.legalName}</Label>
              <Input id="cust-legalName" {...form.register('legalName')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-industry">{t.admin.customers.colIndustry}</Label>
              <Input id="cust-industry" {...form.register('industry')} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cust-status">{t.common.status}</Label>
              <Select id="cust-status" {...form.register('status')}>
                {CUSTOMER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {translateStatus(s)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-mgr">{t.admin.customers.colManager}</Label>
              <Select id="cust-mgr" {...form.register('accountManagerId')}>
                <option value="">{t.common.unassigned}</option>
                {employeesQuery.data?.data.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName} ({emp.employeeCode})
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-notes">{t.admin.customers.internalNotes}</Label>
            <Textarea id="cust-notes" {...form.register('internalNotes')} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? t.common.creating : t.common.create}
            </Button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
