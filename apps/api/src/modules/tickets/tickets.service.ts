import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AttachmentDto,
  type PaginationMeta,
  PERMISSIONS,
  type TicketCategoryDto,
  type TicketDetailDto,
  type TicketDto,
} from '@portal/types';
import type {
  CreateTicketInput,
  ListTicketsQueryInput,
  ReopenTicketInput,
  UpdateTicketInput,
} from '@portal/validators';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import {
  attachments,
  conversationParticipants,
  conversations,
  customers,
  departments,
  employees,
  messages,
  orders,
  ticketCategories,
  tickets,
  users,
} from '../../infrastructure/database/schema';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class TicketsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    private readonly auditService: AuditService,
    private readonly realtimeService: RealtimeService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listCategories(): Promise<TicketCategoryDto[]> {
    return this.db
      .select({
        id: ticketCategories.id,
        name: ticketCategories.name,
        slug: ticketCategories.slug,
        description: ticketCategories.description,
        defaultDepartmentId: ticketCategories.defaultDepartmentId,
        isActive: ticketCategories.isActive,
        sortOrder: ticketCategories.sortOrder,
      })
      .from(ticketCategories)
      .where(eq(ticketCategories.isActive, true))
      .orderBy(asc(ticketCategories.sortOrder));
  }

  private async assertTicketAccess(ticketId: string, actor: AuthenticatedActor) {
    const [ticket] = await this.db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, ticketId), isNull(tickets.deletedAt)));

    if (!ticket) {
      throw new NotFoundException({ code: 'TICKET_NOT_FOUND', message: 'Ticket not found' });
    }

    if (actor.userType === 'customer') {
      if (ticket.customerId !== actor.customerId) {
        throw new ForbiddenException({
          code: 'TENANT_ISOLATION_VIOLATION',
          message: 'Access to another customer ticket is prohibited',
        });
      }
      return ticket;
    }

    if (
      !actor.permissions.includes(PERMISSIONS.TICKET_READ_ALL) &&
      ticket.assignedEmployeeId !== actor.employeeId &&
      ticket.assignedDepartmentId !== actor.departmentId
    ) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Ticket is outside your department or queue',
      });
    }
    return ticket;
  }

  async list(
    query: ListTicketsQueryInput,
    actor: AuthenticatedActor,
  ): Promise<{ items: TicketDto[]; meta: PaginationMeta }> {
    const conditions = [isNull(tickets.deletedAt)];

    if (actor.userType === 'customer') {
      conditions.push(eq(tickets.customerId, actor.customerId ?? ''));
    } else {
      if (query.customerId) conditions.push(eq(tickets.customerId, query.customerId));
      if (!actor.permissions.includes(PERMISSIONS.TICKET_READ_ALL)) {
        conditions.push(
          or(
            eq(tickets.assignedEmployeeId, actor.employeeId ?? ''),
            eq(tickets.assignedDepartmentId, actor.departmentId ?? ''),
          )!,
        );
      }
    }

    if (query.orderId) conditions.push(eq(tickets.orderId, query.orderId));
    if (query.status) conditions.push(eq(tickets.status, query.status));
    if (query.priority) conditions.push(eq(tickets.priority, query.priority));
    if (query.assignedEmployeeId) {
      conditions.push(eq(tickets.assignedEmployeeId, query.assignedEmployeeId));
    }
    if (query.unassignedOnly) {
      conditions.push(isNull(tickets.assignedEmployeeId));
    }
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        sql`(${tickets.ticketNumber} ILIKE ${pattern} OR ${tickets.subject} ILIKE ${pattern})`,
      );
    }

    const whereClause = and(...conditions);
    const offset = (query.page - 1) * query.limit;

    const [countRow] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(tickets)
      .where(whereClause);
    const total = countRow?.total ?? 0;

    const rows = await this.db
      .select({
        ticket: tickets,
        customerCode: customers.customerCode,
        customerName: customers.companyName,
        categoryName: ticketCategories.name,
        orderNumber: orders.orderNumber,
        orderTitle: orders.title,
        conversationId: conversations.id,
        lastMessageAt: conversations.lastMessageAt,
        createdByName: users.fullName,
      })
      .from(tickets)
      .innerJoin(customers, eq(tickets.customerId, customers.id))
      .innerJoin(ticketCategories, eq(tickets.categoryId, ticketCategories.id))
      .leftJoin(orders, eq(tickets.orderId, orders.id))
      .leftJoin(conversations, eq(conversations.ticketId, tickets.id))
      .leftJoin(users, eq(tickets.createdByUserId, users.id))
      .where(whereClause)
      .orderBy(query.sortOrder === 'asc' ? asc(tickets.createdAt) : desc(tickets.createdAt))
      .limit(query.limit)
      .offset(offset);

    const empIds = [
      ...new Set(
        rows
          .map((r) => r.ticket.assignedEmployeeId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const deptIds = [
      ...new Set(
        rows
          .map((r) => r.ticket.assignedDepartmentId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const empRows =
      empIds.length > 0
        ? await this.db
            .select({ id: employees.id, fullName: users.fullName })
            .from(employees)
            .innerJoin(users, eq(employees.userId, users.id))
            .where(inArray(employees.id, empIds))
        : [];
    const empMap = new Map(empRows.map((e) => [e.id, e.fullName]));

    const deptRows =
      deptIds.length > 0
        ? await this.db
            .select({ id: departments.id, name: departments.name })
            .from(departments)
            .where(inArray(departments.id, deptIds))
        : [];
    const deptMap = new Map(deptRows.map((d) => [d.id, d.name]));

    const items: TicketDto[] = rows.map((r) => ({
      id: r.ticket.id,
      ticketNumber: r.ticket.ticketNumber,
      customerId: r.ticket.customerId,
      customerCode: r.customerCode,
      customerName: r.customerName,
      orderId: r.ticket.orderId,
      orderNumber: r.orderNumber,
      orderTitle: r.orderTitle,
      categoryId: r.ticket.categoryId,
      categoryName: r.categoryName,
      subject: r.ticket.subject,
      description: r.ticket.description,
      status: r.ticket.status,
      priority: r.ticket.priority,
      assignedDepartmentId: actor.userType === 'customer' ? null : r.ticket.assignedDepartmentId,
      assignedDepartmentName:
        actor.userType === 'customer'
          ? null
          : r.ticket.assignedDepartmentId
            ? (deptMap.get(r.ticket.assignedDepartmentId) ?? null)
            : null,
      assignedEmployeeId: actor.userType === 'customer' ? null : r.ticket.assignedEmployeeId,
      assignedEmployeeName:
        actor.userType === 'customer'
          ? null
          : r.ticket.assignedEmployeeId
            ? (empMap.get(r.ticket.assignedEmployeeId) ?? null)
            : null,
      createdByUserId: r.ticket.createdByUserId,
      createdByName: r.createdByName,
      conversationId: r.conversationId ?? '',
      lastMessageAt: r.lastMessageAt ? r.lastMessageAt.toISOString() : null,
      resolvedAt: r.ticket.resolvedAt ? r.ticket.resolvedAt.toISOString() : null,
      closedAt: r.ticket.closedAt ? r.ticket.closedAt.toISOString() : null,
      reopenedCount: r.ticket.reopenedCount,
      createdAt: r.ticket.createdAt.toISOString(),
      updatedAt: r.ticket.updatedAt.toISOString(),
    }));

    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async getById(id: string, actor: AuthenticatedActor): Promise<TicketDetailDto> {
    const ticket = await this.assertTicketAccess(id, actor);
    const isCustomer = actor.userType === 'customer';

    const [row] = await this.db
      .select({
        customerCode: customers.customerCode,
        customerName: customers.companyName,
        categoryName: ticketCategories.name,
        orderNumber: orders.orderNumber,
        orderTitle: orders.title,
        conversationId: conversations.id,
        lastMessageAt: conversations.lastMessageAt,
        createdByName: users.fullName,
      })
      .from(tickets)
      .innerJoin(customers, eq(tickets.customerId, customers.id))
      .innerJoin(ticketCategories, eq(tickets.categoryId, ticketCategories.id))
      .leftJoin(orders, eq(tickets.orderId, orders.id))
      .leftJoin(conversations, eq(conversations.ticketId, tickets.id))
      .leftJoin(users, eq(tickets.createdByUserId, users.id))
      .where(eq(tickets.id, id));

    const [empRow] = ticket.assignedEmployeeId
      ? await this.db
          .select({ fullName: users.fullName })
          .from(employees)
          .innerJoin(users, eq(employees.userId, users.id))
          .where(eq(employees.id, ticket.assignedEmployeeId))
      : [];

    const [deptRow] = ticket.assignedDepartmentId
      ? await this.db
          .select({ name: departments.name })
          .from(departments)
          .where(eq(departments.id, ticket.assignedDepartmentId))
      : [];

    const attRows = await this.db
      .select({
        att: attachments,
        uploadedByName: users.fullName,
      })
      .from(attachments)
      .leftJoin(users, eq(attachments.uploadedByUserId, users.id))
      .where(
        and(
          eq(attachments.ticketId, id),
          eq(attachments.uploadStatus, 'ready'),
          isNull(attachments.deletedAt),
          ...(isCustomer ? [eq(attachments.visibility, 'customer_visible')] : []),
        ),
      );

    const ticketAttachments: AttachmentDto[] = attRows.map(({ att, uploadedByName }) => ({
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

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      customerId: ticket.customerId,
      customerCode: row?.customerCode ?? '',
      customerName: row?.customerName ?? '',
      orderId: ticket.orderId,
      orderNumber: row?.orderNumber ?? null,
      orderTitle: row?.orderTitle ?? null,
      categoryId: ticket.categoryId,
      categoryName: row?.categoryName ?? '',
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      assignedDepartmentId: isCustomer ? null : ticket.assignedDepartmentId,
      assignedDepartmentName: isCustomer ? null : (deptRow?.name ?? null),
      assignedEmployeeId: isCustomer ? null : ticket.assignedEmployeeId,
      assignedEmployeeName: isCustomer ? null : (empRow?.fullName ?? null),
      createdByUserId: ticket.createdByUserId,
      createdByName: row?.createdByName ?? null,
      conversationId: row?.conversationId ?? '',
      lastMessageAt: row?.lastMessageAt ? row.lastMessageAt.toISOString() : null,
      resolvedAt: ticket.resolvedAt ? ticket.resolvedAt.toISOString() : null,
      closedAt: ticket.closedAt ? ticket.closedAt.toISOString() : null,
      reopenedCount: ticket.reopenedCount,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      attachments: ticketAttachments,
    };
  }

  async create(
    dto: CreateTicketInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<TicketDetailDto> {
    const customerId =
      actor.userType === 'customer' ? actor.customerId : (dto.customerId ?? null);

    if (!customerId) {
      throw new BadRequestException({
        code: 'CUSTOMER_REQUIRED',
        message: 'Customer organization is required to create a ticket',
      });
    }

    const [customer] = await this.db
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), isNull(customers.deletedAt)));
    if (!customer || customer.status === 'archived') {
      throw new BadRequestException({
        code: 'CUSTOMER_INVALID',
        message: 'Customer organization is inactive or not found',
      });
    }

    const [category] = await this.db
      .select()
      .from(ticketCategories)
      .where(and(eq(ticketCategories.id, dto.categoryId), eq(ticketCategories.isActive, true)));
    if (!category) {
      throw new BadRequestException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Ticket category not found or inactive',
      });
    }

    if (dto.orderId) {
      const [order] = await this.db
        .select({ id: orders.id, customerId: orders.customerId })
        .from(orders)
        .where(and(eq(orders.id, dto.orderId), isNull(orders.deletedAt)));
      if (!order || order.customerId !== customerId) {
        throw new BadRequestException({
          code: 'ORDER_NOT_FOUND',
          message: 'Linked order does not exist for this customer organization',
        });
      }
    }

    const year = new Date().getUTCFullYear();
    const createdId = await this.db.transaction(async (tx) => {
      const seqResult = await tx.execute<{ nextval: string }>(
        sql`SELECT nextval('ticket_number_seq')::text AS nextval`,
      );
      const seqNum = Number(seqResult.rows[0]?.nextval ?? 1);
      const ticketNumber = `TCK-${year}-${String(seqNum).padStart(4, '0')}`;

      const [ticket] = await tx
        .insert(tickets)
        .values({
          ticketNumber,
          customerId,
          orderId: dto.orderId ?? null,
          categoryId: category.id,
          subject: dto.subject,
          description: dto.description,
          status: 'open',
          priority: dto.priority,
          assignedDepartmentId: category.defaultDepartmentId,
          assignedEmployeeId: customer.accountManagerId,
          createdByUserId: actor.id,
        })
        .returning();

      if (!ticket) throw new Error('Failed to create ticket');

      const [conv] = await tx
        .insert(conversations)
        .values({
          customerId,
          contextType: 'ticket',
          ticketId: ticket.id,
          subject: ticket.subject,
          assignedEmployeeId: ticket.assignedEmployeeId,
          lastMessageAt: new Date(),
        })
        .returning();

      if (!conv) throw new Error('Failed to create ticket conversation');

      await tx.insert(messages).values({
        conversationId: conv.id,
        senderUserId: actor.id,
        visibility: 'public',
        messageType: 'text',
        body: dto.description,
      });

      await tx.insert(conversationParticipants).values({
        conversationId: conv.id,
        userId: actor.id,
        participantRole: actor.userType === 'customer' ? 'owner' : 'assignee',
        lastReadAt: new Date(),
      });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: actor.userType,
          customerId,
          action: 'ticket.created',
          entityType: 'ticket',
          entityId: ticket.id,
          summary: `Created ticket ${ticketNumber} (${dto.subject})`,
          afterJson: { ticketNumber, subject: dto.subject, orderId: dto.orderId },
          meta,
        },
        tx,
      );

      return ticket.id;
    });

    const detail = await this.getById(createdId, actor);

    this.realtimeService.emitTicketUpdated(customerId, {
      ticketId: detail.id,
      ticketNumber: detail.ticketNumber,
      status: detail.status,
      priority: detail.priority,
      assignedEmployeeId: detail.assignedEmployeeId,
      assignedDepartmentId: detail.assignedDepartmentId,
      updatedAt: detail.updatedAt,
    });

    if (actor.userType === 'customer') {
      const staffIds = await this.notificationsService.getStaffUserIds({
        employeeId: customer.accountManagerId,
        departmentId: category.defaultDepartmentId,
      });
      await this.notificationsService.dispatch({
        recipientUserIds: staffIds,
        type: 'ticket.created',
        title: `${detail.ticketNumber} · ${detail.subject}`,
        body: detail.description.slice(0, 140),
        entityType: 'ticket',
        entityId: detail.id,
        actionUrl: `/tickets/${detail.id}`,
        surface: 'admin',
      });
    } else {
      const customerIds = await this.notificationsService.getCustomerUserIds(customerId);
      await this.notificationsService.dispatch({
        recipientUserIds: customerIds,
        type: 'ticket.created',
        title: `${detail.ticketNumber} · ${detail.subject}`,
        body: detail.description.slice(0, 140),
        entityType: 'ticket',
        entityId: detail.id,
        actionUrl: `/tickets/${detail.id}`,
        surface: 'portal',
      });
    }

    return detail;
  }

  async update(
    id: string,
    dto: UpdateTicketInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<TicketDetailDto> {
    const before = await this.assertTicketAccess(id, actor);
    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .update(tickets)
        .set({
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.assignedDepartmentId !== undefined
            ? { assignedDepartmentId: dto.assignedDepartmentId }
            : {}),
          ...(dto.assignedEmployeeId !== undefined
            ? { assignedEmployeeId: dto.assignedEmployeeId }
            : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.status === 'resolved' ? { resolvedAt: now } : {}),
          ...(dto.status === 'closed' ? { closedAt: now } : {}),
          updatedAt: now,
        })
        .where(eq(tickets.id, id));

      if (dto.assignedEmployeeId !== undefined) {
        await tx
          .update(conversations)
          .set({ assignedEmployeeId: dto.assignedEmployeeId, updatedAt: now })
          .where(eq(conversations.ticketId, id));
      }

      if (dto.status && dto.status !== before.status) {
        const [conv] = await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(eq(conversations.ticketId, id));
        if (conv) {
          await tx.insert(messages).values({
            conversationId: conv.id,
            senderUserId: actor.id,
            visibility: 'public',
            messageType: 'system_event',
            body: `Status changed from ${before.status} to ${dto.status}`,
          });
        }
      }

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: 'employee',
          customerId: before.customerId,
          action: 'ticket.updated',
          entityType: 'ticket',
          entityId: id,
          summary: `Updated ticket ${before.ticketNumber}`,
          beforeJson: {
            status: before.status,
            priority: before.priority,
            assignedEmployeeId: before.assignedEmployeeId,
          },
          afterJson: dto,
          meta,
        },
        tx,
      );
    });

    const detail = await this.getById(id, actor);
    this.realtimeService.emitTicketUpdated(before.customerId, {
      ticketId: detail.id,
      ticketNumber: detail.ticketNumber,
      status: detail.status,
      priority: detail.priority,
      assignedEmployeeId: detail.assignedEmployeeId,
      assignedDepartmentId: detail.assignedDepartmentId,
      updatedAt: detail.updatedAt,
    });

    if (dto.status && dto.status !== before.status) {
      const custUserIds = await this.notificationsService.getCustomerUserIds(before.customerId);
      await this.notificationsService.dispatch({
        recipientUserIds: custUserIds,
        type: 'ticket.status_changed',
        title: `${detail.ticketNumber} · ${detail.status}`,
        body: detail.subject,
        entityType: 'ticket',
        entityId: detail.id,
        actionUrl: `/tickets/${detail.id}`,
        surface: 'portal',
      });
    }

    return detail;
  }

  async reopen(
    id: string,
    dto: ReopenTicketInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<TicketDetailDto> {
    const before = await this.assertTicketAccess(id, actor);
    if (before.status !== 'resolved' && before.status !== 'closed') {
      throw new BadRequestException({
        code: 'TICKET_NOT_CLOSED',
        message: 'Only resolved or closed tickets can be reopened',
      });
    }

    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(tickets)
        .set({
          status: 'open',
          resolvedAt: null,
          closedAt: null,
          reopenedCount: sql`${tickets.reopenedCount} + 1`,
          updatedAt: now,
        })
        .where(eq(tickets.id, id));

      const [conv] = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.ticketId, id));
      if (conv) {
        await tx.insert(messages).values({
          conversationId: conv.id,
          senderUserId: actor.id,
          visibility: 'public',
          messageType: 'system_event',
          body: dto.reason
            ? `Ticket reopened: ${dto.reason}`
            : `Ticket reopened by ${actor.fullName}`,
        });
      }

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: actor.userType,
          customerId: before.customerId,
          action: 'ticket.reopened',
          entityType: 'ticket',
          entityId: id,
          summary: `Reopened ticket ${before.ticketNumber}`,
          beforeJson: { status: before.status },
          afterJson: { status: 'open', reason: dto.reason },
          meta,
        },
        tx,
      );
    });

    const detail = await this.getById(id, actor);
    this.realtimeService.emitTicketUpdated(before.customerId, {
      ticketId: detail.id,
      ticketNumber: detail.ticketNumber,
      status: detail.status,
      priority: detail.priority,
      assignedEmployeeId: detail.assignedEmployeeId,
      assignedDepartmentId: detail.assignedDepartmentId,
      updatedAt: detail.updatedAt,
    });

    return detail;
  }
}
