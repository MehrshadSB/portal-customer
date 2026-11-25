'use client';

import type { PermissionKey, SessionUser } from '@portal/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { adminApi } from '@/lib/api';

export const ADMIN_SESSION_KEY = ['admin', 'session'] as const;

export function useAdminSession(redirectIfUnauthenticated = true) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ADMIN_SESSION_KEY,
    queryFn: async () => {
      const res = await adminApi.get<SessionUser>('/auth/me');
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
      await adminApi.post('/auth/admin/logout');
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
