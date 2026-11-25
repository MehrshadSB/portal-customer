import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@portal/types';
import {
  type CreateDepartmentInput,
  createDepartmentSchema,
  type UpdateDepartmentInput,
  updateDepartmentSchema,
} from '@portal/validators';
import {
  AllowedSurfaces,
  CurrentUser,
  ReqMeta,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { DepartmentsService } from './departments.service';

@ApiTags('Departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @AllowedSurfaces('admin')
  @ApiOperation({ summary: 'List departments' })
  async list() {
    const data = await this.departmentsService.list();
    return { data };
  }

  @Post()
  @AllowedSurfaces('admin')
  @RequirePermissions(PERMISSIONS.DEPARTMENT_MANAGE)
  @ApiOperation({ summary: 'Create department' })
  async create(
    @Body(new ZodValidationPipe(createDepartmentSchema)) body: CreateDepartmentInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.departmentsService.create(body, actor, meta);
    return { data };
  }

  @Patch(':id')
  @AllowedSurfaces('admin')
  @RequirePermissions(PERMISSIONS.DEPARTMENT_MANAGE)
  @ApiOperation({ summary: 'Update department' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateDepartmentSchema)) body: UpdateDepartmentInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const data = await this.departmentsService.update(id, body, actor, meta);
    return { data };
  }
}
