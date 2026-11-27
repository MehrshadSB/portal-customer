'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useI18n } from '@portal/i18n/react';
import {
  EMPLOYEE_ROLE_SLUGS,
  PERMISSIONS,
  type DepartmentDto,
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
} from '@portal/ui';
import { createEmployeeSchema, type CreateEmployeeInput } from '@portal/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, Users } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useAdminSession } from '@/hooks/use-admin-session';
import { adminApi } from '@/lib/api';

export default function AdminEmployeesPage() {
  const { user, hasPermission } = useAdminSession(false);
  const { t, translateError, translateRole, translateStatus } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EmployeeDto | null>(null);
  const [editDeptId, setEditDeptId] = React.useState('');
  const [editRoleSlug, setEditRoleSlug] = React.useState('');
  const [editJobTitle, setEditJobTitle] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const canManage = hasPermission(PERMISSIONS.EMPLOYEE_MANAGE);

  const employeesQuery = useQuery({
    queryKey: ['admin', 'employees', search],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '50' });
      if (search.trim()) params.set('search', search.trim());
      return adminApi.get<EmployeeDto[]>(`/employees?${params.toString()}`);
    },
  });

  const deptsQuery = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => adminApi.get<DepartmentDto[]>('/departments'),
  });

  const form = useForm({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: { roleSlugs: ['support_agent'] },
  });

  const extractErr = (err: unknown, fallback: string) => {
    const code =
      typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
    return translateError(code, err instanceof Error ? err.message : fallback);
  };

  const createMutation = useMutation({
    mutationFn: (body: CreateEmployeeInput) =>
      adminApi.post<EmployeeDto>('/employees', {
        ...body,
        departmentId: body.departmentId || null,
      }),
    onSuccess: async () => {
      setErrorMsg(null);
      setCreateOpen(false);
      form.reset({ roleSlugs: ['support_agent'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
    },
    onError: (err) => setErrorMsg(extractErr(err, 'Unable to create employee')),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      departmentId: string | null;
      jobTitle: string | null;
      roleSlugs: string[];
      isActive?: boolean;
    }) =>
      adminApi.patch<EmployeeDto>(`/employees/${payload.id}`, {
        departmentId: payload.departmentId,
        jobTitle: payload.jobTitle,
        roleSlugs: payload.roleSlugs,
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      }),
    onSuccess: async () => {
      setErrorMsg(null);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
    },
    onError: (err) => setErrorMsg(extractErr(err, 'Update failed')),
  });

  const openEdit = (emp: EmployeeDto) => {
    setEditing(emp);
    setEditDeptId(emp.departmentId ?? '');
    setEditRoleSlug(emp.roles[0]?.slug ?? 'support_agent');
    setEditJobTitle(emp.jobTitle ?? '');
  };

  const items = employeesQuery.data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.admin.employees.eyebrow}
        title={t.admin.employees.title}
        description={t.admin.employees.description}
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" />
              {t.admin.employees.createEmployee}
            </Button>
          ) : null
        }
      />

      {errorMsg ? <AlertBanner tone="crimson">{errorMsg}</AlertBanner> : null}

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-[var(--ink-muted)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.admin.employees.searchPlaceholder}
          className="ps-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Users className="h-4 w-4" />}
                title={t.admin.employees.emptyTitle}
                description={t.admin.employees.emptyDesc}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--ink-muted)]">
                    <th className="px-4 py-2.5 font-medium">{t.admin.employees.colCode}</th>
                    <th className="px-4 py-2.5 font-medium">{t.admin.employees.colEmployee}</th>
                    <th className="px-4 py-2.5 font-medium">{t.admin.employees.colDepartment}</th>
                    <th className="px-4 py-2.5 font-medium">{t.admin.employees.colRoles}</th>
                    <th className="px-4 py-2.5 font-medium">{t.common.status}</th>
                    {canManage ? (
                      <th className="px-4 py-2.5 text-end font-medium">
                        {t.admin.employees.colManage}
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {items.map((emp) => (
                    <tr key={emp.id} className="hover:bg-[var(--bg-subtle)]/50">
                      <td dir="ltr" className="font-mono-tabular px-4 py-2.5 text-start font-medium">
                        {emp.employeeCode}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-[var(--ink-primary)]">{emp.fullName}</p>
                        <p
                          dir="ltr"
                          className="font-mono-tabular text-start text-[11px] text-[var(--ink-muted)]"
                        >
                          {[emp.phone, emp.email].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-[var(--ink-muted)]">
                        {emp.departmentName ?? t.common.unassigned}
                        {emp.jobTitle ? <span className="block text-[11px]">{emp.jobTitle}</span> : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {emp.roles.map((r) => (
                            <StatusBadge key={r.id} label={translateRole(r.slug)} tone="cobalt" />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          label={
                            emp.isActive
                              ? translateStatus(emp.status)
                              : translateStatus('deactivated')
                          }
                          tone={
                            !emp.isActive
                              ? 'crimson'
                              : emp.status === 'active'
                                ? 'emerald'
                                : 'amber'
                          }
                        />
                      </td>
                      {canManage ? (
                        <td className="px-4 py-2.5 text-end">
                          <Button variant="outline" size="sm" onClick={() => openEdit(emp)}>
                            {t.common.edit}
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
        title={t.admin.employees.createTitle}
        description={t.admin.employees.createDesc}
      >
        <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="emp-name">{t.common.fullName}</Label>
            <Input id="emp-name" {...form.register('fullName')} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="emp-phone">{t.common.phone}</Label>
              <Input
                id="emp-phone"
                type="tel"
                dir="ltr"
                placeholder="+989123456789"
                {...form.register('phone')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-email">
                {t.common.email} ({t.common.optional})
              </Label>
              <Input id="emp-email" type="email" dir="ltr" {...form.register('email')} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="emp-dept">{t.common.department}</Label>
              <Select id="emp-dept" {...form.register('departmentId')}>
                <option value="">{t.common.unassigned}</option>
                {deptsQuery.data?.data.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-role">{t.admin.employees.primaryRole}</Label>
              <Select
                id="emp-role"
                defaultValue="support_agent"
                onChange={(e) =>
                  form.setValue('roleSlugs', [
                    e.target.value as (typeof EMPLOYEE_ROLE_SLUGS)[number],
                  ])
                }
              >
                {EMPLOYEE_ROLE_SLUGS.map((slug) => (
                  <option key={slug} value={slug}>
                    {translateRole(slug)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emp-title">{t.common.jobTitle}</Label>
            <Input id="emp-title" {...form.register('jobTitle')} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? t.common.creating : t.admin.employees.createSubmit}
            </Button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `${t.admin.employees.editTitlePrefix} ${editing.fullName}` : t.common.edit}
        description={editing?.employeeCode}
      >
        {editing ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-dept">{t.common.department}</Label>
              <Select
                id="edit-dept"
                value={editDeptId}
                onChange={(e) => setEditDeptId(e.target.value)}
              >
                <option value="">{t.common.unassigned}</option>
                {deptsQuery.data?.data.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-role">{t.common.role}</Label>
              <Select
                id="edit-role"
                value={editRoleSlug}
                onChange={(e) => setEditRoleSlug(e.target.value)}
              >
                {EMPLOYEE_ROLE_SLUGS.map((slug) => (
                  <option key={slug} value={slug}>
                    {translateRole(slug)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">{t.common.jobTitle}</Label>
              <Input
                id="edit-title"
                value={editJobTitle}
                onChange={(e) => setEditJobTitle(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              {editing.userId !== user?.id ? (
                <Button
                  type="button"
                  variant={editing.isActive ? 'destructive' : 'secondary'}
                  size="sm"
                  onClick={() =>
                    updateMutation.mutate({
                      id: editing.id,
                      departmentId: editDeptId || null,
                      jobTitle: editJobTitle || null,
                      roleSlugs: [editRoleSlug],
                      isActive: !editing.isActive,
                    })
                  }
                >
                  {editing.isActive ? t.common.deactivate : t.common.activate}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  {t.common.cancel}
                </Button>
                <Button
                  type="button"
                  disabled={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({
                      id: editing.id,
                      departmentId: editDeptId || null,
                      jobTitle: editJobTitle || null,
                      roleSlugs: [editRoleSlug],
                    })
                  }
                >
                  {t.common.save}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </ModalDialog>
    </div>
  );
}
