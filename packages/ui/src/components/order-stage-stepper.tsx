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
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-[var(--color-ink)]">
          {sorted[currentIndex]?.name ?? ''}
        </span>
        <span className="font-mono-tabular font-medium text-[var(--color-muted)]">
          {interpolate(t.orders.stageStepOf, {
            current: formatNumber(currentIndex + 1),
            total: formatNumber(sorted.length),
          })}
        </span>
      </div>

      <ol className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {sorted.map((stage, idx) => {
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          return (
            <li
              key={stage.id}
              aria-current={isCurrent ? 'step' : undefined}
              className={cn(
                'flex flex-col gap-1.5 rounded-[var(--radius-input)] border p-3 text-xs transition-colors duration-[var(--dur-micro)]',
                isCurrent
                  ? 'border-[var(--color-board)] bg-[var(--color-board)] text-[var(--color-board-type)]'
                  : isCompleted
                    ? 'border-[var(--color-signal-emerald-border)] bg-[var(--color-signal-emerald-bg)] text-[var(--color-ink)]'
                    : 'border-[var(--color-rule)] bg-[var(--color-paper)] text-[var(--color-muted)]',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'font-mono-tabular flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-xs font-semibold',
                    isCurrent
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-ink)]'
                      : isCompleted
                        ? 'bg-[var(--color-signal-emerald)] text-[var(--color-board-type)]'
                        : 'border border-[var(--color-rule-2)] bg-[var(--color-cotton)] text-[var(--color-muted)]',
                  )}
                >
                  {isCompleted ? <Check className="h-3 w-3" aria-hidden="true" /> : formatNumber(idx + 1)}
                </span>
                {isCurrent ? (
                  <span className="text-xs font-medium text-[var(--color-accent)]">
                    {t.orders.currentStage}
                  </span>
                ) : null}
              </div>
              <p
                className={cn(
                  'font-semibold',
                  isCurrent
                    ? 'text-[var(--color-board-type)]'
                    : isCompleted
                      ? 'text-[var(--color-signal-emerald)]'
                      : 'text-[var(--color-ink-2)]',
                )}
              >
                {stage.name}
              </p>
              {stage.description ? (
                <p
                  className={cn(
                    'line-clamp-2 text-xs leading-relaxed',
                    isCurrent ? 'text-[var(--color-board-type)]/80' : 'text-[var(--color-muted)]',
                  )}
                >
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
