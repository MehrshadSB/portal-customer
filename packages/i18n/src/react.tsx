'use client';

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type AppLocale,
  type CalendarType,
} from '@portal/types';
import * as React from 'react';
import {
  LOCALE_COOKIE_NAME,
  formatDate as fmtDate,
  formatDateTime as fmtDateTime,
  formatNumber as fmtNumber,
  getDictionary,
  getDirection,
  interpolate,
  resolveLocale,
  translateApiError,
  translateRole,
  translateStatus,
} from './formatters';
import type { TranslationDictionary } from './locales/types';

export interface I18nContextValue {
  locale: AppLocale;
  dir: 'rtl' | 'ltr';
  calendarType: CalendarType;
  enabledLocales: AppLocale[];
  brandName: string;
  t: TranslationDictionary;
  setLocale: (next: AppLocale) => void;
  setCalendarType: (next: CalendarType) => void;
  setLocalizationConfig: (cfg: {
    defaultLocale?: AppLocale;
    enabledLocales?: AppLocale[];
    calendarType?: CalendarType;
    brandNameFa?: string;
    brandNameEn?: string;
  }) => void;
  formatDate: (value: string | Date) => string;
  formatDateTime: (value: string | Date) => string;
  formatNumber: (value: number) => string;
  interpolate: typeof interpolate;
  translateStatus: (status: string) => string;
  translateRole: (slug: string) => string;
  translateError: (code: string | undefined, fallback: string) => string;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

function readLocaleCookie(): AppLocale | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE_NAME}=([^;]*)`));
  return match?.[1] ? resolveLocale(decodeURIComponent(match[1])) : null;
}

function writeLocaleCookie(locale: AppLocale): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export interface I18nProviderProps {
  initialLocale?: AppLocale;
  initialCalendarType?: CalendarType;
  children: React.ReactNode;
}

export function I18nProvider({
  initialLocale = DEFAULT_LOCALE,
  initialCalendarType,
  children,
}: I18nProviderProps) {
  const [locale, setLocaleState] = React.useState<AppLocale>(() => initialLocale);
  const [enabledLocales, setEnabledLocales] = React.useState<AppLocale[]>([...SUPPORTED_LOCALES]);
  const [calendarType, setCalendarType] = React.useState<CalendarType>(
    () => initialCalendarType ?? (initialLocale === 'fa' ? 'jalali' : 'gregorian'),
  );
  const [brandNames, setBrandNames] = React.useState<{ fa: string; en: string }>({
    fa: getDictionary('fa').meta.portalTitle,
    en: getDictionary('en').meta.portalTitle,
  });

  React.useEffect(() => {
    const cookieLocale = readLocaleCookie();
    if (cookieLocale && cookieLocale !== locale) {
      setLocaleState(cookieLocale);
      setCalendarType(cookieLocale === 'fa' ? 'jalali' : 'gregorian');
    }
    // Run once on client mount to sync cookie preference
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dir = getDirection(locale);

  React.useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
      document.documentElement.dir = dir;
    }
  }, [locale, dir]);

  const setLocale = React.useCallback((next: AppLocale) => {
    const safe = resolveLocale(next);
    setLocaleState(safe);
    setCalendarType(safe === 'fa' ? 'jalali' : 'gregorian');
    writeLocaleCookie(safe);
  }, []);

  const setLocalizationConfig = React.useCallback(
    (cfg: {
      defaultLocale?: AppLocale;
      enabledLocales?: AppLocale[];
      calendarType?: CalendarType;
      brandNameFa?: string;
      brandNameEn?: string;
    }) => {
      if (cfg.enabledLocales && cfg.enabledLocales.length > 0) {
        setEnabledLocales(cfg.enabledLocales);
      }
      if (cfg.calendarType) {
        setCalendarType(cfg.calendarType);
      }
      if (cfg.brandNameFa || cfg.brandNameEn) {
        setBrandNames((prev) => ({
          fa: cfg.brandNameFa ?? prev.fa,
          en: cfg.brandNameEn ?? prev.en,
        }));
      }
      if (cfg.defaultLocale && !readLocaleCookie()) {
        setLocaleState(cfg.defaultLocale);
      }
    },
    [],
  );

  const value = React.useMemo<I18nContextValue>(() => {
    const t = getDictionary(locale);
    return {
      locale,
      dir,
      calendarType,
      enabledLocales,
      brandName: locale === 'fa' ? brandNames.fa : brandNames.en,
      t,
      setLocale,
      setCalendarType,
      setLocalizationConfig,
      formatDate: (v) => fmtDate(v, locale, calendarType),
      formatDateTime: (v) => fmtDateTime(v, locale, calendarType),
      formatNumber: (v) => fmtNumber(v, locale),
      interpolate,
      translateStatus: (s) => translateStatus(s, locale),
      translateRole: (r) => translateRole(r, locale),
      translateError: (code, fallback) => translateApiError(code, fallback, locale),
    };
  }, [locale, dir, calendarType, enabledLocales, brandNames, setLocale, setLocalizationConfig]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext);
  if (!ctx) {
    const t = getDictionary(DEFAULT_LOCALE);
    return {
      locale: DEFAULT_LOCALE,
      dir: 'rtl',
      calendarType: 'jalali',
      enabledLocales: [...SUPPORTED_LOCALES],
      brandName: t.meta.portalTitle,
      t,
      setLocale: () => {},
      setCalendarType: () => {},
      setLocalizationConfig: () => {},
      formatDate: (v) => fmtDate(v, DEFAULT_LOCALE, 'jalali'),
      formatDateTime: (v) => fmtDateTime(v, DEFAULT_LOCALE, 'jalali'),
      formatNumber: (v) => fmtNumber(v, DEFAULT_LOCALE),
      interpolate,
      translateStatus: (s) => translateStatus(s, DEFAULT_LOCALE),
      translateRole: (r) => translateRole(r, DEFAULT_LOCALE),
      translateError: (code, fallback) => translateApiError(code, fallback, DEFAULT_LOCALE),
    };
  }
  return ctx;
}
