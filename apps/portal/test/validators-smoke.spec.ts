import {
  DICTIONARIES,
  formatDate,
  formatNumber,
  getDirection,
  resolveLocale,
} from '@portal/i18n';
import {
  createTicketSchema,
  presignUploadSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from '@portal/validators';
import { describe, expect, it } from 'vitest';

function collectLeafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj)
    .flatMap(([key, value]) => {
      const next = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return collectLeafKeys(value as Record<string, unknown>, next);
      }
      return [next];
    })
    .sort();
}

describe('Portal validation & localization contracts', () => {
  it('normalizes Persian and local mobile numbers to E.164 for OTP', () => {
    const parsed = requestOtpSchema.parse({ phone: '۰۹۱۲۳۴۵۶۷۸۹' });
    expect(parsed.phone).toBe('+989123456789');

    const verified = verifyOtpSchema.parse({ phone: '09123456789', code: '۱۲۳۴۵۶' });
    expect(verified.phone).toBe('+989123456789');
    expect(verified.code).toBe('123456');
  });

  it('requires presigned attachments to link to a domain entity', () => {
    const invalid = presignUploadSchema.safeParse({
      filename: 'drawing.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    });
    expect(invalid.success).toBe(false);
  });

  it('accepts valid customer support ticket creation payload', () => {
    const valid = createTicketSchema.safeParse({
      categoryId: '11111111-1111-4111-8111-111111111111',
      subject: 'Bracket chamfer question',
      description: 'Need confirmation on flange tolerance callout.',
    });
    expect(valid.success).toBe(true);
  });

  it('maintains strict key parity between Persian and English dictionaries', () => {
    const faKeys = collectLeafKeys(DICTIONARIES.fa as unknown as Record<string, unknown>);
    const enKeys = collectLeafKeys(DICTIONARIES.en as unknown as Record<string, unknown>);
    expect(faKeys).toEqual(enKeys);
  });

  it('resolves locales, RTL/LTR direction, Jalali/Gregorian dates, and numerals', () => {
    expect(resolveLocale(undefined)).toBe('fa');
    expect(resolveLocale('unknown')).toBe('fa');
    expect(resolveLocale('en')).toBe('en');
    expect(getDirection('fa')).toBe('rtl');
    expect(getDirection('en')).toBe('ltr');

    const nowruz = new Date('2026-03-21T12:00:00Z');
    const jalaliFa = formatDate(nowruz, 'fa', 'jalali');
    const gregorianEn = formatDate(nowruz, 'en', 'gregorian');
    expect(jalaliFa).toContain('۱۴۰۵');
    expect(gregorianEn).toContain('2026');

    expect(formatNumber(1234, 'fa')).toBe('۱٬۲۳۴');
    expect(formatNumber(1234, 'en')).toBe('1,234');
  });
});
