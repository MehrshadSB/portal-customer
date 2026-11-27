'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useI18n } from '@portal/i18n/react';
import { PERMISSIONS, type DepartmentDto, type EmployeeDto } from '@portal/types';
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
import { createDepartmentSchema, type CreateDepartmentInput } from '@portal/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useAdminSession } from '@/hooks/use-admin-session';
import { adminApi } from '@/lib/api';

export default function AdminDepartmentsPage() {
  const { hasPermission } = useAdminSession(false);
  const { t, translateError, translateStatus } = useI18n();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const canManage = hasPermission(PERMISSIONS.DEPARTMENT_MANAGE);

  const deptsQuery = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => adminApi.get<DepartmentDto[]>('/departments'),
  });

  const employeesQuery = useQuery({
    queryKey: ['admin', 'employees', 'lookup'],
    queryFn: () => adminApi.get<EmployeeDto[]>('/employees?limit=100&isActive=true'),
    enabled: createOpen,
  });

  const form = useForm({
    resolver: zodResolver(createDepartmentSchema),
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateDepartmentInput) =>
      adminApi.post<DepartmentDto>('/departments', {
        ...body,
        leadEmployeeId: body.leadEmployeeId || null,
      }),
    onSuccess: async () => {
      setErrorMsg(null);
      setCreateOpen(false);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ['admin', 'departments'] });
    },
    onError: (err) => {
      const code =
        typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      setErrorMsg(
        translateError(code, err instanceof Error ? err.message : 'Failed to create department'),
      );
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminApi.patch(`/departments/${id}`, { isActive }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'departments'] });
    },
  });

  const depts = deptsQuery.data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.admin.departments.eyebrow}
        title={t.admin.departments.title}
        description={t.admin.departments.description}
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t.admin.departments.newDepartment}
            </Button>
          ) : null
        }
      />

      {errorMsg ? <AlertBanner tone="crimson">{errorMsg}</AlertBanner> : null}
      {deptsQuery.isError ? (
        <AlertBanner tone="crimson">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {translateError(
                typeof deptsQuery.error === 'object' &&
                  deptsQuery.error !== null &&
                  'code' in deptsQuery.error
                  ? String(deptsQuery.error.code)
                  : undefined,
                deptsQuery.error instanceof Error ? deptsQuery.error.message : t.common.noData,
              )}
            </span>
            <Button variant="outline" size="sm" onClick={() => void deptsQuery.refetch()}>
              {t.common.retry}
            </Button>
          </div>
        </AlertBanner>
      ) : null}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {deptsQuery.isLoading ? (
            <SkeletonTable rows={4} columns={5} />
          ) : deptsQuery.isError ? null : depts.length === 0 ? (
            <EmptyState
              embedded
              headingLevel="h2"
              icon={<Layers className="h-4 w-4" aria-hidden="true" />}
              title={t.admin.departments.title}
              description={t.admin.departments.description}
              action={
                canManage ? (
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    {t.admin.departments.newDepartment}
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
                      {t.admin.departments.colCode}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.admin.departments.colName}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.common.description}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">{t.common.status}</th>
                    {canManage ? (
                      <th className="whitespace-nowrap px-4 py-3 text-end font-medium">
                        {t.common.actions}
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-rule)]">
                  {depts.map((d) => (
                    <tr
                      key={d.id}
                      className="transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper)]"
                    >
                      <td className="font-mono-tabular px-4 py-3 text-start font-medium text-[var(--color-ink)]">
                        <span dir="ltr" className="inline-block">
                          {d.code}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--color-ink)]">{d.name}</td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">
                        {d.description ?? '-'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={translateStatus(d.isActive ? 'active' : 'inactive')}
                          tone={d.isActive ? 'emerald' : 'slate'}
                        />
                      </td>
                      {canManage ? (
                        <td className="px-4 py-3 text-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleActive.mutate({ id: d.id, isActive: !d.isActive })}
                          >
                            {d.isActive ? t.common.deactivate : t.common.activate}
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ModalDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t.admin.departments.createTitle}
      >
        <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dept-code">{t.admin.departments.codeLabel}</Label>
              <Input
                id="dept-code"
                dir="ltr"
                aria-invalid={Boolean(form.formState.errors.code)}
                aria-describedby="dept-code-err"
                {...form.register('code')}
              />
              <p id="dept-code-err" className="min-h-[1lh] text-xs text-[var(--color-error)]">
                {form.formState.errors.code?.message ?? ''}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dept-name">{t.admin.departments.nameLabel}</Label>
              <Input
                id="dept-name"
                aria-invalid={Boolean(form.formState.errors.name)}
                aria-describedby="dept-name-err"
                {...form.register('name')}
              />
              <p id="dept-name-err" className="min-h-[1lh] text-xs text-[var(--color-error)]">
                {form.formState.errors.name?.message ?? ''}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dept-lead">{t.admin.departments.leadLabel}</Label>
            <Select id="dept-lead" {...form.register('leadEmployeeId')}>
              <option value="">{t.common.unassigned}</option>
              {employeesQuery.data?.data.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dept-desc">{t.common.description}</Label>
            <Textarea id="dept-desc" {...form.register('description')} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {t.common.create}
            </Button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
