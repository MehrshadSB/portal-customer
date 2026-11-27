import { ORDER_OPERATIONAL_STATES, ORDER_PRIORITIES, WORKFLOW_COLOR_TOKENS } from '@portal/types';
import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';

export const orderItemInputSchema = z.object({
  partNumber: z.string().trim().max(80).optional(),
  name: z.string().trim().min(1).max(200),
  material: z.string().trim().max(120).optional(),
  specification: z.string().max(4000).optional(),
  quantity: z.coerce.number().positive(),
  unit: z.string().trim().min(1).max(32).default('pcs'),
  targetDate: z.string().date().nullable().optional(),
  notes: z.string().max(2000).optional(),
});

export const createOrderSchema = z.object({
  customerId: uuidSchema,
  title: z.string().trim().min(2).max(200),
  poNumber: z.string().trim().max(80).optional(),
  priority: z.enum(ORDER_PRIORITIES).default('normal'),
  description: z.string().max(8000).optional(),
  internalNotes: z.string().max(8000).optional(),
  assignedDepartmentId: uuidSchema.nullable().optional(),
  assignedEmployeeId: uuidSchema.nullable().optional(),
  expectedCompletionDate: z.string().date().nullable().optional(),
  items: z.array(orderItemInputSchema).max(100).optional(),
});

export const updateOrderSchema = createOrderSchema.omit({ customerId: true, items: true }).partial();

export const updateOrderStateSchema = z.object({
  operationalState: z.enum(ORDER_OPERATIONAL_STATES),
  reason: z.string().trim().min(3).max(1000),
});

export const advanceOrderProgressSchema = z.object({
  toStatusId: uuidSchema,
  responsibleDepartmentId: uuidSchema.nullable().optional(),
  responsibleEmployeeId: uuidSchema.nullable().optional(),
  expectedDate: z.string().date().nullable().optional(),
  note: z.string().trim().max(2000).optional(),
  isCustomerVisible: z.boolean().default(true),
});

export const listOrdersQuerySchema = paginationQuerySchema.extend({
  customerId: uuidSchema.optional(),
  workflowStatusId: uuidSchema.optional(),
  operationalState: z.enum(ORDER_OPERATIONAL_STATES).optional(),
  priority: z.enum(ORDER_PRIORITIES).optional(),
  assignedDepartmentId: uuidSchema.optional(),
  assignedEmployeeId: uuidSchema.optional(),
  overdueOnly: z.coerce.boolean().optional(),
});

export const updateWorkflowStatusSchema = z.object({
  name: z.string().trim().min(2).max(100),
  customerLabel: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  colorToken: z.enum(WORKFLOW_COLOR_TOKENS),
  isCustomerVisible: z.boolean(),
  isTerminal: z.boolean(),
  defaultDepartmentId: uuidSchema.nullable().optional(),
});

export const replaceWorkflowTransitionsSchema = z.object({
  transitions: z.array(
    z.object({
      fromStatusId: uuidSchema,
      toStatusId: uuidSchema,
      requiredPermission: z.string().trim().max(100).nullable().optional(),
    }),
  ),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type UpdateOrderStateInput = z.infer<typeof updateOrderStateSchema>;
export type AdvanceOrderProgressInput = z.infer<typeof advanceOrderProgressSchema>;
export type ListOrdersQueryInput = z.infer<typeof listOrdersQuerySchema>;
export type UpdateWorkflowStatusInput = z.infer<typeof updateWorkflowStatusSchema>;
export type ReplaceWorkflowTransitionsInput = z.infer<typeof replaceWorkflowTransitionsSchema>;
