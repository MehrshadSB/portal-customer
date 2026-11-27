import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@portal/types';
import {
  type ReplaceWorkflowTransitionsInput,
  replaceWorkflowTransitionsSchema,
  type UpdateWorkflowStatusInput,
  updateWorkflowStatusSchema,
} from '@portal/validators';
import {
  AllowedSurfaces,
  CurrentUser,
  ReqMeta,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { WorkflowsService } from './workflows.service';

@ApiTags('Workflows')
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  @ApiOperation({ summary: 'List order workflows and stage definitions' })
  async list(@CurrentUser() actor: AuthenticatedActor) {
    const data = await this.workflowsService.list(actor);
    return { data };
  }

  @Patch('statuses/:statusId')
  @AllowedSurfaces('admin')
  @RequirePermissions(PERMISSIONS.WORKFLOW_CONFIGURE)
  @ApiOperation({ summary: 'Update a workflow stage label, visibility, or color' })
  async updateStatus(
    @Param('statusId', ParseUUIDPipe) statusId: string,
    @Body(new ZodValidationPipe(updateWorkflowStatusSchema)) body: UpdateWorkflowStatusInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.workflowsService.updateStatus(statusId, body, actor, meta);
    return { data };
  }

  @Put(':workflowId/transitions')
  @AllowedSurfaces('admin')
  @RequirePermissions(PERMISSIONS.WORKFLOW_CONFIGURE)
  @ApiOperation({ summary: 'Replace allowed stage transitions for a workflow' })
  async replaceTransitions(
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Body(new ZodValidationPipe(replaceWorkflowTransitionsSchema))
    body: ReplaceWorkflowTransitionsInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.workflowsService.replaceTransitions(workflowId, body, actor, meta);
    return { data };
  }
}
