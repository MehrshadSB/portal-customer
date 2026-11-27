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
  SkeletonTable,
  StatusBadge,
  Textarea,
} from '@portal/ui';
import { createCustomerSchema, type CreateCustomerInput } from '@portal/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useAdminSession } from '@/hooks/use-admin-session';
import { adminApi } from '@/lib/api';

function AdminCustomersContent() {
  const { hasPermission } = useAdminSession(false);
  const { t, formatNumber, interpolate, translateError, translateStatus } = useI18n();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(() => searchParams.get('search') ?? '');
  const [statusFilter, setStatusFilter] = React.useState(() => searchParams.get('status') ?? '');
  const [page, setPage] = React.useState(() =>
    Math.max(1, Number(searchParams.get('page') ?? '1') || 1),
  );
  const [createOpen, setCreateOpen] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set('search', search.trim());
    if (statusFilter) p.set('status', statusFilter);
    if (page > 1) p.set('page', String(page));
    const qs = p.toString();
    if (qs !== searchParams.toString()) {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [search, statusFilter, page, pathname, router, searchParams]);

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
      const code =
        typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      setErrorMsg(
        translateError(code, err instanceof Error ? err.message : 'Unable to create customer'),
      );
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
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t.admin.customers.newCustomer}
            </Button>
          ) : null
        }
      />

      {errorMsg ? <AlertBanner tone="crimson">{errorMsg}</AlertBanner> : null}
      {query.isError ? (
        <AlertBanner tone="crimson">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {translateError(
                typeof query.error === 'object' && query.error !== null && 'code' in query.error
                  ? String(query.error.code)
                  : undefined,
                query.error instanceof Error ? query.error.message : t.common.noData,
              )}
            </span>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
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
              aria-label={t.admin.customers.searchPlaceholder}
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

        <CardContent className="p-0">
          {query.isLoading ? (
            <SkeletonTable rows={6} columns={6} />
          ) : query.isError ? null : items.length === 0 ? (
            <EmptyState
              embedded
              headingLevel="h2"
              icon={<Building2 className="h-4 w-4" aria-hidden="true" />}
              title={t.admin.customers.emptyTitle}
              description={t.admin.customers.emptyDesc}
              action={
                search || statusFilter ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setStatusFilter('');
                      setPage(1);
                    }}
                  >
                    {t.common.clearFilters}
                  </Button>
                ) : canCreate ? (
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    {t.admin.customers.newCustomer}
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
                      {t.admin.customers.colCode}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.admin.customers.colCompany}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.admin.customers.colIndustry}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.admin.customers.colManager}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.common.status}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-end font-medium">
                      {t.admin.customers.colWorkspace}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-rule)]">
                  {items.map((c) => (
                    <tr
                      key={c.id}
                      className="transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper)]"
                    >
                      <td className="font-mono-tabular px-4 py-3 text-start font-medium text-[var(--color-ink)]">
                        <span dir="ltr" className="inline-block">
                          {c.customerCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                        {c.companyName}
                        {c.legalName ? (
                          <span className="block text-xs font-normal text-[var(--color-muted)]">
                            {c.legalName}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">{c.industry ?? '-'}</td>
                      <td className="px-4 py-3 text-[var(--color-ink-2)]">
                        {c.accountManagerName ?? t.common.unassigned}
                      </td>
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3 text-end">
                        <Link
                          href={`/customers/${c.id}`}
                          className="font-medium text-[var(--color-accent-2)] hover:underline"
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

        {meta && meta.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-[var(--color-rule)] bg-[var(--color-paper-2)]/50 px-4 py-3 text-xs text-[var(--color-muted)]">
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

      <ModalDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t.admin.customers.createTitle}
        description={t.admin.customers.createDesc}
      >
        <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cust-companyName">{t.admin.customers.companyName}</Label>
            <Input
              id="cust-companyName"
              aria-invalid={Boolean(form.formState.errors.companyName)}
              aria-describedby="cust-companyName-err"
              {...form.register('companyName')}
            />
            <p id="cust-companyName-err" className="min-h-[1lh] text-xs text-[var(--color-error)]">
              {form.formState.errors.companyName?.message ?? ''}
            </p>
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

export default function AdminCustomersPage() {
  return (
    <React.Suspense fallback={<SkeletonTable rows={6} columns={6} />}>
      <AdminCustomersContent />
    </React.Suspense>
  );
}
