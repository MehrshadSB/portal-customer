import type { WorkflowColorToken } from '@portal/types';
import * as React from 'react';
import { cn } from '../lib/cn';

const TOKEN_STYLES: Record<WorkflowColorToken, string> = {
  slate:
    'border-[var(--color-signal-slate-border)] bg-[var(--color-signal-slate-bg)] text-[var(--color-signal-slate)]',
  cobalt:
    'border-[var(--color-signal-cobalt-border)] bg-[var(--color-signal-cobalt-bg)] text-[var(--color-signal-cobalt)]',
  amber:
    'border-[var(--color-signal-amber-border)] bg-[var(--color-signal-amber-bg)] text-[var(--color-signal-amber)]',
  emerald:
    'border-[var(--color-signal-emerald-border)] bg-[var(--color-signal-emerald-bg)] text-[var(--color-signal-emerald)]',
  crimson:
    'border-[var(--color-signal-crimson-border)] bg-[var(--color-signal-crimson-bg)] text-[var(--color-signal-crimson)]',
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: string;
  tone?: WorkflowColorToken;
  mono?: boolean;
}

export function StatusBadge({
  label,
  tone = 'slate',
  mono = false,
  className,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-[var(--radius-input)] border px-2 py-0.5 text-xs font-medium leading-tight',
        mono && 'font-mono-tabular',
        TOKEN_STYLES[tone],
        className,
      )}
      {...props}
    >
      {label}
    </span>
  );
}
