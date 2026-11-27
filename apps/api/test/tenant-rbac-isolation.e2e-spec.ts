import { PERMISSIONS } from '@portal/types';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createIntegrationTestContext,
  loginAsOtp,
  teardownIntegrationTestContext,
  TEST_PHONES,
  type TestContext,
} from './helpers/test-app';

describe('Tenant Isolation, Admin Provisioning, RBAC & Audit Trail (Integration)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createIntegrationTestContext();
  });

  afterAll(async () => {
    if (ctx) await teardownIntegrationTestContext(ctx);
  });

  it('blocks Customer A from creating members or mutating Customer B contacts', async () => {
    const custASession = await loginAsOtp(ctx, 'portal', TEST_PHONES.custAAdmin);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/customers/${ctx.ids.customerBId}/members`)
      .set('X-App-Surface', 'portal')
      .set('Cookie', custASession.cookieHeader)
      .expect(403);

    // Portal users CANNOT create customer login profiles even for own company (admin only)
    await request(ctx.app.getHttpServer())
      .post('/api/v1/customers/my-company/members')
      .set('X-App-Surface', 'portal')
      .set('Cookie', custASession.cookieHeader)
      .set('X-CSRF-Token', custASession.csrfToken)
      .send({
        fullName: 'Self Added',
        phone: '+989125551122',
        roleSlug: 'customer_member',
      })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/customers/${ctx.ids.customerBId}/contacts`)
      .set('X-App-Surface', 'portal')
      .set('Cookie', custASession.cookieHeader)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .delete(`/api/v1/customers/my-company/contacts/${ctx.ids.contactBId}`)
      .set('X-App-Surface', 'portal')
      .set('Cookie', custASession.cookieHeader)
      .set('X-CSRF-Token', custASession.csrfToken)
      .expect(404);
  });

  it('allows Admin to provision an active customer profile who can immediately login via OTP', async () => {
    const adminSession = await loginAsOtp(ctx, 'admin', TEST_PHONES.admin);
    const newPhone = '+989127770011';

    // Before admin provisions profile, OTP request is rejected
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/portal/otp/request')
      .set('X-App-Surface', 'portal')
      .send({ phone: newPhone })
      .expect(403);

    // Admin provisions profile
    const createRes = await request(ctx.app.getHttpServer())
      .post(`/api/v1/customers/${ctx.ids.customerAId}/members`)
      .set('X-App-Surface', 'admin')
      .set('Cookie', adminSession.cookieHeader)
      .set('X-CSRF-Token', adminSession.csrfToken)
      .send({
        fullName: 'Provisioned Buyer',
        phone: newPhone,
        email: 'provisioned@apex.test',
        roleSlug: 'customer_member',
      })
      .expect(201);

    expect(createRes.body.data.userStatus).toBe('active');
    expect(createRes.body.data.phone).toBe(newPhone);

    // Customer can now request OTP & sign in on portal
    const session = await loginAsOtp(ctx, 'portal', newPhone);
    expect(session.cookies.portal_access_token).toBeDefined();
  });

  it('strips internalNotes from customer responses and enforces viewer read-only limits', async () => {
    const custASession = await loginAsOtp(ctx, 'portal', TEST_PHONES.custAAdmin);
    const viewerSession = await loginAsOtp(ctx, 'portal', TEST_PHONES.custAViewer);

    const myCompanyRes = await request(ctx.app.getHttpServer())
      .get('/api/v1/customers/my-company')
      .set('X-App-Surface', 'portal')
      .set('Cookie', custASession.cookieHeader)
      .expect(200);

    expect(myCompanyRes.body.data.companyName).toBe('Apex Aerospace');
    expect(myCompanyRes.body.data.internalNotes).toBeUndefined();

    await request(ctx.app.getHttpServer())
      .get('/api/v1/customers/my-company')
      .set('X-App-Surface', 'portal')
      .set('Cookie', viewerSession.cookieHeader)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post('/api/v1/customers/my-company/contacts')
      .set('X-App-Surface', 'portal')
      .set('Cookie', viewerSession.cookieHeader)
      .set('X-CSRF-Token', viewerSession.csrfToken)
      .send({ fullName: 'Unauthorized Contact' })
      .expect(403);
  });

  it('enforces module/action RBAC across employee roles and records audit logs', async () => {
    const supportSession = await loginAsOtp(ctx, 'admin', TEST_PHONES.support);
    const adminSession = await loginAsOtp(ctx, 'admin', TEST_PHONES.admin);

    await request(ctx.app.getHttpServer())
      .post('/api/v1/employees')
      .set('X-App-Surface', 'admin')
      .set('Cookie', supportSession.cookieHeader)
      .set('X-CSRF-Token', supportSession.csrfToken)
      .send({
        fullName: 'Nope',
        phone: '+989123334455',
        roleSlugs: ['support_agent'],
      })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('X-App-Surface', 'admin')
      .set('Cookie', supportSession.cookieHeader)
      .expect(403);

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

    const supportSession = await loginAsOtp(ctx, 'admin', TEST_PHONES.support);
    const adminSession = await loginAsOtp(ctx, 'admin', TEST_PHONES.admin);

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

    const custSession = await loginAsOtp(ctx, 'portal', TEST_PHONES.custAAdmin);
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
