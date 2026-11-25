import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type AppLocale,
  type CalendarType,
} from '@portal/types';
import { en } from './locales/en';
import { fa } from './locales/fa';
import type { TranslationDictionary } from './locales/types';

export const LOCALE_COOKIE_NAME = 'app_locale';

export const DICTIONARIES: Record<AppLocale, TranslationDictionary> = {
  fa,
  en,
};

export function resolveLocale(input?: string | null, fallback: AppLocale = DEFAULT_LOCALE): AppLocale {
  if (input && (SUPPORTED_LOCALES as readonly string[]).includes(input)) {
    return input as AppLocale;
  }
  return fallback;
}

export function getDirection(locale: AppLocale): 'rtl' | 'ltr' {
  return locale === 'fa' ? 'rtl' : 'ltr';
}

export function getDictionary(locale: AppLocale): TranslationDictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

export function interpolate(
  template: string,
  params: Record<string, string | number>,
): string {
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function formatNumber(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US').format(value);
}

export function formatDate(
  value: string | Date,
  locale: AppLocale,
  calendarType: CalendarType = locale === 'fa' ? 'jalali' : 'gregorian',
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);

  const intlLocale =
    locale === 'fa'
      ? calendarType === 'jalali'
        ? 'fa-IR-u-ca-persian'
        : 'fa-IR'
      : calendarType === 'jalali'
        ? 'en-US-u-ca-persian'
        : 'en-US';

  return new Intl.DateTimeFormat(intlLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatDateTime(
  value: string | Date,
  locale: AppLocale,
  calendarType: CalendarType = locale === 'fa' ? 'jalali' : 'gregorian',
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);

  const intlLocale =
    locale === 'fa'
      ? calendarType === 'jalali'
        ? 'fa-IR-u-ca-persian'
        : 'fa-IR'
      : calendarType === 'jalali'
        ? 'en-US-u-ca-persian'
        : 'en-US';

  return new Intl.DateTimeFormat(intlLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function translateStatus(status: string, locale: AppLocale): string {
  return getDictionary(locale).statuses[status] ?? status;
}

export function translateRole(slug: string, locale: AppLocale): string {
  return getDictionary(locale).roles[slug] ?? slug;
}

export function translateApiError(
  code: string | undefined,
  fallbackMessage: string,
  locale: AppLocale,
): string {
  if (code && getDictionary(locale).errorCodes[code]) {
    return getDictionary(locale).errorCodes[code]!;
  }
  return fallbackMessage;
}
