export const CUSTOMER_STATUSES = ['prospect', 'active', 'on_hold', 'archived'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const ORDER_OPERATIONAL_STATES = [
  'draft',
  'active',
  'on_hold',
  'completed',
  'cancelled',
] as const;
export type OrderOperationalState = (typeof ORDER_OPERATIONAL_STATES)[number];

export const ORDER_PRIORITIES = ['low', 'normal', 'high', 'rush'] as const;
export type OrderPriority = (typeof ORDER_PRIORITIES)[number];

export const WORKFLOW_COLOR_TOKENS = ['slate', 'cobalt', 'amber', 'emerald', 'crimson'] as const;
export type WorkflowColorToken = (typeof WORKFLOW_COLOR_TOKENS)[number];

export const TICKET_STATUSES = [
  'open',
  'in_progress',
  'waiting_for_customer',
  'resolved',
  'closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const CONVERSATION_CONTEXT_TYPES = ['ticket', 'order', 'customer'] as const;
export type ConversationContextType = (typeof CONVERSATION_CONTEXT_TYPES)[number];

export const MESSAGE_VISIBILITIES = ['public', 'internal'] as const;
export type MessageVisibility = (typeof MESSAGE_VISIBILITIES)[number];

export const ATTACHMENT_VISIBILITIES = ['customer_visible', 'internal_only'] as const;
export type AttachmentVisibility = (typeof ATTACHMENT_VISIBILITIES)[number];

export const ATTACHMENT_UPLOAD_STATUSES = ['pending', 'ready', 'failed'] as const;
export type AttachmentUploadStatus = (typeof ATTACHMENT_UPLOAD_STATUSES)[number];
