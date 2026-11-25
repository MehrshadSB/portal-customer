import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PERMISSIONS, type AppSurface } from '@portal/types';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { config } from 'dotenv';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import Redis from 'ioredis';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import request from 'supertest';
import * as schema from '../../src/infrastructure/database/schema';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '../../.env') });

export const TEST_PASSWORD = 'TestPassword123!';

export interface TestContext {
  app: INestApplication;
  pool: Pool;
  db: ReturnType<typeof drizzle<typeof schema>>;
  redis: Redis;
  ids: {
    customerAId: string;
    customerBId: string;
    contactBId: string;
    deptProdId: string;
    supportRoleId: string;
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

export async function createIntegrationTestContext(): Promise<TestContext> {
  const testDbUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://portal:portal_dev_password@localhost:5433/portal_test';
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6380';

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = testDbUrl;
  process.env.REDIS_URL = redisUrl;

  const pool = new Pool({ connectionString: testDbUrl });
  const db = drizzle(pool, { schema });
  const redis = new Redis(redisUrl);

  await migrate(db, {
    migrationsFolder: resolve(__dirname, '../../src/infrastructure/database/migrations'),
  });

  // Reset database & Redis test state cleanly
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
      auth_tokens,
      users
    RESTART IDENTITY CASCADE
  `);
  await redis.flushdb();

  // Seed permissions & roles
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
      slug: 'support_agent',
      name: 'Support Agent',
      scope: 'employee' as const,
      perms: [PERMISSIONS.CUSTOMER_READ_ALL, PERMISSIONS.TICKET_READ_ALL],
    },
    {
      slug: 'customer_admin',
      name: 'Customer Admin',
      scope: 'customer' as const,
      perms: [
        PERMISSIONS.CUSTOMER_READ_OWN,
        PERMISSIONS.CUSTOMER_UPDATE_OWN,
        PERMISSIONS.CUSTOMER_MEMBER_MANAGE_OWN,
        PERMISSIONS.CONTACT_MANAGE_OWN,
      ],
    },
    {
      slug: 'customer_member',
      name: 'Customer Member',
      scope: 'customer' as const,
      perms: [PERMISSIONS.CUSTOMER_READ_OWN],
    },
    {
      slug: 'customer_viewer',
      name: 'Customer Viewer',
      scope: 'customer' as const,
      perms: [PERMISSIONS.CUSTOMER_READ_OWN],
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

  const passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 16384,
    timeCost: 2,
    parallelism: 1,
  });

  const [adminUser] = await db
    .insert(schema.users)
    .values({
      email: 'admin@test.local',
      passwordHash,
      fullName: 'Test Admin',
      userType: 'employee',
      status: 'active',
    })
    .returning();

  const [supportUser] = await db
    .insert(schema.users)
    .values({
      email: 'support@test.local',
      passwordHash,
      fullName: 'Test Support',
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

  await db.insert(schema.employeeRoles).values([
    { employeeId: adminEmp!.id, roleId: roleIdBySlug.get('admin')! },
    { employeeId: supportEmp!.id, roleId: roleIdBySlug.get('support_agent')! },
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
      passwordHash,
      fullName: 'Apex Admin',
      userType: 'customer',
      status: 'active',
    })
    .returning();

  const [custAViewerUser] = await db
    .insert(schema.users)
    .values({
      email: 'viewer@apex.test',
      passwordHash,
      fullName: 'Apex Viewer',
      userType: 'customer',
      status: 'active',
    })
    .returning();

  const [custBAdminUser] = await db
    .insert(schema.users)
    .values({
      email: 'admin@orion.test',
      passwordHash,
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
  await db.execute(sql`SELECT setval('employee_code_seq', 2)`);

  const { AppModule } = await import('../../src/app.module');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  await app.init();

  return {
    app,
    pool,
    db,
    redis,
    ids: {
      customerAId: customerA!.id,
      customerBId: customerB!.id,
      contactBId: contactB!.id,
      deptProdId: deptProd!.id,
      supportRoleId: roleIdBySlug.get('support_agent')!,
    },
  };
}

export async function loginAs(
  app: INestApplication,
  surface: AppSurface,
  email: string,
  password = TEST_PASSWORD,
): Promise<CookieSession> {
  const res = await request(app.getHttpServer())
    .post(`/api/v1/auth/${surface}/login`)
    .set('X-App-Surface', surface)
    .send({ email, password })
    .expect(200);

  return extractSessionCookies(res, surface);
}

export async function teardownIntegrationTestContext(ctx: TestContext): Promise<void> {
  await ctx.app.close();
  await ctx.redis.quit();
  await ctx.pool.end();
}
