import * as React from 'react';
import { cn } from '../lib/cn';

export function SkeletonLine({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'h-3.5 rounded-[var(--radius-input)] bg-[var(--color-paper-2)] motion-safe:animate-pulse',
        className,
      )}
    />
  );
}

export function SkeletonTable({
  rows = 5,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="divide-y divide-[var(--color-rule)]" aria-busy="true">
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="grid items-center gap-4 px-4 py-3.5"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((__, colIdx) => (
            <SkeletonLine
              key={colIdx}
              className={colIdx === 0 ? 'w-20' : colIdx === columns - 1 ? 'ms-auto w-16' : 'w-full'}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonStatStrip({ items = 4 }: { items?: number }) {
  const colsClass =
    items === 3
      ? 'md:grid-cols-3'
      : items === 2
        ? 'sm:grid-cols-2'
        : 'sm:grid-cols-2 lg:grid-cols-4';
  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-rule)] bg-[var(--color-rule)]',
        colsClass,
      )}
      aria-busy="true"
    >
      {Array.from({ length: items }).map((_, idx) => (
        <div key={idx} className="space-y-2.5 bg-[var(--color-cotton)] px-5 py-4">
          <SkeletonLine className="w-24" />
          <SkeletonLine className="h-6 w-16" />
          <SkeletonLine className="w-32" />
        </div>
      ))}
    </div>
  );
}
