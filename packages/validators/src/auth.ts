import { APP_SURFACES, CALENDAR_TYPES, DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@portal/types';
import { z } from 'zod';

export const appSurfaceSchema = z.enum(APP_SURFACES);
export const appLocaleSchema = z.enum(SUPPORTED_LOCALES);
export const calendarTypeSchema = z.enum(CALENDAR_TYPES);

export const passwordPolicySchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must not exceed 128 characters');

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16),
  password: passwordPolicySchema,
});

export const acceptInviteSchema = z.object({
  token: z.string().min(16),
  password: passwordPolicySchema,
  fullName: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().max(40).optional(),
  timezone: z.string().trim().max(64).default('Asia/Tehran'),
  locale: appLocaleSchema.default(DEFAULT_LOCALE),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  timezone: z.string().trim().max(64).optional(),
  locale: appLocaleSchema.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordPolicySchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
