import * as React from 'react';
import { cn } from '../lib/cn';

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 border-b border-[var(--color-rule)] pb-5 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-2xl">
          {title}
        </h1>
        {eyebrow || description ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-[var(--color-muted)]">
            {eyebrow ? (
              <span className="text-xs font-medium text-[var(--color-ink-2)]">{eyebrow}</span>
            ) : null}
            {description ? <p className="max-w-prose text-sm">{description}</p> : null}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
