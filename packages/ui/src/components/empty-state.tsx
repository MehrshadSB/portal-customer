import * as React from 'react';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  embedded?: boolean;
  headingLevel?: 'h2' | 'h3';
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  embedded = false,
  headingLevel = 'h2',
  className,
}: EmptyStateProps) {
  const Heading = headingLevel;
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-10 text-center',
        !embedded &&
          'rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] bg-[var(--color-paper-2)]/50',
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className="mb-3 flex h-10 w-10 items-center justify-center rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-[var(--color-cotton)] text-[var(--color-ink-2)]"
        >
          {icon}
        </div>
      ) : null}
      <Heading className="text-sm font-semibold text-[var(--color-ink)]">{title}</Heading>
      <p className="mt-1 max-w-prose text-xs leading-relaxed text-[var(--color-muted)]">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
