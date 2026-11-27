'use client';

import { useI18n } from '@portal/i18n/react';
import type { NotificationDto } from '@portal/types';
import { Bell, CheckCheck } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';

export interface NotificationBellProps {
  notifications: NotificationDto[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onNavigate: (url: string) => void;
}

export function NotificationBell({
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onNavigate,
}: NotificationBellProps) {
  const { t, formatDateTime, formatNumber } = useI18n();
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus();
  }, [open]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Home') {
      items[0]?.focus();
    } else if (event.key === 'End') {
      items[items.length - 1]?.focus();
    } else if (event.key === 'ArrowDown') {
      items[(currentIndex + 1) % items.length]?.focus();
    } else {
      items[(currentIndex - 1 + items.length) % items.length]?.focus();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t.notifications.title}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
        className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-[var(--radius-input)] border border-[var(--color-rule-2)] bg-[var(--color-cotton)] text-[var(--color-ink-2)] transition-colors duration-[var(--dur-micro)] before:absolute before:-inset-1.5 before:content-[''] hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)] active:translate-y-px"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            role="status"
            className="font-mono-tabular absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--color-accent-2)] px-1 text-xs font-semibold leading-none text-[var(--color-board-type)]"
          >
            {unreadCount > 99 ? '99+' : formatNumber(unreadCount)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          className="absolute end-0 z-[var(--z-dropdown)] mt-2 w-80 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-rule-2)] bg-[var(--color-cotton)] shadow-[var(--cast-stock-lift)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--color-rule)] bg-[var(--color-paper-2)] px-3.5 py-2.5">
            <span className="text-xs font-semibold text-[var(--color-ink)]">
              {t.notifications.title}
            </span>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[var(--color-accent-2)] hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t.notifications.markAllRead}
              </button>
            ) : null}
          </div>

          <div className="max-h-80 divide-y divide-[var(--color-rule)] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-5 text-center text-xs text-[var(--color-muted)]">
                {t.notifications.empty}
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (!n.isRead) onMarkRead(n.id);
                    setOpen(false);
                    if (n.actionUrl) onNavigate(n.actionUrl);
                  }}
                  className={cn(
                    'block w-full cursor-pointer px-3.5 py-3 text-start text-xs transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper)]',
                    !n.isRead && 'border-s-2 border-s-[var(--color-accent-2)] bg-[var(--color-paper)]',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-[var(--color-ink)]">{n.title}</span>
                    {!n.isRead ? (
                      <span className="shrink-0 text-xs font-medium text-[var(--color-accent-2)]">
                        {t.notifications.unreadLabel}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-muted)]">{n.body}</p>
                  <p className="font-mono-tabular mt-1 text-xs text-[var(--color-muted)]">
                    {formatDateTime(n.createdAt)}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
