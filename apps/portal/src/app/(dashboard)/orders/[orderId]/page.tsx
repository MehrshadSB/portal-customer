'use client';

import { useI18n } from '@portal/i18n/react';
import {
  PERMISSIONS,
  REALTIME_EVENTS,
  type AttachmentDto,
  type ConversationDto,
  type MessageDto,
  type OrderDetailDto,
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
  FileDropzone,
  OrderStageStepper,
  PageHeader,
  SkeletonStatStrip,
  SkeletonTable,
  StatusBadge,
} from '@portal/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, LifeBuoy } from 'lucide-react';
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

export default function PortalOrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;
  const { user, hasPermission } = usePortalSession(false);
  const { t, formatDate, formatDateTime, formatNumber, translateError, translateStatus } = useI18n();
  const queryClient = useQueryClient();

  const orderQuery = useQuery({
    queryKey: ['portal', 'order', orderId],
    queryFn: async () => (await portalApi.get<OrderDetailDto>(`/orders/${orderId}`)).data,
  });

  const conversationQuery = useQuery({
    queryKey: ['portal', 'order', orderId, 'conversation'],
    queryFn: async () =>
      (await portalApi.get<ConversationDto>(`/conversations/by-order/${orderId}`)).data,
    enabled: Boolean(orderQuery.data),
  });

  const conversationId = conversationQuery.data?.id;

  const messagesQuery = useQuery({
    queryKey: ['portal', 'conversation', conversationId, 'messages'],
    queryFn: async () =>
      (await portalApi.get<MessageDto[]>(`/conversations/${conversationId}/messages?limit=100`))
        .data,
    enabled: Boolean(conversationId),
  });

  const docsQuery = useQuery({
    queryKey: ['portal', 'documents', { orderId }],
    queryFn: async () =>
      (await portalApi.get<AttachmentDto[]>(`/documents?orderId=${orderId}&limit=50`)).data,
  });

  React.useEffect(() => {
    if (!user) return;
    const socket = createPortalSocket();

    socket.on('connect', () => {
      socket.emit(REALTIME_EVENTS.ORDER_JOIN, { orderId });
      if (conversationId) {
        socket.emit(REALTIME_EVENTS.CONVERSATION_JOIN, { conversationId });
      }
    });

    socket.on(REALTIME_EVENTS.ORDER_PROGRESS_UPDATED, () => {
      void queryClient.invalidateQueries({ queryKey: ['portal', 'order', orderId] });
    });

    socket.on(REALTIME_EVENTS.MESSAGE_CREATED, () => {
      if (conversationId) {
        void queryClient.invalidateQueries({
          queryKey: ['portal', 'conversation', conversationId, 'messages'],
        });
      }
    });

    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [user, orderId, conversationId, queryClient]);

  const order = orderQuery.data;
  const canSendPublic = hasPermission(PERMISSIONS.MESSAGE_SEND_PUBLIC);
  const canUpload = hasPermission(PERMISSIONS.DOCUMENT_UPLOAD);
  const canCreateTicket = hasPermission(PERMISSIONS.TICKET_CREATE_COMPANY);

  if (orderQuery.isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonStatStrip items={3} />
        <SkeletonTable rows={5} columns={4} />
      </div>
    );
  }

  if (orderQuery.isError || !order) {
    return (
      <AlertBanner tone="crimson">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {translateError(
              typeof orderQuery.error === 'object' &&
                orderQuery.error !== null &&
                'code' in orderQuery.error
                ? String(orderQuery.error.code)
                : undefined,
              orderQuery.error instanceof Error ? orderQuery.error.message : t.common.noData,
            )}
          </span>
          <Button variant="outline" size="sm" onClick={() => void orderQuery.refetch()}>
            {t.common.retry}
          </Button>
        </div>
      </AlertBanner>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${order.orderNumber}: ${t.orders.eyebrow}`}
        title={order.title}
        description={order.description ?? t.orders.portalDescription}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={order.currentStageName} tone={order.currentStageColor} />
            <StatusBadge
              label={translateStatus(order.operationalState)}
              tone={order.operationalState === 'completed' ? 'emerald' : 'cobalt'}
            />
            {canCreateTicket ? (
              <Link
                href={`/tickets/new?orderId=${order.id}`}
                className="app-btn app-btn-outline h-8 px-3 text-xs"
              >
                <LifeBuoy className="h-3.5 w-3.5" aria-hidden="true" />
                {t.orders.openTicketForOrder}
              </Link>
            ) : null}
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t.orders.stageStepperTitle}</CardTitle>
          <CardDescription>
            {order.expectedCompletionDate
              ? `${t.orders.expectedCompletion}: ${formatDate(order.expectedCompletionDate)}`
              : `${t.orders.orderedAt}: ${formatDate(order.orderedAt)}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrderStageStepper stages={order.stages} currentStatusId={order.currentStatusId} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <Card>
            <CardHeader>
              <CardTitle>{t.orders.lineItemsTitle}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {order.items.length === 0 ? (
                <p className="p-4 text-xs text-[var(--color-muted)]">{t.common.noData}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-start text-xs">
                    <thead>
                      <tr className="border-b border-[var(--color-rule)] bg-[var(--color-paper-2)] text-[var(--color-muted)]">
                        <th className="px-4 py-2 font-medium">{t.orders.partNumber}</th>
                        <th className="px-4 py-2 font-medium">{t.orders.itemName}</th>
                        <th className="px-4 py-2 font-medium">{t.orders.material}</th>
                        <th className="px-4 py-2 text-end font-medium">{t.orders.quantity}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-rule)]">
                      {order.items.map((item) => (
                        <tr
                          key={item.id}
                          className="transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper-2)]/60"
                        >
                          <td className="font-mono-tabular px-4 py-2.5 text-start">
                            {item.partNumber ? (
                              <span dir="ltr" className="inline-block">
                                {item.partNumber}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-[var(--color-ink)]">
                            {item.name}
                            {item.specification ? (
                              <span className="block text-xs font-normal text-[var(--color-muted)]">
                                {item.specification}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--color-muted)]">
                            {item.material ?? '-'}
                          </td>
                          <td className="font-mono-tabular px-4 py-2.5 text-end font-medium text-[var(--color-ink)]">
                            <span dir="ltr" className="inline-block">
                              {Number.isFinite(Number(item.quantity))
                                ? formatNumber(Number(item.quantity))
                                : item.quantity}{' '}
                              {item.unit}
                            </span>
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
              <CardTitle>{t.orders.orderThreadTitle}</CardTitle>
              <CardDescription>{t.conversations.publicMode}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ConversationThread
                embedded
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
                    ? async (file) => {
                        const att = await uploadPortalAttachment(file, { orderId: order.id });
                        await queryClient.invalidateQueries({
                          queryKey: ['portal', 'documents', { orderId }],
                        });
                        return att;
                      }
                    : undefined
                }
                onDownloadAttachment={(attId) => void downloadPortalAttachment(attId)}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>{t.orders.progressTimelineTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.progressEvents.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">{t.orders.noProgressEvents}</p>
              ) : (
                [...order.progressEvents].reverse().map((evt) => (
                  <div
                    key={evt.id}
                    className="space-y-1 rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-[var(--color-paper-2)]/60 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge label={evt.statusNameSnapshot} tone={evt.statusColorToken} />
                      <span className="font-mono-tabular text-xs text-[var(--color-muted)]">
                        {formatDateTime(evt.createdAt)}
                      </span>
                    </div>
                    {evt.note ? <p className="pt-1 text-[var(--color-ink)]">{evt.note}</p> : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.documents.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {canUpload ? (
                <FileDropzone
                  onUploadFile={async (file) => {
                    await uploadPortalAttachment(file, { orderId: order.id });
                    await queryClient.invalidateQueries({
                      queryKey: ['portal', 'documents', { orderId }],
                    });
                  }}
                />
              ) : null}

              <div className="divide-y divide-[var(--color-rule)] text-xs">
                {docsQuery.isLoading ? (
                  <SkeletonTable rows={2} columns={2} />
                ) : (docsQuery.data?.length ?? 0) === 0 ? (
                  <p className="py-2 text-[var(--color-muted)]">{t.documents.emptyTitle}</p>
                ) : (
                  docsQuery.data?.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <p dir="ltr" className="truncate font-medium text-[var(--color-ink)]">
                          {doc.originalFilename}
                        </p>
                        <p className="font-mono-tabular text-xs text-[var(--color-muted)]">
                          <span dir="ltr" className="inline-block">
                            {formatNumber(Math.max(1, Math.round(doc.sizeBytes / 1024)))} KB
                          </span>
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void downloadPortalAttachment(doc.id)}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        {t.common.download}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
