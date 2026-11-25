import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { customers } from './customers';
import { orderOperationalStateEnum, orderPriorityEnum, workflowColorTokenEnum } from './enums';
import { departments, employees, users } from './identity';

export const orderWorkflows = pgTable('order_workflows', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 120 }).notNull().unique(),
  description: text('description'),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const orderWorkflowStatuses = pgTable(
  'order_workflow_statuses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => orderWorkflows.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    customerLabel: varchar('customer_label', { length: 100 }),
    description: text('description'),
    colorToken: workflowColorTokenEnum('color_token').notNull().default('slate'),
    sortOrder: integer('sort_order').notNull(),
    isCustomerVisible: boolean('is_customer_visible').notNull().default(true),
    isTerminal: boolean('is_terminal').notNull().default(false),
    defaultDepartmentId: uuid('default_department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_workflow_status_code').on(table.workflowId, table.code),
    unique('uq_workflow_status_order').on(table.workflowId, table.sortOrder),
  ],
);

export const orderWorkflowTransitions = pgTable(
  'order_workflow_transitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => orderWorkflows.id, { onDelete: 'cascade' }),
    fromStatusId: uuid('from_status_id')
      .notNull()
      .references(() => orderWorkflowStatuses.id, { onDelete: 'cascade' }),
    toStatusId: uuid('to_status_id')
      .notNull()
      .references(() => orderWorkflowStatuses.id, { onDelete: 'cascade' }),
    requiredPermission: varchar('required_permission', { length: 100 }),
  },
  (table) => [
    unique('uq_workflow_transition').on(table.workflowId, table.fromStatusId, table.toStatusId),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderNumber: varchar('order_number', { length: 32 }).notNull().unique(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => orderWorkflows.id, { onDelete: 'restrict' }),
    currentStatusId: uuid('current_status_id')
      .notNull()
      .references(() => orderWorkflowStatuses.id, { onDelete: 'restrict' }),
    operationalState: orderOperationalStateEnum('operational_state').notNull().default('active'),
    priority: orderPriorityEnum('priority').notNull().default('normal'),
    title: varchar('title', { length: 200 }).notNull(),
    poNumber: varchar('po_number', { length: 80 }),
    description: text('description'),
    internalNotes: text('internal_notes'),
    assignedDepartmentId: uuid('assigned_department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),
    assignedEmployeeId: uuid('assigned_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    orderedAt: timestamp('ordered_at', { withTimezone: true }).defaultNow().notNull(),
    expectedCompletionDate: date('expected_completion_date'),
    actualCompletionDate: date('actual_completion_date'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_orders_cust_state')
      .on(table.customerId, table.operationalState, table.createdAt)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_orders_status_expected')
      .on(table.currentStatusId, table.expectedCompletionDate)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_orders_assigned').on(table.assignedEmployeeId, table.assignedDepartmentId),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    partNumber: varchar('part_number', { length: 80 }),
    name: varchar('name', { length: 200 }).notNull(),
    material: varchar('material', { length: 120 }),
    specification: text('specification'),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull().default('1'),
    unit: varchar('unit', { length: 32 }).notNull().default('pcs'),
    targetDate: date('target_date'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique('uq_order_item_line').on(table.orderId, table.lineNumber)],
);

export const orderProgressEvents = pgTable(
  'order_progress_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    fromStatusId: uuid('from_status_id').references(() => orderWorkflowStatuses.id, {
      onDelete: 'restrict',
    }),
    toStatusId: uuid('to_status_id')
      .notNull()
      .references(() => orderWorkflowStatuses.id, { onDelete: 'restrict' }),
    statusNameSnapshot: varchar('status_name_snapshot', { length: 100 }).notNull(),
    changedByUserId: uuid('changed_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    responsibleDepartmentId: uuid('responsible_department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),
    responsibleEmployeeId: uuid('responsible_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    expectedDate: date('expected_date'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    note: text('note'),
    isCustomerVisible: boolean('is_customer_visible').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_order_progress_timeline').on(table.orderId, table.createdAt)],
);
