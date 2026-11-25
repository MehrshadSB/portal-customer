import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { customerStatusEnum } from './enums';
import { employees, roles, users } from './identity';

export interface AddressJson {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
}

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerCode: varchar('customer_code', { length: 32 }).notNull().unique(),
    companyName: varchar('company_name', { length: 200 }).notNull(),
    legalName: varchar('legal_name', { length: 200 }),
    taxId: varchar('tax_id', { length: 64 }),
    industry: varchar('industry', { length: 100 }),
    website: varchar('website', { length: 255 }),
    billingAddress: jsonb('billing_address').$type<AddressJson>(),
    shippingAddress: jsonb('shipping_address').$type<AddressJson>(),
    accountManagerId: uuid('account_manager_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    status: customerStatusEnum('status').notNull().default('active'),
    internalNotes: text('internal_notes'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_customers_status_name')
      .on(table.status, table.companyName)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_customers_acct_mgr').on(table.accountManagerId),
  ],
);

export const customerMembers = pgTable(
  'customer_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'restrict' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    jobTitle: varchar('job_title', { length: 120 }),
    isPrimary: boolean('is_primary').notNull().default(false),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_cust_members_customer').on(table.customerId)],
);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    fullName: varchar('full_name', { length: 150 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 40 }),
    jobTitle: varchar('job_title', { length: 120 }),
    departmentLabel: varchar('department_label', { length: 100 }),
    isPrimary: boolean('is_primary').notNull().default(false),
    notes: text('notes'),
    linkedMemberId: uuid('linked_member_id').references(() => customerMembers.id, {
      onDelete: 'set null',
    }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_contacts_customer')
      .on(table.customerId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);
