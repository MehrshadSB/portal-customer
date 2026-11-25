'use client';

import type { PermissionKey, SessionUser } from '@portal/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { portalApi } from '@/lib/api';

export const PORTAL_SESSION_KEY = ['portal', 'session'] as const;

export function usePortalSession(redirectIfUnauthenticated = true) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: PORTAL_SESSION_KEY,
    queryFn: async () => {
      const res = await portalApi.get<SessionUser>('/auth/me');
      return res.data;
    },
    retry: false,
    staleTime: 30_000,
  });

  React.useEffect(() => {
    if (redirectIfUnauthenticated && query.isError) {
      router.replace('/login');
    }
  }, [redirectIfUnauthenticated, query.isError, router]);

  const logout = React.useCallback(async () => {
    try {
      await portalApi.post('/auth/portal/logout');
    } finally {
      queryClient.clear();
      router.replace('/login');
    }
  }, [queryClient, router]);

  const hasPermission = React.useCallback(
    (perm: PermissionKey) => query.data?.permissions.includes(perm) ?? false,
    [query.data],
  );

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    isAuthenticated: Boolean(query.data),
    hasPermission,
    logout,
    refetch: query.refetch,
  };
}
