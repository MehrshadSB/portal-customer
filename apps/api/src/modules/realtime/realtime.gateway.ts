import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { REALTIME_EVENTS, REALTIME_NAMESPACES } from '@portal/types';
import type { Namespace, Socket } from 'socket.io';
import { RealtimeAuthHelper } from './realtime-auth.helper';
import { RealtimeService } from './realtime.service';

@WebSocketGateway({ namespace: REALTIME_NAMESPACES.PORTAL })
export class PortalRealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly authHelper: RealtimeAuthHelper,
  ) {}

  afterInit(server: Namespace): void {
    this.realtimeService.registerNamespace('portal', server);
    this.authHelper.attachAuthMiddleware(server, 'portal');
  }

  handleConnection(client: Socket): void {
    this.authHelper.onConnected(client);
  }

  @SubscribeMessage(REALTIME_EVENTS.CONVERSATION_JOIN)
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { conversationId?: string },
  ) {
    return this.authHelper.joinConversation(client, payload?.conversationId ?? '');
  }

  @SubscribeMessage(REALTIME_EVENTS.CONVERSATION_LEAVE)
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { conversationId?: string },
  ) {
    return this.authHelper.leaveConversation(client, payload?.conversationId ?? '');
  }

  @SubscribeMessage(REALTIME_EVENTS.ORDER_JOIN)
  handleJoinOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { orderId?: string },
  ) {
    return this.authHelper.joinOrder(client, payload?.orderId ?? '');
  }

  @SubscribeMessage(REALTIME_EVENTS.ORDER_LEAVE)
  handleLeaveOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { orderId?: string },
  ) {
    return this.authHelper.leaveOrder(client, payload?.orderId ?? '');
  }
}

@WebSocketGateway({ namespace: REALTIME_NAMESPACES.ADMIN })
export class AdminRealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly authHelper: RealtimeAuthHelper,
  ) {}

  afterInit(server: Namespace): void {
    this.realtimeService.registerNamespace('admin', server);
    this.authHelper.attachAuthMiddleware(server, 'admin');
  }

  handleConnection(client: Socket): void {
    this.authHelper.onConnected(client);
  }

  @SubscribeMessage(REALTIME_EVENTS.CONVERSATION_JOIN)
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { conversationId?: string },
  ) {
    return this.authHelper.joinConversation(client, payload?.conversationId ?? '');
  }

  @SubscribeMessage(REALTIME_EVENTS.CONVERSATION_LEAVE)
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { conversationId?: string },
  ) {
    return this.authHelper.leaveConversation(client, payload?.conversationId ?? '');
  }

  @SubscribeMessage(REALTIME_EVENTS.ORDER_JOIN)
  handleJoinOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { orderId?: string },
  ) {
    return this.authHelper.joinOrder(client, payload?.orderId ?? '');
  }

  @SubscribeMessage(REALTIME_EVENTS.ORDER_LEAVE)
  handleLeaveOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { orderId?: string },
  ) {
    return this.authHelper.leaveOrder(client, payload?.orderId ?? '');
  }
}
