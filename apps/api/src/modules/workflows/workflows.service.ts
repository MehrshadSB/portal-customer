import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { WorkflowDto, WorkflowStatusDto } from '@portal/types';
import type {
  ReplaceWorkflowTransitionsInput,
  UpdateWorkflowStatusInput,
} from '@portal/validators';
import { asc, eq } from 'drizzle-orm';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import {
  orderWorkflows,
  orderWorkflowStatuses,
  orderWorkflowTransitions,
} from '../../infrastructure/database/schema';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class WorkflowsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    private readonly auditService: AuditService,
  ) {}

  async list(actor: AuthenticatedActor): Promise<WorkflowDto[]> {
    const workflows = await this.db
      .select()
      .from(orderWorkflows)
      .where(eq(orderWorkflows.isActive, true))
      .orderBy(asc(orderWorkflows.name));

    const statuses = await this.db
      .select()
      .from(orderWorkflowStatuses)
      .orderBy(asc(orderWorkflowStatuses.sortOrder));

    const transitions = await this.db.select().from(orderWorkflowTransitions);

    const isCustomer = actor.userType === 'customer';

    return workflows.map((wf) => {
      const wfStatuses = statuses
        .filter((s) => s.workflowId === wf.id && (!isCustomer || s.isCustomerVisible))
        .map((s) => ({
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
        }));

      const wfTransitions = isCustomer
        ? []
        : transitions
            .filter((t) => t.workflowId === wf.id)
            .map((t) => ({
              id: t.id,
              workflowId: t.workflowId,
              fromStatusId: t.fromStatusId,
              toStatusId: t.toStatusId,
              requiredPermission: t.requiredPermission,
            }));

      return {
        id: wf.id,
        name: wf.name,
        description: wf.description,
        isDefault: wf.isDefault,
        isActive: wf.isActive,
        statuses: wfStatuses,
        transitions: wfTransitions,
      };
    });
  }

  async updateStatus(
    statusId: string,
    dto: UpdateWorkflowStatusInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<WorkflowStatusDto> {
    const [existing] = await this.db
      .select()
      .from(orderWorkflowStatuses)
      .where(eq(orderWorkflowStatuses.id, statusId));

    if (!existing) {
      throw new NotFoundException({
        code: 'WORKFLOW_STATUS_NOT_FOUND',
        message: 'Workflow status not found',
      });
    }

    const [updated] = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(orderWorkflowStatuses)
        .set({
          name: dto.name,
          customerLabel: dto.customerLabel ?? null,
          description: dto.description ?? null,
          colorToken: dto.colorToken,
          isCustomerVisible: dto.isCustomerVisible,
          isTerminal: dto.isTerminal,
          defaultDepartmentId: dto.defaultDepartmentId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(orderWorkflowStatuses.id, statusId))
        .returning();

      if (row) {
        await this.auditService.record(
          {
            actorUserId: actor.id,
            actorType: 'employee',
            action: 'workflow_status.updated',
            entityType: 'order_workflow_status',
            entityId: statusId,
            summary: `Updated workflow stage ${row.code}`,
            beforeJson: existing,
            afterJson: row,
            meta,
          },
          tx,
        );
      }
      return [row];
    });

    if (!updated) throw new Error('Failed to update workflow status');
    return updated;
  }

  async replaceTransitions(
    workflowId: string,
    dto: ReplaceWorkflowTransitionsInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<WorkflowDto> {
    const [wf] = await this.db
      .select()
      .from(orderWorkflows)
      .where(eq(orderWorkflows.id, workflowId));
    if (!wf) {
      throw new NotFoundException({ code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' });
    }

    const wfStatuses = await this.db
      .select({ id: orderWorkflowStatuses.id })
      .from(orderWorkflowStatuses)
      .where(eq(orderWorkflowStatuses.workflowId, workflowId));
    const validIds = new Set(wfStatuses.map((s) => s.id));

    for (const t of dto.transitions) {
      if (!validIds.has(t.fromStatusId) || !validIds.has(t.toStatusId) || t.fromStatusId === t.toStatusId) {
        throw new BadRequestException({
          code: 'INVALID_WORKFLOW_TRANSITION',
          message: 'Transitions must connect two distinct stages belonging to this workflow',
        });
      }
    }

    await this.db.transaction(async (tx) => {
      await tx
        .delete(orderWorkflowTransitions)
        .where(eq(orderWorkflowTransitions.workflowId, workflowId));

      if (dto.transitions.length > 0) {
        await tx.insert(orderWorkflowTransitions).values(
          dto.transitions.map((t) => ({
            workflowId,
            fromStatusId: t.fromStatusId,
            toStatusId: t.toStatusId,
            requiredPermission: t.requiredPermission ?? null,
          })),
        );
      }

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: 'employee',
          action: 'workflow.transitions_updated',
          entityType: 'order_workflow',
          entityId: workflowId,
          summary: `Updated workflow transitions for ${wf.name}`,
          afterJson: dto.transitions,
          meta,
        },
        tx,
      );
    });

    const all = await this.list(actor);
    const updated = all.find((w) => w.id === workflowId);
    if (!updated) throw new NotFoundException({ code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' });
    return updated;
  }
}
