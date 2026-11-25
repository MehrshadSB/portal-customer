'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useI18n } from '@portal/i18n/react';
import {
  CUSTOMER_ROLE_SLUGS,
  PERMISSIONS,
  type ContactDto,
  type CustomerMemberDto,
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
  Input,
  Label,
  ModalDialog,
  PageHeader,
  Select,
  StatusBadge,
} from '@portal/ui';
import {
  createContactSchema,
  inviteCustomerMemberSchema,
  type CreateContactInput,
  type InviteCustomerMemberInput,
} from '@portal/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, UserPlus, Users } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { usePortalSession } from '@/hooks/use-portal-session';
import { portalApi } from '@/lib/api';

export default function PortalTeamPage() {
  const { user, hasPermission } = usePortalSession(false);
  const { t, translateError, translateRole, translateStatus } = useI18n();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [contactOpen, setContactOpen] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const canManageMembers = hasPermission(PERMISSIONS.CUSTOMER_MEMBER_MANAGE_OWN);
  const canManageContacts = hasPermission(PERMISSIONS.CONTACT_MANAGE_OWN);

  const membersQuery = useQuery({
    queryKey: ['portal', 'members'],
    queryFn: async () =>
      (await portalApi.get<CustomerMemberDto[]>('/customers/my-company/members')).data,
  });

  const contactsQuery = useQuery({
    queryKey: ['portal', 'contacts'],
    queryFn: async () =>
      (await portalApi.get<ContactDto[]>('/customers/my-company/contacts')).data,
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

  const inviteMutation = useMutation({
    mutationFn: (body: InviteCustomerMemberInput) =>
      portalApi.post<CustomerMemberDto>('/customers/my-company/members/invite', body),
    onSuccess: async () => {
      setErrorMsg(null);
      setInviteOpen(false);
      inviteForm.reset({ roleSlug: 'customer_member', isPrimary: false });
      await queryClient.invalidateQueries({ queryKey: ['portal', 'members'] });
    },
    onError: (err) => setErrorMsg(extractErr(err, 'Invite failed')),
  });

  const toggleMemberStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) =>
      portalApi.patch(`/customers/my-company/members/${id}`, { status }),
    onSuccess: async () => {
      setErrorMsg(null);
      await queryClient.invalidateQueries({ queryKey: ['portal', 'members'] });
    },
    onError: (err) => setErrorMsg(extractErr(err, 'Update failed')),
  });

  const addContactMutation = useMutation({
    mutationFn: (body: CreateContactInput) =>
      portalApi.post<ContactDto>('/customers/my-company/contacts', body),
    onSuccess: async () => {
      setErrorMsg(null);
      setContactOpen(false);
      contactForm.reset({ isPrimary: false });
      await queryClient.invalidateQueries({ queryKey: ['portal', 'contacts'] });
    },
    onError: (err) => setErrorMsg(extractErr(err, 'Failed to add contact')),
  });

  const deleteContactMutation = useMutation({
    mutationFn: (contactId: string) =>
      portalApi.delete(`/customers/my-company/contacts/${contactId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['portal', 'contacts'] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.portal.team.eyebrow}
        title={t.portal.team.title}
        description={t.portal.team.description}
        actions={
          <div className="flex gap-2">
            {canManageContacts ? (
              <Button variant="outline" size="sm" onClick={() => setContactOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                {t.portal.team.addContact}
              </Button>
            ) : null}
            {canManageMembers ? (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" />
                {t.portal.team.inviteMember}
              </Button>
            ) : null}
          </div>
        }
      />

      {errorMsg ? <AlertBanner tone="crimson">{errorMsg}</AlertBanner> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.portal.team.portalUsersTitle}</CardTitle>
          <CardDescription>{t.portal.team.portalUsersDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          {membersQuery.isLoading ? (
            <p className="text-xs text-[var(--ink-muted)]">{t.portal.team.loadingMembers}</p>
          ) : (membersQuery.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Users className="h-4 w-4" />}
              title={t.portal.team.emptyMembersTitle}
              description={t.portal.team.emptyMembersDesc}
            />
          ) : (
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
                  {membersQuery.data?.map((member) => (
                    <tr key={member.id} className="hover:bg-[var(--bg-subtle)]/50">
                      <td className="py-2.5 pe-4 font-medium">
                        {member.fullName}
                        {member.jobTitle ? (
                          <span className="block text-[11px] font-normal text-[var(--ink-muted)]">
                            {member.jobTitle}
                          </span>
                        ) : null}
                      </td>
                      <td dir="ltr" className="font-mono-tabular py-2.5 pe-4 text-start text-[var(--ink-muted)]">
                        {member.email}
                      </td>
                      <td className="py-2.5 pe-4">
                        <StatusBadge label={translateRole(member.roleSlug)} tone="cobalt" />
                      </td>
                      <td className="py-2.5 pe-4">
                        <StatusBadge
                          label={translateStatus(member.userStatus)}
                          tone={
                            member.userStatus === 'active'
                              ? 'emerald'
                              : member.userStatus === 'invited'
                                ? 'amber'
                                : 'crimson'
                          }
                        />
                      </td>
                      {canManageMembers ? (
                        <td className="py-2.5 text-end">
                          {member.userId !== user?.id && member.userStatus !== 'invited' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                toggleMemberStatus.mutate({
                                  id: member.id,
                                  status: member.userStatus === 'active' ? 'suspended' : 'active',
                                })
                              }
                            >
                              {member.userStatus === 'active' ? t.common.suspend : t.common.activate}
                            </Button>
                          ) : (
                            <span className="text-[11px] text-[var(--ink-muted)]">—</span>
                          )}
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

      <Card>
        <CardHeader>
          <CardTitle>{t.portal.team.contactsTitle}</CardTitle>
          <CardDescription>{t.portal.team.contactsDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          {(contactsQuery.data?.length ?? 0) === 0 ? (
            <EmptyState
              title={t.portal.team.emptyContactsTitle}
              description={t.portal.team.emptyContactsDesc}
            />
          ) : (
            <div className="divide-y divide-[var(--border-hairline)]">
              {contactsQuery.data?.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-3 text-xs">
                  <div>
                    <p className="font-medium text-[var(--ink-primary)]">
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
                      onClick={() => deleteContactMutation.mutate(c.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-[var(--signal-crimson)]" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ModalDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t.portal.team.inviteModalTitle}
        description={t.portal.team.inviteModalDesc}
      >
        <form
          onSubmit={inviteForm.handleSubmit((v) => inviteMutation.mutate(v))}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">{t.common.fullName}</Label>
            <Input id="invite-name" {...inviteForm.register('fullName')} />
            {inviteForm.formState.errors.fullName ? (
              <p className="text-xs text-[var(--signal-crimson)]">
                {inviteForm.formState.errors.fullName.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">{t.common.email}</Label>
            <Input id="invite-email" type="email" dir="ltr" {...inviteForm.register('email')} />
            {inviteForm.formState.errors.email ? (
              <p className="text-xs text-[var(--signal-crimson)]">
                {inviteForm.formState.errors.email.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">{t.portal.team.companyRoleLabel}</Label>
            <Select id="invite-role" {...inviteForm.register('roleSlug')}>
              {CUSTOMER_ROLE_SLUGS.map((slug) => (
                <option key={slug} value={slug}>
                  {translateRole(slug)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-title">{t.common.jobTitle}</Label>
            <Input id="invite-title" {...inviteForm.register('jobTitle')} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? t.common.sending : t.portal.team.sendInvite}
            </Button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        title={t.portal.team.contactModalTitle}
        description={t.portal.team.contactModalDesc}
      >
        <form
          onSubmit={contactForm.handleSubmit((v) => addContactMutation.mutate(v))}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="contact-name">{t.common.fullName}</Label>
            <Input id="contact-name" {...contactForm.register('fullName')} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">{t.common.email}</Label>
              <Input id="contact-email" type="email" dir="ltr" {...contactForm.register('email')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-phone">{t.common.phone}</Label>
              <Input id="contact-phone" dir="ltr" {...contactForm.register('phone')} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contact-title">{t.common.jobTitle}</Label>
              <Input id="contact-title" {...contactForm.register('jobTitle')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-dept">{t.portal.team.deptDockLabel}</Label>
              <Input id="contact-dept" {...contactForm.register('departmentLabel')} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setContactOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={addContactMutation.isPending}>
              {t.portal.team.saveContact}
            </Button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
