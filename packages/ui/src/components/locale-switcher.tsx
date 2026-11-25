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
        'inline-flex items-center gap-0.5 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-0.5',
        className,
      )}
    >
      <Globe className="mx-1.5 h-3.5 w-3.5 text-[var(--ink-muted)]" aria-hidden="true" />
      {enabledLocales.map((code) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => handleSelect(code)}
            aria-pressed={active}
            className={cn(
              'font-mono-tabular rounded px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer',
              active
                ? 'bg-[var(--bg-surface)] text-[var(--accent-cobalt)] shadow-2xs'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]',
            )}
          >
            {code === 'fa' ? 'فارسی' : 'EN'}
          </button>
        );
      })}
    </div>
  );
}
