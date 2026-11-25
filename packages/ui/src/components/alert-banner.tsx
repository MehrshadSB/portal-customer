import type { WorkflowColorToken } from '@portal/types';
import * as React from 'react';
import { cn } from '../lib/cn';

const BANNER_TONES: Record<WorkflowColorToken, string> = {
  slate: 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--ink-primary)]',
  cobalt: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100',
  amber:
    'border-amber-200 bg-[var(--signal-amber-surface)] text-amber-950 dark:border-amber-800 dark:text-amber-100',
  emerald:
    'border-emerald-200 bg-[var(--signal-emerald-surface)] text-emerald-950 dark:border-emerald-800 dark:text-emerald-100',
  crimson:
    'border-red-200 bg-[var(--signal-crimson-surface)] text-red-950 dark:border-red-800 dark:text-red-100',
};

export interface AlertBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: WorkflowColorToken;
  title?: string;
}

export function AlertBanner({
  tone = 'slate',
  title,
  children,
  className,
  ...props
}: AlertBannerProps) {
  return (
    <div
      role="alert"
      className={cn('rounded-md border px-3.5 py-2.5 text-xs', BANNER_TONES[tone], className)}
      {...props}
    >
      {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}
