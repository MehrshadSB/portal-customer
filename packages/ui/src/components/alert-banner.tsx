import type { WorkflowColorToken } from '@portal/types';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';

const BANNER_TONES: Record<WorkflowColorToken, string> = {
  slate:
    'border-[var(--color-signal-slate-border)] bg-[var(--color-signal-slate-bg)] text-[var(--color-ink)]',
  cobalt:
    'border-[var(--color-signal-cobalt-border)] bg-[var(--color-signal-cobalt-bg)] text-[var(--color-signal-cobalt)]',
  amber:
    'border-[var(--color-signal-amber-border)] bg-[var(--color-signal-amber-bg)] text-[var(--color-signal-amber)]',
  emerald:
    'border-[var(--color-signal-emerald-border)] bg-[var(--color-signal-emerald-bg)] text-[var(--color-signal-emerald)]',
  crimson:
    'border-[var(--color-signal-crimson-border)] bg-[var(--color-signal-crimson-bg)] text-[var(--color-signal-crimson)]',
};

const BANNER_ICONS: Record<WorkflowColorToken, React.ReactNode> = {
  slate: <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />,
  cobalt: <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />,
  amber: <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />,
  emerald: <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />,
  crimson: <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />,
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
      className={cn(
        'flex items-start gap-2.5 rounded-[var(--radius-card)] border px-3.5 py-2.5 text-xs leading-relaxed',
        BANNER_TONES[tone],
        className,
      )}
      {...props}
    >
      {BANNER_ICONS[tone]}
      <div className="min-w-0 flex-1">
        {title ? <p className="mb-0.5 font-semibold text-[var(--color-ink)]">{title}</p> : null}
        <div className="text-[var(--color-ink)]">{children}</div>
      </div>
    </div>
  );
}
