import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ContactDto, CustomerDto, CustomerMemberDto, PaginationMeta } from '@portal/types';
import type {
  CreateContactInput,
  CreateCustomerInput,
  InviteCustomerMemberInput,
  ListCustomersQueryInput,
  UpdateContactInput,
  UpdateCustomerInput,
  UpdateCustomerMemberInput,
} from '@portal/validators';
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import {
  authTokens,
  contacts,
  customerMembers,
  customers,
  employees,
  orders,
  roles,
  users,
} from '../../infrastructure/database/schema';
import { MailService } from '../../infrastructure/mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { AuthStateService } from '../auth/auth-state.service';
import { generateOpaqueToken, hashToken } from '../auth/auth.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class CustomersService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    private readonly auditService: AuditService,
    private readonly authStateService: AuthStateService,
    private readonly mailService: MailService,
    private readonly settingsService: SettingsService,
  ) {}

  resolveTargetCustomerId(actor: AuthenticatedActor, requestedId: string): string {
    if (actor.userType === 'customer') {
      if (!actor.customerId) {
        throw new ForbiddenException({
          code: 'CUSTOMER_MEMBERSHIP_REQUIRED',
          message: 'Customer organization is required',
        });
      }
      if (requestedId !== 'my-company' && requestedId !== actor.customerId) {
        throw new ForbiddenException({
          code: 'TENANT_ISOLATION_VIOLATION',
          message: 'Access to another customer organization is prohibited',
        });
      }
      return actor.customerId;
    }

    if (requestedId === 'my-company') {
      throw new BadRequestException({
        code: 'INVALID_CUSTOMER_ID',
        message: 'Employee requests must specify a customer UUID',
      });
    }
    return requestedId;
  }

  private sanitizeForActor(row: CustomerDto, actor: AuthenticatedActor): CustomerDto {
    if (actor.userType === 'customer') {
      const { internalNotes: _omitted, ...publicView } = row;
      return publicView;
    }
    return row;
  }

  async list(
    query: ListCustomersQueryInput,
    actor: AuthenticatedActor,
  ): Promise<{ items: CustomerDto[]; meta: PaginationMeta }> {
    const conditions = [isNull(customers.deletedAt)];

    if (query.status) conditions.push(eq(customers.status, query.status));
    if (query.accountManagerId) conditions.push(eq(customers.accountManagerId, query.accountManagerId));
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        sql`(${customers.companyName} ILIKE ${pattern} OR ${customers.customerCode} ILIKE ${pattern} OR COALESCE(${customers.legalName}, '') ILIKE ${pattern})`,
      );
    }

    const canReadAll = actor.permissions.includes('customer:read:all');
    if (!canReadAll) {
      // Production staff / scoped employees see only customers they manage or whose orders are assigned to them/their dept
      conditions.push(
        sql`(${customers.accountManagerId} = ${actor.employeeId} OR EXISTS (
          SELECT 1 FROM ${orders} o
          WHERE o.customer_id = ${customers.id}
            AND o.deleted_at IS NULL
            AND (o.assigned_employee_id = ${actor.employeeId} OR o.assigned_department_id = ${actor.departmentId})
        ))`,
      );
    }

    const whereClause = and(...conditions);
    const offset = (query.page - 1) * query.limit;

    const [countRow] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(customers)
      .where(whereClause);
    const total = countRow?.total ?? 0;

    const rows = await this.db
      .select({
        id: customers.id,
        customerCode: customers.customerCode,
        companyName: customers.companyName,
        legalName: customers.legalName,
        taxId: customers.taxId,
        industry: customers.industry,
        website: customers.website,
        billingAddress: customers.billingAddress,
        shippingAddress: customers.shippingAddress,
        accountManagerId: customers.accountManagerId,
        accountManagerName: users.fullName,
        status: customers.status,
        internalNotes: customers.internalNotes,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
      })
      .from(customers)
      .leftJoin(employees, eq(customers.accountManagerId, employees.id))
      .leftJoin(users, eq(employees.userId, users.id))
      .where(whereClause)
      .orderBy(query.sortOrder === 'asc' ? asc(customers.companyName) : desc(customers.createdAt))
      .limit(query.limit)
      .offset(offset);

    return {
      items: rows.map((r) =>
        this.sanitizeForActor(
          {
            ...r,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          },
          actor,
        ),
      ),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async getById(id: string, actor: AuthenticatedActor): Promise<CustomerDto> {
    const targetId = this.resolveTargetCustomerId(actor, id);

    const [row] = await this.db
      .select({
        id: customers.id,
        customerCode: customers.customerCode,
        companyName: customers.companyName,
        legalName: customers.legalName,
        taxId: customers.taxId,
        industry: customers.industry,
        website: customers.website,
        billingAddress: customers.billingAddress,
        shippingAddress: customers.shippingAddress,
        accountManagerId: customers.accountManagerId,
        accountManagerName: users.fullName,
        status: customers.status,
        internalNotes: customers.internalNotes,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
      })
      .from(customers)
      .leftJoin(employees, eq(customers.accountManagerId, employees.id))
      .leftJoin(users, eq(employees.userId, users.id))
      .where(and(eq(customers.id, targetId), isNull(customers.deletedAt)));

    if (!row) {
      throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
    }

    if (actor.userType === 'employee' && !actor.permissions.includes('customer:read:all')) {
      const hasOrderAccess = await this.db
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.customerId, targetId),
            isNull(orders.deletedAt),
            or(
              eq(orders.assignedEmployeeId, actor.employeeId ?? ''),
              eq(orders.assignedDepartmentId, actor.departmentId ?? ''),
            ),
          ),
        )
        .limit(1);

      if (row.accountManagerId !== actor.employeeId && hasOrderAccess.length === 0) {
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: 'Customer is outside your assigned accounts or orders',
        });
      }
    }

    return this.sanitizeForActor(
      {
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
      actor,
    );
  }

  async create(
    dto: CreateCustomerInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<CustomerDto> {
    const createdId = await this.db.transaction(async (tx) => {
      const seqResult = await tx.execute<{ nextval: string }>(
        sql`SELECT nextval('customer_code_seq')::text AS nextval`,
      );
      const seqNum = Number(seqResult.rows[0]?.nextval ?? 1);
      const customerCode = `CUS-${String(seqNum).padStart(4, '0')}`;

      const [row] = await tx
        .insert(customers)
        .values({
          customerCode,
          companyName: dto.companyName,
          legalName: dto.legalName ?? null,
          taxId: dto.taxId ?? null,
          industry: dto.industry ?? null,
          website: dto.website || null,
          billingAddress: dto.billingAddress ?? null,
          shippingAddress: dto.shippingAddress ?? null,
          accountManagerId: dto.accountManagerId ?? null,
          status: dto.status,
          internalNotes: dto.internalNotes ?? null,
        })
        .returning();

      if (!row) throw new Error('Failed to create customer');

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: 'employee',
          customerId: row.id,
          action: 'customer.created',
          entityType: 'customer',
          entityId: row.id,
          summary: `Created customer ${row.companyName} (${customerCode})`,
          afterJson: row,
          meta,
        },
        tx,
      );

      return row.id;
    });

    return this.getById(createdId, actor);
  }

  async update(
    id: string,
    dto: UpdateCustomerInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<CustomerDto> {
    const targetId = this.resolveTargetCustomerId(actor, id);
    const before = await this.getById(targetId, actor);

    const safePayload: Partial<typeof customers.$inferInsert> =
      actor.userType === 'customer'
        ? {
            ...(dto.website !== undefined ? { website: dto.website || null } : {}),
            ...(dto.billingAddress !== undefined ? { billingAddress: dto.billingAddress } : {}),
            ...(dto.shippingAddress !== undefined ? { shippingAddress: dto.shippingAddress } : {}),
          }
        : {
            ...(dto.companyName !== undefined ? { companyName: dto.companyName } : {}),
            ...(dto.legalName !== undefined ? { legalName: dto.legalName } : {}),
            ...(dto.taxId !== undefined ? { taxId: dto.taxId } : {}),
            ...(dto.industry !== undefined ? { industry: dto.industry } : {}),
            ...(dto.website !== undefined ? { website: dto.website || null } : {}),
            ...(dto.billingAddress !== undefined ? { billingAddress: dto.billingAddress } : {}),
            ...(dto.shippingAddress !== undefined ? { shippingAddress: dto.shippingAddress } : {}),
            ...(dto.accountManagerId !== undefined
              ? { accountManagerId: dto.accountManagerId }
              : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
            ...(dto.internalNotes !== undefined ? { internalNotes: dto.internalNotes } : {}),
          };

    await this.db.transaction(async (tx) => {
      await tx
        .update(customers)
        .set({ ...safePayload, updatedAt: new Date() })
        .where(eq(customers.id, targetId));

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: actor.userType,
          customerId: targetId,
          action: 'customer.updated',
          entityType: 'customer',
          entityId: targetId,
          summary: `Updated customer profile ${before.customerCode}`,
          beforeJson: before,
          afterJson: safePayload,
          meta,
        },
        tx,
      );
    });

    return this.getById(targetId, actor);
  }

  async archive(id: string, actor: AuthenticatedActor, meta: RequestMetadata): Promise<void> {
    const before = await this.getById(id, actor);

    await this.db.transaction(async (tx) => {
      await tx
        .update(customers)
        .set({ status: 'archived', deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(customers.id, id));

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: 'employee',
          customerId: id,
          action: 'customer.archived',
          entityType: 'customer',
          entityId: id,
          summary: `Archived customer ${before.companyName} (${before.customerCode})`,
          beforeJson: { status: before.status },
          afterJson: { status: 'archived' },
          meta,
        },
        tx,
      );
    });

    const memberUsers = await this.db
      .select({ userId: customerMembers.userId })
      .from(customerMembers)
      .where(eq(customerMembers.customerId, id));
    await this.authStateService.invalidateUsers(memberUsers.map((m) => m.userId));
  }

  // ---- Business Contacts ----

  async listContacts(customerIdParam: string, actor: AuthenticatedActor): Promise<ContactDto[]> {
    const customerId = this.resolveTargetCustomerId(actor, customerIdParam);
    await this.getById(customerId, actor);

    const rows = await this.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.customerId, customerId), isNull(contacts.deletedAt)))
      .orderBy(desc(contacts.isPrimary), asc(contacts.fullName));

    return rows.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      fullName: r.fullName,
      email: r.email,
      phone: r.phone,
      jobTitle: r.jobTitle,
      departmentLabel: r.departmentLabel,
      isPrimary: r.isPrimary,
      notes: r.notes,
      linkedMemberId: r.linkedMemberId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async createContact(
    customerIdParam: string,
    dto: CreateContactInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<ContactDto> {
    const customerId = this.resolveTargetCustomerId(actor, customerIdParam);
    await this.getById(customerId, actor);

    const [created] = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(contacts)
        .values({
          customerId,
          fullName: dto.fullName,
          email: dto.email || null,
          phone: dto.phone ?? null,
          jobTitle: dto.jobTitle ?? null,
          departmentLabel: dto.departmentLabel ?? null,
          isPrimary: dto.isPrimary,
          notes: dto.notes ?? null,
        })
        .returning();

      if (row) {
        await this.auditService.record(
          {
            actorUserId: actor.id,
            actorType: actor.userType,
            customerId,
            action: 'contact.created',
            entityType: 'contact',
            entityId: row.id,
            summary: `Added contact ${row.fullName}`,
            afterJson: row,
            meta,
          },
          tx,
        );
      }
      return [row];
    });

    if (!created) throw new Error('Failed to create contact');
    return {
      ...created,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async updateContact(
    customerIdParam: string,
    contactId: string,
    dto: UpdateContactInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<ContactDto> {
    const customerId = this.resolveTargetCustomerId(actor, customerIdParam);
    const [existing] = await this.db
      .select()
      .from(contacts)
      .where(
        and(eq(contacts.id, contactId), eq(contacts.customerId, customerId), isNull(contacts.deletedAt)),
      );
    if (!existing) {
      throw new NotFoundException({ code: 'CONTACT_NOT_FOUND', message: 'Contact not found' });
    }

    const [updated] = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(contacts)
        .set({
          ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
          ...(dto.email !== undefined ? { email: dto.email || null } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.jobTitle !== undefined ? { jobTitle: dto.jobTitle } : {}),
          ...(dto.departmentLabel !== undefined ? { departmentLabel: dto.departmentLabel } : {}),
          ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(contacts.id, contactId), eq(contacts.customerId, customerId)))
        .returning();

      if (row) {
        await this.auditService.record(
          {
            actorUserId: actor.id,
            actorType: actor.userType,
            customerId,
            action: 'contact.updated',
            entityType: 'contact',
            entityId: contactId,
            summary: `Updated contact ${row.fullName}`,
            beforeJson: existing,
            afterJson: row,
            meta,
          },
          tx,
        );
      }
      return [row];
    });

    if (!updated) throw new NotFoundException({ code: 'CONTACT_NOT_FOUND', message: 'Contact not found' });
    return { ...updated, createdAt: updated.createdAt.toISOString() };
  }

  async deleteContact(
    customerIdParam: string,
    contactId: string,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<void> {
    const customerId = this.resolveTargetCustomerId(actor, customerIdParam);
    const [existing] = await this.db
      .select()
      .from(contacts)
      .where(
        and(eq(contacts.id, contactId), eq(contacts.customerId, customerId), isNull(contacts.deletedAt)),
      );
    if (!existing) {
      throw new NotFoundException({ code: 'CONTACT_NOT_FOUND', message: 'Contact not found' });
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(contacts)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(contacts.id, contactId), eq(contacts.customerId, customerId)));

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: actor.userType,
          customerId,
          action: 'contact.deleted',
          entityType: 'contact',
          entityId: contactId,
          summary: `Removed contact ${existing.fullName}`,
          beforeJson: existing,
          meta,
        },
        tx,
      );
    });
  }

  // ---- Customer Portal Members ----

  async listMembers(
    customerIdParam: string,
    actor: AuthenticatedActor,
  ): Promise<CustomerMemberDto[]> {
    const customerId = this.resolveTargetCustomerId(actor, customerIdParam);
    await this.getById(customerId, actor);

    const rows = await this.db
      .select({
        id: customerMembers.id,
        customerId: customerMembers.customerId,
        userId: customerMembers.userId,
        email: users.email,
        fullName: users.fullName,
        phone: users.phone,
        userStatus: users.status,
        roleId: roles.id,
        roleSlug: roles.slug,
        roleName: roles.name,
        jobTitle: customerMembers.jobTitle,
        isPrimary: customerMembers.isPrimary,
        joinedAt: customerMembers.joinedAt,
        lastLoginAt: users.lastLoginAt,
        createdAt: customerMembers.createdAt,
      })
      .from(customerMembers)
      .innerJoin(users, eq(customerMembers.userId, users.id))
      .innerJoin(roles, eq(customerMembers.roleId, roles.id))
      .where(and(eq(customerMembers.customerId, customerId), isNull(users.deletedAt)))
      .orderBy(desc(customerMembers.isPrimary), asc(users.fullName));

    return rows.map((r) => ({
      ...r,
      joinedAt: r.joinedAt ? r.joinedAt.toISOString() : null,
      lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async inviteMember(
    customerIdParam: string,
    dto: InviteCustomerMemberInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<CustomerMemberDto> {
    const customerId = this.resolveTargetCustomerId(actor, customerIdParam);
    const customer = await this.getById(customerId, actor);

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

    const [role] = await this.db
      .select()
      .from(roles)
      .where(and(eq(roles.slug, dto.roleSlug), eq(roles.scope, 'customer')));
    if (!role) {
      throw new BadRequestException({
        code: 'INVALID_CUSTOMER_ROLE',
        message: 'Customer role does not exist',
      });
    }

    const rawToken = generateOpaqueToken();
    const localization = await this.settingsService.getLocalization();

    const createdMemberId = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email: dto.email,
          fullName: dto.fullName,
          userType: 'customer',
          status: 'invited',
          locale: localization.defaultLocale,
        })
        .returning();
      if (!user) throw new Error('Failed to create user');

      const [member] = await tx
        .insert(customerMembers)
        .values({
          customerId,
          userId: user.id,
          roleId: role.id,
          jobTitle: dto.jobTitle ?? null,
          isPrimary: dto.isPrimary,
          invitedByUserId: actor.id,
        })
        .returning();
      if (!member) throw new Error('Failed to create customer member');

      await tx.insert(authTokens).values({
        userId: user.id,
        purpose: 'invite',
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: actor.userType,
          customerId,
          action: 'customer_member.invited',
          entityType: 'customer_member',
          entityId: member.id,
          summary: `Invited ${dto.fullName} (${dto.email}) as ${role.slug}`,
          afterJson: { email: dto.email, roleSlug: role.slug },
          meta,
        },
        tx,
      );

      return member.id;
    });

    await this.mailService.enqueueInvite({
      to: dto.email,
      fullName: dto.fullName,
      surface: 'portal',
      token: rawToken,
      companyName: customer.companyName,
      locale: localization.defaultLocale,
    });

    const list = await this.listMembers(customerId, actor);
    const created = list.find((m) => m.id === createdMemberId);
    if (!created) throw new Error('Invited member lookup failed');
    return created;
  }

  async updateMember(
    customerIdParam: string,
    memberId: string,
    dto: UpdateCustomerMemberInput,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<CustomerMemberDto> {
    const customerId = this.resolveTargetCustomerId(actor, customerIdParam);
    const currentList = await this.listMembers(customerId, actor);
    const target = currentList.find((m) => m.id === memberId);

    if (!target) {
      throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Member not found' });
    }

    if (target.userId === actor.id && (dto.status === 'suspended' || (dto.roleSlug && dto.roleSlug !== 'customer_admin'))) {
      throw new BadRequestException({
        code: 'SELF_MODIFICATION_FORBIDDEN',
        message: 'You cannot suspend yourself or remove your own customer admin role',
      });
    }

    let nextRoleId = target.roleId;
    if (dto.roleSlug) {
      const [role] = await this.db
        .select()
        .from(roles)
        .where(and(eq(roles.slug, dto.roleSlug), eq(roles.scope, 'customer')));
      if (!role) {
        throw new BadRequestException({
          code: 'INVALID_CUSTOMER_ROLE',
          message: 'Customer role is invalid',
        });
      }
      nextRoleId = role.id;
    }

    await this.db.transaction(async (tx) => {
      if (dto.roleSlug || dto.jobTitle !== undefined || dto.isPrimary !== undefined) {
        await tx
          .update(customerMembers)
          .set({
            roleId: nextRoleId,
            ...(dto.jobTitle !== undefined ? { jobTitle: dto.jobTitle } : {}),
            ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(customerMembers.id, memberId), eq(customerMembers.customerId, customerId)));
      }

      if (dto.status !== undefined || dto.roleSlug !== undefined) {
        await tx
          .update(users)
          .set({
            ...(dto.status !== undefined ? { status: dto.status } : {}),
            tokenVersion: sql`${users.tokenVersion} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, target.userId));
      }

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: actor.userType,
          customerId,
          action: 'customer_member.updated',
          entityType: 'customer_member',
          entityId: memberId,
          summary: `Updated member ${target.email}`,
          beforeJson: { roleSlug: target.roleSlug, status: target.userStatus },
          afterJson: dto,
          meta,
        },
        tx,
      );
    });

    await this.authStateService.invalidateUser(target.userId);
    const updatedList = await this.listMembers(customerId, actor);
    const updated = updatedList.find((m) => m.id === memberId);
    if (!updated) throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Member not found' });
    return updated;
  }
}
