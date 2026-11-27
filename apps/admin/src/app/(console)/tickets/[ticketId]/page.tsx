'use client';

import { useI18n } from '@portal/i18n/react';
import {
  PERMISSIONS,
  REALTIME_EVENTS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type DepartmentDto,
  type EmployeeDto,
  type MessageDto,
  type TicketDetailDto,
} from '@portal/types';
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConversationThread,
  Label,
  PageHeader,
  Select,
  SkeletonStatStrip,
  SkeletonTable,
  StatusBadge,
} from '@portal/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { useAdminSession } from '@/hooks/use-admin-session';
import {
  adminApi,
  createAdminSocket,
  downloadAdminAttachment,
  uploadAdminAttachment,
} from '@/lib/api';

export default function AdminTicketDetailPage() {
  const params = useParams<{ ticketId: string }>();
  const ticketId = params.ticketId;
  const { user, hasPermission } = useAdminSession(false);
  const { t, formatDateTime, translateError, translateStatus } = useI18n();
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const ticketQuery = useQuery({
    queryKey: ['admin', 'ticket', ticketId],
    queryFn: async () => (await adminApi.get<TicketDetailDto>(`/tickets/${ticketId}`)).data,
  });

  const ticket = ticketQuery.data;
  const conversationId = ticket?.conversationId;

  const messagesQuery = useQuery({
    queryKey: ['admin', 'conversation', conversationId, 'messages'],
    queryFn: async () =>
      (await adminApi.get<MessageDto[]>(`/conversations/${conversationId}/messages?limit=100`))
        .data,
    enabled: Boolean(conversationId),
  });

  const deptsQuery = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => adminApi.get<DepartmentDto[]>('/departments'),
  });

  const empsQuery = useQuery({
    queryKey: ['admin', 'employees', 'lookup'],
    queryFn: () => adminApi.get<EmployeeDto[]>('/employees?limit=100&isActive=true'),
  });

  React.useEffect(() => {
    if (!user || !conversationId) return;
    const socket = createAdminSocket();

    socket.on('connect', () => {
      socket.emit(REALTIME_EVENTS.CONVERSATION_JOIN, { conversationId });
    });

    socket.on(REALTIME_EVENTS.MESSAGE_CREATED, () => {
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'conversation', conversationId, 'messages'],
      });
    });

    socket.on(REALTIME_EVENTS.TICKET_UPDATED, () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'ticket', ticketId] });
    });

    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [user, conversationId, ticketId, queryClient]);

  const updateMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      adminApi.patch<TicketDetailDto>(`/tickets/${ticketId}`, patch),
    onSuccess: async () => {
      setErrorMsg(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'ticket', ticketId] });
      if (conversationId) {
        await queryClient.invalidateQueries({
          queryKey: ['admin', 'conversation', conversationId, 'messages'],
        });
      }
    },
    onError: (err) => {
      const code =
        typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      setErrorMsg(translateError(code, err instanceof Error ? err.message : 'Update failed'));
    },
  });

  const reopenMutation = useMutation({
    mutationFn: () => adminApi.post(`/tickets/${ticketId}/reopen`, {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'ticket', ticketId] });
      if (conversationId) {
        await queryClient.invalidateQueries({
          queryKey: ['admin', 'conversation', conversationId, 'messages'],
        });
      }
    },
  });

  if (ticketQuery.isError) {
    return (
      <AlertBanner tone="crimson">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {translateError(
              typeof ticketQuery.error === 'object' &&
                ticketQuery.error !== null &&
                'code' in ticketQuery.error
                ? String(ticketQuery.error.code)
                : undefined,
              ticketQuery.error instanceof Error ? ticketQuery.error.message : t.common.noData,
            )}
          </span>
          <Button variant="outline" size="sm" onClick={() => void ticketQuery.refetch()}>
            {t.common.retry}
          </Button>
        </div>
      </AlertBanner>
    );
  }

  if (ticketQuery.isLoading || !ticket) {
    return (
      <div className="space-y-6">
        <SkeletonStatStrip items={3} />
        <SkeletonTable rows={5} columns={3} />
      </div>
    );
  }

  const canUpdate =
    hasPermission(PERMISSIONS.TICKET_UPDATE) || hasPermission(PERMISSIONS.TICKET_ASSIGN);
  const canReopen =
    hasPermission(PERMISSIONS.TICKET_REOPEN) &&
    (ticket.status === 'resolved' || ticket.status === 'closed');
  const canSendPublic = hasPermission(PERMISSIONS.MESSAGE_SEND_PUBLIC);
  const canSendInternal = hasPermission(PERMISSIONS.MESSAGE_SEND_INTERNAL);
  const canUpload = hasPermission(PERMISSIONS.DOCUMENT_UPLOAD);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${ticket.ticketNumber}, ${ticket.customerName} (${ticket.categoryName})`}
        title={ticket.subject}
        description={`${t.common.timestamp}: ${formatDateTime(ticket.createdAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={translateStatus(ticket.status)}
              tone={
                ticket.status === 'resolved' || ticket.status === 'closed'
                  ? 'emerald'
                  : ticket.status === 'waiting_for_customer'
                    ? 'amber'
                    : 'cobalt'
              }
            />
            {canReopen ? (
              <Button variant="outline" size="sm" onClick={() => reopenMutation.mutate()}>
                {t.tickets.reopenTicket}
              </Button>
            ) : null}
          </div>
        }
      />

      {errorMsg ? <AlertBanner tone="crimson">{errorMsg}</AlertBanner> : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <Card>
            <CardHeader>
              <CardTitle>{t.tickets.conversationTitle}</CardTitle>
              <CardDescription>{t.tickets.adminDescription}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ConversationThread
                embedded
                messages={messagesQuery.data ?? []}
                currentUserId={user?.id ?? ''}
                canSendPublic={canSendPublic}
                canSendInternal={canSendInternal}
                isLoading={messagesQuery.isLoading}
                onSendMessage={async (payload) => {
                  if (!conversationId) return;
                  await adminApi.post(`/conversations/${conversationId}/messages`, payload);
                  await queryClient.invalidateQueries({
                    queryKey: ['admin', 'conversation', conversationId, 'messages'],
                  });
                }}
                onUploadAttachment={
                  canUpload
                    ? (file, visibility) =>
                        uploadAdminAttachment(file, {
                          ticketId: ticket.id,
                          visibility,
                        })
                    : undefined
                }
                onDownloadAttachment={(attId) => void downloadAdminAttachment(attId)}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>{t.common.actions}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="tk-status">{t.common.status}</Label>
                <Select
                  id="tk-status"
                  value={ticket.status}
                  disabled={!canUpdate || updateMutation.isPending}
                  onChange={(e) => updateMutation.mutate({ status: e.target.value })}
                >
                  {TICKET_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {translateStatus(s)}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tk-prio">{t.common.priority}</Label>
                <Select
                  id="tk-prio"
                  value={ticket.priority}
                  disabled={!canUpdate || updateMutation.isPending}
                  onChange={(e) => updateMutation.mutate({ priority: e.target.value })}
                >
                  {TICKET_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {translateStatus(p)}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tk-dept">{t.common.department}</Label>
                <Select
                  id="tk-dept"
                  value={ticket.assignedDepartmentId ?? ''}
                  disabled={!canUpdate || updateMutation.isPending}
                  onChange={(e) =>
                    updateMutation.mutate({ assignedDepartmentId: e.target.value || null })
                  }
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
                <Label htmlFor="tk-assignee">{t.tickets.assignee}</Label>
                <Select
                  id="tk-assignee"
                  value={ticket.assignedEmployeeId ?? ''}
                  disabled={!canUpdate || updateMutation.isPending}
                  onChange={(e) =>
                    updateMutation.mutate({ assignedEmployeeId: e.target.value || null })
                  }
                >
                  <option value="">{t.common.unassigned}</option>
                  {empsQuery.data?.data.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName}
                    </option>
                  ))}
                </Select>
              </div>

              {ticket.orderId && ticket.orderNumber ? (
                <div className="border-t border-[var(--color-rule)] pt-3 text-xs">
                  <p className="mb-1 text-[var(--color-muted)]">{t.tickets.linkedOrder}</p>
                  <Link
                    href={`/orders/${ticket.orderId}`}
                    className="font-mono-tabular font-medium text-[var(--color-accent-2)] hover:underline"
                  >
                    {`${ticket.orderNumber} (${ticket.orderTitle})`}
                  </Link>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
