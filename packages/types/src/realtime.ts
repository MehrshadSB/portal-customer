import type { OrderOperationalState, TicketPriority, TicketStatus, WorkflowColorToken } from './domain';
import type { AttachmentDto } from './dtos';

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
  messageType: 'text' | 'system_event';
  body: string;
  attachments: AttachmentDto[];
  createdAt: string;
}

export interface RealtimeOrderProgressPayload {
  orderId: string;
  orderNumber: string;
  toStatusId: string;
  stageCode: string;
  stageName: string;
  stageColor: WorkflowColorToken;
  operationalState: OrderOperationalState;
  isCustomerVisible: boolean;
  note: string | null;
  createdAt: string;
}

export interface RealtimeTicketUpdatedPayload {
  ticketId: string;
  ticketNumber: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedEmployeeId: string | null;
  assignedDepartmentId: string | null;
  updatedAt: string;
}

export interface RealtimeNotificationPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  createdAt: string;
}
