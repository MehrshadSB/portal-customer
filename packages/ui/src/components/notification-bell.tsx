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

  React.useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={t.notifications.title}
        onClick={() => setOpen((prev) => !prev)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="font-mono-tabular absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--signal-crimson)] px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : formatNumber(unreadCount)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute end-0 z-50 mt-2 w-80 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-3 py-2.5">
            <span className="text-xs font-semibold text-[var(--ink-primary)]">
              {t.notifications.title}
            </span>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent-cobalt)] hover:underline"
              >
                <CheckCheck className="h-3 w-3" />
                {t.notifications.markAllRead}
              </button>
            ) : null}
          </div>

          <div className="max-h-80 divide-y divide-[var(--border-hairline)] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-center text-xs text-[var(--ink-muted)]">
                {t.notifications.empty}
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (!n.isRead) onMarkRead(n.id);
                    setOpen(false);
                    if (n.actionUrl) onNavigate(n.actionUrl);
                  }}
                  className={cn(
                    'block w-full px-3 py-2.5 text-start text-xs transition-colors hover:bg-[var(--bg-subtle)]',
                    !n.isRead && 'bg-[var(--accent-cobalt)]/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-[var(--ink-primary)]">{n.title}</span>
                    {!n.isRead ? (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--accent-cobalt)]" />
                    ) : null}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--ink-muted)]">{n.body}</p>
                  <p className="font-mono-tabular mt-1 text-[10px] text-[var(--ink-muted)]">
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
