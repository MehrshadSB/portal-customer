import { MESSAGE_VISIBILITIES, TICKET_PRIORITIES, TICKET_STATUSES } from '@portal/types';
import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';

export const createTicketSchema = z.object({
  customerId: uuidSchema.optional(),
  orderId: uuidSchema.nullable().optional(),
  categoryId: uuidSchema,
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(5).max(10000),
  priority: z.enum(TICKET_PRIORITIES).default('medium'),
});

export const updateTicketSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assignedDepartmentId: uuidSchema.nullable().optional(),
  assignedEmployeeId: uuidSchema.nullable().optional(),
  categoryId: uuidSchema.optional(),
});

export const createMessageSchema = z.object({
  body: z.string().trim().min(1).max(10000),
  visibility: z.enum(MESSAGE_VISIBILITIES).default('public'),
  attachmentIds: z.array(uuidSchema).max(10).optional(),
});

export const listTicketsQuerySchema = paginationQuerySchema.extend({
  customerId: uuidSchema.optional(),
  orderId: uuidSchema.optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assignedEmployeeId: uuidSchema.optional(),
  unassignedOnly: z.coerce.boolean().optional(),
});

export const reopenTicketSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime().optional(),
});

export const markConversationReadSchema = z.object({
  lastReadMessageId: uuidSchema.optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type ReopenTicketInput = z.infer<typeof reopenTicketSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type ListTicketsQueryInput = z.infer<typeof listTicketsQuerySchema>;
export type ListMessagesQueryInput = z.infer<typeof listMessagesQuerySchema>;
export type MarkConversationReadInput = z.infer<typeof markConversationReadSchema>;
