'use client';

import { useI18n } from '@portal/i18n/react';
import {
  PERMISSIONS,
  REALTIME_EVENTS,
  type MessageDto,
  type TicketDetailDto,
} from '@portal/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConversationThread,
  PageHeader,
  StatusBadge,
} from '@portal/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { usePortalSession } from '@/hooks/use-portal-session';
import {
  createPortalSocket,
  downloadPortalAttachment,
  portalApi,
  uploadPortalAttachment,
} from '@/lib/api';

export default function PortalTicketDetailPage() {
  const params = useParams<{ ticketId: string }>();
  const ticketId = params.ticketId;
  const { user, hasPermission } = usePortalSession(false);
  const { t, formatDateTime, translateStatus } = useI18n();
  const queryClient = useQueryClient();

  const ticketQuery = useQuery({
    queryKey: ['portal', 'ticket', ticketId],
    queryFn: async () => (await portalApi.get<TicketDetailDto>(`/tickets/${ticketId}`)).data,
  });

  const ticket = ticketQuery.data;
  const conversationId = ticket?.conversationId;

  const messagesQuery = useQuery({
    queryKey: ['portal', 'conversation', conversationId, 'messages'],
    queryFn: async () =>
      (await portalApi.get<MessageDto[]>(`/conversations/${conversationId}/messages?limit=100`))
        .data,
    enabled: Boolean(conversationId),
  });

  React.useEffect(() => {
    if (!user || !conversationId) return;
    const socket = createPortalSocket();

    socket.on('connect', () => {
      socket.emit(REALTIME_EVENTS.CONVERSATION_JOIN, { conversationId });
    });

    socket.on(REALTIME_EVENTS.MESSAGE_CREATED, () => {
      void queryClient.invalidateQueries({
        queryKey: ['portal', 'conversation', conversationId, 'messages'],
      });
    });

    socket.on(REALTIME_EVENTS.TICKET_UPDATED, () => {
      void queryClient.invalidateQueries({ queryKey: ['portal', 'ticket', ticketId] });
    });

    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [user, conversationId, ticketId, queryClient]);

  const reopenMutation = useMutation({
    mutationFn: () => portalApi.post(`/tickets/${ticketId}/reopen`, {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['portal', 'ticket', ticketId] });
      if (conversationId) {
        await queryClient.invalidateQueries({
          queryKey: ['portal', 'conversation', conversationId, 'messages'],
        });
      }
    },
  });

  if (ticketQuery.isLoading || !ticket) {
    return <p className="py-8 text-xs text-[var(--ink-muted)]">{t.common.loading}</p>;
  }

  const canSendPublic = hasPermission(PERMISSIONS.MESSAGE_SEND_PUBLIC);
  const canUpload = hasPermission(PERMISSIONS.DOCUMENT_UPLOAD);
  const canReopen =
    hasPermission(PERMISSIONS.TICKET_REOPEN) &&
    (ticket.status === 'resolved' || ticket.status === 'closed');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${ticket.ticketNumber} · ${ticket.categoryName}`}
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
            <StatusBadge label={translateStatus(ticket.priority)} tone="slate" />
            {canReopen ? (
              <Button
                variant="outline"
                size="sm"
                disabled={reopenMutation.isPending}
                onClick={() => reopenMutation.mutate()}
              >
                {t.tickets.reopenTicket}
              </Button>
            ) : null}
          </div>
        }
      />

      {ticket.orderId && ticket.orderNumber ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
            <span>
              {t.tickets.linkedOrder}:{' '}
              <strong dir="ltr" className="font-mono-tabular">
                {ticket.orderNumber}
              </strong>{' '}
              — {ticket.orderTitle}
            </span>
            <Link
              href={`/orders/${ticket.orderId}`}
              className="font-medium text-[var(--accent-cobalt)] hover:underline"
            >
              {t.common.inspect}
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.tickets.conversationTitle}</CardTitle>
          <CardDescription>{t.conversations.publicMode}</CardDescription>
        </CardHeader>
        <CardContent>
          <ConversationThread
            messages={messagesQuery.data ?? []}
            currentUserId={user?.id ?? ''}
            canSendPublic={canSendPublic}
            canSendInternal={false}
            isLoading={messagesQuery.isLoading}
            onSendMessage={async (payload) => {
              if (!conversationId) return;
              await portalApi.post(`/conversations/${conversationId}/messages`, payload);
              await queryClient.invalidateQueries({
                queryKey: ['portal', 'conversation', conversationId, 'messages'],
              });
            }}
            onUploadAttachment={
              canUpload
                ? (file) => uploadPortalAttachment(file, { ticketId: ticket.id })
                : undefined
            }
            onDownloadAttachment={(attId) => void downloadPortalAttachment(attId)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
