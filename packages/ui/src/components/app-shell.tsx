'use client';

import { useI18n } from '@portal/i18n/react';
import { Menu, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';

export interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  badge?: string | number;
  active?: boolean;
}

export interface AppShellProps {
  brandTitle: string;
  brandSubtitle: string;
  navItems: NavItem[];
  renderLink: (item: NavItem, className: string, onClick?: () => void) => React.ReactNode;
  headerActions?: React.ReactNode;
  sidebarFooter?: React.ReactNode;
  dense?: boolean;
  children: React.ReactNode;
}

export function AppShell({
  brandTitle,
  brandSubtitle,
  navItems,
  renderLink,
  headerActions,
  sidebarFooter,
  dense = false,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { locale } = useI18n();

  const openLabel = locale === 'fa' ? 'باز کردن منو' : 'Open navigation menu';
  const closeLabel = locale === 'fa' ? 'بستن منو' : 'Close navigation menu';

  const navContent = (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="border-b border-[var(--border-hairline)] px-4 py-4">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[var(--accent-cobalt)] bg-[var(--accent-cobalt)]/10 font-mono-tabular text-xs font-bold text-[var(--accent-cobalt)]"
            >
              AP
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-[var(--ink-primary)]">
                {brandTitle}
              </p>
              <p className="truncate text-[11px] font-medium text-[var(--ink-muted)]">
                {brandSubtitle}
              </p>
            </div>
          </div>
        </div>

        <nav aria-label="Primary navigation" className="space-y-0.5 p-2.5">
          {navItems.map((item) => {
            const linkClass = cn(
              'flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors duration-150',
              item.active
                ? 'bg-[var(--accent-cobalt)]/10 font-medium text-[var(--accent-cobalt)]'
                : 'text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]',
            );
            return (
              <div key={item.href}>
                {renderLink(item, linkClass, () => setMobileOpen(false))}
              </div>
            );
          })}
        </nav>
      </div>

      {sidebarFooter ? (
        <div className="border-t border-[var(--border-hairline)] p-3">{sidebarFooter}</div>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[var(--bg-canvas)] text-[var(--ink-primary)]">
      {/* Desktop Sidebar (logical border-e works in both RTL & LTR) */}
      <aside className="hidden w-64 shrink-0 border-e border-[var(--border-hairline)] bg-[var(--bg-surface)] lg:block">
        {navContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 border-e border-[var(--border-hairline)] bg-[var(--bg-surface)]">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label={closeLabel}
              className="absolute end-3 top-3 rounded p-1.5 text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)]"
            >
              <X className="h-4 w-4" />
            </button>
            {navContent}
          </aside>
        </div>
      ) : null}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]/95 px-4 backdrop-blur-xs lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label={openLabel}
              className="rounded-md border border-[var(--border-hairline)] p-1.5 text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="text-xs font-medium text-[var(--ink-muted)]">{brandSubtitle}</span>
          </div>
          {headerActions ? <div className="flex items-center gap-2">{headerActions}</div> : null}
        </header>

        <main className={cn('flex-1 px-4 py-6 lg:px-8', !dense && 'mx-auto w-full max-w-7xl')}>
          {children}
        </main>
      </div>
    </div>
  );
}
