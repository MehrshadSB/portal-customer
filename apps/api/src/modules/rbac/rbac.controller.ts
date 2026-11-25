import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@portal/types';
import { type UpdateRolePermissionsInput, updateRolePermissionsSchema } from '@portal/validators';
import {
  AllowedSurfaces,
  CurrentUser,
  ReqMeta,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { AuthStateService } from '../auth/auth-state.service';
import { RbacService } from './rbac.service';

@ApiTags('RBAC')
@Controller()
export class RbacController {
  constructor(
    private readonly rbacService: RbacService,
    private readonly authStateService: AuthStateService,
  ) {}

  @Get('permissions')
  @AllowedSurfaces('admin')
  @RequirePermissions(PERMISSIONS.ROLE_PERMISSION_MANAGE)
  @ApiOperation({ summary: 'List all platform permissions' })
  async listPermissions() {
    const data = await this.rbacService.listPermissions();
    return { data };
  }

  @Get('roles')
  @AllowedSurfaces('admin')
  @RequirePermissions(PERMISSIONS.ROLE_PERMISSION_MANAGE)
  @ApiOperation({ summary: 'List all roles with assigned permission keys' })
  async listRoles() {
    const data = await this.rbacService.listRoles();
    return { data };
  }

  @Patch('roles/:id/permissions')
  @AllowedSurfaces('admin')
  @RequirePermissions(PERMISSIONS.ROLE_PERMISSION_MANAGE)
  @ApiOperation({ summary: 'Update permission assignments for a role' })
  async updateRolePermissions(
    @Param('id', ParseUUIDPipe) roleId: string,
    @Body(new ZodValidationPipe(updateRolePermissionsSchema)) body: UpdateRolePermissionsInput,
    @CurrentUser() actor: AuthenticatedActor,
    @ReqMeta() meta: RequestMetadata,
  ) {
    const { role, affectedUserIds } = await this.rbacService.updateRolePermissions(
      roleId,
      body.permissionKeys,
      actor,
      meta,
    );
    await this.authStateService.invalidateUsers(affectedUserIds);
    return { data: role };
  }
}
