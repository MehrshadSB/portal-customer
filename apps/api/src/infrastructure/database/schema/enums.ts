import {
  ATTACHMENT_UPLOAD_STATUSES,
  ATTACHMENT_VISIBILITIES,
  CONVERSATION_CONTEXT_TYPES,
  CUSTOMER_STATUSES,
  MESSAGE_VISIBILITIES,
  ORDER_OPERATIONAL_STATES,
  ORDER_PRIORITIES,
  ROLE_SCOPES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  USER_STATUSES,
  USER_TYPES,
  WORKFLOW_COLOR_TOKENS,
} from '@portal/types';
import { pgEnum } from 'drizzle-orm/pg-core';

export const userTypeEnum = pgEnum('user_type', USER_TYPES);
export const userStatusEnum = pgEnum('user_status', USER_STATUSES);
export const roleScopeEnum = pgEnum('role_scope', ROLE_SCOPES);

export const customerStatusEnum = pgEnum('customer_status', CUSTOMER_STATUSES);

export const orderOperationalStateEnum = pgEnum(
  'order_operational_state',
  ORDER_OPERATIONAL_STATES,
);
export const orderPriorityEnum = pgEnum('order_priority', ORDER_PRIORITIES);
export const workflowColorTokenEnum = pgEnum('workflow_color_token', WORKFLOW_COLOR_TOKENS);

export const ticketStatusEnum = pgEnum('ticket_status', TICKET_STATUSES);
export const ticketPriorityEnum = pgEnum('ticket_priority', TICKET_PRIORITIES);

export const conversationContextTypeEnum = pgEnum(
  'conversation_context_type',
  CONVERSATION_CONTEXT_TYPES,
);
export const conversationStatusEnum = pgEnum('conversation_status', ['open', 'archived']);
export const participantRoleEnum = pgEnum('participant_role', ['owner', 'assignee', 'follower']);

export const messageVisibilityEnum = pgEnum('message_visibility', MESSAGE_VISIBILITIES);
export const messageTypeEnum = pgEnum('message_type', ['text', 'system_event']);

export const attachmentVisibilityEnum = pgEnum('attachment_visibility', ATTACHMENT_VISIBILITIES);
export const attachmentUploadStatusEnum = pgEnum(
  'attachment_upload_status',
  ATTACHMENT_UPLOAD_STATUSES,
);

export const auditActorTypeEnum = pgEnum('audit_actor_type', ['employee', 'customer', 'system']);
