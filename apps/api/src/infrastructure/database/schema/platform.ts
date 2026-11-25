import type { AppLocale, CalendarType } from '@portal/types';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { customers } from './customers';
import { attachmentUploadStatusEnum, attachmentVisibilityEnum, auditActorTypeEnum } from './enums';
import { users } from './identity';
import { orderProgressEvents, orders } from './orders';
import { messages, tickets } from './ticketing';

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'restrict' }),
    uploadedByUserId: uuid('uploaded_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    storageKey: varchar('storage_key', { length: 512 }).notNull().unique(),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 150 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    checksumSha256: varchar('checksum_sha256', { length: 64 }),
    uploadStatus: attachmentUploadStatusEnum('upload_status').notNull().default('pending'),
    visibility: attachmentVisibilityEnum('visibility').notNull().default('customer_visible'),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    orderProgressEventId: uuid('order_progress_event_id').references(
      () => orderProgressEvents.id,
      { onDelete: 'set null' },
    ),
    ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_attachments_order')
      .on(table.orderId)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_attachments_ticket')
      .on(table.ticketId)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_attachments_message')
      .on(table.messageId)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_attachments_pending_cleanup').on(table.uploadStatus, table.createdAt),
    check(
      'chk_attachments_target',
      sql`num_nonnulls(${table.customerId}, ${table.orderId}, ${table.orderProgressEventId}, ${table.ticketId}, ${table.messageId}) >= 1`,
    ),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 80 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    entityType: varchar('entity_type', { length: 50 }),
    entityId: uuid('entity_id'),
    actionUrl: varchar('action_url', { length: 255 }),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_notifications_inbox').on(table.recipientUserId, table.isRead, table.createdAt)],
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 80 }).notNull(),
    inAppEnabled: boolean('in_app_enabled').notNull().default(true),
    emailEnabled: boolean('email_enabled').notNull().default(true),
  },
  (table) => [unique('uq_notification_pref').on(table.userId, table.eventType)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorType: auditActorTypeEnum('actor_type').notNull(),
    action: varchar('action', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 60 }).notNull(),
    entityId: uuid('entity_id'),
    customerId: uuid('customer_id'),
    summary: text('summary').notNull(),
    beforeJson: jsonb('before_json'),
    afterJson: jsonb('after_json'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    requestId: varchar('request_id', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_audit_entity').on(table.entityType, table.entityId, table.createdAt),
    index('idx_audit_customer').on(table.customerId, table.createdAt),
    index('idx_audit_actor').on(table.actorUserId, table.createdAt),
  ],
);

export const platformSettings = pgTable('platform_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: varchar('key', { length: 64 }).notNull().unique(),
  defaultLocale: varchar('default_locale', { length: 10 }).$type<AppLocale>().notNull().default('fa'),
  enabledLocales: jsonb('enabled_locales').$type<AppLocale[]>().notNull(),
  calendarType: varchar('calendar_type', { length: 16 })
    .$type<CalendarType>()
    .notNull()
    .default('jalali'),
  brandNameFa: varchar('brand_name_fa', { length: 120 }).notNull().default('آذرپارت صنعت'),
  brandNameEn: varchar('brand_name_en', { length: 120 }).notNull().default('AzarPart Mfg'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
