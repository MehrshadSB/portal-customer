import { REALTIME_EVENTS, REALTIME_NAMESPACES } from '@portal/types';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createIntegrationTestContext,
  loginAsOtp,
  teardownIntegrationTestContext,
  TEST_PHONES,
  type TestContext,
} from './helpers/test-app';

function connectSocket(
  baseUrl: string,
  namespace: string,
  cookieHeader: string,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`${baseUrl}${namespace}`, {
      forceNew: true,
      extraHeaders: { Cookie: cookieHeader },
      transports: ['websocket', 'polling'],
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => reject(err));
  });
}

describe('Tickets, Unified Conversations & Realtime Isolation (Integration)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createIntegrationTestContext();
  });

  afterAll(async () => {
    if (ctx) await teardownIntegrationTestContext(ctx);
  });

  it('prevents internal staff notes from leaking in REST or /realtime/portal sockets', async () => {
    const custA = await loginAsOtp(ctx, 'portal', TEST_PHONES.custAAdmin);
    const custB = await loginAsOtp(ctx, 'portal', TEST_PHONES.custBAdmin);
    const support = await loginAsOtp(ctx, 'admin', TEST_PHONES.support);

    const tkRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/tickets')
      .set('X-App-Surface', 'portal')
      .set('Cookie', custA.cookieHeader)
      .set('X-CSRF-Token', custA.csrfToken)
      .send({
        categoryId: ctx.ids.categorySpecId,
        subject: 'Tolerance check',
        description: 'Confirm bore tolerance on drawing Rev B.',
        priority: 'high',
      })
      .expect(201);

    const ticketId = tkRes.body.data.id as string;
    const convId = tkRes.body.data.conversationId as string;
    expect(convId).toBeTruthy();

    // Customer cannot send internal note -> 403
    await request(ctx.app.getHttpServer())
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('X-App-Surface', 'portal')
      .set('Cookie', custA.cookieHeader)
      .set('X-CSRF-Token', custA.csrfToken)
      .send({ body: 'Attempt internal', visibility: 'internal' })
      .expect(403);

    // Connect Portal & Admin Socket.IO clients
    const portalSocket = await connectSocket(
      ctx.baseUrl,
      REALTIME_NAMESPACES.PORTAL,
      custA.cookieHeader,
    );
    const adminSocket = await connectSocket(
      ctx.baseUrl,
      REALTIME_NAMESPACES.ADMIN,
      support.cookieHeader,
    );
    const custBSocket = await connectSocket(
      ctx.baseUrl,
      REALTIME_NAMESPACES.PORTAL,
      custB.cookieHeader,
    );

    try {
      const portalJoinAck = await portalSocket.emitWithAck(REALTIME_EVENTS.CONVERSATION_JOIN, {
        conversationId: convId,
      });
      expect(portalJoinAck.ok).toBe(true);

      const adminJoinAck = await adminSocket.emitWithAck(REALTIME_EVENTS.CONVERSATION_JOIN, {
        conversationId: convId,
      });
      expect(adminJoinAck.ok).toBe(true);

      // Cross-tenant room join must be rejected
      const custBJoinAck = await custBSocket.emitWithAck(REALTIME_EVENTS.CONVERSATION_JOIN, {
        conversationId: convId,
      });
      expect(custBJoinAck.ok).toBe(false);
      expect(custBJoinAck.error).toBe('TENANT_ISOLATION_VIOLATION');

      const portalEvents: Array<{ visibility: string; body: string }> = [];
      const adminEvents: Array<{ visibility: string; body: string }> = [];
      portalSocket.on(REALTIME_EVENTS.MESSAGE_CREATED, (p) => portalEvents.push(p));
      adminSocket.on(REALTIME_EVENTS.MESSAGE_CREATED, (p) => adminEvents.push(p));

      // Support posts INTERNAL note -> admin socket gets it, portal socket NEVER gets it
      await request(ctx.app.getHttpServer())
        .post(`/api/v1/conversations/${convId}/messages`)
        .set('X-App-Surface', 'admin')
        .set('Cookie', support.cookieHeader)
        .set('X-CSRF-Token', support.csrfToken)
        .send({ body: 'SECRET INTERNAL STAFF NOTE', visibility: 'internal' })
        .expect(201);

      // Support posts PUBLIC reply -> both sockets get it
      await request(ctx.app.getHttpServer())
        .post(`/api/v1/conversations/${convId}/messages`)
        .set('X-App-Surface', 'admin')
        .set('Cookie', support.cookieHeader)
        .set('X-CSRF-Token', support.csrfToken)
        .send({ body: 'Confirmed: tolerance is +/-0.015mm', visibility: 'public' })
        .expect(201);

      await new Promise((r) => setTimeout(r, 150));

      expect(adminEvents.some((e) => e.body === 'SECRET INTERNAL STAFF NOTE')).toBe(true);
      expect(portalEvents.some((e) => e.body === 'SECRET INTERNAL STAFF NOTE')).toBe(false);
      expect(portalEvents.some((e) => e.body === 'Confirmed: tolerance is +/-0.015mm')).toBe(true);

      // REST GET messages for Customer A omits internal note
      const custMsgsRes = await request(ctx.app.getHttpServer())
        .get(`/api/v1/conversations/${convId}/messages`)
        .set('X-App-Surface', 'portal')
        .set('Cookie', custA.cookieHeader)
        .expect(200);
      expect(
        (custMsgsRes.body.data as Array<{ visibility: string }>).every(
          (m) => m.visibility === 'public',
        ),
      ).toBe(true);

      // Admin resolves, then customer reopens
      await request(ctx.app.getHttpServer())
        .patch(`/api/v1/tickets/${ticketId}`)
        .set('X-App-Surface', 'admin')
        .set('Cookie', support.cookieHeader)
        .set('X-CSRF-Token', support.csrfToken)
        .send({ status: 'resolved' })
        .expect(200);

      const reopenRes = await request(ctx.app.getHttpServer())
        .post(`/api/v1/tickets/${ticketId}/reopen`)
        .set('X-App-Surface', 'portal')
        .set('Cookie', custA.cookieHeader)
        .set('X-CSRF-Token', custA.csrfToken)
        .send({ reason: 'Need Rev C check as well' })
        .expect(200);
      expect(reopenRes.body.data.status).toBe('open');
      expect(reopenRes.body.data.reopenedCount).toBe(1);
    } finally {
      portalSocket.disconnect();
      adminSocket.disconnect();
      custBSocket.disconnect();
    }
  });
});
