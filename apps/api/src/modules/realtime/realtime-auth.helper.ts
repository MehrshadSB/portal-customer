import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PERMISSIONS, type AppSurface } from '@portal/types';
import { and, eq, isNull } from 'drizzle-orm';
import type { Namespace, Socket } from 'socket.io';
import type { AccessJwtPayload } from '../../common/guards/jwt-auth.guard';
import { type AuthenticatedActor, expectedUserTypeForSurface } from '../../common/types/auth-context';
import type { AppEnv } from '../../infrastructure/config/env.schema';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import { conversations, orders } from '../../infrastructure/database/schema';
import { AuthStateService } from '../auth/auth-state.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

@Injectable()
export class RealtimeAuthHelper {
  private readonly jwtSecret: string;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    private readonly jwtService: JwtService,
    private readonly authStateService: AuthStateService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.jwtSecret = config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  attachAuthMiddleware(namespace: Namespace, surface: AppSurface): void {
    namespace.use(async (socket, next) => {
      try {
        const cookies = parseCookieHeader(socket.handshake.headers.cookie);
        const token = cookies[`${surface}_access_token`];
        if (!token) {
          return next(new Error('AUTH_REQUIRED'));
        }

        const payload = await this.jwtService.verifyAsync<AccessJwtPayload>(token, {
          secret: this.jwtSecret,
        });
        if (payload.aud !== surface || payload.userType !== expectedUserTypeForSurface(surface)) {
          return next(new Error('SURFACE_TOKEN_MISMATCH'));
        }

        const actor = await this.authStateService.getActiveActor(payload.sub, surface);
        if (!actor || actor.status !== 'active' || actor.tokenVersion !== payload.tokenVersion) {
          return next(new Error('SESSION_REVOKED'));
        }

        socket.data.actor = actor;
        return next();
      } catch {
        return next(new Error('TOKEN_INVALID'));
      }
    });
  }

  onConnected(socket: Socket): void {
    const actor = socket.data.actor as AuthenticatedActor | undefined;
    if (!actor) return;
    void socket.join(`user:${actor.id}`);
    if (actor.userType === 'customer' && actor.customerId) {
      void socket.join(`customer:${actor.customerId}`);
    } else if (actor.userType === 'employee') {
      void socket.join('admin:ops');
    }
  }

  async joinConversation(socket: Socket, conversationId: string): Promise<{ ok: boolean; error?: string }> {
    const actor = socket.data.actor as AuthenticatedActor | undefined;
    if (!actor || !UUID_REGEX.test(conversationId)) {
      return { ok: false, error: 'INVALID_CONVERSATION' };
    }

    const [conv] = await this.db
      .select({
        id: conversations.id,
        customerId: conversations.customerId,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    if (!conv) {
      return { ok: false, error: 'CONVERSATION_NOT_FOUND' };
    }

    if (actor.userType === 'customer') {
      if (conv.customerId !== actor.customerId) {
        return { ok: false, error: 'TENANT_ISOLATION_VIOLATION' };
      }
      // Customers NEVER join conv:{id}:internal
      await socket.join(`conv:${conversationId}:public`);
      return { ok: true };
    }

    await socket.join(`conv:${conversationId}:public`);
    if (actor.permissions.includes(PERMISSIONS.MESSAGE_READ_INTERNAL)) {
      await socket.join(`conv:${conversationId}:internal`);
    }
    return { ok: true };
  }

  async leaveConversation(socket: Socket, conversationId: string): Promise<{ ok: boolean }> {
    await socket.leave(`conv:${conversationId}:public`);
    await socket.leave(`conv:${conversationId}:internal`);
    return { ok: true };
  }

  async joinOrder(socket: Socket, orderId: string): Promise<{ ok: boolean; error?: string }> {
    const actor = socket.data.actor as AuthenticatedActor | undefined;
    if (!actor || !UUID_REGEX.test(orderId)) {
      return { ok: false, error: 'INVALID_ORDER' };
    }

    const [order] = await this.db
      .select({
        id: orders.id,
        customerId: orders.customerId,
        assignedDepartmentId: orders.assignedDepartmentId,
        assignedEmployeeId: orders.assignedEmployeeId,
      })
      .from(orders)
      .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)));

    if (!order) {
      return { ok: false, error: 'ORDER_NOT_FOUND' };
    }

    if (actor.userType === 'customer') {
      if (order.customerId !== actor.customerId) {
        return { ok: false, error: 'TENANT_ISOLATION_VIOLATION' };
      }
      await socket.join(`order:${orderId}:public`);
      return { ok: true };
    }

    const canReadAll = actor.permissions.includes(PERMISSIONS.ORDER_READ_ALL);
    if (
      !canReadAll &&
      order.assignedDepartmentId !== actor.departmentId &&
      order.assignedEmployeeId !== actor.employeeId
    ) {
      return { ok: false, error: 'PERMISSION_DENIED' };
    }

    await socket.join(`order:${orderId}:internal`);
    return { ok: true };
  }

  async leaveOrder(socket: Socket, orderId: string): Promise<{ ok: boolean }> {
    await socket.leave(`order:${orderId}:public`);
    await socket.leave(`order:${orderId}:internal`);
    return { ok: true };
  }
}
