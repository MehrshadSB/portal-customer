import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AttachmentDto,
  type OrderDetailDto,
  type OrderDto,
  type OrderProgressEventDto,
  type PaginationMeta,
  PERMISSIONS,
} from '@portal/types';
import type {
  AdvanceOrderProgressInput,
  CreateOrderInput,
  ListOrdersQueryInput,
  UpdateOrderInput,
  UpdateOrderStateInput,
} from '@portal/validators';
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import {
  attachments,
  conversations,
  customers,
  departments,
  employees,
  orderItems,
  orderProgressEvents,
  orders,
  orderWorkflows,
  orderWorkflowStatuses,
  orderWorkflowTransitions,
  tickets,
  users,
} from '../../infrastructure/database/schema';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    private readonly auditService: AuditService,
    private readonly realtimeService: RealtimeService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async loadEmployeeNameMap(empIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(empIds.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .select({ empId: employees.id, fullName: users.fullName })
      .from(employees)
      .innerJoin(users, eq(employees.userId, users.id))
      .where(inArray(employees.id, unique));
    return new Map(rows.map((r) => [r.empId, r.fullName]));
  }

  private async loadDepartmentNameMap(deptIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(deptIds.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(inArray(departments.id, unique));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async assertOrderAccess(orderId: string, actor: AuthenticatedActor) {
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
      return order;
    }

    const canReadAll = actor.permissions.includes(PERMISSIONS.ORDER_READ_ALL);
    if (
      !canReadAll &&
      order.assignedEmployeeId !== actor.employeeId &&
      order.assignedDepartmentId !== actor.departmentId
    ) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Order is outside your assigned department or queue',
      });
    }
    return order;
  }

  async list(
    query: ListOrdersQueryInput,
    actor: AuthenticatedActor,
  ): Promise<{ items: OrderDto[]; meta: PaginationMeta }> {
    const conditions = [isNull(orders.deletedAt)];

    if (actor.userType === 'customer') {
      conditions.push(eq(orders.customerId, actor.customerId ?? ''));
      conditions.push(ne(orders.operationalState, 'draft'));
    } else {
      if (query.customerId) conditions.push(eq(orders.customerId, query.customerId));
      if (!actor.permissions.includes(PERMISSIONS.ORDER_READ_ALL)) {
        conditions.push(
          or(
            eq(orders.assignedEmployeeId, actor.employeeId ?? ''),
            eq(orders.assignedDepartmentId, actor.departmentId ?? ''),
          )!,
        );
      }
    }

    if (query.workflowStatusId) conditions.push(eq(orders.currentStatusId, query.workflowStatusId));
    if (query.operationalState) conditions.push(eq(orders.operationalState, query.operationalState));
    if (query.priority) conditions.push(eq(orders.priority, query.priority));
    if (query.assignedDepartmentId) {
      conditions.push(eq(orders.assignedDepartmentId, query.assignedDepartmentId));
    }
    if (query.assignedEmployeeId) {
      conditions.push(eq(orders.assignedEmployeeId, query.assignedEmployeeId));
    }
    if (query.overdueOnly) {
      conditions.push(
        sql`${orders.expectedCompletionDate} IS NOT NULL AND ${orders.expectedCompletionDate} < CURRENT_DATE AND ${orders.operationalState} IN ('active', 'on_hold')`,
      );
    }
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        sql`(${orders.orderNumber} ILIKE ${pattern} OR ${orders.title} ILIKE ${pattern} OR COALESCE(${orders.poNumber}, '') ILIKE ${pattern})`,
      );
    }

    const whereClause = and(...conditions);
    const offset = (query.page - 1) * query.limit;

    const [countRow] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(orders)
      .where(whereClause);
    const total = countRow?.total ?? 0;

    const rows = await this.db
      .select({
        order: orders,
        customerCode: customers.customerCode,
        customerName: customers.companyName,
      })
      .from(orders)
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .where(whereClause)
      .orderBy(query.sortOrder === 'asc' ? asc(orders.createdAt) : desc(orders.createdAt))
      .limit(query.limit)
      .offset(offset);

    if (rows.length === 0) {
      return {
        items: [],
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        },
      };
    }

    const workflowIds = [...new Set(rows.map((r) => r.order.workflowId))];
    const allStatuses = await this.db
      .select()
      .from(orderWorkflowStatuses)
      .where(inArray(orderWorkflowStatuses.workflowId, workflowIds))
      .orderBy(asc(orderWorkflowStatuses.sortOrder));

    const statusById = new Map(allStatuses.map((s) => [s.id, s]));
    const statusesByWorkflow = new Map<string, (typeof allStatuses)[number][]>();
    for (const s of allStatuses) {
      const list = statusesByWorkflow.get(s.workflowId) ?? [];
      list.push(s);
      statusesByWorkflow.set(s.workflowId, list);
    }

    const empMap = await this.loadEmployeeNameMap(
      rows.map((r) => r.order.assignedEmployeeId).filter((id): id is string => Boolean(id)),
    );
    const deptMap = await this.loadDepartmentNameMap(
      rows.map((r) => r.order.assignedDepartmentId).filter((id): id is string => Boolean(id)),
    );

    const isCustomer = actor.userType === 'customer';
    // For customer orders currently on an internal-only stage, find latest visible progress event
    const hiddenStatusOrderIds = isCustomer
      ? rows
          .filter((r) => statusById.get(r.order.currentStatusId)?.isCustomerVisible === false)
          .map((r) => r.order.id)
      : [];

    const fallbackVisibleByOrder = new Map<string, (typeof allStatuses)[number]>();
    if (hiddenStatusOrderIds.length > 0) {
      const visibleEvents = await this.db
        .select({
          orderId: orderProgressEvents.orderId,
          toStatusId: orderProgressEvents.toStatusId,
          createdAt: orderProgressEvents.createdAt,
        })
        .from(orderProgressEvents)
        .where(
          and(
            inArray(orderProgressEvents.orderId, hiddenStatusOrderIds),
            eq(orderProgressEvents.isCustomerVisible, true),
          ),
        )
        .orderBy(desc(orderProgressEvents.createdAt));

      for (const evt of visibleEvents) {
        if (fallbackVisibleByOrder.has(evt.orderId)) continue;
        const st = statusById.get(evt.toStatusId);
        if (st?.isCustomerVisible) {
          fallbackVisibleByOrder.set(evt.orderId, st);
        }
      }
    }

    const items: OrderDto[] = rows.map(({ order, customerCode, customerName }) => {
      const wfStatuses = statusesByWorkflow.get(order.workflowId) ?? [];
      const visibleStatuses = isCustomer
        ? wfStatuses.filter((s) => s.isCustomerVisible)
        : wfStatuses;
      const rawCurrent = statusById.get(order.currentStatusId);
      const projectedStage =
        isCustomer && rawCurrent && !rawCurrent.isCustomerVisible
          ? (fallbackVisibleByOrder.get(order.id) ?? visibleStatuses[0] ?? rawCurrent)
          : rawCurrent;

      const stageIndex = projectedStage
        ? Math.max(
            1,
            visibleStatuses.findIndex((s) => s.id === projectedStage.id) + 1,
          )
        : 1;

      const dto: OrderDto = {
        id: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        customerCode,
        customerName,
        workflowId: order.workflowId,
        currentStatusId: projectedStage?.id ?? order.currentStatusId,
        currentStageCode: projectedStage?.code ?? 'unknown',
        currentStageName: isCustomer
          ? (projectedStage?.customerLabel ?? projectedStage?.name ?? 'Unknown')
          : (projectedStage?.name ?? 'Unknown'),
        currentStageColor: projectedStage?.colorToken ?? 'slate',
        currentStageOrder: stageIndex,
        totalVisibleStages: Math.max(1, visibleStatuses.length),
        operationalState: order.operationalState,
        priority: order.priority,
        title: order.title,
        poNumber: order.poNumber,
        description: order.description,
        ...(isCustomer ? {} : { internalNotes: order.internalNotes }),
        assignedDepartmentId: isCustomer ? null : order.assignedDepartmentId,
        assignedDepartmentName: isCustomer
          ? null
          : order.assignedDepartmentId
            ? (deptMap.get(order.assignedDepartmentId) ?? null)
            : null,
        assignedEmployeeId: isCustomer ? null : order.assignedEmployeeId,
        assignedEmployeeName: isCustomer
          ? null
          : order.assignedEmployeeId
            ? (empMap.get(order.assignedEmployeeId) ?? null)
            : null,
        orderedAt: order.orderedAt.toISOString(),
        expectedCompletionDate: order.expectedCompletionDate,
        actualCompletionDate: order.actualCompletionDate,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      };
      return dto;
    });

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

  async getById(id: string, actor: AuthenticatedActor): Promise<OrderDetailDto> {
    const order = await this.assertOrderAccess(id, actor);
    const isCustomer = actor.userType === 'customer';

    const [customer] = await this.db
      .select({ customerCode: customers.customerCode, companyName: customers.companyName })
      .from(customers)
      .where(eq(customers.id, order.customerId));

    const wfStatuses = await this.db
      .select()
      .from(orderWorkflowStatuses)
      .where(eq(orderWorkflowStatuses.workflowId, order.workflowId))
      .orderBy(asc(orderWorkflowStatuses.sortOrder));
    const statusById = new Map(wfStatuses.map((s) => [s.id, s]));

    const transitions = isCustomer
      ? []
      : await this.db
          .select()
          .from(orderWorkflowTransitions)
          .where(eq(orderWorkflowTransitions.workflowId, order.workflowId));

    const items = await this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.lineNumber));

    const eventRows = await this.db
      .select({
        event: orderProgressEvents,
        changedByName: users.fullName,
      })
      .from(orderProgressEvents)
      .leftJoin(users, eq(orderProgressEvents.changedByUserId, users.id))
      .where(eq(orderProgressEvents.orderId, order.id))
      .orderBy(asc(orderProgressEvents.createdAt));

    const visibleEvents = eventRows.filter(({ event }) => {
      if (!isCustomer) return true;
      const targetSt = statusById.get(event.toStatusId);
      return event.isCustomerVisible && Boolean(targetSt?.isCustomerVisible);
    });

    const eventIds = visibleEvents.map((e) => e.event.id);
    const attRows =
      eventIds.length > 0
        ? await this.db
            .select({
              att: attachments,
              uploadedByName: users.fullName,
            })
            .from(attachments)
            .leftJoin(users, eq(attachments.uploadedByUserId, users.id))
            .where(
              and(
                inArray(attachments.orderProgressEventId, eventIds),
                eq(attachments.uploadStatus, 'ready'),
                isNull(attachments.deletedAt),
                ...(isCustomer ? [eq(attachments.visibility, 'customer_visible')] : []),
              ),
            )
        : [];

    const attByEvent = new Map<string, AttachmentDto[]>();
    for (const { att, uploadedByName } of attRows) {
      if (!att.orderProgressEventId) continue;
      const list = attByEvent.get(att.orderProgressEventId) ?? [];
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
      attByEvent.set(att.orderProgressEventId, list);
    }

    const empMap = await this.loadEmployeeNameMap([
      ...(order.assignedEmployeeId ? [order.assignedEmployeeId] : []),
      ...visibleEvents
        .map((e) => e.event.responsibleEmployeeId)
        .filter((eid): eid is string => Boolean(eid)),
    ]);
    const deptMap = await this.loadDepartmentNameMap([
      ...(order.assignedDepartmentId ? [order.assignedDepartmentId] : []),
      ...visibleEvents
        .map((e) => e.event.responsibleDepartmentId)
        .filter((did): did is string => Boolean(did)),
    ]);

    const visibleStages = (isCustomer ? wfStatuses.filter((s) => s.isCustomerVisible) : wfStatuses).map(
      (s) => ({
        id: s.id,
        workflowId: s.workflowId,
        code: s.code,
        name: isCustomer ? (s.customerLabel ?? s.name) : s.name,
        customerLabel: s.customerLabel,
        description: s.description,
        colorToken: s.colorToken,
        sortOrder: s.sortOrder,
        isCustomerVisible: s.isCustomerVisible,
        isTerminal: s.isTerminal,
        defaultDepartmentId: isCustomer ? null : s.defaultDepartmentId,
      }),
    );

    const rawCurrent = statusById.get(order.currentStatusId);
    const lastVisibleEvent = [...visibleEvents].reverse()[0];
    const projectedStage =
      isCustomer && rawCurrent && !rawCurrent.isCustomerVisible
        ? ((lastVisibleEvent ? statusById.get(lastVisibleEvent.event.toStatusId) : undefined) ??
          visibleStages[0] ??
          rawCurrent)
        : rawCurrent;

    const stageOrder = projectedStage
      ? Math.max(1, visibleStages.findIndex((s) => s.id === projectedStage.id) + 1)
      : 1;

    const allowedNextStatusIds = isCustomer
      ? []
      : transitions.length > 0
        ? transitions
            .filter((t) => t.fromStatusId === order.currentStatusId)
            .map((t) => t.toStatusId)
        : wfStatuses.filter((s) => s.id !== order.currentStatusId).map((s) => s.id);

    const [conv] = await this.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.orderId, order.id));

    const [ticketCountRow] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(tickets)
      .where(and(eq(tickets.orderId, order.id), isNull(tickets.deletedAt)));

    const [attCountRow] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(attachments)
      .where(
        and(
          eq(attachments.orderId, order.id),
          eq(attachments.uploadStatus, 'ready'),
          isNull(attachments.deletedAt),
          ...(isCustomer ? [eq(attachments.visibility, 'customer_visible')] : []),
        ),
      );

    const progressEvents: OrderProgressEventDto[] = visibleEvents.map(({ event, changedByName }) => {
      const targetSt = statusById.get(event.toStatusId);
      return {
        id: event.id,
        orderId: event.orderId,
        fromStatusId: event.fromStatusId,
        toStatusId: event.toStatusId,
        statusNameSnapshot: isCustomer
          ? (targetSt?.customerLabel ?? event.statusNameSnapshot)
          : event.statusNameSnapshot,
        statusColorToken: targetSt?.colorToken ?? 'slate',
        changedByUserId: event.changedByUserId,
        changedByName: isCustomer ? null : changedByName,
        responsibleDepartmentId: isCustomer ? null : event.responsibleDepartmentId,
        responsibleDepartmentName: isCustomer
          ? null
          : event.responsibleDepartmentId
            ? (deptMap.get(event.responsibleDepartmentId) ?? null)
            : null,
        responsibleEmployeeId: isCustomer ? null : event.responsibleEmployeeId,
        responsibleEmployeeName: isCustomer
          ? null
          : event.responsibleEmployeeId
            ? (empMap.get(event.responsibleEmployeeId) ?? null)
            : null,
        expectedDate: event.expectedDate,
        completedAt: event.completedAt ? event.completedAt.toISOString() : null,
        note: event.note,
        isCustomerVisible: event.isCustomerVisible,
        attachments: attByEvent.get(event.id) ?? [],
        createdAt: event.createdAt.toISOString(),
      };
    });

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerCode: customer?.customerCode ?? '',
      customerName: customer?.companyName ?? '',
      workflowId: order.workflowId,
      currentStatusId: projectedStage?.id ?? order.currentStatusId,
      currentStageCode: projectedStage?.code ?? 'unknown',
      currentStageName: isCustomer
        ? (projectedStage?.customerLabel ?? projectedStage?.name ?? 'Unknown')
        : (projectedStage?.name ?? 'Unknown'),
      currentStageColor: projectedStage?.colorToken ?? 'slate',
      currentStageOrder: stageOrder,
      totalVisibleStages: Math.max(1, visibleStages.length),
      operationalState: order.operationalState,
      priority: order.priority,
      title: order.title,
      poNumber: order.poNumber,
      description: order.description,
      ...(isCustomer ? {} : { internalNotes: order.internalNotes }),
      assignedDepartmentId: isCustomer ? null : order.assignedDepartmentId,
      assignedDepartmentName: isCustomer
        ? null
        : order.assignedDepartmentId
          ? (deptMap.get(order.assignedDepartmentId) ?? null)
          : null,
      assignedEmployeeId: isCustomer ? null : order.assignedEmployeeId,
      assignedEmployeeName: isCustomer
        ? null
        : order.assignedEmployeeId
          ? (empMap.get(order.assignedEmployeeId) ?? null)
          : null,
      orderedAt: order.orderedAt.toISOString(),
      expectedCompletionDate: order.expectedCompletionDate,
      actualCompletionDate: order.actualCompletionDate,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: items.map((i) => ({
        id: i.id,
        orderId: i.orderId,
        lineNumber: i.lineNumber,
        partNumber: i.partNumber,
        name: i.name,
        material: i.material,
        specification: i.specification,
        quantity: i.quantity,
        unit: i.unit,
        targetDate: i.targetDate,
        notes: i.notes,
      })),
      stages: visibleStages,
      allowedNextStatusIds,
      progressEvents,
      conversationId: conv?.id ?? null,
      ticketsCount: ticketCountRow?.total ?? 0,
      attachmentsCount: attCountRow?.total ?? 0,
    };
  }

  async create(
    dto: CreateOrderInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<OrderDetailDto> {
    const [customer] = await this.db
      .select()
      .from(customers)
      .where(and(eq(customers.id, dto.customerId), isNull(customers.deletedAt)));
    if (!customer || customer.status === 'archived') {
      throw new BadRequestException({
        code: 'CUSTOMER_INVALID',
        message: 'Active customer organization is required to create an order',
      });
    }

    const [defaultWorkflow] = await this.db
      .select()
      .from(orderWorkflows)
      .where(and(eq(orderWorkflows.isDefault, true), eq(orderWorkflows.isActive, true)));
    if (!defaultWorkflow) {
      throw new BadRequestException({
        code: 'WORKFLOW_MISSING',
        message: 'No active default order workflow is configured',
      });
    }

    const [initialStage] = await this.db
      .select()
      .from(orderWorkflowStatuses)
      .where(eq(orderWorkflowStatuses.workflowId, defaultWorkflow.id))
      .orderBy(asc(orderWorkflowStatuses.sortOrder))
      .limit(1);
    if (!initialStage) {
      throw new BadRequestException({
        code: 'WORKFLOW_STAGES_MISSING',
        message: 'Default workflow has no configured stages',
      });
    }

    const year = new Date().getUTCFullYear();

    const createdId = await this.db.transaction(async (tx) => {
      const seqResult = await tx.execute<{ nextval: string }>(
        sql`SELECT nextval('order_number_seq')::text AS nextval`,
      );
      const seqNum = Number(seqResult.rows[0]?.nextval ?? 1);
      const orderNumber = `ORD-${year}-${String(seqNum).padStart(4, '0')}`;

      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber,
          customerId: dto.customerId,
          workflowId: defaultWorkflow.id,
          currentStatusId: initialStage.id,
          operationalState: 'active',
          priority: dto.priority,
          title: dto.title,
          poNumber: dto.poNumber ?? null,
          description: dto.description ?? null,
          internalNotes: dto.internalNotes ?? null,
          assignedDepartmentId: dto.assignedDepartmentId ?? initialStage.defaultDepartmentId,
          assignedEmployeeId: dto.assignedEmployeeId ?? null,
          expectedCompletionDate: dto.expectedCompletionDate ?? null,
          createdByUserId: actor.id,
        })
        .returning();

      if (!order) throw new Error('Failed to create order');

      if (dto.items && dto.items.length > 0) {
        await tx.insert(orderItems).values(
          dto.items.map((item, idx) => ({
            orderId: order.id,
            lineNumber: idx + 1,
            partNumber: item.partNumber ?? null,
            name: item.name,
            material: item.material ?? null,
            specification: item.specification ?? null,
            quantity: String(item.quantity),
            unit: item.unit,
            targetDate: item.targetDate ?? null,
            notes: item.notes ?? null,
          })),
        );
      }

      await tx.insert(orderProgressEvents).values({
        orderId: order.id,
        fromStatusId: null,
        toStatusId: initialStage.id,
        statusNameSnapshot: initialStage.name,
        changedByUserId: actor.id,
        responsibleDepartmentId: order.assignedDepartmentId,
        responsibleEmployeeId: order.assignedEmployeeId,
        expectedDate: order.expectedCompletionDate,
        note: 'Order created and entered workflow.',
        isCustomerVisible: initialStage.isCustomerVisible,
      });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: 'employee',
          customerId: dto.customerId,
          action: 'order.created',
          entityType: 'order',
          entityId: order.id,
          summary: `Created order ${orderNumber} (${dto.title})`,
          afterJson: { orderNumber, title: dto.title, priority: dto.priority },
          meta,
        },
        tx,
      );

      return order.id;
    });

    const detail = await this.getById(createdId, actor);

    const customerUserIds = await this.notificationsService.getCustomerUserIds(dto.customerId);
    await this.notificationsService.dispatch({
      recipientUserIds: customerUserIds,
      type: 'order.created',
      title: `New order ${detail.orderNumber}`,
      body: `${detail.title} (${detail.currentStageName})`,
      entityType: 'order',
      entityId: detail.id,
      actionUrl: `/orders/${detail.id}`,
      surface: 'portal',
    });

    return detail;
  }

  async update(
    id: string,
    dto: UpdateOrderInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<OrderDetailDto> {
    const before = await this.assertOrderAccess(id, actor);

    await this.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.poNumber !== undefined ? { poNumber: dto.poNumber } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.internalNotes !== undefined ? { internalNotes: dto.internalNotes } : {}),
          ...(dto.assignedDepartmentId !== undefined
            ? { assignedDepartmentId: dto.assignedDepartmentId }
            : {}),
          ...(dto.assignedEmployeeId !== undefined
            ? { assignedEmployeeId: dto.assignedEmployeeId }
            : {}),
          ...(dto.expectedCompletionDate !== undefined
            ? { expectedCompletionDate: dto.expectedCompletionDate }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, id));

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: 'employee',
          customerId: before.customerId,
          action: 'order.updated',
          entityType: 'order',
          entityId: id,
          summary: `Updated order ${before.orderNumber}`,
          beforeJson: before,
          afterJson: dto,
          meta,
        },
        tx,
      );
    });

    return this.getById(id, actor);
  }

  async updateState(
    id: string,
    dto: UpdateOrderStateInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<OrderDetailDto> {
    const before = await this.assertOrderAccess(id, actor);

    await this.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          operationalState: dto.operationalState,
          ...(dto.operationalState === 'completed' && !before.actualCompletionDate
            ? { actualCompletionDate: new Date().toISOString().slice(0, 10) }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, id));

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: 'employee',
          customerId: before.customerId,
          action: 'order.state_changed',
          entityType: 'order',
          entityId: id,
          summary: `Changed ${before.orderNumber} state from ${before.operationalState} to ${dto.operationalState}`,
          beforeJson: { operationalState: before.operationalState },
          afterJson: dto,
          meta,
        },
        tx,
      );
    });

    return this.getById(id, actor);
  }

  async advanceProgress(
    id: string,
    dto: AdvanceOrderProgressInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<OrderDetailDto> {
    const order = await this.assertOrderAccess(id, actor);

    const canAdvanceAll = actor.permissions.includes(PERMISSIONS.ORDER_ADVANCE_ALL);
    const canAdvanceAssigned = actor.permissions.includes(PERMISSIONS.ORDER_ADVANCE_ASSIGNED);
    const isAssigned =
      order.assignedEmployeeId === actor.employeeId ||
      order.assignedDepartmentId === actor.departmentId;

    if (!canAdvanceAll && (!canAdvanceAssigned || !isAssigned)) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Insufficient permission to advance this order stage',
      });
    }

    if (dto.toStatusId === order.currentStatusId) {
      throw new BadRequestException({
        code: 'INVALID_ORDER_TRANSITION',
        message: 'Order is already in the selected workflow stage',
      });
    }

    const [toStatus] = await this.db
      .select()
      .from(orderWorkflowStatuses)
      .where(
        and(
          eq(orderWorkflowStatuses.id, dto.toStatusId),
          eq(orderWorkflowStatuses.workflowId, order.workflowId),
        ),
      );
    if (!toStatus) {
      throw new BadRequestException({
        code: 'INVALID_ORDER_TRANSITION',
        message: 'Target stage does not belong to order workflow',
      });
    }

    const configuredTransitions = await this.db
      .select()
      .from(orderWorkflowTransitions)
      .where(eq(orderWorkflowTransitions.workflowId, order.workflowId));

    if (configuredTransitions.length > 0) {
      const matched = configuredTransitions.find(
        (t) => t.fromStatusId === order.currentStatusId && t.toStatusId === dto.toStatusId,
      );
      if (!matched) {
        throw new BadRequestException({
          code: 'INVALID_ORDER_TRANSITION',
          message: 'This stage transition is not permitted by the workflow configuration',
        });
      }
      if (matched.requiredPermission && !actor.permissions.includes(matched.requiredPermission)) {
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: 'You lack the required permission for this workflow transition',
        });
      }
    }

    const effectiveCustomerVisible = dto.isCustomerVisible && toStatus.isCustomerVisible;
    const nextDepartmentId =
      dto.responsibleDepartmentId !== undefined
        ? dto.responsibleDepartmentId
        : (toStatus.defaultDepartmentId ?? order.assignedDepartmentId);
    const nextEmployeeId =
      dto.responsibleEmployeeId !== undefined
        ? dto.responsibleEmployeeId
        : order.assignedEmployeeId;

    const createdEvent = await this.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          currentStatusId: toStatus.id,
          assignedDepartmentId: nextDepartmentId,
          assignedEmployeeId: nextEmployeeId,
          ...(toStatus.isTerminal && !order.actualCompletionDate
            ? { actualCompletionDate: new Date().toISOString().slice(0, 10) }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      const [evt] = await tx
        .insert(orderProgressEvents)
        .values({
          orderId: order.id,
          fromStatusId: order.currentStatusId,
          toStatusId: toStatus.id,
          statusNameSnapshot: toStatus.name,
          changedByUserId: actor.id,
          responsibleDepartmentId: nextDepartmentId,
          responsibleEmployeeId: nextEmployeeId,
          expectedDate: dto.expectedDate ?? null,
          completedAt: toStatus.isTerminal ? new Date() : null,
          note: dto.note ?? null,
          isCustomerVisible: effectiveCustomerVisible,
        })
        .returning();

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: 'employee',
          customerId: order.customerId,
          action: 'order.stage_advanced',
          entityType: 'order',
          entityId: order.id,
          summary: `Advanced ${order.orderNumber} to ${toStatus.name}`,
          beforeJson: { currentStatusId: order.currentStatusId },
          afterJson: {
            toStatusId: toStatus.id,
            toStatusCode: toStatus.code,
            isCustomerVisible: effectiveCustomerVisible,
            note: dto.note,
          },
          meta,
        },
        tx,
      );

      return evt;
    });

    this.realtimeService.emitOrderProgressUpdated(order.id, order.customerId, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      toStatusId: toStatus.id,
      stageCode: toStatus.code,
      stageName: effectiveCustomerVisible ? (toStatus.customerLabel ?? toStatus.name) : toStatus.name,
      stageColor: toStatus.colorToken,
      operationalState: order.operationalState,
      isCustomerVisible: effectiveCustomerVisible,
      note: dto.note ?? null,
      createdAt: (createdEvent?.createdAt ?? new Date()).toISOString(),
    });

    if (effectiveCustomerVisible) {
      const customerUserIds = await this.notificationsService.getCustomerUserIds(order.customerId);
      const stageLabel = toStatus.customerLabel ?? toStatus.name;
      await this.notificationsService.dispatch({
        recipientUserIds: customerUserIds,
        type: 'order.progress_updated',
        title: `${order.orderNumber} · ${stageLabel}`,
        body: dto.note || `Order stage updated to ${stageLabel}`,
        entityType: 'order',
        entityId: order.id,
        actionUrl: `/orders/${order.id}`,
        surface: 'portal',
      });
    }

    return this.getById(id, actor);
  }
}
