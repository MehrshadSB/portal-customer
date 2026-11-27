import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AttachmentDto,
  type ConversationDto,
  type MessageDto,
  type PaginationMeta,
  PERMISSIONS,
} from '@portal/types';
import type {
  CreateMessageInput,
  ListMessagesQueryInput,
  MarkConversationReadInput,
} from '@portal/validators';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import {
  attachments,
  conversationParticipants,
  conversations,
  messages,
  orders,
  tickets,
  users,
} from '../../infrastructure/database/schema';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class ConversationsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    private readonly auditService: AuditService,
    private readonly realtimeService: RealtimeService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async assertConversationAccess(conversationId: string, actor: AuthenticatedActor) {
    const [conv] = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    if (!conv) {
      throw new NotFoundException({
        code: 'CONVERSATION_NOT_FOUND',
        message: 'Conversation not found',
      });
    }

    if (actor.userType === 'customer') {
      if (conv.customerId !== actor.customerId) {
        throw new ForbiddenException({
          code: 'TENANT_ISOLATION_VIOLATION',
          message: 'Access to another customer conversation is prohibited',
        });
      }
      return conv;
    }

    return conv;
  }

  async getOrCreateForOrder(orderId: string, actor: AuthenticatedActor): Promise<ConversationDto> {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)));

    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }

    if (actor.userType === 'customer') {
      if (order.customerId !== actor.customerId) {
        throw new ForbiddenException({
          code: 'TENANT_ISOLATION_VIOLATION',
          message: 'Access to another customer order is prohibited',
        });
      }
      if (order.operationalState === 'draft') {
        throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
      }
    } else if (
      !actor.permissions.includes(PERMISSIONS.ORDER_READ_ALL) &&
      order.assignedEmployeeId !== actor.employeeId &&
      order.assignedDepartmentId !== actor.departmentId
    ) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Order is outside your assigned queue',
      });
    }

    const [existing] = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.orderId, orderId));

    if (existing) {
      return {
        ...existing,
        lastMessageAt: existing.lastMessageAt ? existing.lastMessageAt.toISOString() : null,
        createdAt: existing.createdAt.toISOString(),
      };
    }

    await this.db
      .insert(conversations)
      .values({
        customerId: order.customerId,
        contextType: 'order',
        orderId: order.id,
        subject: `${order.orderNumber} · ${order.title}`,
        assignedEmployeeId: order.assignedEmployeeId,
      })
      .onConflictDoNothing();

    const [created] = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.orderId, orderId));

    if (!created) throw new Error('Failed to resolve order conversation');
    return {
      ...created,
      lastMessageAt: created.lastMessageAt ? created.lastMessageAt.toISOString() : null,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async listMessages(
    conversationId: string,
    query: ListMessagesQueryInput,
    actor: AuthenticatedActor,
  ): Promise<{ items: MessageDto[]; meta: PaginationMeta }> {
    await this.assertConversationAccess(conversationId, actor);

    const canReadInternal =
      actor.userType === 'employee' && actor.permissions.includes(PERMISSIONS.MESSAGE_READ_INTERNAL);

    const baseConditions = [
      eq(messages.conversationId, conversationId),
      isNull(messages.deletedAt),
      ...(!canReadInternal ? [eq(messages.visibility, 'public' as const)] : []),
    ];

    const [countRow] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(...baseConditions));
    const total = countRow?.total ?? 0;

    const cursorConditions = [...baseConditions];
    if (query.before) {
      cursorConditions.push(lt(messages.createdAt, new Date(query.before)));
    }

    const rows = await this.db
      .select({
        msg: messages,
        senderName: users.fullName,
        senderType: users.userType,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderUserId, users.id))
      .where(and(...cursorConditions))
      .orderBy(desc(messages.createdAt))
      .limit(query.limit);

    const chronological = [...rows].reverse();
    const messageIds = chronological.map((r) => r.msg.id);

    const attRows =
      messageIds.length > 0
        ? await this.db
            .select({
              att: attachments,
              uploadedByName: users.fullName,
            })
            .from(attachments)
            .leftJoin(users, eq(attachments.uploadedByUserId, users.id))
            .where(
              and(
                inArray(attachments.messageId, messageIds),
                eq(attachments.uploadStatus, 'ready'),
                isNull(attachments.deletedAt),
                ...(actor.userType === 'customer' || !canReadInternal
                  ? [eq(attachments.visibility, 'customer_visible' as const)]
                  : []),
              ),
            )
        : [];

    const attByMsg = new Map<string, AttachmentDto[]>();
    for (const { att, uploadedByName } of attRows) {
      if (!att.messageId) continue;
      const list = attByMsg.get(att.messageId) ?? [];
      list.push({
        id: att.id,
        customerId: att.customerId,
        uploadedByUserId: att.uploadedByUserId,
        uploadedByName,
        originalFilename: att.originalFilename,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
        uploadStatus: att.uploadStatus,
        visibility: att.visibility,
        orderId: att.orderId,
        orderProgressEventId: att.orderProgressEventId,
        ticketId: att.ticketId,
        messageId: att.messageId,
        createdAt: att.createdAt.toISOString(),
      });
      attByMsg.set(att.messageId, list);
    }

    const items: MessageDto[] = chronological.map(({ msg, senderName, senderType }) => ({
      id: msg.id,
      conversationId: msg.conversationId,
      senderUserId: msg.senderUserId,
      senderName,
      senderType,
      visibility: msg.visibility,
      messageType: msg.messageType,
      body: msg.body,
      attachments: attByMsg.get(msg.id) ?? [],
      editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
      createdAt: msg.createdAt.toISOString(),
    }));

    return {
      items,
      meta: {
        page: 1,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async sendMessage(
    conversationId: string,
    dto: CreateMessageInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<MessageDto> {
    const conv = await this.assertConversationAccess(conversationId, actor);

    if (dto.visibility === 'internal') {
      if (actor.userType === 'customer' || !actor.permissions.includes(PERMISSIONS.MESSAGE_SEND_INTERNAL)) {
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: 'You are not permitted to post internal notes',
        });
      }
    } else if (!actor.permissions.includes(PERMISSIONS.MESSAGE_SEND_PUBLIC)) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'You are not permitted to send public messages',
      });
    }

    const attachmentIds = [...new Set(dto.attachmentIds ?? [])];
    let linkedAttachments: AttachmentDto[] = [];

    if (attachmentIds.length > 0) {
      const attRows = await this.db
        .select({
          att: attachments,
          uploadedByName: users.fullName,
        })
        .from(attachments)
        .leftJoin(users, eq(attachments.uploadedByUserId, users.id))
        .where(
          and(
            inArray(attachments.id, attachmentIds),
            eq(attachments.uploadStatus, 'ready'),
            isNull(attachments.deletedAt),
          ),
        );

      if (attRows.length !== attachmentIds.length) {
        throw new BadRequestException({
          code: 'INVALID_ATTACHMENTS',
          message: 'One or more attachments are missing or incomplete',
        });
      }

      for (const { att } of attRows) {
        if (att.customerId !== conv.customerId) {
          throw new ForbiddenException({
            code: 'TENANT_ISOLATION_VIOLATION',
            message: 'Attachment belongs to a different customer organization',
          });
        }
        if (dto.visibility === 'public' && att.visibility === 'internal_only') {
          throw new BadRequestException({
            code: 'INTERNAL_ATTACHMENT_IN_PUBLIC_MESSAGE',
            message: 'Internal-only attachments cannot be shared in public replies',
          });
        }
      }

      linkedAttachments = attRows.map(({ att, uploadedByName }) => ({
        id: att.id,
        customerId: att.customerId,
        uploadedByUserId: att.uploadedByUserId,
        uploadedByName,
        originalFilename: att.originalFilename,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
        uploadStatus: att.uploadStatus,
        visibility: att.visibility,
        orderId: att.orderId,
        orderProgressEventId: att.orderProgressEventId,
        ticketId: att.ticketId,
        messageId: att.messageId,
        createdAt: att.createdAt.toISOString(),
      }));
    }

    const inserted = await this.db.transaction(async (tx) => {
      const [msg] = await tx
        .insert(messages)
        .values({
          conversationId,
          senderUserId: actor.id,
          visibility: dto.visibility,
          messageType: 'text',
          body: dto.body,
        })
        .returning();

      if (!msg) throw new Error('Failed to create message');

      if (attachmentIds.length > 0) {
        await tx
          .update(attachments)
          .set({
            messageId: msg.id,
            ...(conv.ticketId ? { ticketId: conv.ticketId } : {}),
            ...(conv.orderId ? { orderId: conv.orderId } : {}),
          })
          .where(inArray(attachments.id, attachmentIds));
      }

      await tx
        .update(conversations)
        .set({ lastMessageAt: msg.createdAt, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));

      await tx
        .insert(conversationParticipants)
        .values({
          conversationId,
          userId: actor.id,
          participantRole: actor.userType === 'customer' ? 'owner' : 'assignee',
          lastReadMessageId: msg.id,
          lastReadAt: msg.createdAt,
        })
        .onConflictDoUpdate({
          target: [conversationParticipants.conversationId, conversationParticipants.userId],
          set: { lastReadMessageId: msg.id, lastReadAt: msg.createdAt },
        });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: actor.userType,
          customerId: conv.customerId,
          action: dto.visibility === 'internal' ? 'message.internal_note' : 'message.sent',
          entityType: 'message',
          entityId: msg.id,
          summary: `Posted ${dto.visibility} message in conversation ${conversationId}`,
          afterJson: { conversationId, visibility: dto.visibility },
          meta,
        },
        tx,
      );

      return msg;
    });

    const payload: MessageDto = {
      id: inserted.id,
      conversationId,
      senderUserId: actor.id,
      senderName: actor.fullName,
      senderType: actor.userType,
      visibility: inserted.visibility,
      messageType: inserted.messageType,
      body: inserted.body,
      attachments: linkedAttachments.map((a) => ({ ...a, messageId: inserted.id })),
      editedAt: null,
      createdAt: inserted.createdAt.toISOString(),
    };

    this.realtimeService.emitMessageCreated(conversationId, {
      id: payload.id,
      conversationId: payload.conversationId,
      senderUserId: payload.senderUserId,
      senderName: payload.senderName,
      senderType: payload.senderType,
      visibility: payload.visibility,
      messageType: payload.messageType,
      body: payload.body,
      attachments: payload.attachments,
      createdAt: payload.createdAt,
    });

    if (dto.visibility === 'public') {
      const actionUrl = conv.ticketId
        ? `/tickets/${conv.ticketId}`
        : conv.orderId
          ? `/orders/${conv.orderId}`
          : '/';

      if (actor.userType === 'employee') {
        const customerUserIds = await this.notificationsService.getCustomerUserIds(conv.customerId);
        await this.notificationsService.dispatch({
          recipientUserIds: customerUserIds,
          type: 'message.reply',
          title: conv.subject ?? 'New reply from support',
          body: dto.body.slice(0, 140),
          entityType: conv.contextType,
          entityId: conv.ticketId ?? conv.orderId ?? conv.id,
          actionUrl,
          surface: 'portal',
        });
      } else {
        let targetEmployeeId = conv.assignedEmployeeId;
        let targetDeptId: string | null = null;
        if (conv.ticketId) {
          const [tk] = await this.db
            .select({ empId: tickets.assignedEmployeeId, deptId: tickets.assignedDepartmentId })
            .from(tickets)
            .where(eq(tickets.id, conv.ticketId));
          targetEmployeeId = tk?.empId ?? targetEmployeeId;
          targetDeptId = tk?.deptId ?? null;
        } else if (conv.orderId) {
          const [ord] = await this.db
            .select({ empId: orders.assignedEmployeeId, deptId: orders.assignedDepartmentId })
            .from(orders)
            .where(eq(orders.id, conv.orderId));
          targetEmployeeId = ord?.empId ?? targetEmployeeId;
          targetDeptId = ord?.deptId ?? null;
        }
        const staffIds = await this.notificationsService.getStaffUserIds({
          employeeId: targetEmployeeId,
          departmentId: targetDeptId,
        });
        await this.notificationsService.dispatch({
          recipientUserIds: staffIds,
          type: 'message.customer_reply',
          title: `Customer reply · ${conv.subject ?? 'Thread'}`,
          body: dto.body.slice(0, 140),
          entityType: conv.contextType,
          entityId: conv.ticketId ?? conv.orderId ?? conv.id,
          actionUrl,
          surface: 'admin',
        });
      }
    }

    return payload;
  }

  async markRead(
    conversationId: string,
    dto: MarkConversationReadInput,
    actor: AuthenticatedActor,
  ): Promise<void> {
    await this.assertConversationAccess(conversationId, actor);

    const now = new Date();
    await this.db
      .insert(conversationParticipants)
      .values({
        conversationId,
        userId: actor.id,
        participantRole: actor.userType === 'customer' ? 'owner' : 'follower',
        lastReadMessageId: dto.lastReadMessageId ?? null,
        lastReadAt: now,
      })
      .onConflictDoUpdate({
        target: [conversationParticipants.conversationId, conversationParticipants.userId],
        set: {
          ...(dto.lastReadMessageId ? { lastReadMessageId: dto.lastReadMessageId } : {}),
          lastReadAt: now,
        },
      });
  }
}
