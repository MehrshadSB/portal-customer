'use client';

import { useAdminSession } from '@/hooks/use-admin-session';
import { adminApi } from '@/lib/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { useI18n } from '@portal/i18n/react';
import {
  CUSTOMER_ROLE_SLUGS,
  CUSTOMER_STATUSES,
  PERMISSIONS,
  type ContactDto,
  type CustomerDto,
  type CustomerMemberDto,
  type EmployeeDto,
} from '@portal/types';
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  ModalDialog,
  PageHeader,
  Select,
  SkeletonStatStrip,
  SkeletonTable,
  StatusBadge,
  Textarea,
} from '@portal/ui';
import {
  createContactSchema,
  createCustomerMemberSchema,
  updateCustomerSchema,
  type CreateContactInput,
  type CreateCustomerMemberInput,
  type UpdateCustomerInput,
} from '@portal/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';

export default function AdminCustomerDetailPage() {
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId;
  const { hasPermission } = useAdminSession(false);
  const { t, translateError, translateRole, translateStatus } = useI18n();
  const queryClient = useQueryClient();

  const [createMemberOpen, setCreateMemberOpen] = React.useState(false);
  const [contactOpen, setContactOpen] = React.useState(false);
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const canEditCustomer = hasPermission(PERMISSIONS.CUSTOMER_UPDATE_ALL);
  const canManageMembers = hasPermission(PERMISSIONS.CUSTOMER_MEMBER_MANAGE_ALL);
  const canManageContacts = hasPermission(PERMISSIONS.CONTACT_MANAGE_ALL);

  const customerQuery = useQuery({
    queryKey: ['admin', 'customer', customerId],
    queryFn: async () => (await adminApi.get<CustomerDto>(`/customers/${customerId}`)).data,
  });

  const membersQuery = useQuery({
    queryKey: ['admin', 'customer', customerId, 'members'],
    queryFn: async () =>
      (await adminApi.get<CustomerMemberDto[]>(`/customers/${customerId}/members`)).data,
  });

  const contactsQuery = useQuery({
    queryKey: ['admin', 'customer', customerId, 'contacts'],
    queryFn: async () =>
      (await adminApi.get<ContactDto[]>(`/customers/${customerId}/contacts`)).data,
  });

  const employeesQuery = useQuery({
    queryKey: ['admin', 'employees', 'lookup'],
    queryFn: () => adminApi.get<EmployeeDto[]>('/employees?limit=100&isActive=true'),
  });

  const customer = customerQuery.data;

  const updateForm = useForm<UpdateCustomerInput>({
    resolver: zodResolver(updateCustomerSchema),
    values: customer
      ? {
          companyName: customer.companyName,
          legalName: customer.legalName ?? '',
          industry: customer.industry ?? '',
          taxId: customer.taxId ?? '',
          website: customer.website ?? '',
          status: customer.status,
          accountManagerId: customer.accountManagerId ?? '',
          internalNotes: customer.internalNotes ?? '',
        }
      : undefined,
  });

  const memberForm = useForm({
    resolver: zodResolver(createCustomerMemberSchema),
    defaultValues: { roleSlug: 'customer_member', isPrimary: false },
  });

  const contactForm = useForm({
    resolver: zodResolver(createContactSchema),
    defaultValues: { isPrimary: false },
  });

  const extractErr = (err: unknown, fallback: string) => {
    const code =
      typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
    return translateError(code, err instanceof Error ? err.message : fallback);
  };

  const saveCustomer = useMutation({
    mutationFn: (body: UpdateCustomerInput) =>
      adminApi.patch<CustomerDto>(`/customers/${customerId}`, {
        ...body,
        accountManagerId: body.accountManagerId || null,
      }),
    onSuccess: async () => {
      setErrorMsg(null);
      setStatusMsg(t.admin.customers.profileSaved);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'customer', customerId] });
    },
    onError: (err) => setErrorMsg(extractErr(err, 'Update failed')),
  });

  const createMember = useMutation({
    mutationFn: (body: CreateCustomerMemberInput) =>
      adminApi.post<CustomerMemberDto>(`/customers/${customerId}/members`, body),
    onSuccess: async () => {
      setErrorMsg(null);
      setStatusMsg(t.admin.customers.profileCreatedNotice);
      setCreateMemberOpen(false);
      memberForm.reset({ roleSlug: 'customer_member', isPrimary: false });
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'customer', customerId, 'members'],
      });
    },
    onError: (err) => setErrorMsg(extractErr(err, 'Unable to create customer profile')),
  });

  const toggleMember = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) =>
      adminApi.patch(`/customers/${customerId}/members/${id}`, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'customer', customerId, 'members'],
      });
    },
    onError: (err) => setErrorMsg(extractErr(err, 'Unable to update member status')),
  });

  const addContact = useMutation({
    mutationFn: (body: CreateContactInput) =>
      adminApi.post<ContactDto>(`/customers/${customerId}/contacts`, body),
    onSuccess: async () => {
      setErrorMsg(null);
      setContactOpen(false);
      contactForm.reset({ isPrimary: false });
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'customer', customerId, 'contacts'],
      });
    },
    onError: (err) => setErrorMsg(extractErr(err, 'Unable to add contact')),
  });

  const deleteContact = useMutation({
    mutationFn: (contactId: string) =>
      adminApi.delete(`/customers/${customerId}/contacts/${contactId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'customer', customerId, 'contacts'],
      });
    },
    onError: (err) => setErrorMsg(extractErr(err, 'Unable to delete contact')),
  });

  const queryError = customerQuery.error ?? membersQuery.error ?? contactsQuery.error;

  if (customerQuery.isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonStatStrip items={3} />
        <SkeletonTable rows={5} columns={5} />
      </div>
    );
  }

  if (customerQuery.isError || !customer) {
    return (
      <AlertBanner tone="crimson">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{extractErr(customerQuery.error, t.common.noData)}</span>
          <Button variant="outline" size="sm" onClick={() => void customerQuery.refetch()}>
            {t.common.retry}
          </Button>
        </div>
      </AlertBanner>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          customer
            ? `${customer.customerCode} (${t.admin.customers.detailEyebrow})`
            : t.admin.customers.detailEyebrow
        }
        title={customer?.companyName ?? t.common.loading}
        description={t.admin.customers.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/customers">{t.admin.customers.backToDirectory}</Link>
            </Button>
            {canManageContacts ? (
              <Button variant="outline" size="sm" onClick={() => setContactOpen(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t.portal.team.addContact}
              </Button>
            ) : null}
            {canManageMembers ? (
              <Button size="sm" onClick={() => setCreateMemberOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                {t.admin.customers.createPortalUser}
              </Button>
            ) : null}
          </div>
        }
      />

      {errorMsg ? <AlertBanner tone="crimson">{errorMsg}</AlertBanner> : null}
      {queryError ? (
        <AlertBanner tone="crimson">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{extractErr(queryError, t.common.noData)}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void membersQuery.refetch();
                void contactsQuery.refetch();
              }}
            >
              {t.common.retry}
            </Button>
          </div>
        </AlertBanner>
      ) : null}
      {statusMsg ? <AlertBanner tone="emerald">{statusMsg}</AlertBanner> : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>{t.admin.customers.companyProfileTitle}</CardTitle>
            <CardDescription>{t.admin.customers.companyProfileDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={updateForm.handleSubmit((v) => saveCustomer.mutate(v))}
              className="space-y-3.5"
            >
              <div className="space-y-1">
                <Label htmlFor="c360-name">{t.admin.customers.companyName}</Label>
                <Input
                  id="c360-name"
                  disabled={!canEditCustomer}
                  {...updateForm.register('companyName')}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="c360-legal">{t.admin.customers.legalName}</Label>
                <Input
                  id="c360-legal"
                  disabled={!canEditCustomer}
                  {...updateForm.register('legalName')}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="c360-status">{t.common.status}</Label>
                  <Select
                    id="c360-status"
                    disabled={!canEditCustomer}
                    {...updateForm.register('status')}
                  >
                    {CUSTOMER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {translateStatus(s)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="c360-industry">{t.admin.customers.colIndustry}</Label>
                  <Input
                    id="c360-industry"
                    disabled={!canEditCustomer}
                    {...updateForm.register('industry')}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="c360-mgr">{t.admin.customers.colManager}</Label>
                <Select
                  id="c360-mgr"
                  disabled={!canEditCustomer}
                  {...updateForm.register('accountManagerId')}
                >
                  <option value="">{t.common.unassigned}</option>
                  {employeesQuery.data?.data.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="c360-notes">{t.admin.customers.internalNotesHidden}</Label>
                <Textarea
                  id="c360-notes"
                  disabled={!canEditCustomer}
                  {...updateForm.register('internalNotes')}
                />
              </div>
              {canEditCustomer ? (
                <Button type="submit" size="sm" disabled={saveCustomer.isPending}>
                  {t.admin.customers.saveProfile}
                </Button>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-8">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>{t.admin.customers.portalMembersTitle}</CardTitle>
              <CardDescription>{t.admin.customers.portalMembersDesc}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {membersQuery.isLoading ? (
                <SkeletonTable rows={3} columns={5} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-start text-xs">
                    <thead>
                      <tr className="border-b border-[var(--color-rule)] bg-[var(--color-paper-2)]/75 text-[var(--color-muted)]">
                        <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                          {t.common.fullName}
                        </th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                          {t.common.phone}
                        </th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                          {t.common.email}
                        </th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                          {t.common.role}
                        </th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                          {t.common.status}
                        </th>
                        {canManageMembers ? (
                          <th className="whitespace-nowrap px-4 py-2.5 text-end font-medium">
                            {t.common.actions}
                          </th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-rule)]">
                      {membersQuery.data?.map((m) => (
                        <tr key={m.id}>
                          <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                            {m.fullName}
                          </td>
                          <td className="font-mono-tabular px-4 py-3 text-start text-[var(--color-muted)]">
                            {m.phone ? (
                              <span dir="ltr" className="inline-block">
                                {m.phone}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="font-mono-tabular px-4 py-3 text-start text-[var(--color-muted)]">
                            {m.email ? (
                              <span dir="ltr" className="inline-block">
                                {m.email}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge label={translateRole(m.roleSlug)} tone="cobalt" />
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              label={translateStatus(m.userStatus)}
                              tone={m.userStatus === 'active' ? 'emerald' : 'crimson'}
                            />
                          </td>
                          {canManageMembers ? (
                            <td className="px-4 py-3 text-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  toggleMember.mutate({
                                    id: m.id,
                                    status: m.userStatus === 'active' ? 'suspended' : 'active',
                                  })
                                }
                              >
                                {m.userStatus === 'active' ? t.common.suspend : t.common.activate}
                              </Button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                      {(membersQuery.data?.length ?? 0) === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-5 text-[var(--color-muted)]">
                            {t.admin.customers.noMembers}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.admin.customers.contactsTitle}</CardTitle>
              <CardDescription>{t.admin.customers.contactsDesc}</CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-[var(--color-rule)]">
              {contactsQuery.isLoading ? (
                <SkeletonTable rows={3} columns={2} />
              ) : contactsQuery.isError ? null : (contactsQuery.data?.length ?? 0) === 0 ? (
                <p className="py-3 text-xs text-[var(--color-muted)]">
                  {t.admin.customers.noContacts}
                </p>
              ) : (
                contactsQuery.data?.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 py-3 text-xs">
                    <div className="space-y-0.5">
                      <p className="font-medium text-[var(--color-ink)]">
                        {c.fullName}{' '}
                        {c.jobTitle ? (
                          <span className="font-normal text-[var(--color-muted)]">
                            ({c.jobTitle})
                          </span>
                        ) : null}
                      </p>
                      <p className="text-start text-xs text-[var(--color-muted)]">
                        {c.email || c.phone ? (
                          <span dir="ltr" className="font-mono-tabular inline-block">
                            {[c.email, c.phone].filter(Boolean).join(', ')}
                          </span>
                        ) : null}
                        {c.departmentLabel ? (
                          <span>
                            {c.email || c.phone ? ', ' : ''}
                            {c.departmentLabel}
                          </span>
                        ) : null}
                        {!c.email && !c.phone && !c.departmentLabel ? '-' : null}
                      </p>
                    </div>
                    {canManageContacts ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${t.common.delete} ${c.fullName}`}
                        onClick={() => deleteContact.mutate(c.id)}
                      >
                        <Trash2
                          className="h-3.5 w-3.5 text-[var(--color-signal-crimson)]"
                          aria-hidden="true"
                        />
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ModalDialog
        open={createMemberOpen}
        onClose={() => setCreateMemberOpen(false)}
        title={t.admin.customers.createMemberModalTitle}
        description={t.admin.customers.createMemberModalDesc}
      >
        <form
          onSubmit={memberForm.handleSubmit((v) => createMember.mutate(v))}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="m-name">{t.common.fullName}</Label>
            <Input
              id="m-name"
              aria-invalid={Boolean(memberForm.formState.errors.fullName)}
              aria-describedby="m-name-err"
              {...memberForm.register('fullName')}
            />
            <p id="m-name-err" className="min-h-[1lh] text-xs text-[var(--color-error)]">
              {memberForm.formState.errors.fullName?.message ?? ''}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-phone">{t.common.phone}</Label>
            <Input
              id="m-phone"
              type="tel"
              dir="ltr"
              placeholder="+989123456789"
              aria-invalid={Boolean(memberForm.formState.errors.phone)}
              aria-describedby="m-phone-err"
              {...memberForm.register('phone')}
            />
            <p id="m-phone-err" className="min-h-[1lh] text-xs text-[var(--color-error)]">
              {memberForm.formState.errors.phone?.message ?? ''}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-email">
              {t.common.email} ({t.common.optional})
            </Label>
            <Input
              id="m-email"
              type="email"
              dir="ltr"
              aria-invalid={Boolean(memberForm.formState.errors.email)}
              aria-describedby="m-email-err"
              {...memberForm.register('email')}
            />
            <p id="m-email-err" className="min-h-[1lh] text-xs text-[var(--color-error)]">
              {memberForm.formState.errors.email?.message ?? ''}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-role">{t.admin.customers.portalRole}</Label>
              <Select id="m-role" {...memberForm.register('roleSlug')}>
                {CUSTOMER_ROLE_SLUGS.map((slug) => (
                  <option key={slug} value={slug}>
                    {translateRole(slug)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-title">{t.common.jobTitle}</Label>
              <Input id="m-title" {...memberForm.register('jobTitle')} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateMemberOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={createMember.isPending}>
              {createMember.isPending
                ? t.common.creating
                : t.admin.customers.createProfileSubmit}
            </Button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        title={t.portal.team.contactModalTitle}
      >
        <form
          onSubmit={contactForm.handleSubmit((v) => addContact.mutate(v))}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="ac-name">{t.common.fullName}</Label>
            <Input
              id="ac-name"
              aria-invalid={Boolean(contactForm.formState.errors.fullName)}
              aria-describedby="ac-name-err"
              {...contactForm.register('fullName')}
            />
            <p id="ac-name-err" className="min-h-[1lh] text-xs text-[var(--color-error)]">
              {contactForm.formState.errors.fullName?.message ?? ''}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ac-email">{t.common.email}</Label>
              <Input id="ac-email" type="email" dir="ltr" {...contactForm.register('email')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ac-phone">{t.common.phone}</Label>
              <Input id="ac-phone" dir="ltr" {...contactForm.register('phone')} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ac-title">{t.common.jobTitle}</Label>
              <Input id="ac-title" {...contactForm.register('jobTitle')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ac-dept">{t.portal.team.deptDockLabel}</Label>
              <Input id="ac-dept" {...contactForm.register('departmentLabel')} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setContactOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={addContact.isPending}>
              {t.portal.team.saveContact}
            </Button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
