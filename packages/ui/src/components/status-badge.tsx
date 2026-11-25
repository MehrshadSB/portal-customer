import type { WorkflowColorToken } from '@portal/types';
import * as React from 'react';
import { cn } from '../lib/cn';

const TOKEN_STYLES: Record<WorkflowColorToken, { container: string; dot: string }> = {
  slate: {
    container:
      'bg-[var(--signal-slate-surface)] text-[var(--signal-slate)] border-[var(--border-hairline)]',
    dot: 'bg-[var(--signal-slate)]',
  },
  cobalt: {
    container: 'bg-blue-50 text-[var(--accent-cobalt)] border-blue-200 dark:bg-blue-950/50 dark:border-blue-800',
    dot: 'bg-[var(--accent-cobalt)]',
  },
  amber: {
    container:
      'bg-[var(--signal-amber-surface)] text-[var(--signal-amber)] border-amber-200 dark:border-amber-800',
    dot: 'bg-[var(--signal-amber)]',
  },
  emerald: {
    container:
      'bg-[var(--signal-emerald-surface)] text-[var(--signal-emerald)] border-emerald-200 dark:border-emerald-800',
    dot: 'bg-[var(--signal-emerald)]',
  },
  crimson: {
    container:
      'bg-[var(--signal-crimson-surface)] text-[var(--signal-crimson)] border-red-200 dark:border-red-800',
    dot: 'bg-[var(--signal-crimson)]',
  },
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
  const style = TOKEN_STYLES[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
        mono && 'font-mono-tabular',
        style.container,
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
      {label}
    </span>
  );
}
