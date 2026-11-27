'use client';

import { useI18n } from '@portal/i18n/react';
import {
  ORDER_OPERATIONAL_STATES,
  PERMISSIONS,
  REALTIME_EVENTS,
  type AttachmentDto,
  type ConversationDto,
  type DepartmentDto,
  type EmployeeDto,
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
  Input,
  Label,
  ModalDialog,
  OrderStageStepper,
  PageHeader,
  Select,
  SkeletonStatStrip,
  SkeletonTable,
  StatusBadge,
  Textarea,
} from '@portal/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Download, Lock } from 'lucide-react';
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

export default function AdminOrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;
  const { user, hasPermission } = useAdminSession(false);
  const { t, formatDate, formatDateTime, formatNumber, translateError, translateStatus } = useI18n();
  const queryClient = useQueryClient();

  const [advanceOpen, setAdvanceOpen] = React.useState(false);
  const [stateOpen, setStateOpen] = React.useState(false);
  const [toStatusId, setToStatusId] = React.useState('');
  const [respDeptId, setRespDeptId] = React.useState('');
  const [respEmpId, setRespEmpId] = React.useState('');
  const [progressNote, setProgressNote] = React.useState('');
  const [isCustomerVisible, setIsCustomerVisible] = React.useState(true);
  const [nextOpState, setNextOpState] = React.useState('active');
  const [stateReason, setStateReason] = React.useState('');
  const [uploadVisibility, setUploadVisibility] = React.useState<'customer_visible' | 'internal_only'>('customer_visible');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const orderQuery = useQuery({
    queryKey: ['admin', 'order', orderId],
    queryFn: async () => (await adminApi.get<OrderDetailDto>(`/orders/${orderId}`)).data,
  });

  const conversationQuery = useQuery({
    queryKey: ['admin', 'order', orderId, 'conversation'],
    queryFn: async () =>
      (await adminApi.get<ConversationDto>(`/conversations/by-order/${orderId}`)).data,
    enabled: Boolean(orderQuery.data),
  });

  const conversationId = conversationQuery.data?.id;

  const messagesQuery = useQuery({
    queryKey: ['admin', 'conversation', conversationId, 'messages'],
    queryFn: async () =>
      (await adminApi.get<MessageDto[]>(`/conversations/${conversationId}/messages?limit=100`))
        .data,
    enabled: Boolean(conversationId),
  });

  const docsQuery = useQuery({
    queryKey: ['admin', 'documents', { orderId }],
    queryFn: async () =>
      (await adminApi.get<AttachmentDto[]>(`/documents?orderId=${orderId}&limit=50`)).data,
  });

  const deptsQuery = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => adminApi.get<DepartmentDto[]>('/departments'),
    enabled: advanceOpen,
  });

  const empsQuery = useQuery({
    queryKey: ['admin', 'employees', 'lookup'],
    queryFn: () => adminApi.get<EmployeeDto[]>('/employees?limit=100&isActive=true'),
    enabled: advanceOpen,
  });

  React.useEffect(() => {
    if (!user) return;
    const socket = createAdminSocket();

    socket.on('connect', () => {
      socket.emit(REALTIME_EVENTS.ORDER_JOIN, { orderId });
      if (conversationId) {
        socket.emit(REALTIME_EVENTS.CONVERSATION_JOIN, { conversationId });
      }
    });

    socket.on(REALTIME_EVENTS.ORDER_PROGRESS_UPDATED, () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'order', orderId] });
    });

    socket.on(REALTIME_EVENTS.MESSAGE_CREATED, () => {
      if (conversationId) {
        void queryClient.invalidateQueries({
          queryKey: ['admin', 'conversation', conversationId, 'messages'],
        });
      }
    });

    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [user, orderId, conversationId, queryClient]);

  const order = orderQuery.data;

  const extractErr = (err: unknown, fallback: string) => {
    const code =
      typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
    return translateError(code, err instanceof Error ? err.message : fallback);
  };

  const advanceMutation = useMutation({
    mutationFn: () =>
      adminApi.post(`/orders/${orderId}/progress`, {
        toStatusId,
        responsibleDepartmentId: respDeptId || null,
        responsibleEmployeeId: respEmpId || null,
        note: progressNote.trim() || undefined,
        isCustomerVisible,
      }),
    onSuccess: async () => {
      setErrorMsg(null);
      setAdvanceOpen(false);
      setProgressNote('');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'order', orderId] });
    },
    onError: (err) => setErrorMsg(extractErr(err, 'Unable to advance stage')),
  });

  const stateMutation = useMutation({
    mutationFn: () =>
      adminApi.patch(`/orders/${orderId}/state`, {
        operationalState: nextOpState,
        reason: stateReason,
      }),
    onSuccess: async () => {
      setErrorMsg(null);
      setStateOpen(false);
      setStateReason('');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'order', orderId] });
    },
    onError: (err) => setErrorMsg(extractErr(err, 'Unable to update state')),
  });

  if (orderQuery.isError) {
    return (
      <AlertBanner tone="crimson">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{extractErr(orderQuery.error, t.common.noData)}</span>
          <Button variant="outline" size="sm" onClick={() => void orderQuery.refetch()}>
            {t.common.retry}
          </Button>
        </div>
      </AlertBanner>
    );
  }

  if (orderQuery.isLoading || !order) {
    return (
      <div className="space-y-6">
        <SkeletonStatStrip items={4} />
        <SkeletonTable rows={5} columns={4} />
      </div>
    );
  }

  const canAdvance =
    hasPermission(PERMISSIONS.ORDER_ADVANCE_ALL) ||
    hasPermission(PERMISSIONS.ORDER_ADVANCE_ASSIGNED);
  const canUpdateState = hasPermission(PERMISSIONS.ORDER_UPDATE);
  const canSendPublic = hasPermission(PERMISSIONS.MESSAGE_SEND_PUBLIC);
  const canSendInternal = hasPermission(PERMISSIONS.MESSAGE_SEND_INTERNAL);
  const canUpload = hasPermission(PERMISSIONS.DOCUMENT_UPLOAD);

  const allowedStages = order.stages.filter((s) =>
    order.allowedNextStatusIds.length > 0
      ? order.allowedNextStatusIds.includes(s.id)
      : s.id !== order.currentStatusId,
  );

  const openAdvanceModal = () => {
    const firstNext = allowedStages[0];
    setToStatusId(firstNext?.id ?? '');
    setIsCustomerVisible(firstNext ? firstNext.isCustomerVisible : true);
    setRespDeptId(order.assignedDepartmentId ?? '');
    setRespEmpId(order.assignedEmployeeId ?? '');
    setAdvanceOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${order.orderNumber}, ${order.customerName}`}
        title={order.title}
        description={order.description ?? t.orders.adminDescription}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={order.currentStageName} tone={order.currentStageColor} />
            <StatusBadge
              label={translateStatus(order.operationalState)}
              tone={order.operationalState === 'completed' ? 'emerald' : 'cobalt'}
            />
            {canUpdateState ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNextOpState(order.operationalState);
                  setStateOpen(true);
                }}
              >
                {t.orders.updateState}
              </Button>
            ) : null}
            {canAdvance && allowedStages.length > 0 ? (
              <Button size="sm" onClick={openAdvanceModal}>
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
                {t.orders.advanceStage}
              </Button>
            ) : null}
          </div>
        }
      />

      {errorMsg ? <AlertBanner tone="crimson">{errorMsg}</AlertBanner> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.orders.stageStepperTitle}</CardTitle>
          <CardDescription>
            <Link
              href={`/customers/${order.customerId}`}
              className="font-medium text-[var(--color-accent-2)] hover:underline"
            >
              {`${order.customerCode} (${order.customerName})`}
            </Link>
            {order.expectedCompletionDate
              ? ` | ${t.orders.expectedCompletion}: ${formatDate(order.expectedCompletionDate)}`
              : ''}
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
                <p className="p-5 text-xs text-[var(--color-muted)]">{t.common.noData}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-start text-xs">
                    <thead>
                      <tr className="border-b border-[var(--color-rule)] bg-[var(--color-paper-2)]/75 text-[var(--color-muted)]">
                        <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                          {t.orders.partNumber}
                        </th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                          {t.orders.itemName}
                        </th>
                        <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                          {t.orders.material}
                        </th>
                        <th className="whitespace-nowrap px-4 py-2.5 text-end font-medium">
                          {t.orders.quantity}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-rule)]">
                      {order.items.map((item) => (
                        <tr key={item.id}>
                          <td className="font-mono-tabular px-4 py-3 text-start">
                            {item.partNumber ? (
                              <span dir="ltr" className="inline-block">
                                {item.partNumber}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium text-[var(--color-ink)]">
                            {item.name}
                            {item.specification ? (
                              <span className="block text-xs font-normal text-[var(--color-muted)]">
                                {item.specification}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-[var(--color-muted)]">
                            {item.material ?? '-'}
                          </td>
                          <td className="font-mono-tabular px-4 py-3 text-end font-medium">
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
                    ? async (file, visibility) => {
                        const att = await uploadAdminAttachment(file, {
                          orderId: order.id,
                          visibility,
                        });
                        await queryClient.invalidateQueries({
                          queryKey: ['admin', 'documents', { orderId }],
                        });
                        return att;
                      }
                    : undefined
                }
                onDownloadAttachment={(attId) => void downloadAdminAttachment(attId)}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-4">
          {order.internalNotes ? (
            <AlertBanner tone="amber" title={t.orders.internalNotesHidden}>
              {order.internalNotes}
            </AlertBanner>
          ) : null}

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
                    className="space-y-1.5 rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <StatusBadge label={evt.statusNameSnapshot} tone={evt.statusColorToken} />
                      <time className="font-mono-tabular text-xs text-[var(--color-muted)]">
                        {formatDateTime(evt.createdAt)}
                      </time>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
                      {!evt.isCustomerVisible ? (
                        <span className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--color-signal-amber-bg)] px-1.5 py-0.5 font-medium text-[var(--color-signal-amber)]">
                          <Lock className="h-3 w-3" aria-hidden="true" />
                          {t.orders.visibilityInternal}
                        </span>
                      ) : (
                        <span>{t.orders.visibilityCustomer}</span>
                      )}
                      {evt.changedByName ? <span>{evt.changedByName}</span> : null}
                    </div>
                    {evt.note ? (
                      <p className="pt-1 leading-relaxed text-[var(--color-ink)]">{evt.note}</p>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{t.documents.title}</CardTitle>
                <Select
                  aria-label={t.documents.visibility}
                  value={uploadVisibility}
                  onChange={(e) =>
                    setUploadVisibility(e.target.value as 'customer_visible' | 'internal_only')
                  }
                  className="h-8 w-40 text-xs"
                >
                  <option value="customer_visible">{t.documents.customerVisible}</option>
                  <option value="internal_only">{t.documents.internalOnly}</option>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {canUpload ? (
                <FileDropzone
                  onUploadFile={async (file) => {
                    await uploadAdminAttachment(file, {
                      orderId: order.id,
                      visibility: uploadVisibility,
                    });
                    await queryClient.invalidateQueries({
                      queryKey: ['admin', 'documents', { orderId }],
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
                      <div className="min-w-0 space-y-1">
                        <p dir="ltr" className="truncate font-medium text-[var(--color-ink)]">
                          {doc.originalFilename}
                        </p>
                        <StatusBadge
                          label={translateStatus(doc.visibility)}
                          tone={doc.visibility === 'internal_only' ? 'amber' : 'emerald'}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void downloadAdminAttachment(doc.id)}
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

      <ModalDialog
        open={advanceOpen}
        onClose={() => setAdvanceOpen(false)}
        title={t.orders.advanceStageTitle}
        description={order.orderNumber}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="adv-stage">{t.orders.targetStageLabel}</Label>
            <Select
              id="adv-stage"
              value={toStatusId}
              onChange={(e) => {
                const id = e.target.value;
                setToStatusId(id);
                const found = allowedStages.find((s) => s.id === id);
                if (found) setIsCustomerVisible(found.isCustomerVisible);
              }}
            >
              {allowedStages.map((s) => (
                <option key={s.id} value={s.id}>
                  {`#${s.sortOrder} ${s.name}`}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="adv-dept">{t.common.department}</Label>
              <Select
                id="adv-dept"
                value={respDeptId}
                onChange={(e) => setRespDeptId(e.target.value)}
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
              <Label htmlFor="adv-emp">{t.tickets.assignee}</Label>
              <Select
                id="adv-emp"
                value={respEmpId}
                onChange={(e) => setRespEmpId(e.target.value)}
              >
                <option value="">{t.common.unassigned}</option>
                {empsQuery.data?.data.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-[var(--color-ink)]">
            <input
              type="checkbox"
              checked={isCustomerVisible}
              onChange={(e) => setIsCustomerVisible(e.target.checked)}
              className="accent-[var(--color-board)]"
            />
            <span>{t.orders.customerVisibleToggle}</span>
          </label>

          {!isCustomerVisible ? (
            <AlertBanner tone="amber">{t.orders.internalOnlyWarning}</AlertBanner>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="adv-note">{t.common.notes}</Label>
            <Textarea
              id="adv-note"
              rows={3}
              value={progressNote}
              onChange={(e) => setProgressNote(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAdvanceOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              type="button"
              disabled={advanceMutation.isPending || !toStatusId}
              onClick={() => advanceMutation.mutate()}
            >
              {t.orders.advanceStage}
            </Button>
          </div>
        </div>
      </ModalDialog>

      <ModalDialog
        open={stateOpen}
        onClose={() => setStateOpen(false)}
        title={t.orders.updateState}
        description={order.orderNumber}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="op-state">{t.orders.operationalState}</Label>
            <Select
              id="op-state"
              value={nextOpState}
              onChange={(e) => setNextOpState(e.target.value)}
            >
              {ORDER_OPERATIONAL_STATES.map((s) => (
                <option key={s} value={s}>
                  {translateStatus(s)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="op-reason">{t.orders.stateReasonLabel}</Label>
            <Input
              id="op-reason"
              value={stateReason}
              onChange={(e) => setStateReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setStateOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              type="button"
              disabled={stateMutation.isPending || stateReason.trim().length < 3}
              onClick={() => stateMutation.mutate()}
            >
              {t.common.save}
            </Button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
