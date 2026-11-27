'use client';

import { useI18n } from '@portal/i18n/react';
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
  const dialogRef = React.useRef<HTMLDialogElement | null>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const { t } = useI18n();
  const titleId = React.useId();
  const descId = React.useId();

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  const isWide = Boolean(className && /\bmax-w-(2xl|3xl|4xl)\b/.test(className));

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      data-size={isWide ? 'wide' : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
      className={cn('app-dialog open:flex open:flex-col', !open && 'hidden', className)}
    >
      {open ? (
        <>
          <div className="flex items-start justify-between gap-4 border-b border-[var(--color-rule)] px-5 py-4">
            <div className="min-w-0 space-y-1">
              <h2 id={titleId} className="text-base font-semibold text-[var(--color-ink)]">
                {title}
              </h2>
              {description ? (
                <p id={descId} className="text-xs leading-relaxed text-[var(--color-muted)]">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.common.close}
              className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-input)] text-[var(--color-muted)] transition-colors duration-[var(--dur-micro)] before:absolute before:-inset-1.5 before:content-[''] hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)] active:translate-y-px"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="overflow-y-auto p-5">{children}</div>
        </>
      ) : null}
    </dialog>
  );
}
