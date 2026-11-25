import { PERMISSIONS } from '@portal/types';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createIntegrationTestContext,
  loginAs,
  teardownIntegrationTestContext,
  type TestContext,
} from './helpers/test-app';

describe('Tenant Isolation, RBAC & Audit Trail (Integration)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createIntegrationTestContext();
  });

  afterAll(async () => {
    if (ctx) await teardownIntegrationTestContext(ctx);
  });

  it('blocks Customer A from reading or mutating Customer B members or contacts', async () => {
    const custASession = await loginAs(ctx.app, 'portal', 'admin@apex.test');

    // Cross-tenant GET members -> 403
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/customers/${ctx.ids.customerBId}/members`)
      .set('X-App-Surface', 'portal')
      .set('Cookie', custASession.cookieHeader)
      .expect(403);

    // Cross-tenant POST invite -> 403
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/customers/${ctx.ids.customerBId}/members/invite`)
      .set('X-App-Surface', 'portal')
      .set('Cookie', custASession.cookieHeader)
      .set('X-CSRF-Token', custASession.csrfToken)
      .send({
        email: 'intruder@orion.test',
        fullName: 'Intruder',
        roleSlug: 'customer_admin',
      })
      .expect(403);

    // Cross-tenant GET contacts -> 403
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/customers/${ctx.ids.customerBId}/contacts`)
      .set('X-App-Surface', 'portal')
      .set('Cookie', custASession.cookieHeader)
      .expect(403);

    // Cross-tenant contact UUID targeted via my-company -> 404 (not deleted!)
    await request(ctx.app.getHttpServer())
      .delete(`/api/v1/customers/my-company/contacts/${ctx.ids.contactBId}`)
      .set('X-App-Surface', 'portal')
      .set('Cookie', custASession.cookieHeader)
      .set('X-CSRF-Token', custASession.csrfToken)
      .expect(404);
  });

  it('strips internalNotes from customer responses and enforces viewer read-only limits', async () => {
    const custASession = await loginAs(ctx.app, 'portal', 'admin@apex.test');
    const viewerSession = await loginAs(ctx.app, 'portal', 'viewer@apex.test');

    const myCompanyRes = await request(ctx.app.getHttpServer())
      .get('/api/v1/customers/my-company')
      .set('X-App-Surface', 'portal')
      .set('Cookie', custASession.cookieHeader)
      .expect(200);

    expect(myCompanyRes.body.data.companyName).toBe('Apex Aerospace');
    expect(myCompanyRes.body.data.internalNotes).toBeUndefined();

    // Viewer can read own company
    await request(ctx.app.getHttpServer())
      .get('/api/v1/customers/my-company')
      .set('X-App-Surface', 'portal')
      .set('Cookie', viewerSession.cookieHeader)
      .expect(200);

    // Viewer cannot add contacts or invite colleagues
    await request(ctx.app.getHttpServer())
      .post('/api/v1/customers/my-company/contacts')
      .set('X-App-Surface', 'portal')
      .set('Cookie', viewerSession.cookieHeader)
      .set('X-CSRF-Token', viewerSession.csrfToken)
      .send({ fullName: 'Unauthorized Contact' })
      .expect(403);
  });

  it('enforces module/action RBAC across employee roles and records audit logs', async () => {
    const supportSession = await loginAs(ctx.app, 'admin', 'support@test.local');
    const adminSession = await loginAs(ctx.app, 'admin', 'admin@test.local');

    // Support agent lacks employee/department/rbac/audit permissions
    await request(ctx.app.getHttpServer())
      .post('/api/v1/employees/invite')
      .set('X-App-Surface', 'admin')
      .set('Cookie', supportSession.cookieHeader)
      .set('X-CSRF-Token', supportSession.csrfToken)
      .send({
        email: 'unauth@test.local',
        fullName: 'Nope',
        roleSlugs: ['support_agent'],
      })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('X-App-Surface', 'admin')
      .set('Cookie', supportSession.cookieHeader)
      .expect(403);

    // Admin creates customer, invites employee, and updates support role permissions
    const custRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/customers')
      .set('X-App-Surface', 'admin')
      .set('Cookie', adminSession.cookieHeader)
      .set('X-CSRF-Token', adminSession.csrfToken)
      .send({ companyName: 'Titan Precision Co', industry: 'CNC Machining' })
      .expect(201);

    expect(custRes.body.data.customerCode).toBe('CUS-0003');

    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/roles/${ctx.ids.supportRoleId}/permissions`)
      .set('X-App-Surface', 'admin')
      .set('Cookie', adminSession.cookieHeader)
      .set('X-CSRF-Token', adminSession.csrfToken)
      .send({
        permissionKeys: [
          PERMISSIONS.CUSTOMER_READ_ALL,
          PERMISSIONS.TICKET_READ_ALL,
          PERMISSIONS.TICKET_UPDATE,
        ],
      })
      .expect(200);

    // Audit log reflects admin actions
    const auditRes = await request(ctx.app.getHttpServer())
      .get('/api/v1/audit-logs?limit=20')
      .set('X-App-Surface', 'admin')
      .set('Cookie', adminSession.cookieHeader)
      .expect(200);

    const actions = (auditRes.body.data as Array<{ action: string }>).map((a) => a.action);
    expect(actions).toContain('customer.created');
    expect(actions).toContain('role.permissions_updated');
  });

  it('enforces localization setup permissions, public read defaults, and user locale updates', async () => {
    const publicRes = await request(ctx.app.getHttpServer())
      .get('/api/v1/settings/localization')
      .expect(200);

    expect(publicRes.body.data.defaultLocale).toBe('fa');
    expect(publicRes.body.data.calendarType).toBe('jalali');
    expect(publicRes.body.data.enabledLocales).toEqual(['fa', 'en']);

    const supportSession = await loginAs(ctx.app, 'admin', 'support@test.local');
    const adminSession = await loginAs(ctx.app, 'admin', 'admin@test.local');

    // Support agent lacks system_settings:manage permission -> 403
    await request(ctx.app.getHttpServer())
      .patch('/api/v1/settings/localization')
      .set('X-App-Surface', 'admin')
      .set('Cookie', supportSession.cookieHeader)
      .set('X-CSRF-Token', supportSession.csrfToken)
      .send({
        defaultLocale: 'en',
        enabledLocales: ['fa', 'en'],
        calendarType: 'gregorian',
        brandNameFa: 'آذرپارت صنعت',
        brandNameEn: 'AzarPart Mfg',
      })
      .expect(403);

    // Admin updates platform localization settings -> 200 & audited
    const updateRes = await request(ctx.app.getHttpServer())
      .patch('/api/v1/settings/localization')
      .set('X-App-Surface', 'admin')
      .set('Cookie', adminSession.cookieHeader)
      .set('X-CSRF-Token', adminSession.csrfToken)
      .send({
        defaultLocale: 'en',
        enabledLocales: ['fa', 'en'],
        calendarType: 'gregorian',
        brandNameFa: 'آذرپارت صنعت نوین',
        brandNameEn: 'AzarPart Mfg Co',
      })
      .expect(200);

    expect(updateRes.body.data.defaultLocale).toBe('en');
    expect(updateRes.body.data.calendarType).toBe('gregorian');
    expect(updateRes.body.data.brandNameEn).toBe('AzarPart Mfg Co');

    const verifyPublicRes = await request(ctx.app.getHttpServer())
      .get('/api/v1/settings/localization')
      .expect(200);
    expect(verifyPublicRes.body.data.defaultLocale).toBe('en');

    const auditRes = await request(ctx.app.getHttpServer())
      .get('/api/v1/audit-logs?limit=20')
      .set('X-App-Surface', 'admin')
      .set('Cookie', adminSession.cookieHeader)
      .expect(200);
    const actions = (auditRes.body.data as Array<{ action: string }>).map((a) => a.action);
    expect(actions).toContain('settings.localization_updated');

    // User profile locale updates persist to session context
    const custSession = await loginAs(ctx.app, 'portal', 'admin@apex.test');
    const meBefore = await request(ctx.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('X-App-Surface', 'portal')
      .set('Cookie', custSession.cookieHeader)
      .expect(200);
    expect(meBefore.body.data.locale).toBe('fa');

    await request(ctx.app.getHttpServer())
      .patch('/api/v1/profile')
      .set('X-App-Surface', 'portal')
      .set('Cookie', custSession.cookieHeader)
      .set('X-CSRF-Token', custSession.csrfToken)
      .send({ locale: 'en' })
      .expect(200);

    const meAfter = await request(ctx.app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('X-App-Surface', 'portal')
      .set('Cookie', custSession.cookieHeader)
      .expect(200);
    expect(meAfter.body.data.locale).toBe('en');
  });
});
