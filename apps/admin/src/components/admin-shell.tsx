'use client';

import { useI18n } from '@portal/i18n/react';
import { PERMISSIONS, REALTIME_EVENTS, type NotificationDto } from '@portal/types';
import {
  AppShell,
  Button,
  LocaleSwitcher,
  NotificationBell,
  StatusBadge,
  type NavItem,
} from '@portal/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { useAdminSession } from '@/hooks/use-admin-session';
import { adminApi, createAdminSocket } from '@/lib/api';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading, hasPermission, logout, refetch } = useAdminSession(true);
  const { t, brandName, translateRole } = useI18n();

  const notificationsQuery = useQuery({
    queryKey: ['admin', 'notifications'],
    queryFn: async () => (await adminApi.get<NotificationDto[]>('/notifications?limit=15')).data,
    enabled: Boolean(user),
  });

  const unreadQuery = useQuery({
    queryKey: ['admin', 'notifications', 'unread'],
    queryFn: async () =>
      (await adminApi.get<{ unreadCount: number }>('/notifications/unread-count')).data,
    enabled: Boolean(user),
  });

  React.useEffect(() => {
    if (!user) return;
    const socket = createAdminSocket();
    socket.on(REALTIME_EVENTS.NOTIFICATION_NEW, () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
    });
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [user, queryClient]);

  const markRead = useMutation({
    mutationFn: (id: string) => adminApi.patch(`/notifications/${id}/read`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => adminApi.post('/notifications/read-all'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
    },
  });

  if (isLoading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--color-paper)]">
        <div className="space-y-2.5 text-center">
          <div
            aria-hidden="true"
            className="mx-auto h-6 w-6 rounded-full border-2 border-[var(--color-board)] border-t-transparent motion-safe:animate-spin"
          />
          <p className="text-xs font-medium text-[var(--color-muted)]">{t.auth.verifyingSession}</p>
        </div>
      </div>
    );
  }

  const navItems: NavItem[] = [
    {
      label: t.admin.nav.operations,
      href: '/',
      icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" />,
      active: pathname === '/',
    },
    ...(hasPermission(PERMISSIONS.CUSTOMER_READ_ALL) ||
    hasPermission(PERMISSIONS.CUSTOMER_READ_ASSIGNED)
      ? [
          {
            label: t.admin.nav.customers,
            href: '/customers',
            icon: <Building2 className="h-4 w-4" aria-hidden="true" />,
            active: pathname.startsWith('/customers'),
          },
        ]
      : []),
    ...(hasPermission(PERMISSIONS.ORDER_READ_ALL) ||
    hasPermission(PERMISSIONS.ORDER_READ_DEPARTMENT)
      ? [
          {
            label: t.admin.nav.orders,
            href: '/orders',
            icon: <ClipboardList className="h-4 w-4" aria-hidden="true" />,
            active: pathname.startsWith('/orders'),
          },
        ]
      : []),
    ...(hasPermission(PERMISSIONS.TICKET_READ_ALL) ||
    hasPermission(PERMISSIONS.TICKET_READ_DEPARTMENT)
      ? [
          {
            label: t.admin.nav.tickets,
            href: '/tickets',
            icon: <LifeBuoy className="h-4 w-4" aria-hidden="true" />,
            active: pathname.startsWith('/tickets'),
          },
        ]
      : []),
    ...(hasPermission(PERMISSIONS.DOCUMENT_READ_PUBLIC) ||
    hasPermission(PERMISSIONS.DOCUMENT_READ_INTERNAL)
      ? [
          {
            label: t.admin.nav.documents,
            href: '/documents',
            icon: <FolderLock className="h-4 w-4" aria-hidden="true" />,
            active: pathname.startsWith('/documents'),
          },
        ]
      : []),
    {
      label: t.admin.nav.employees,
      href: '/employees',
      icon: <Users className="h-4 w-4" aria-hidden="true" />,
      active: pathname.startsWith('/employees'),
    },
    {
      label: t.admin.nav.departments,
      href: '/departments',
      icon: <Layers className="h-4 w-4" aria-hidden="true" />,
      active: pathname.startsWith('/departments'),
    },
    ...(hasPermission(PERMISSIONS.AUDIT_LOG_READ)
      ? [
          {
            label: t.admin.nav.auditLogs,
            href: '/audit-logs',
            icon: <ShieldCheck className="h-4 w-4" aria-hidden="true" />,
            active: pathname.startsWith('/audit-logs'),
          },
        ]
      : []),
    ...(hasPermission(PERMISSIONS.ROLE_PERMISSION_MANAGE) ||
    hasPermission(PERMISSIONS.SYSTEM_SETTINGS_MANAGE) ||
    hasPermission(PERMISSIONS.WORKFLOW_CONFIGURE)
      ? [
          {
            label: t.admin.nav.settings,
            href: '/settings',
            icon: <Settings className="h-4 w-4" aria-hidden="true" />,
            active: pathname.startsWith('/settings'),
          },
        ]
      : []),
  ];

  return (
    <AppShell
      brandTitle={brandName}
      brandSubtitle={t.meta.adminSubtitle}
      variant="sidebar"
      dense
      navItems={navItems}
      renderLink={(item, className, onClick) => (
        <Link href={item.href} className={className} onClick={onClick}>
          <span className="flex items-center gap-2.5">
            {item.icon}
            <span>{item.label}</span>
          </span>
        </Link>
      )}
      headerActions={
        <div className="flex items-center gap-2">
          <NotificationBell
            notifications={notificationsQuery.data ?? []}
            unreadCount={unreadQuery.data?.unreadCount ?? 0}
            onMarkRead={(id) => markRead.mutate(id)}
            onMarkAllRead={() => markAllRead.mutate()}
            onNavigate={(url) => router.push(url)}
          />
          <LocaleSwitcher
            onLocaleChange={(next) => {
              void adminApi.patch('/profile', { locale: next }).then(() => refetch());
            }}
          />
          <span className="hidden sm:inline-flex">
            <StatusBadge label={translateRole(user.roles[0] ?? 'employee')} tone="amber" />
          </span>
          <span className="hidden text-xs font-medium text-[var(--color-ink-2)] md:inline">
            {user.fullName}
          </span>
          <Button variant="outline" size="sm" aria-label={t.common.signOut} onClick={logout}>
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{t.common.signOut}</span>
          </Button>
        </div>
      }
      sidebarFooter={
        <div className="space-y-1.5">
          <StatusBadge label={translateRole(user.roles[0] ?? 'employee')} tone="amber" />
          <p className="truncate text-xs font-semibold text-[var(--color-ink)]">{user.fullName}</p>
          <p className="font-mono-tabular truncate text-start text-xs text-[var(--color-muted)]">
            {user.phone || user.email ? (
              <span dir="ltr" className="inline-block">
                {user.phone ?? user.email}
              </span>
            ) : (
              '-'
            )}
          </p>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
