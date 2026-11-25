'use client';

import { I18nProvider, useI18n } from '@portal/i18n/react';
import type { AppLocale, LocalizationSettingsDto } from '@portal/types';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { portalApi } from '@/lib/api';

function LocalizationHydrator({ children }: { children: React.ReactNode }) {
  const { setLocalizationConfig } = useI18n();

  const settingsQuery = useQuery({
    queryKey: ['portal', 'localization-settings'],
    queryFn: async () =>
      (await portalApi.get<LocalizationSettingsDto>('/settings/localization')).data,
    staleTime: 60_000,
    retry: false,
  });

  React.useEffect(() => {
    if (settingsQuery.data) {
      setLocalizationConfig(settingsQuery.data);
    }
  }, [settingsQuery.data, setLocalizationConfig]);

  return <>{children}</>;
}

export function QueryProvider({
  initialLocale,
  children,
}: {
  initialLocale: AppLocale;
  children: React.ReactNode;
}) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider initialLocale={initialLocale}>
        <LocalizationHydrator>{children}</LocalizationHydrator>
      </I18nProvider>
    </QueryClientProvider>
  );
}
