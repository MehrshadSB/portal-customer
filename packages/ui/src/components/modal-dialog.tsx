'use client';

import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';

export interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function ModalDialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: ModalDialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          'relative z-10 w-full max-w-lg rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-lg',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-hairline)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink-primary)]">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded p-1 text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
