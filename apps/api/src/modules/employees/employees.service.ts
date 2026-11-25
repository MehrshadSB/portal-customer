import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EmployeeDto, PaginationMeta } from '@portal/types';
import type {
  InviteEmployeeInput,
  ListEmployeesQueryInput,
  UpdateEmployeeInput,
} from '@portal/validators';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import {
  authTokens,
  departments,
  employeeRoles,
  employees,
  roles,
  users,
} from '../../infrastructure/database/schema';
import { MailService } from '../../infrastructure/mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { AuthStateService } from '../auth/auth-state.service';
import { generateOpaqueToken, hashToken } from '../auth/auth.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class EmployeesService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    private readonly auditService: AuditService,
    private readonly authStateService: AuthStateService,
    private readonly mailService: MailService,
    private readonly settingsService: SettingsService,
  ) {}

  async list(
    query: ListEmployeesQueryInput,
  ): Promise<{ items: EmployeeDto[]; meta: PaginationMeta }> {
    const conditions = [isNull(users.deletedAt)];
    if (query.departmentId) conditions.push(eq(employees.departmentId, query.departmentId));
    if (query.isActive !== undefined) conditions.push(eq(employees.isActive, query.isActive));
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        sql`(${users.fullName} ILIKE ${pattern} OR ${users.email} ILIKE ${pattern} OR ${employees.employeeCode} ILIKE ${pattern})`,
      );
    }

    const whereClause = and(...conditions);
    const offset = (query.page - 1) * query.limit;

    const [countRow] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(employees)
      .innerJoin(users, eq(employees.userId, users.id))
      .where(whereClause);
    const total = countRow?.total ?? 0;

    const rows = await this.db
      .select({
        id: employees.id,
        userId: employees.userId,
        employeeCode: employees.employeeCode,
        email: users.email,
        fullName: users.fullName,
        phone: users.phone,
        timezone: users.timezone,
        status: users.status,
        departmentId: employees.departmentId,
        departmentName: departments.name,
        jobTitle: employees.jobTitle,
        isActive: employees.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: employees.createdAt,
      })
      .from(employees)
      .innerJoin(users, eq(employees.userId, users.id))
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(whereClause)
      .orderBy(query.sortOrder === 'asc' ? asc(users.fullName) : desc(employees.createdAt))
      .limit(query.limit)
      .offset(offset);

    const empIds = rows.map((r) => r.id);
    const roleRows =
      empIds.length > 0
        ? await this.db
            .select({
              employeeId: employeeRoles.employeeId,
              roleId: roles.id,
              slug: roles.slug,
              name: roles.name,
            })
            .from(employeeRoles)
            .innerJoin(roles, eq(employeeRoles.roleId, roles.id))
            .where(inArray(employeeRoles.employeeId, empIds))
        : [];

    const rolesByEmp = new Map<string, Array<{ id: string; slug: string; name: string }>>();
    for (const rr of roleRows) {
      const list = rolesByEmp.get(rr.employeeId) ?? [];
      list.push({ id: rr.roleId, slug: rr.slug, name: rr.name });
      rolesByEmp.set(rr.employeeId, list);
    }

    return {
      items: rows.map((r) => ({
        ...r,
        roles: rolesByEmp.get(r.id) ?? [],
        lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async invite(
    dto: InviteEmployeeInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<EmployeeDto> {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${dto.email}`, isNull(users.deletedAt)));
    if (existing.length > 0) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'A user with this email already exists',
      });
    }

    const targetRoles = await this.db
      .select()
      .from(roles)
      .where(and(inArray(roles.slug, dto.roleSlugs), eq(roles.scope, 'employee')));

    if (targetRoles.length !== dto.roleSlugs.length) {
      throw new BadRequestException({
        code: 'INVALID_EMPLOYEE_ROLES',
        message: 'One or more employee roles are invalid',
      });
    }

    const rawToken = generateOpaqueToken();
    const localization = await this.settingsService.getLocalization();

    const createdEmployeeId = await this.db.transaction(async (tx) => {
      const seqResult = await tx.execute<{ nextval: string }>(
        sql`SELECT nextval('employee_code_seq')::text AS nextval`,
      );
      const seqNum = Number(seqResult.rows[0]?.nextval ?? 1);
      const employeeCode = `EMP-${String(seqNum).padStart(4, '0')}`;

      const [user] = await tx
        .insert(users)
        .values({
          email: dto.email,
          fullName: dto.fullName,
          userType: 'employee',
          status: 'invited',
          locale: localization.defaultLocale,
        })
        .returning();

      if (!user) throw new Error('Failed to create user');

      const [employee] = await tx
        .insert(employees)
        .values({
          userId: user.id,
          employeeCode,
          departmentId: dto.departmentId ?? null,
          jobTitle: dto.jobTitle ?? null,
          isActive: true,
        })
        .returning();

      if (!employee) throw new Error('Failed to create employee');

      await tx.insert(employeeRoles).values(
        targetRoles.map((r) => ({
          employeeId: employee.id,
          roleId: r.id,
        })),
      );

      await tx.insert(authTokens).values({
        userId: user.id,
        purpose: 'invite',
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: 'employee',
          action: 'employee.invited',
          entityType: 'employee',
          entityId: employee.id,
          summary: `Invited employee ${dto.fullName} (${employeeCode})`,
          afterJson: { email: dto.email, employeeCode, roles: dto.roleSlugs },
          meta,
        },
        tx,
      );

      return employee.id;
    });

    await this.mailService.enqueueInvite({
      to: dto.email,
      fullName: dto.fullName,
      surface: 'admin',
      token: rawToken,
      locale: localization.defaultLocale,
    });

    return this.getById(createdEmployeeId);
  }

  async getById(id: string): Promise<EmployeeDto> {
    const [row] = await this.db
      .select({
        id: employees.id,
        userId: employees.userId,
        employeeCode: employees.employeeCode,
        email: users.email,
        fullName: users.fullName,
        phone: users.phone,
        timezone: users.timezone,
        status: users.status,
        departmentId: employees.departmentId,
        departmentName: departments.name,
        jobTitle: employees.jobTitle,
        isActive: employees.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: employees.createdAt,
      })
      .from(employees)
      .innerJoin(users, eq(employees.userId, users.id))
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(and(eq(employees.id, id), isNull(users.deletedAt)));

    if (!row) {
      throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' });
    }

    const roleRows = await this.db
      .select({ id: roles.id, slug: roles.slug, name: roles.name })
      .from(employeeRoles)
      .innerJoin(roles, eq(employeeRoles.roleId, roles.id))
      .where(eq(employeeRoles.employeeId, id));

    return {
      ...row,
      roles: roleRows,
      lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async update(
    id: string,
    dto: UpdateEmployeeInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<EmployeeDto> {
    const before = await this.getById(id);

    if (before.userId === actor.id && (dto.isActive === false || dto.status === 'suspended')) {
      throw new BadRequestException({
        code: 'SELF_SUSPENSION_FORBIDDEN',
        message: 'You cannot deactivate or suspend your own account',
      });
    }

    const targetRoles = dto.roleSlugs
      ? await this.db
          .select()
          .from(roles)
          .where(and(inArray(roles.slug, dto.roleSlugs), eq(roles.scope, 'employee')))
      : null;

    if (dto.roleSlugs && targetRoles && targetRoles.length !== dto.roleSlugs.length) {
      throw new BadRequestException({
        code: 'INVALID_EMPLOYEE_ROLES',
        message: 'One or more employee roles are invalid',
      });
    }

    await this.db.transaction(async (tx) => {
      if (dto.fullName !== undefined || dto.phone !== undefined || dto.status !== undefined) {
        await tx
          .update(users)
          .set({
            ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
            ...(dto.status === 'suspended' ? { tokenVersion: sql`${users.tokenVersion} + 1` } : {}),
            updatedAt: new Date(),
          })
          .where(eq(users.id, before.userId));
      }

      if (
        dto.departmentId !== undefined ||
        dto.jobTitle !== undefined ||
        dto.isActive !== undefined
      ) {
        await tx
          .update(employees)
          .set({
            ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
            ...(dto.jobTitle !== undefined ? { jobTitle: dto.jobTitle } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
            updatedAt: new Date(),
          })
          .where(eq(employees.id, id));
      }

      if (targetRoles) {
        await tx.delete(employeeRoles).where(eq(employeeRoles.employeeId, id));
        await tx.insert(employeeRoles).values(
          targetRoles.map((r) => ({
            employeeId: id,
            roleId: r.id,
          })),
        );
        await tx
          .update(users)
          .set({ tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
          .where(eq(users.id, before.userId));
      }

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: 'employee',
          action: 'employee.updated',
          entityType: 'employee',
          entityId: id,
          summary: `Updated employee ${before.employeeCode}`,
          beforeJson: before,
          afterJson: dto,
          meta,
        },
        tx,
      );
    });

    await this.authStateService.invalidateUser(before.userId);
    return this.getById(id);
  }
}
