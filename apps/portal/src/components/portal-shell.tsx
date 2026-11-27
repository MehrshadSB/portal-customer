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
  FileText,
  FolderLock,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  UserCircle,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { usePortalSession } from '@/hooks/use-portal-session';
import { createPortalSocket, portalApi } from '@/lib/api';

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading, hasPermission, logout, refetch } = usePortalSession(true);
  const { t, brandName, translateRole } = useI18n();

  const notificationsQuery = useQuery({
    queryKey: ['portal', 'notifications'],
    queryFn: async () => (await portalApi.get<NotificationDto[]>('/notifications?limit=15')).data,
    enabled: Boolean(user),
  });

  const unreadQuery = useQuery({
    queryKey: ['portal', 'notifications', 'unread'],
    queryFn: async () =>
      (await portalApi.get<{ unreadCount: number }>('/notifications/unread-count')).data,
    enabled: Boolean(user),
  });

  React.useEffect(() => {
    if (!user) return;
    const socket = createPortalSocket();
    socket.on(REALTIME_EVENTS.NOTIFICATION_NEW, () => {
      void queryClient.invalidateQueries({ queryKey: ['portal', 'notifications'] });
    });
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [user, queryClient]);

  const markRead = useMutation({
    mutationFn: (id: string) => portalApi.patch(`/notifications/${id}/read`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['portal', 'notifications'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => portalApi.post('/notifications/read-all'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['portal', 'notifications'] });
    },
  });

  if (isLoading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--color-paper)] text-[var(--color-ink)]">
        <div className="space-y-2.5 text-center">
          <div
            aria-hidden="true"
            className="mx-auto h-6 w-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent motion-safe:animate-spin"
          />
          <p className="text-xs font-medium text-[var(--color-muted)]">{t.auth.verifyingSession}</p>
        </div>
      </div>
    );
  }

  const navItems: NavItem[] = [
    {
      label: t.portal.nav.overview,
      href: '/',
      icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" />,
      active: pathname === '/',
    },
    ...(hasPermission(PERMISSIONS.ORDER_READ_COMPANY)
      ? [
          {
            label: t.portal.nav.orders,
            href: '/orders',
            icon: <FileText className="h-4 w-4" aria-hidden="true" />,
            active: pathname.startsWith('/orders'),
          },
        ]
      : []),
    ...(hasPermission(PERMISSIONS.TICKET_READ_COMPANY)
      ? [
          {
            label: t.portal.nav.tickets,
            href: '/tickets',
            icon: <LifeBuoy className="h-4 w-4" aria-hidden="true" />,
            active: pathname.startsWith('/tickets'),
          },
        ]
      : []),
    ...(hasPermission(PERMISSIONS.DOCUMENT_READ_PUBLIC)
      ? [
          {
            label: t.portal.nav.documents,
            href: '/documents',
            icon: <FolderLock className="h-4 w-4" aria-hidden="true" />,
            active: pathname.startsWith('/documents'),
          },
        ]
      : []),
    ...(hasPermission(PERMISSIONS.CUSTOMER_READ_OWN)
      ? [
          {
            label: t.portal.nav.team,
            href: '/team',
            icon: <Users className="h-4 w-4" aria-hidden="true" />,
            active: pathname.startsWith('/team'),
          },
        ]
      : []),
    {
      label: t.portal.nav.profile,
      href: '/profile',
      icon: <UserCircle className="h-4 w-4" aria-hidden="true" />,
      active: pathname.startsWith('/profile'),
    },
  ];

  return (
    <AppShell
      variant="topbar"
      brandTitle={user.customerName ?? brandName}
      brandSubtitle={t.meta.portalSubtitle}
      navItems={navItems}
      renderLink={(item, className, onClick) => (
        <Link href={item.href} className={className} onClick={onClick}>
          <span className="flex items-center gap-2">
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
              void portalApi.patch('/profile', { locale: next }).then(() => refetch());
            }}
          />
          <span className="hidden sm:inline-flex">
            <StatusBadge label={translateRole(user.roles[0] ?? 'customer_member')} tone="cobalt" />
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
          <StatusBadge label={translateRole(user.roles[0] ?? 'customer_member')} tone="cobalt" />
          <p className="truncate text-xs font-medium text-[var(--color-ink)]">{user.fullName}</p>
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
