'use client';

import { useI18n } from '@portal/i18n/react';
import type { WorkflowStatusDto } from '@portal/types';
import { Check } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';

export interface OrderStageStepperProps {
  stages: WorkflowStatusDto[];
  currentStatusId: string;
}

export function OrderStageStepper({ stages, currentStatusId }: OrderStageStepperProps) {
  const { t, interpolate, formatNumber } = useI18n();
  const sorted = React.useMemo(
    () => [...stages].sort((a, b) => a.sortOrder - b.sortOrder),
    [stages],
  );
  const currentIndex = Math.max(
    0,
    sorted.findIndex((s) => s.id === currentStatusId),
  );

  if (sorted.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-[var(--ink-muted)]">
        <span className="font-medium text-[var(--ink-primary)]">
          {sorted[currentIndex]?.name ?? ''}
        </span>
        <span className="font-mono-tabular">
          {interpolate(t.orders.stageStepOf, {
            current: formatNumber(currentIndex + 1),
            total: formatNumber(sorted.length),
          })}
        </span>
      </div>

      <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {sorted.map((stage, idx) => {
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          return (
            <li
              key={stage.id}
              className={cn(
                'relative flex flex-col gap-1 rounded-md border p-2.5 text-xs transition-colors',
                isCurrent
                  ? 'border-[var(--accent-cobalt)] bg-[var(--accent-cobalt)]/8'
                  : isCompleted
                    ? 'border-emerald-300 bg-[var(--signal-emerald-surface)]/50 dark:border-emerald-800'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)]/40 opacity-75',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'font-mono-tabular flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                    isCurrent
                      ? 'bg-[var(--accent-cobalt)] text-white'
                      : isCompleted
                        ? 'bg-[var(--signal-emerald)] text-white'
                        : 'border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-muted)]',
                  )}
                >
                  {isCompleted ? <Check className="h-3 w-3" /> : formatNumber(idx + 1)}
                </span>
                {isCurrent ? (
                  <span className="rounded bg-[var(--accent-cobalt)] px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {t.orders.currentStage}
                  </span>
                ) : null}
              </div>
              <p
                className={cn(
                  'font-medium',
                  isCurrent
                    ? 'text-[var(--accent-cobalt)]'
                    : isCompleted
                      ? 'text-[var(--signal-emerald)]'
                      : 'text-[var(--ink-primary)]',
                )}
              >
                {stage.name}
              </p>
              {stage.description ? (
                <p className="line-clamp-2 text-[11px] text-[var(--ink-muted)]">
                  {stage.description}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
