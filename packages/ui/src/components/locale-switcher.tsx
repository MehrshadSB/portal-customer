'use client';

import { useI18n } from '@portal/i18n/react';
import type { AppLocale } from '@portal/types';
import { Globe } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';

export interface LocaleSwitcherProps {
  onLocaleChange?: (locale: AppLocale) => void;
  className?: string;
}

export function LocaleSwitcher({ onLocaleChange, className }: LocaleSwitcherProps) {
  const { locale, enabledLocales, setLocale, t } = useI18n();

  if (enabledLocales.length <= 1) return null;

  const handleSelect = (next: AppLocale) => {
    setLocale(next);
    onLocaleChange?.(next);
  };

  return (
    <div
      role="group"
      aria-label={t.meta.languageLabel}
      className={cn(
        'app-groove inline-flex h-8 items-center gap-0.5 rounded-[var(--radius-input)] p-0.5',
        className,
      )}
    >
      <Globe className="mx-1.5 h-3.5 w-3.5 shrink-0 text-[var(--color-muted)]" aria-hidden="true" />
      {enabledLocales.map((code) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => handleSelect(code)}
            aria-pressed={active}
            className={cn(
              'relative cursor-pointer whitespace-nowrap rounded-[4px] px-2.5 py-1 text-xs font-medium transition-colors duration-[var(--dur-micro)] before:absolute before:-inset-1.5 before:content-[""]',
              active
                ? 'bg-[var(--color-cotton)] text-[var(--color-ink)] shadow-[var(--shadow-card)]'
                : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]',
            )}
          >
            {code === 'fa' ? 'فارسی' : 'EN'}
          </button>
        );
      })}
    </div>
  );
}
