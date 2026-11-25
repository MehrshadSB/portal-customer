'use client';

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
  StatusBadge,
  Textarea,
} from '@portal/ui';
import {
  createContactSchema,
  inviteCustomerMemberSchema,
  updateCustomerSchema,
  type CreateContactInput,
  type InviteCustomerMemberInput,
  type UpdateCustomerInput,
} from '@portal/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useAdminSession } from '@/hooks/use-admin-session';
import { adminApi } from '@/lib/api';

export default function AdminCustomerDetailPage() {
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId;
  const { hasPermission } = useAdminSession(false);
  const { t, translateError, translateRole, translateStatus } = useI18n();
  const queryClient = useQueryClient();

  const [inviteOpen, setInviteOpen] = React.useState(false);
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

  const inviteForm = useForm({
    resolver: zodResolver(inviteCustomerMemberSchema),
    defaultValues: { roleSlug: 'customer_member', isPrimary: false },
  });

  const contactForm = useForm({
    resolver: zodResolver(createContactSchema),
    defaultValues: { isPrimary: false },
  });

  const extractErr = (err: unknown, fallback: string) => {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
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

  const inviteMember = useMutation({
    mutationFn: (body: InviteCustomerMemberInput) =>
      adminApi.post<CustomerMemberDto>(`/customers/${customerId}/members/invite`, body),
    onSuccess: async () => {
      setErrorMsg(null);
      setInviteOpen(false);
      inviteForm.reset({ roleSlug: 'customer_member', isPrimary: false });
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'customer', customerId, 'members'],
      });
    },
    onError: (err) => setErrorMsg(extractErr(err, 'Invite failed')),
  });

  const toggleMember = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) =>
      adminApi.patch(`/customers/${customerId}/members/${id}`, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'customer', customerId, 'members'],
      });
    },
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
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          customer
            ? `${customer.customerCode} · ${t.admin.customers.detailEyebrow}`
            : t.admin.customers.detailEyebrow
        }
        title={customer?.companyName ?? t.common.loading}
        description={t.admin.customers.description}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/customers"
              className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg-subtle)]"
            >
              {t.admin.customers.backToDirectory}
            </Link>
            {canManageContacts ? (
              <Button variant="outline" size="sm" onClick={() => setContactOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                {t.portal.team.addContact}
              </Button>
            ) : null}
            {canManageMembers ? (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" />
                {t.admin.customers.invitePortalUser}
              </Button>
            ) : null}
          </div>
        }
      />

      {errorMsg ? <AlertBanner tone="crimson">{errorMsg}</AlertBanner> : null}
      {statusMsg ? <AlertBanner tone="emerald">{statusMsg}</AlertBanner> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{t.admin.customers.companyProfileTitle}</CardTitle>
            <CardDescription>{t.admin.customers.companyProfileDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={updateForm.handleSubmit((v) => saveCustomer.mutate(v))}
              className="space-y-3"
            >
              <div className="space-y-1">
                <Label htmlFor="c360-name">{t.admin.customers.companyName}</Label>
                <Input id="c360-name" disabled={!canEditCustomer} {...updateForm.register('companyName')} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="c360-legal">{t.admin.customers.legalName}</Label>
                <Input id="c360-legal" disabled={!canEditCustomer} {...updateForm.register('legalName')} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="c360-status">{t.common.status}</Label>
                  <Select id="c360-status" disabled={!canEditCustomer} {...updateForm.register('status')}>
                    {CUSTOMER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {translateStatus(s)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="c360-industry">{t.admin.customers.colIndustry}</Label>
                  <Input id="c360-industry" disabled={!canEditCustomer} {...updateForm.register('industry')} />
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

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t.admin.customers.portalMembersTitle}</CardTitle>
              <CardDescription>{t.admin.customers.portalMembersDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-hairline)] text-[var(--ink-muted)]">
                      <th className="py-2 pe-4 font-medium">{t.common.fullName}</th>
                      <th className="py-2 pe-4 font-medium">{t.common.email}</th>
                      <th className="py-2 pe-4 font-medium">{t.common.role}</th>
                      <th className="py-2 pe-4 font-medium">{t.common.status}</th>
                      {canManageMembers ? <th className="py-2 text-end font-medium">{t.common.actions}</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)]">
                    {membersQuery.data?.map((m) => (
                      <tr key={m.id}>
                        <td className="py-2.5 pe-4 font-medium">{m.fullName}</td>
                        <td dir="ltr" className="font-mono-tabular py-2.5 pe-4 text-start text-[var(--ink-muted)]">
                          {m.email}
                        </td>
                        <td className="py-2.5 pe-4">
                          <StatusBadge label={translateRole(m.roleSlug)} tone="cobalt" />
                        </td>
                        <td className="py-2.5 pe-4">
                          <StatusBadge
                            label={translateStatus(m.userStatus)}
                            tone={
                              m.userStatus === 'active'
                                ? 'emerald'
                                : m.userStatus === 'invited'
                                  ? 'amber'
                                  : 'crimson'
                            }
                          />
                        </td>
                        {canManageMembers ? (
                          <td className="py-2.5 text-end">
                            {m.userStatus !== 'invited' ? (
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
                            ) : (
                              <span className="text-[var(--ink-muted)]">{t.admin.customers.pendingInvite}</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                    {(membersQuery.data?.length ?? 0) === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-4 text-[var(--ink-muted)]">
                          {t.admin.customers.noMembers}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.admin.customers.contactsTitle}</CardTitle>
              <CardDescription>{t.admin.customers.contactsDesc}</CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-[var(--border-hairline)]">
              {contactsQuery.data?.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2.5 text-xs">
                  <div>
                    <p className="font-medium">
                      {c.fullName}{' '}
                      {c.jobTitle ? (
                        <span className="font-normal text-[var(--ink-muted)]">· {c.jobTitle}</span>
                      ) : null}
                    </p>
                    <p dir="ltr" className="font-mono-tabular text-start text-[11px] text-[var(--ink-muted)]">
                      {[c.email, c.phone, c.departmentLabel].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  {canManageContacts ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${t.common.delete} ${c.fullName}`}
                      onClick={() => deleteContact.mutate(c.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-[var(--signal-crimson)]" />
                    </Button>
                  ) : null}
                </div>
              ))}
              {(contactsQuery.data?.length ?? 0) === 0 ? (
                <p className="py-3 text-xs text-[var(--ink-muted)]">{t.admin.customers.noContacts}</p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <ModalDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t.admin.customers.inviteModalTitle}
        description={t.admin.customers.inviteModalDesc}
      >
        <form
          onSubmit={inviteForm.handleSubmit((v) => inviteMember.mutate(v))}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="m-name">{t.common.fullName}</Label>
            <Input id="m-name" {...inviteForm.register('fullName')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-email">{t.common.email}</Label>
            <Input id="m-email" type="email" dir="ltr" {...inviteForm.register('email')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-role">{t.admin.customers.portalRole}</Label>
            <Select id="m-role" {...inviteForm.register('roleSlug')}>
              {CUSTOMER_ROLE_SLUGS.map((slug) => (
                <option key={slug} value={slug}>
                  {translateRole(slug)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-title">{t.common.jobTitle}</Label>
            <Input id="m-title" {...inviteForm.register('jobTitle')} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={inviteMember.isPending}>
              {t.admin.customers.sendPortalInvite}
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
            <Input id="ac-name" {...contactForm.register('fullName')} />
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
