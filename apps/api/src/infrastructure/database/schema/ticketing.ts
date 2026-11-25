import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { customers } from './customers';
import {
  conversationContextTypeEnum,
  conversationStatusEnum,
  messageTypeEnum,
  messageVisibilityEnum,
  participantRoleEnum,
  ticketPriorityEnum,
  ticketStatusEnum,
} from './enums';
import { departments, employees, users } from './identity';
import { orders } from './orders';

export const ticketCategories = pgTable('ticket_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  description: text('description'),
  defaultDepartmentId: uuid('default_department_id').references(() => departments.id, {
    onDelete: 'set null',
  }),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ticketNumber: varchar('ticket_number', { length: 32 }).notNull().unique(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => ticketCategories.id, { onDelete: 'restrict' }),
    subject: varchar('subject', { length: 200 }).notNull(),
    description: text('description').notNull(),
    status: ticketStatusEnum('status').notNull().default('open'),
    priority: ticketPriorityEnum('priority').notNull().default('medium'),
    assignedDepartmentId: uuid('assigned_department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),
    assignedEmployeeId: uuid('assigned_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    reopenedCount: integer('reopened_count').notNull().default(0),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_tickets_cust_status')
      .on(table.customerId, table.status, table.createdAt)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_tickets_queue')
      .on(table.status, table.priority, table.assignedEmployeeId)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_tickets_order').on(table.orderId),
  ],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    contextType: conversationContextTypeEnum('context_type').notNull(),
    ticketId: uuid('ticket_id')
      .unique()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .unique()
      .references(() => orders.id, { onDelete: 'cascade' }),
    subject: varchar('subject', { length: 200 }),
    status: conversationStatusEnum('status').notNull().default('open'),
    assignedEmployeeId: uuid('assigned_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_conversations_cust_recent').on(table.customerId, table.lastMessageAt),
    check(
      'chk_conversations_context',
      sql`((${table.contextType} = 'ticket' AND ${table.ticketId} IS NOT NULL AND ${table.orderId} IS NULL) OR (${table.contextType} = 'order' AND ${table.orderId} IS NOT NULL AND ${table.ticketId} IS NULL) OR (${table.contextType} = 'customer' AND ${table.ticketId} IS NULL AND ${table.orderId} IS NULL))`,
    ),
  ],
);

export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    participantRole: participantRoleEnum('participant_role').notNull().default('follower'),
    lastReadMessageId: uuid('last_read_message_id'),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique('uq_conversation_participant').on(table.conversationId, table.userId)],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderUserId: uuid('sender_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    visibility: messageVisibilityEnum('visibility').notNull().default('public'),
    messageType: messageTypeEnum('message_type').notNull().default('text'),
    body: text('body').notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_messages_conv_cursor')
      .on(table.conversationId, table.createdAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);
