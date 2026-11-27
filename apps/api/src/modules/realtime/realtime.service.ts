import { Injectable } from '@nestjs/common';
import type {
  AppSurface,
  RealtimeMessagePayload,
  RealtimeNotificationPayload,
  RealtimeOrderProgressPayload,
  RealtimeTicketUpdatedPayload,
} from '@portal/types';
import { REALTIME_EVENTS } from '@portal/types';
import type { Namespace } from 'socket.io';

@Injectable()
export class RealtimeService {
  private portalNamespace: Namespace | null = null;
  private adminNamespace: Namespace | null = null;

  registerNamespace(surface: AppSurface, namespace: Namespace): void {
    if (surface === 'portal') {
      this.portalNamespace = namespace;
    } else {
      this.adminNamespace = namespace;
    }
  }

  emitMessageCreated(conversationId: string, payload: RealtimeMessagePayload): void {
    if (payload.visibility === 'internal') {
      this.adminNamespace
        ?.to(`conv:${conversationId}:internal`)
        .emit(REALTIME_EVENTS.MESSAGE_CREATED, payload);
      return;
    }

    this.portalNamespace
      ?.to(`conv:${conversationId}:public`)
      .emit(REALTIME_EVENTS.MESSAGE_CREATED, payload);
    this.adminNamespace
      ?.to(`conv:${conversationId}:public`)
      .emit(REALTIME_EVENTS.MESSAGE_CREATED, payload);
  }

  emitOrderProgressUpdated(
    orderId: string,
    customerId: string,
    payload: RealtimeOrderProgressPayload,
  ): void {
    this.adminNamespace
      ?.to('admin:ops')
      .to(`order:${orderId}:internal`)
      .emit(REALTIME_EVENTS.ORDER_PROGRESS_UPDATED, payload);

    if (payload.isCustomerVisible) {
      this.portalNamespace
        ?.to(`customer:${customerId}`)
        .to(`order:${orderId}:public`)
        .emit(REALTIME_EVENTS.ORDER_PROGRESS_UPDATED, payload);
    }
  }

  emitTicketUpdated(customerId: string, payload: RealtimeTicketUpdatedPayload): void {
    this.adminNamespace?.to('admin:ops').emit(REALTIME_EVENTS.TICKET_UPDATED, payload);
    this.portalNamespace
      ?.to(`customer:${customerId}`)
      .emit(REALTIME_EVENTS.TICKET_UPDATED, payload);
  }

  emitNotification(
    surface: AppSurface,
    userId: string,
    payload: RealtimeNotificationPayload,
  ): void {
    const ns = surface === 'portal' ? this.portalNamespace : this.adminNamespace;
    ns?.to(`user:${userId}`).emit(REALTIME_EVENTS.NOTIFICATION_NEW, payload);
  }
}
