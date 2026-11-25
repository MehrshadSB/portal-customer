import { CALENDAR_TYPES, EMPLOYEE_ROLE_SLUGS, SUPPORTED_LOCALES } from '@portal/types';
import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .transform((v) => v.toUpperCase()),
  description: z.string().trim().max(1000).optional(),
  leadEmployeeId: uuidSchema.nullable().optional(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const inviteEmployeeSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  fullName: z.string().trim().min(2).max(150),
  departmentId: uuidSchema.nullable().optional(),
  jobTitle: z.string().trim().max(120).optional(),
  roleSlugs: z.array(z.enum(EMPLOYEE_ROLE_SLUGS)).min(1, 'At least one employee role is required'),
});

export const updateEmployeeSchema = z.object({
  fullName: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  departmentId: uuidSchema.nullable().optional(),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  roleSlugs: z.array(z.enum(EMPLOYEE_ROLE_SLUGS)).min(1).optional(),
  isActive: z.boolean().optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

export const listEmployeesQuerySchema = paginationQuerySchema.extend({
  departmentId: uuidSchema.optional(),
  isActive: z.coerce.boolean().optional(),
});

export const updateRolePermissionsSchema = z.object({
  permissionKeys: z.array(z.string().min(3).max(100)),
});

export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  entityType: z.string().trim().max(60).optional(),
  entityId: uuidSchema.optional(),
  customerId: uuidSchema.optional(),
  actorUserId: uuidSchema.optional(),
  action: z.string().trim().max(100).optional(),
});

export const updateLocalizationSettingsSchema = z
  .object({
    defaultLocale: z.enum(SUPPORTED_LOCALES),
    enabledLocales: z.array(z.enum(SUPPORTED_LOCALES)).min(1),
    calendarType: z.enum(CALENDAR_TYPES),
    brandNameFa: z.string().trim().min(2).max(120),
    brandNameEn: z.string().trim().min(2).max(120),
  })
  .refine((data) => data.enabledLocales.includes(data.defaultLocale), {
    message: 'Default language must be included in enabled languages',
    path: ['defaultLocale'],
  });

export type UpdateLocalizationSettingsInput = z.infer<typeof updateLocalizationSettingsSchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type InviteEmployeeInput = z.infer<typeof inviteEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ListEmployeesQueryInput = z.infer<typeof listEmployeesQuerySchema>;
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;
export type ListAuditLogsQueryInput = z.infer<typeof listAuditLogsQuerySchema>;
