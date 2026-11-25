import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PermissionDto, RoleDto, UserType } from '@portal/types';
import { eq, inArray, sql } from 'drizzle-orm';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import {
  customerMembers,
  customers,
  employeeRoles,
  employees,
  permissions,
  rolePermissions,
  roles,
  users,
} from '../../infrastructure/database/schema';
import { AuditService } from '../audit/audit.service';

export interface ResolvedIdentityContext {
  employeeId: string | null;
  departmentId: string | null;
  customerId: string | null;
  customerName: string | null;
  roles: string[];
  permissions: string[];
}

@Injectable()
export class RbacService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    private readonly auditService: AuditService,
  ) {}

  async resolveUserContext(userId: string, userType: UserType): Promise<ResolvedIdentityContext> {
    if (userType === 'employee') {
      const [emp] = await this.db
        .select({ id: employees.id, departmentId: employees.departmentId, isActive: employees.isActive })
        .from(employees)
        .where(eq(employees.userId, userId));

      if (!emp || !emp.isActive) {
        return {
          employeeId: emp?.id ?? null,
          departmentId: emp?.departmentId ?? null,
          customerId: null,
          customerName: null,
          roles: [],
          permissions: [],
        };
      }

      const roleRows = await this.db
        .select({ roleId: roles.id, slug: roles.slug })
        .from(employeeRoles)
        .innerJoin(roles, eq(employeeRoles.roleId, roles.id))
        .where(eq(employeeRoles.employeeId, emp.id));

      const roleIds = roleRows.map((r) => r.roleId);
      const permKeys =
        roleIds.length > 0
          ? await this.db
              .selectDistinct({ key: permissions.key })
              .from(rolePermissions)
              .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
              .where(inArray(rolePermissions.roleId, roleIds))
          : [];

      return {
        employeeId: emp.id,
        departmentId: emp.departmentId,
        customerId: null,
        customerName: null,
        roles: roleRows.map((r) => r.slug),
        permissions: permKeys.map((p) => p.key),
      };
    }

    const [member] = await this.db
      .select({
        customerId: customerMembers.customerId,
        customerName: customers.companyName,
        customerStatus: customers.status,
        customerDeletedAt: customers.deletedAt,
        roleId: roles.id,
        roleSlug: roles.slug,
      })
      .from(customerMembers)
      .innerJoin(customers, eq(customerMembers.customerId, customers.id))
      .innerJoin(roles, eq(customerMembers.roleId, roles.id))
      .where(eq(customerMembers.userId, userId));

    if (!member || member.customerDeletedAt || member.customerStatus === 'archived') {
      return {
        employeeId: null,
        departmentId: null,
        customerId: null,
        customerName: null,
        roles: [],
        permissions: [],
      };
    }

    const permRows = await this.db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, member.roleId));

    return {
      employeeId: null,
      departmentId: null,
      customerId: member.customerId,
      customerName: member.customerName,
      roles: [member.roleSlug],
      permissions: permRows.map((p) => p.key),
    };
  }

  async listPermissions(): Promise<PermissionDto[]> {
    return this.db
      .select({
        id: permissions.id,
        key: permissions.key,
        resource: permissions.resource,
        action: permissions.action,
        description: permissions.description,
      })
      .from(permissions)
      .orderBy(permissions.resource, permissions.action);
  }

  async listRoles(): Promise<RoleDto[]> {
    const allRoles = await this.db.select().from(roles).orderBy(roles.scope, roles.name);
    const mappings = await this.db
      .select({ roleId: rolePermissions.roleId, key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id));

    const permsByRole = new Map<string, string[]>();
    for (const row of mappings) {
      const list = permsByRole.get(row.roleId) ?? [];
      list.push(row.key);
      permsByRole.set(row.roleId, list);
    }

    return allRoles.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      scope: r.scope,
      description: r.description,
      isSystem: r.isSystem,
      permissionKeys: (permsByRole.get(r.id) ?? []).sort(),
    }));
  }

  async updateRolePermissions(
    roleId: string,
    permissionKeys: string[],
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<{ role: RoleDto; affectedUserIds: string[] }> {
    const [role] = await this.db.select().from(roles).where(eq(roles.id, roleId));
    if (!role) {
      throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'Role not found' });
    }
    if (role.slug === 'admin') {
      throw new BadRequestException({
        code: 'SYSTEM_ADMIN_ROLE_LOCKED',
        message: 'System administrator permissions cannot be stripped',
      });
    }

    const uniqueKeys = [...new Set(permissionKeys)];
    const permRows =
      uniqueKeys.length > 0
        ? await this.db.select().from(permissions).where(inArray(permissions.key, uniqueKeys))
        : [];

    if (permRows.length !== uniqueKeys.length) {
      throw new BadRequestException({
        code: 'UNKNOWN_PERMISSIONS',
        message: 'One or more permission keys do not exist',
      });
    }

    const beforeRows = await this.db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));
    const beforeKeys = beforeRows.map((r) => r.key).sort();

    const affectedUserIds = await this.db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      if (permRows.length > 0) {
        await tx.insert(rolePermissions).values(
          permRows.map((p) => ({
            roleId,
            permissionId: p.id,
          })),
        );
      }

      const affectedIds: string[] = [];
      if (role.scope === 'employee') {
        const empUsers = await tx
          .select({ userId: employees.userId })
          .from(employeeRoles)
          .innerJoin(employees, eq(employeeRoles.employeeId, employees.id))
          .where(eq(employeeRoles.roleId, roleId));
        affectedIds.push(...empUsers.map((u) => u.userId));
      } else {
        const custUsers = await tx
          .select({ userId: customerMembers.userId })
          .from(customerMembers)
          .where(eq(customerMembers.roleId, roleId));
        affectedIds.push(...custUsers.map((u) => u.userId));
      }

      if (affectedIds.length > 0) {
        await tx
          .update(users)
          .set({ tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
          .where(inArray(users.id, affectedIds));
      }

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: 'employee',
          action: 'role.permissions_updated',
          entityType: 'role',
          entityId: roleId,
          summary: `Updated permissions for role ${role.slug}`,
          beforeJson: { permissionKeys: beforeKeys },
          afterJson: { permissionKeys: uniqueKeys.sort() },
          meta,
        },
        tx,
      );

      return affectedIds;
    });

    return {
      role: {
        id: role.id,
        slug: role.slug,
        name: role.name,
        scope: role.scope,
        description: role.description,
        isSystem: role.isSystem,
        permissionKeys: uniqueKeys.sort(),
      },
      affectedUserIds,
    };
  }
}
