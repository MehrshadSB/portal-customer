'use client';

import { useI18n } from '@portal/i18n/react';
import { PERMISSIONS } from '@portal/types';
import { AppShell, Button, LocaleSwitcher, StatusBadge, type NavItem } from '@portal/ui';
import {
  Building2,
  ClipboardList,
  FolderLock,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { useAdminSession } from '@/hooks/use-admin-session';
import { adminApi } from '@/lib/api';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading, hasPermission, logout, refetch } = useAdminSession(true);
  const { t, brandName, translateRole } = useI18n();

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-canvas)]">
        <div className="space-y-2 text-center">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent-cobalt)] border-t-transparent" />
          <p className="text-xs text-[var(--ink-muted)]">{t.auth.verifyingSession}</p>
        </div>
      </div>
    );
  }

  const navItems: NavItem[] = [
    {
      label: t.admin.nav.operations,
      href: '/',
      icon: <LayoutDashboard className="h-4 w-4" />,
      active: pathname === '/',
    },
    ...(hasPermission(PERMISSIONS.CUSTOMER_READ_ALL) ||
    hasPermission(PERMISSIONS.CUSTOMER_READ_ASSIGNED)
      ? [
          {
            label: t.admin.nav.customers,
            href: '/customers',
            icon: <Building2 className="h-4 w-4" />,
            active: pathname.startsWith('/customers'),
          },
        ]
      : []),
    {
      label: t.admin.nav.orders,
      href: '/#orders',
      icon: <ClipboardList className="h-4 w-4" />,
      badge: '1B',
      active: pathname.startsWith('/orders'),
    },
    {
      label: t.admin.nav.tickets,
      href: '/#tickets',
      icon: <LifeBuoy className="h-4 w-4" />,
      badge: '1C',
      active: pathname.startsWith('/tickets'),
    },
    {
      label: t.admin.nav.documents,
      href: '/#documents',
      icon: <FolderLock className="h-4 w-4" />,
      badge: '1B',
      active: pathname.startsWith('/documents'),
    },
    {
      label: t.admin.nav.employees,
      href: '/employees',
      icon: <Users className="h-4 w-4" />,
      active: pathname.startsWith('/employees'),
    },
    {
      label: t.admin.nav.departments,
      href: '/departments',
      icon: <Layers className="h-4 w-4" />,
      active: pathname.startsWith('/departments'),
    },
    ...(hasPermission(PERMISSIONS.AUDIT_LOG_READ)
      ? [
          {
            label: t.admin.nav.auditLogs,
            href: '/audit-logs',
            icon: <ShieldCheck className="h-4 w-4" />,
            active: pathname.startsWith('/audit-logs'),
          },
        ]
      : []),
    ...(hasPermission(PERMISSIONS.ROLE_PERMISSION_MANAGE) ||
    hasPermission(PERMISSIONS.SYSTEM_SETTINGS_MANAGE)
      ? [
          {
            label: t.admin.nav.settings,
            href: '/settings',
            icon: <Settings className="h-4 w-4" />,
            active: pathname.startsWith('/settings'),
          },
        ]
      : []),
  ];

  return (
    <AppShell
      brandTitle={brandName}
      brandSubtitle={t.meta.adminSubtitle}
      dense
      navItems={navItems}
      renderLink={(item, className, onClick) => (
        <Link href={item.href} className={className} onClick={onClick}>
          <span className="flex items-center gap-2.5">
            {item.icon}
            <span>{item.label}</span>
          </span>
          {item.badge ? (
            <span className="font-mono-tabular rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--ink-muted)]">
              {item.badge}
            </span>
          ) : null}
        </Link>
      )}
      headerActions={
        <div className="flex items-center gap-2.5">
          <LocaleSwitcher
            onLocaleChange={(next) => {
              void adminApi.patch('/profile', { locale: next }).then(() => refetch());
            }}
          />
          <StatusBadge label={translateRole(user.roles[0] ?? 'employee')} tone="amber" />
          <span className="hidden text-xs text-[var(--ink-muted)] sm:inline">{user.fullName}</span>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="h-3.5 w-3.5" />
            {t.common.signOut}
          </Button>
        </div>
      }
      sidebarFooter={
        <div className="space-y-0.5">
          <p className="truncate text-xs font-medium text-[var(--ink-primary)]">{user.fullName}</p>
          <p dir="ltr" className="truncate font-mono-tabular text-start text-[11px] text-[var(--ink-muted)]">
            {user.email}
          </p>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
