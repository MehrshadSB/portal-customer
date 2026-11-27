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

  if (ticketQuery.isLoading || !ticket) {
    return <p className="py-8 text-xs text-[var(--ink-muted)]">{t.common.loading}</p>;
  }

  const canUpdate = hasPermission(PERMISSIONS.TICKET_UPDATE) || hasPermission(PERMISSIONS.TICKET_ASSIGN);
  const canReopen =
    hasPermission(PERMISSIONS.TICKET_REOPEN) &&
    (ticket.status === 'resolved' || ticket.status === 'closed');
  const canSendPublic = hasPermission(PERMISSIONS.MESSAGE_SEND_PUBLIC);
  const canSendInternal = hasPermission(PERMISSIONS.MESSAGE_SEND_INTERNAL);
  const canUpload = hasPermission(PERMISSIONS.DOCUMENT_UPLOAD);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${ticket.ticketNumber} · ${ticket.customerName} · ${ticket.categoryName}`}
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => reopenMutation.mutate()}
              >
                {t.tickets.reopenTicket}
              </Button>
            ) : null}
          </div>
        }
      />

      {errorMsg ? <AlertBanner tone="crimson">{errorMsg}</AlertBanner> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t.tickets.conversationTitle}</CardTitle>
              <CardDescription>{t.tickets.adminDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <ConversationThread
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

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.common.actions}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t.common.status}</Label>
                <Select
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
                <Label>{t.common.priority}</Label>
                <Select
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
                <Label>{t.common.department}</Label>
                <Select
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
                <Label>{t.tickets.assignee}</Label>
                <Select
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
                <div className="border-t border-[var(--border-hairline)] pt-3 text-xs">
                  <p className="text-[var(--ink-muted)]">{t.tickets.linkedOrder}</p>
                  <Link
                    href={`/orders/${ticket.orderId}`}
                    className="font-mono-tabular font-medium text-[var(--accent-cobalt)] hover:underline"
                  >
                    {ticket.orderNumber} · {ticket.orderTitle}
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
