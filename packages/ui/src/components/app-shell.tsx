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
  variant?: 'sidebar' | 'topbar';
  children: React.ReactNode;
}

function BrandMark() {
  return (
    <span
      data-brand-mark="logo"
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-input)] border border-[var(--color-rule-2)] bg-[var(--color-board)]"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <rect x="4" y="4.5" width="16" height="3.5" rx="1" fill="var(--color-board-type)" />
        <rect x="4" y="10.25" width="12.5" height="3.5" rx="1" fill="var(--color-accent)" />
        <rect x="4" y="16" width="9" height="3.5" rx="1" fill="var(--color-paper-3)" />
      </svg>
    </span>
  );
}

export function AppShell({
  brandTitle,
  brandSubtitle,
  navItems,
  renderLink,
  headerActions,
  sidebarFooter,
  dense = false,
  variant = 'sidebar',
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { locale } = useI18n();
  const drawerCloseRef = React.useRef<HTMLButtonElement | null>(null);
  const drawerRef = React.useRef<HTMLElement | null>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  const openLabel = locale === 'fa' ? 'باز کردن منو' : 'Open navigation menu';
  const closeLabel = locale === 'fa' ? 'بستن منو' : 'Close navigation menu';
  const skipLabel = locale === 'fa' ? 'پرش به محتوای اصلی' : 'Skip to content';
  const navLabel = locale === 'fa' ? 'ناوبری اصلی' : 'Primary navigation';

  React.useEffect(() => {
    if (!mobileOpen) {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
      return;
    }
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    drawerCloseRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const drawerContent = (
    <div className="flex h-full flex-col justify-between bg-[var(--color-paper-2)]">
      <div>
        <div className="border-b border-[var(--color-rule)] px-4 py-4">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-[var(--color-ink)]">
                {brandTitle}
              </p>
              <p className="truncate text-xs font-medium text-[var(--color-muted)]">
                {brandSubtitle}
              </p>
            </div>
          </div>
        </div>

        <nav aria-label={navLabel} className="space-y-1 p-3">
          {navItems.map((item) => {
            const linkClass = cn(
              'flex items-center justify-between whitespace-nowrap rounded-[var(--radius-input)] px-3 py-2 text-sm transition-colors duration-[var(--dur-micro)]',
              item.active
                ? 'bg-[var(--color-board)] font-medium text-[var(--color-board-type)] shadow-[var(--shadow-card)]'
                : 'text-[var(--color-ink-2)] hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)]',
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
        <div className="border-t border-[var(--color-rule)] bg-[var(--color-paper)] px-4 py-3">
          {sidebarFooter}
        </div>
      ) : null}
    </div>
  );

  const mobileDrawer = mobileOpen ? (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={brandTitle}
    >
      <div
        className="fixed inset-0 bg-[var(--scrim-modal)]"
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        className="relative z-10 w-72 border-e border-[var(--color-rule-2)] bg-[var(--color-paper-2)] shadow-[var(--cast-stock-lift)]"
      >
        <button
          ref={drawerCloseRef}
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label={closeLabel}
          className="absolute end-3 top-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-[var(--radius-input)] text-[var(--color-muted)] before:absolute before:-inset-1.5 before:content-[''] hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)] active:translate-y-px"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        {drawerContent}
      </aside>
    </div>
  ) : null;

  if (variant === 'topbar') {
    return (
      <div className="flex min-h-dvh flex-col bg-[var(--color-paper)] text-[var(--color-ink)]">
        <a href="#main-content" className="skip-link">
          {skipLabel}
        </a>

        {mobileDrawer}

        <header className="sticky top-0 z-[var(--z-sticky-nav)] border-b border-[var(--color-rule)] bg-[var(--color-cotton)]">
          <div className="mx-auto flex h-14 max-w-[var(--container)] items-center justify-between gap-4 px-4 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label={openLabel}
                className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius-input)] border border-[var(--color-rule-2)] bg-[var(--color-paper)] text-[var(--color-ink-2)] before:absolute before:-inset-1 before:content-[''] hover:bg-[var(--color-paper-2)] lg:hidden"
              >
                <Menu className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="flex min-w-0 items-center gap-2.5">
                <BrandMark />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold tracking-tight text-[var(--color-ink)]">
                    {brandTitle}
                  </p>
                  <p className="truncate text-xs text-[var(--color-muted)]">{brandSubtitle}</p>
                </div>
              </div>
            </div>

            {headerActions ? (
              <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
            ) : null}
          </div>

          <div className="hidden border-t border-[var(--color-rule)] bg-[var(--color-paper-2)]/70 lg:block">
            <nav
              aria-label={navLabel}
              className="mx-auto flex max-w-[var(--container)] items-center gap-1 overflow-x-auto px-4 py-1.5 lg:px-8"
            >
              {navItems.map((item) => {
                const linkClass = cn(
                  'inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-[var(--radius-input)] px-3 text-sm transition-colors duration-[var(--dur-micro)]',
                  item.active
                    ? 'bg-[var(--color-board)] font-medium text-[var(--color-board-type)] shadow-[var(--shadow-card)]'
                    : 'text-[var(--color-ink-2)] hover:bg-[var(--color-cotton)] hover:text-[var(--color-ink)]',
                );
                return <div key={item.href}>{renderLink(item, linkClass)}</div>;
              })}
            </nav>
          </div>
        </header>

        <main
          id="main-content"
          className={cn(
            'mx-auto w-full flex-1 px-4 py-6 lg:px-8',
            !dense && 'max-w-[var(--container)]',
          )}
        >
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-[var(--color-paper)] text-[var(--color-ink)]">
      <a href="#main-content" className="skip-link">
        {skipLabel}
      </a>

      <aside className="hidden w-64 shrink-0 border-e border-[var(--color-rule)] bg-[var(--color-paper-2)] lg:block">
        <div className="sticky top-0 h-dvh overflow-y-auto">{drawerContent}</div>
      </aside>

      {mobileDrawer}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[var(--z-sticky-nav)] flex h-14 items-center justify-between gap-3 border-b border-[var(--color-rule)] bg-[var(--color-cotton)] px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label={openLabel}
              className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-input)] border border-[var(--color-rule-2)] bg-[var(--color-paper)] text-[var(--color-ink-2)] before:absolute before:-inset-1 before:content-[''] hover:bg-[var(--color-paper-2)] lg:hidden"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="min-w-0 truncate text-xs font-medium text-[var(--color-muted)]">
              {brandSubtitle}
            </span>
          </div>
          {headerActions ? <div className="flex items-center gap-2">{headerActions}</div> : null}
        </header>

        <main
          id="main-content"
          className={cn('flex-1 px-4 py-6 lg:px-8', !dense && 'mx-auto w-full max-w-[var(--container)]')}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
