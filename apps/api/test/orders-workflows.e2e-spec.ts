import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createIntegrationTestContext,
  loginAsOtp,
  teardownIntegrationTestContext,
  TEST_PHONES,
  type TestContext,
} from './helpers/test-app';

describe('Orders, Workflow Stages & Customer Visibility Projection (Integration)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createIntegrationTestContext();
  });

  afterAll(async () => {
    if (ctx) await teardownIntegrationTestContext(ctx);
  });

  it('creates orders, tracks stage transitions, hides internal-only stages/notes, and enforces tenant scope', async () => {
    const orderMgr = await loginAsOtp(ctx, 'admin', TEST_PHONES.orderManager);
    const custASession = await loginAsOtp(ctx, 'portal', TEST_PHONES.custAAdmin);
    const custBSession = await loginAsOtp(ctx, 'portal', TEST_PHONES.custBAdmin);

    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/orders')
      .set('X-App-Surface', 'admin')
      .set('Cookie', orderMgr.cookieHeader)
      .set('X-CSRF-Token', orderMgr.csrfToken)
      .send({
        customerId: ctx.ids.customerAId,
        title: 'Titanium Turbine Housing',
        poNumber: 'PO-9901',
        priority: 'high',
        internalNotes: 'INTERNAL MARGIN 42%',
        items: [
          {
            partNumber: 'TT-100',
            name: 'Turbine Housing',
            material: 'Ti-6Al-4V',
            quantity: 10,
            unit: 'pcs',
          },
        ],
      })
      .expect(201);

    const orderId = createRes.body.data.id as string;
    expect(createRes.body.data.orderNumber).toMatch(/^ORD-\d{4}-0001$/);
    expect(createRes.body.data.currentStageCode).toBe('order_received');

    // Invalid direct skip from order_received -> delivered must fail (400)
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/orders/${orderId}/progress`)
      .set('X-App-Surface', 'admin')
      .set('Cookie', orderMgr.cookieHeader)
      .set('X-CSRF-Token', orderMgr.csrfToken)
      .send({
        toStatusId: ctx.ids.stagesByCode['delivered'],
        isCustomerVisible: true,
      })
      .expect(400);

    // Advance to internal-only stage: technical_review
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/orders/${orderId}/progress`)
      .set('X-App-Surface', 'admin')
      .set('Cookie', orderMgr.cookieHeader)
      .set('X-CSRF-Token', orderMgr.csrfToken)
      .send({
        toStatusId: ctx.ids.stagesByCode['technical_review'],
        note: 'Internal CAD DFM check found thin wall',
        isCustomerVisible: false,
      })
      .expect(201);

    // Customer A must NOT see technical_review stage or internalNotes
    const custHiddenView = await request(ctx.app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set('X-App-Surface', 'portal')
      .set('Cookie', custASession.cookieHeader)
      .expect(200);

    expect(custHiddenView.body.data.internalNotes).toBeUndefined();
    expect(custHiddenView.body.data.currentStageCode).toBe('order_received');
    expect(custHiddenView.body.data.stages.some((s: { code: string }) => s.code === 'technical_review')).toBe(false);
    expect(custHiddenView.body.data.progressEvents).toHaveLength(1);

    // Advance to approved -> in_production (customer visible)
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/orders/${orderId}/progress`)
      .set('X-App-Surface', 'admin')
      .set('Cookie', orderMgr.cookieHeader)
      .set('X-CSRF-Token', orderMgr.csrfToken)
      .send({
        toStatusId: ctx.ids.stagesByCode['approved'],
        note: 'Approved for CNC cell',
        isCustomerVisible: true,
      })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/orders/${orderId}/progress`)
      .set('X-App-Surface', 'admin')
      .set('Cookie', orderMgr.cookieHeader)
      .set('X-CSRF-Token', orderMgr.csrfToken)
      .send({
        toStatusId: ctx.ids.stagesByCode['in_production'],
        note: 'Machining started on 5-axis mill',
        isCustomerVisible: true,
      })
      .expect(201);

    const custVisibleView = await request(ctx.app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set('X-App-Surface', 'portal')
      .set('Cookie', custASession.cookieHeader)
      .expect(200);

    expect(custVisibleView.body.data.currentStageCode).toBe('in_production');
    expect(custVisibleView.body.data.currentStageOrder).toBe(3);
    expect(custVisibleView.body.data.totalVisibleStages).toBe(4);
    expect(custVisibleView.body.data.progressEvents).toHaveLength(3);

    // Customer B cannot read Customer A's order
    await request(ctx.app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set('X-App-Surface', 'portal')
      .set('Cookie', custBSession.cookieHeader)
      .expect(403);
  });
});
