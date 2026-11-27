import { APP_SURFACES, CALENDAR_TYPES, SUPPORTED_LOCALES } from '@portal/types';
import { z } from 'zod';

export const appSurfaceSchema = z.enum(APP_SURFACES);
export const appLocaleSchema = z.enum(SUPPORTED_LOCALES);
export const calendarTypeSchema = z.enum(CALENDAR_TYPES);

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (ch) => String(PERSIAN_DIGITS.indexOf(ch)))
    .replace(/[٠-٩]/g, (ch) => String(ARABIC_DIGITS.indexOf(ch)));
}

export function normalizePhoneE164(raw: string): string {
  const cleaned = normalizeDigits(raw).trim().replace(/[\s\-().]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('00')) {
    return `+${cleaned.slice(2)}`;
  }
  if (cleaned.startsWith('09') && cleaned.length === 11) {
    return `+98${cleaned.slice(1)}`;
  }
  if (cleaned.startsWith('9') && cleaned.length === 10) {
    return `+98${cleaned}`;
  }
  if (cleaned.startsWith('98') && !cleaned.startsWith('+') && cleaned.length >= 11) {
    return `+${cleaned}`;
  }
  return cleaned;
}

export const phoneSchema = z
  .string()
  .trim()
  .transform(normalizePhoneE164)
  .refine((val) => /^\+[1-9]\d{7,14}$/.test(val), {
    message: 'Enter a valid mobile phone number in international format (e.g. +989123456789)',
  });

export const otpCodeSchema = z
  .string()
  .trim()
  .transform((val) => normalizeDigits(val).replace(/\s+/g, ''))
  .refine((val) => /^\d{6}$/.test(val), {
    message: 'Verification code must be 6 digits',
  });

export const requestOtpSchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(150).optional(),
  timezone: z.string().trim().max(64).optional(),
  locale: appLocaleSchema.optional(),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
