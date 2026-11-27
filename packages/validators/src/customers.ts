import { CUSTOMER_ROLE_SLUGS, CUSTOMER_STATUSES } from '@portal/types';
import { z } from 'zod';
import { phoneSchema } from './auth';
import { paginationQuerySchema, uuidSchema } from './common';

const addressSchema = z
  .object({
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().max(100).optional(),
    postalCode: z.string().trim().max(30).optional(),
    country: z.string().trim().min(2).max(100),
  })
  .nullable()
  .optional();

export const createCustomerSchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  legalName: z.string().trim().max(200).optional(),
  taxId: z.string().trim().max(64).optional(),
  industry: z.string().trim().max(100).optional(),
  website: z.string().trim().url().max(255).optional().or(z.literal('')),
  billingAddress: addressSchema,
  shippingAddress: addressSchema,
  accountManagerId: uuidSchema.nullable().optional(),
  status: z.enum(CUSTOMER_STATUSES).default('active'),
  internalNotes: z.string().max(4000).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const listCustomersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(CUSTOMER_STATUSES).optional(),
  accountManagerId: uuidSchema.optional(),
});

export const createContactSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().toLowerCase().optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional(),
  jobTitle: z.string().trim().max(120).optional(),
  departmentLabel: z.string().trim().max(100).optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().max(2000).optional(),
});

export const createCustomerMemberSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  phone: phoneSchema,
  email: z.string().trim().email().toLowerCase().optional().or(z.literal('')),
  roleSlug: z.enum(CUSTOMER_ROLE_SLUGS),
  jobTitle: z.string().trim().max(120).optional(),
  isPrimary: z.boolean().default(false),
});

export const updateContactSchema = createContactSchema.partial();

export const updateCustomerMemberSchema = z.object({
  fullName: z.string().trim().min(2).max(150).optional(),
  phone: phoneSchema.optional(),
  email: z.string().trim().email().toLowerCase().nullable().optional().or(z.literal('')),
  roleSlug: z.enum(CUSTOMER_ROLE_SLUGS).optional(),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  isPrimary: z.boolean().optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQueryInput = z.infer<typeof listCustomersQuerySchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type CreateCustomerMemberInput = z.infer<typeof createCustomerMemberSchema>;
export type UpdateCustomerMemberInput = z.infer<typeof updateCustomerMemberSchema>;
