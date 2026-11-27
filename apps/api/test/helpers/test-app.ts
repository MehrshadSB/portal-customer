import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PERMISSIONS, type AppSurface } from '@portal/types';
import cookieParser from 'cookie-parser';
import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import Redis from 'ioredis';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import request from 'supertest';
import * as schema from '../../src/infrastructure/database/schema';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '../../.env') });

export const TEST_PHONES = {
  admin: '+989120000001',
  support: '+989120000002',
  orderManager: '+989120000006',
  prodStaff: '+989120000007',
  custAAdmin: '+989120000003',
  custAViewer: '+989120000004',
  custBAdmin: '+989120000005',
} as const;

export interface TestContext {
  app: INestApplication;
  baseUrl: string;
  pool: Pool;
  db: ReturnType<typeof drizzle<typeof schema>>;
  redis: Redis;
  ids: {
    customerAId: string;
    customerBId: string;
    contactBId: string;
    deptProdId: string;
    deptEngId: string;
    supportRoleId: string;
    workflowId: string;
    stagesByCode: Record<string, string>;
    categorySpecId: string;
    adminUserId: string;
    custAAdminUserId: string;
    custBAdminUserId: string;
  };
}

export interface CookieSession {
  cookieHeader: string;
  csrfToken: string;
  cookies: Record<string, string>;
}

export function extractSessionCookies(
  res: request.Response,
  surface: AppSurface,
): CookieSession {
  const setCookie = res.headers['set-cookie'];
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookies: Record<string, string> = {};

  for (const entry of list) {
    const firstPart = entry.split(';')[0];
    if (!firstPart) continue;
    const eqIndex = firstPart.indexOf('=');
    if (eqIndex <= 0) continue;
    const name = firstPart.slice(0, eqIndex);
    const value = firstPart.slice(eqIndex + 1);
    cookies[name] = value;
  }

  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

  return {
    cookieHeader,
    csrfToken: cookies[`${surface}_csrf_token`] ?? '',
    cookies,
  };
}

export interface TestContextOverrides {
  oidc?: {
    enabled: boolean;
    issuerUrl?: string;
    clientId?: string;
    clientSecret?: string;
  };
}

export async function createIntegrationTestContext(
  overrides?: TestContextOverrides,
): Promise<TestContext> {
  const testDbUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://portal:portal_dev_password@localhost:5433/portal_test';
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6380';

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = testDbUrl;
  process.env.REDIS_URL = redisUrl;
  process.env.OIDC_ENABLED = overrides?.oidc?.enabled ? 'true' : 'false';
  process.env.OIDC_ISSUER_URL = overrides?.oidc?.issuerUrl ?? '';
  process.env.OIDC_CLIENT_ID = overrides?.oidc?.clientId ?? '';
  process.env.OIDC_CLIENT_SECRET = overrides?.oidc?.clientSecret ?? '';

  const pool = new Pool({ connectionString: testDbUrl });
  const db = drizzle(pool, { schema });
  const redis = new Redis(redisUrl);

  await migrate(db, {
    migrationsFolder: resolve(__dirname, '../../src/infrastructure/database/migrations'),
  });

  await db.execute(sql`
    TRUNCATE TABLE
      platform_settings,
      audit_logs,
      notifications,
      notification_preferences,
      attachments,
      messages,
      conversation_participants,
      conversations,
      tickets,
      ticket_categories,
      order_progress_events,
      order_items,
      orders,
      order_workflow_transitions,
      order_workflow_statuses,
      order_workflows,
      contacts,
      customer_members,
      customers,
      employee_roles,
      employees,
      departments,
      role_permissions,
      permissions,
      roles,
      user_identities,
      users
    RESTART IDENTITY CASCADE
  `);
  await redis.flushdb();

  const permRows = Object.values(PERMISSIONS).map((key) => {
    const parts = key.split(':');
    return {
      key,
      resource: parts[0] ?? 'system',
      action: parts.slice(1).join(':') || 'read',
      description: key,
    };
  });
  await db.insert(schema.permissions).values(permRows);
  const allPerms = await db.select().from(schema.permissions);
  const permByKey = new Map(allPerms.map((p) => [p.key, p.id]));

  const roleDefs = [
    { slug: 'admin', name: 'Admin', scope: 'employee' as const, perms: Object.values(PERMISSIONS) },
    {
      slug: 'order_manager',
      name: 'Order Manager',
      scope: 'employee' as const,
      perms: [
        PERMISSIONS.CUSTOMER_READ_ALL,
        PERMISSIONS.ORDER_READ_ALL,
        PERMISSIONS.ORDER_CREATE,
        PERMISSIONS.ORDER_UPDATE,
        PERMISSIONS.ORDER_ASSIGN,
        PERMISSIONS.ORDER_ADVANCE_ALL,
        PERMISSIONS.ORDER_INTERNAL_NOTE,
        PERMISSIONS.WORKFLOW_CONFIGURE,
        PERMISSIONS.MESSAGE_READ_PUBLIC,
        PERMISSIONS.MESSAGE_READ_INTERNAL,
        PERMISSIONS.MESSAGE_SEND_PUBLIC,
        PERMISSIONS.MESSAGE_SEND_INTERNAL,
        PERMISSIONS.DOCUMENT_READ_PUBLIC,
        PERMISSIONS.DOCUMENT_READ_INTERNAL,
        PERMISSIONS.DOCUMENT_UPLOAD,
      ],
    },
    {
      slug: 'production_staff',
      name: 'Production Staff',
      scope: 'employee' as const,
      perms: [
        PERMISSIONS.CUSTOMER_READ_ASSIGNED,
        PERMISSIONS.ORDER_READ_DEPARTMENT,
        PERMISSIONS.ORDER_ADVANCE_ASSIGNED,
        PERMISSIONS.ORDER_INTERNAL_NOTE,
        PERMISSIONS.TICKET_READ_DEPARTMENT,
        PERMISSIONS.MESSAGE_READ_PUBLIC,
        PERMISSIONS.MESSAGE_READ_INTERNAL,
        PERMISSIONS.MESSAGE_SEND_PUBLIC,
        PERMISSIONS.MESSAGE_SEND_INTERNAL,
        PERMISSIONS.DOCUMENT_READ_PUBLIC,
        PERMISSIONS.DOCUMENT_READ_INTERNAL,
        PERMISSIONS.DOCUMENT_UPLOAD,
      ],
    },
    {
      slug: 'support_agent',
      name: 'Support Agent',
      scope: 'employee' as const,
      perms: [
        PERMISSIONS.CUSTOMER_READ_ALL,
        PERMISSIONS.ORDER_READ_ALL,
        PERMISSIONS.TICKET_READ_ALL,
        PERMISSIONS.TICKET_CREATE_ALL,
        PERMISSIONS.TICKET_UPDATE,
        PERMISSIONS.TICKET_ASSIGN,
        PERMISSIONS.TICKET_REOPEN,
        PERMISSIONS.MESSAGE_READ_PUBLIC,
        PERMISSIONS.MESSAGE_READ_INTERNAL,
        PERMISSIONS.MESSAGE_SEND_PUBLIC,
        PERMISSIONS.MESSAGE_SEND_INTERNAL,
        PERMISSIONS.DOCUMENT_READ_PUBLIC,
        PERMISSIONS.DOCUMENT_READ_INTERNAL,
        PERMISSIONS.DOCUMENT_UPLOAD,
      ],
    },
    {
      slug: 'customer_admin',
      name: 'Customer Admin',
      scope: 'customer' as const,
      perms: [
        PERMISSIONS.CUSTOMER_READ_OWN,
        PERMISSIONS.CUSTOMER_UPDATE_OWN,
        PERMISSIONS.CONTACT_MANAGE_OWN,
        PERMISSIONS.ORDER_READ_COMPANY,
        PERMISSIONS.TICKET_READ_COMPANY,
        PERMISSIONS.TICKET_CREATE_COMPANY,
        PERMISSIONS.TICKET_REOPEN,
        PERMISSIONS.MESSAGE_READ_PUBLIC,
        PERMISSIONS.MESSAGE_SEND_PUBLIC,
        PERMISSIONS.DOCUMENT_READ_PUBLIC,
        PERMISSIONS.DOCUMENT_UPLOAD,
        PERMISSIONS.DOCUMENT_DELETE_OWN,
      ],
    },
    {
      slug: 'customer_member',
      name: 'Customer Member',
      scope: 'customer' as const,
      perms: [
        PERMISSIONS.CUSTOMER_READ_OWN,
        PERMISSIONS.ORDER_READ_COMPANY,
        PERMISSIONS.TICKET_READ_COMPANY,
        PERMISSIONS.TICKET_CREATE_COMPANY,
        PERMISSIONS.TICKET_REOPEN,
        PERMISSIONS.MESSAGE_READ_PUBLIC,
        PERMISSIONS.MESSAGE_SEND_PUBLIC,
        PERMISSIONS.DOCUMENT_READ_PUBLIC,
        PERMISSIONS.DOCUMENT_UPLOAD,
      ],
    },
    {
      slug: 'customer_viewer',
      name: 'Customer Viewer',
      scope: 'customer' as const,
      perms: [
        PERMISSIONS.CUSTOMER_READ_OWN,
        PERMISSIONS.ORDER_READ_COMPANY,
        PERMISSIONS.TICKET_READ_COMPANY,
        PERMISSIONS.MESSAGE_READ_PUBLIC,
        PERMISSIONS.DOCUMENT_READ_PUBLIC,
      ],
    },
  ];

  const roleIdBySlug = new Map<string, string>();
  for (const def of roleDefs) {
    const [role] = await db
      .insert(schema.roles)
      .values({ slug: def.slug, name: def.name, scope: def.scope, isSystem: true })
      .returning();
    if (!role) throw new Error('Role insert failed');
    roleIdBySlug.set(def.slug, role.id);
    const mappings = def.perms
      .map((k) => permByKey.get(k))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({ roleId: role.id, permissionId }));
    if (mappings.length > 0) {
      await db.insert(schema.rolePermissions).values(mappings);
    }
  }

  const [deptProd] = await db
    .insert(schema.departments)
    .values({ code: 'PROD', name: 'Production' })
    .returning();
  const [deptEng] = await db
    .insert(schema.departments)
    .values({ code: 'ENG', name: 'Engineering' })
    .returning();

  const [wf] = await db
    .insert(schema.orderWorkflows)
    .values({ name: 'Standard Custom Manufacturing', isDefault: true, isActive: true })
    .returning();

  const stageDefs = [
    {
      workflowId: wf!.id,
      code: 'order_received',
      name: 'Order Received',
      customerLabel: 'Order Received',
      colorToken: 'slate' as const,
      sortOrder: 1,
      isCustomerVisible: true,
      isTerminal: false,
      defaultDepartmentId: deptProd!.id,
    },
    {
      workflowId: wf!.id,
      code: 'technical_review',
      name: 'Technical Review',
      customerLabel: 'Engineering Review',
      colorToken: 'amber' as const,
      sortOrder: 2,
      isCustomerVisible: false,
      isTerminal: false,
      defaultDepartmentId: deptEng!.id,
    },
    {
      workflowId: wf!.id,
      code: 'approved',
      name: 'Approved',
      customerLabel: 'Approved for Production',
      colorToken: 'cobalt' as const,
      sortOrder: 3,
      isCustomerVisible: true,
      isTerminal: false,
      defaultDepartmentId: deptProd!.id,
    },
    {
      workflowId: wf!.id,
      code: 'in_production',
      name: 'In Production',
      customerLabel: 'In Production',
      colorToken: 'cobalt' as const,
      sortOrder: 4,
      isCustomerVisible: true,
      isTerminal: false,
      defaultDepartmentId: deptProd!.id,
    },
    {
      workflowId: wf!.id,
      code: 'delivered',
      name: 'Delivered',
      customerLabel: 'Delivered',
      colorToken: 'emerald' as const,
      sortOrder: 5,
      isCustomerVisible: true,
      isTerminal: true,
      defaultDepartmentId: deptProd!.id,
    },
  ];
  const insertedStages = await db
    .insert(schema.orderWorkflowStatuses)
    .values(stageDefs)
    .returning();
  const stagesByCode: Record<string, string> = {};
  for (const st of insertedStages) {
    stagesByCode[st.code] = st.id;
  }

  await db.insert(schema.orderWorkflowTransitions).values([
    {
      workflowId: wf!.id,
      fromStatusId: stagesByCode['order_received']!,
      toStatusId: stagesByCode['technical_review']!,
    },
    {
      workflowId: wf!.id,
      fromStatusId: stagesByCode['order_received']!,
      toStatusId: stagesByCode['approved']!,
    },
    {
      workflowId: wf!.id,
      fromStatusId: stagesByCode['technical_review']!,
      toStatusId: stagesByCode['approved']!,
    },
    {
      workflowId: wf!.id,
      fromStatusId: stagesByCode['approved']!,
      toStatusId: stagesByCode['in_production']!,
    },
    {
      workflowId: wf!.id,
      fromStatusId: stagesByCode['in_production']!,
      toStatusId: stagesByCode['delivered']!,
    },
  ]);

  const [catSpec] = await db
    .insert(schema.ticketCategories)
    .values({
      slug: 'spec_change',
      name: 'Spec Revision',
      defaultDepartmentId: deptEng!.id,
      sortOrder: 1,
    })
    .returning();

  const [adminUser] = await db
    .insert(schema.users)
    .values({
      email: 'admin@test.local',
      phone: TEST_PHONES.admin,
      fullName: 'Test Admin',
      userType: 'employee',
      status: 'active',
    })
    .returning();

  const [supportUser] = await db
    .insert(schema.users)
    .values({
      email: 'support@test.local',
      phone: TEST_PHONES.support,
      fullName: 'Test Support',
      userType: 'employee',
      status: 'active',
    })
    .returning();

  const [orderMgrUser] = await db
    .insert(schema.users)
    .values({
      email: 'orders@test.local',
      phone: TEST_PHONES.orderManager,
      fullName: 'Test Order Mgr',
      userType: 'employee',
      status: 'active',
    })
    .returning();

  const [prodUser] = await db
    .insert(schema.users)
    .values({
      email: 'prod@test.local',
      phone: TEST_PHONES.prodStaff,
      fullName: 'Test Production Staff',
      userType: 'employee',
      status: 'active',
    })
    .returning();

  const [adminEmp] = await db
    .insert(schema.employees)
    .values({ userId: adminUser!.id, employeeCode: 'EMP-0001', departmentId: deptProd!.id })
    .returning();
  const [supportEmp] = await db
    .insert(schema.employees)
    .values({ userId: supportUser!.id, employeeCode: 'EMP-0002', departmentId: deptProd!.id })
    .returning();
  const [orderMgrEmp] = await db
    .insert(schema.employees)
    .values({ userId: orderMgrUser!.id, employeeCode: 'EMP-0003', departmentId: deptProd!.id })
    .returning();
  const [prodEmp] = await db
    .insert(schema.employees)
    .values({ userId: prodUser!.id, employeeCode: 'EMP-0004', departmentId: deptProd!.id })
    .returning();

  await db.insert(schema.employeeRoles).values([
    { employeeId: adminEmp!.id, roleId: roleIdBySlug.get('admin')! },
    { employeeId: supportEmp!.id, roleId: roleIdBySlug.get('support_agent')! },
    { employeeId: orderMgrEmp!.id, roleId: roleIdBySlug.get('order_manager')! },
    { employeeId: prodEmp!.id, roleId: roleIdBySlug.get('production_staff')! },
  ]);

  const [customerA] = await db
    .insert(schema.customers)
    .values({
      customerCode: 'CUS-0001',
      companyName: 'Apex Aerospace',
      status: 'active',
      internalNotes: 'SECRET INTERNAL MARGIN NOTE',
    })
    .returning();
  const [customerB] = await db
    .insert(schema.customers)
    .values({
      customerCode: 'CUS-0002',
      companyName: 'Orion Robotics',
      status: 'active',
      internalNotes: 'ORION INTERNAL NOTE',
    })
    .returning();

  const [custAAdminUser] = await db
    .insert(schema.users)
    .values({
      email: 'admin@apex.test',
      phone: TEST_PHONES.custAAdmin,
      fullName: 'Apex Admin',
      userType: 'customer',
      status: 'active',
    })
    .returning();

  const [custAViewerUser] = await db
    .insert(schema.users)
    .values({
      email: 'viewer@apex.test',
      phone: TEST_PHONES.custAViewer,
      fullName: 'Apex Viewer',
      userType: 'customer',
      status: 'active',
    })
    .returning();

  const [custBAdminUser] = await db
    .insert(schema.users)
    .values({
      email: 'admin@orion.test',
      phone: TEST_PHONES.custBAdmin,
      fullName: 'Orion Admin',
      userType: 'customer',
      status: 'active',
    })
    .returning();

  await db.insert(schema.customerMembers).values([
    {
      customerId: customerA!.id,
      userId: custAAdminUser!.id,
      roleId: roleIdBySlug.get('customer_admin')!,
      isPrimary: true,
      joinedAt: new Date(),
    },
    {
      customerId: customerA!.id,
      userId: custAViewerUser!.id,
      roleId: roleIdBySlug.get('customer_viewer')!,
      joinedAt: new Date(),
    },
    {
      customerId: customerB!.id,
      userId: custBAdminUser!.id,
      roleId: roleIdBySlug.get('customer_admin')!,
      isPrimary: true,
      joinedAt: new Date(),
    },
  ]);

  const [contactB] = await db
    .insert(schema.contacts)
    .values({
      customerId: customerB!.id,
      fullName: 'Orion Private Contact',
      email: 'private@orion.test',
    })
    .returning();

  await db.execute(sql`SELECT setval('customer_code_seq', 2)`);
  await db.execute(sql`SELECT setval('employee_code_seq', 4)`);
  await db.execute(sql`SELECT setval('order_number_seq', 1, false)`);
  await db.execute(sql`SELECT setval('ticket_number_seq', 1, false)`);

  const { ConfigService } = await import('@nestjs/config');
  const { validateEnv } = await import('../../src/infrastructure/config/env.schema');
  const { AppModule } = await import('../../src/app.module');
  const freshConfig = new ConfigService(validateEnv(process.env));
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ConfigService)
    .useValue(freshConfig)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  await app.listen(0);

  const address = app.getHttpServer().address();
  const port = typeof address === 'object' && address ? address.port : 4000;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    app,
    baseUrl,
    pool,
    db,
    redis,
    ids: {
      customerAId: customerA!.id,
      customerBId: customerB!.id,
      contactBId: contactB!.id,
      deptProdId: deptProd!.id,
      deptEngId: deptEng!.id,
      supportRoleId: roleIdBySlug.get('support_agent')!,
      workflowId: wf!.id,
      stagesByCode,
      categorySpecId: catSpec!.id,
      adminUserId: adminUser!.id,
      custAAdminUserId: custAAdminUser!.id,
      custBAdminUserId: custBAdminUser!.id,
    },
  };
}

export async function loginAsOtp(
  ctx: TestContext,
  surface: AppSurface,
  phone: string,
): Promise<CookieSession> {
  await request(ctx.app.getHttpServer())
    .post(`/api/v1/auth/${surface}/otp/request`)
    .set('X-App-Surface', surface)
    .send({ phone })
    .expect(200);

  const code = await ctx.redis.get(`test:last_otp:${phone}`);
  if (!code) {
    throw new Error(`Expected test OTP in Redis for ${phone}`);
  }

  const res = await request(ctx.app.getHttpServer())
    .post(`/api/v1/auth/${surface}/otp/verify`)
    .set('X-App-Surface', surface)
    .send({ phone, code })
    .expect(200);

  return extractSessionCookies(res, surface);
}

export async function teardownIntegrationTestContext(ctx: TestContext): Promise<void> {
  await ctx.app.close();
  await ctx.redis.quit();
  await ctx.pool.end();
}
