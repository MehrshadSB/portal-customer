import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@portal/types';
import {
  type InviteEmployeeInput,
  inviteEmployeeSchema,
  type ListEmployeesQueryInput,
  listEmployeesQuerySchema,
  type UpdateEmployeeInput,
  updateEmployeeSchema,
} from '@portal/validators';
import {
  AllowedSurfaces,
  CurrentUser,
  ReqMeta,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { EmployeesService } from './employees.service';

@ApiTags('Employees')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @AllowedSurfaces('admin')
  @ApiOperation({ summary: 'List internal employees' })
  async list(
    @Query(new ZodValidationPipe(listEmployeesQuerySchema)) query: ListEmployeesQueryInput,
  ) {
    const { items, meta } = await this.employeesService.list(query);
    return { data: items, meta };
  }

  @Post('invite')
  @AllowedSurfaces('admin')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_MANAGE)
  @ApiOperation({ summary: 'Invite a new employee and assign roles' })
  async invite(
    @Body(new ZodValidationPipe(inviteEmployeeSchema)) body: InviteEmployeeInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.employeesService.invite(body, actor, meta);
    return { data };
  }

  @Patch(':id')
  @AllowedSurfaces('admin')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_MANAGE)
  @ApiOperation({ summary: 'Update employee profile, department, roles, or status' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEmployeeSchema)) body: UpdateEmployeeInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.employeesService.update(id, body, actor, meta);
    return { data };
  }
}
