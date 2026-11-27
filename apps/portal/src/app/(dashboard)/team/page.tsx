'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useI18n } from '@portal/i18n/react';
import { PERMISSIONS, type ContactDto, type CustomerMemberDto } from '@portal/types';
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
  SkeletonTable,
  StatusBadge,
} from '@portal/ui';
import { createContactSchema, type CreateContactInput } from '@portal/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Users } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { usePortalSession } from '@/hooks/use-portal-session';
import { portalApi } from '@/lib/api';

export default function PortalTeamPage() {
  const { hasPermission } = usePortalSession(false);
  const { t, translateError, translateRole, translateStatus } = useI18n();
  const queryClient = useQueryClient();
  const [contactOpen, setContactOpen] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

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

  const contactForm = useForm({
    resolver: zodResolver(createContactSchema),
    defaultValues: { isPrimary: false },
  });

  const extractErr = (err: unknown, fallback: string) => {
    const code =
      typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
    return translateError(code, err instanceof Error ? err.message : fallback);
  };

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
          canManageContacts ? (
            <Button variant="outline" size="sm" onClick={() => setContactOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t.portal.team.addContact}
            </Button>
          ) : null
        }
      />

      <AlertBanner tone="cobalt">{t.portal.team.adminProvisionedNotice}</AlertBanner>
      {errorMsg || membersQuery.isError || contactsQuery.isError || deleteContactMutation.isError ? (
        <AlertBanner tone="crimson">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {errorMsg ??
                extractErr(
                  membersQuery.error ?? contactsQuery.error ?? deleteContactMutation.error,
                  t.common.noData,
                )}
            </span>
            {membersQuery.isError || contactsQuery.isError ? (
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
            ) : null}
          </div>
        </AlertBanner>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.portal.team.portalUsersTitle}</CardTitle>
          <CardDescription>{t.portal.team.portalUsersDesc}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {membersQuery.isLoading ? (
            <SkeletonTable rows={4} columns={5} />
          ) : membersQuery.isError ? null : (membersQuery.data?.length ?? 0) === 0 ? (
            <EmptyState
              embedded
              headingLevel="h3"
              icon={<Users className="h-4 w-4" />}
              title={t.portal.team.emptyMembersTitle}
              description={t.portal.team.emptyMembersDesc}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-rule)] bg-[var(--color-paper-2)] text-[var(--color-muted)]">
                    <th className="px-4 py-2.5 font-medium">{t.common.fullName}</th>
                    <th className="px-4 py-2.5 font-medium">{t.common.phone}</th>
                    <th className="px-4 py-2.5 font-medium">{t.common.email}</th>
                    <th className="px-4 py-2.5 font-medium">{t.common.role}</th>
                    <th className="px-4 py-2.5 font-medium">{t.common.status}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-rule)]">
                  {membersQuery.data?.map((member) => (
                    <tr
                      key={member.id}
                      className="transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper-2)]/60"
                    >
                      <td className="px-4 py-2.5 font-medium text-[var(--color-ink)]">
                        {member.fullName}
                        {member.jobTitle ? (
                          <span className="block text-xs font-normal text-[var(--color-muted)]">
                            {member.jobTitle}
                          </span>
                        ) : null}
                      </td>
                      <td className="font-mono-tabular px-4 py-2.5 text-start text-[var(--color-muted)]">
                        {member.phone ? (
                          <span dir="ltr" className="inline-block">
                            {member.phone}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="font-mono-tabular px-4 py-2.5 text-start text-[var(--color-muted)]">
                        {member.email ? (
                          <span dir="ltr" className="inline-block">
                            {member.email}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge label={translateRole(member.roleSlug)} tone="cobalt" />
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          label={translateStatus(member.userStatus)}
                          tone={member.userStatus === 'active' ? 'emerald' : 'crimson'}
                        />
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
          <CardTitle>{t.portal.team.contactsTitle}</CardTitle>
          <CardDescription>{t.portal.team.contactsDesc}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {contactsQuery.isLoading ? (
            <SkeletonTable rows={3} columns={2} />
          ) : contactsQuery.isError ? null : (contactsQuery.data?.length ?? 0) === 0 ? (
            <EmptyState
              embedded
              headingLevel="h3"
              title={t.portal.team.emptyContactsTitle}
              description={t.portal.team.emptyContactsDesc}
              action={
                canManageContacts ? (
                  <Button variant="outline" size="sm" onClick={() => setContactOpen(true)}>
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    {t.portal.team.addContact}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="divide-y divide-[var(--color-rule)]">
              {contactsQuery.data?.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 text-xs">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium text-[var(--color-ink)]">
                      {c.fullName}
                      {c.jobTitle ? (
                        <span className="font-normal text-[var(--color-muted)]">: {c.jobTitle}</span>
                      ) : null}
                    </p>
                    <p className="truncate text-start text-xs text-[var(--color-muted)]">
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
                      onClick={() => deleteContactMutation.mutate(c.id)}
                    >
                      <Trash2
                        className="h-3.5 w-3.5 text-[var(--color-signal-crimson)]"
                        aria-hidden="true"
                      />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
            <Input
              id="contact-name"
              aria-invalid={Boolean(contactForm.formState.errors.fullName)}
              aria-describedby="contact-name-err"
              {...contactForm.register('fullName')}
            />
            <p id="contact-name-err" className="min-h-[1lh] text-xs text-[var(--color-signal-crimson)]">
              {contactForm.formState.errors.fullName?.message ?? ''}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">{t.common.email}</Label>
              <Input
                id="contact-email"
                type="email"
                dir="ltr"
                aria-invalid={Boolean(contactForm.formState.errors.email)}
                aria-describedby="contact-email-err"
                {...contactForm.register('email')}
              />
              <p id="contact-email-err" className="min-h-[1lh] text-xs text-[var(--color-signal-crimson)]">
                {contactForm.formState.errors.email?.message ?? ''}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-phone">{t.common.phone}</Label>
              <Input
                id="contact-phone"
                dir="ltr"
                aria-invalid={Boolean(contactForm.formState.errors.phone)}
                aria-describedby="contact-phone-err"
                {...contactForm.register('phone')}
              />
              <p id="contact-phone-err" className="min-h-[1lh] text-xs text-[var(--color-signal-crimson)]">
                {contactForm.formState.errors.phone?.message ?? ''}
              </p>
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
