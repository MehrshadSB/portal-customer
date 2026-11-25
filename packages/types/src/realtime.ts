export const REALTIME_NAMESPACES = {
  PORTAL: '/realtime/portal',
  ADMIN: '/realtime/admin',
} as const;

export const REALTIME_EVENTS = {
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  ORDER_JOIN: 'order:join',
  ORDER_LEAVE: 'order:leave',
  MESSAGE_CREATED: 'message:created',
  ORDER_PROGRESS_UPDATED: 'order:progress_updated',
  TICKET_UPDATED: 'ticket:updated',
  NOTIFICATION_NEW: 'notification:new',
} as const;

export interface RealtimeMessagePayload {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderName: string;
  senderType: 'employee' | 'customer';
  visibility: 'public' | 'internal';
  body: string;
  createdAt: string;
}

export interface RealtimeNotificationPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  actionUrl: string | null;
  createdAt: string;
}
