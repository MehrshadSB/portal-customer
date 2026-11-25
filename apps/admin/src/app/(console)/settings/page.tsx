'use client';

import { useI18n } from '@portal/i18n/react';
import {
  PERMISSIONS,
  SUPPORTED_LOCALES,
  type AppLocale,
  type CalendarType,
  type LocalizationSettingsDto,
  type PermissionDto,
  type RoleDto,
} from '@portal/types';
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  Select,
  StatusBadge,
} from '@portal/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useAdminSession } from '@/hooks/use-admin-session';
import { adminApi } from '@/lib/api';

export default function AdminSettingsPage() {
  const { hasPermission } = useAdminSession(false);
  const { t, formatNumber, setLocalizationConfig, translateError, translateRole, translateStatus } =
    useI18n();
  const queryClient = useQueryClient();

  const canManageLocalization = hasPermission(PERMISSIONS.SYSTEM_SETTINGS_MANAGE);
  const canManageRbac = hasPermission(PERMISSIONS.ROLE_PERMISSION_MANAGE);

  const [selectedRoleId, setSelectedRoleId] = React.useState<string>('');
  const [draftKeys, setDraftKeys] = React.useState<Set<string>>(new Set());
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Localization state
  const [defaultLocale, setDefaultLocale] = React.useState<AppLocale>('fa');
  const [enabledLocales, setEnabledLocales] = React.useState<Set<AppLocale>>(new Set(['fa', 'en']));
  const [calendarType, setCalendarType] = React.useState<CalendarType>('jalali');
  const [brandNameFa, setBrandNameFa] = React.useState('آذرپارت صنعت');
  const [brandNameEn, setBrandNameEn] = React.useState('AzarPart Mfg');
  const [locFeedback, setLocFeedback] = React.useState<string | null>(null);

  const localizationQuery = useQuery({
    queryKey: ['admin', 'localization-settings'],
    queryFn: async () =>
      (await adminApi.get<LocalizationSettingsDto>('/settings/localization')).data,
  });

  React.useEffect(() => {
    const d = localizationQuery.data;
    if (!d) return;
    setDefaultLocale(d.defaultLocale);
    setEnabledLocales(new Set(d.enabledLocales));
    setCalendarType(d.calendarType);
    setBrandNameFa(d.brandNameFa);
    setBrandNameEn(d.brandNameEn);
  }, [localizationQuery.data]);

  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: async () => (await adminApi.get<RoleDto[]>('/roles')).data,
    enabled: canManageRbac,
  });

  const permissionsQuery = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: async () => (await adminApi.get<PermissionDto[]>('/permissions')).data,
    enabled: canManageRbac,
  });

  const roles = React.useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);
  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? roles[0];

  React.useEffect(() => {
    if (selectedRole) {
      if (!selectedRoleId) setSelectedRoleId(selectedRole.id);
      setDraftKeys(new Set(selectedRole.permissionKeys));
    }
  }, [selectedRole, selectedRoleId]);

  const saveLocMutation = useMutation({
    mutationFn: () =>
      adminApi.patch<LocalizationSettingsDto>('/settings/localization', {
        defaultLocale,
        enabledLocales: [...enabledLocales],
        calendarType,
        brandNameFa,
        brandNameEn,
      }),
    onSuccess: async (res) => {
      setErrorMsg(null);
      setLocFeedback(t.admin.settings.localizationSaved);
      setLocalizationConfig(res.data);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'localization-settings'] });
    },
    onError: (err) => {
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      setErrorMsg(translateError(code, err instanceof Error ? err.message : 'Unable to save settings'));
    },
  });

  const saveRbacMutation = useMutation({
    mutationFn: (payload: { roleId: string; permissionKeys: string[] }) =>
      adminApi.patch<RoleDto>(`/roles/${payload.roleId}/permissions`, {
        permissionKeys: payload.permissionKeys,
      }),
    onSuccess: async () => {
      setErrorMsg(null);
      setFeedback(t.admin.settings.permissionsSaved);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
    onError: (err) => {
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      setErrorMsg(translateError(code, err instanceof Error ? err.message : 'Unable to save permissions'));
    },
  });

  const toggleEnabledLocale = (code: AppLocale) => {
    setEnabledLocales((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        if (next.size <= 1 || code === defaultLocale) return prev;
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const toggleKey = (key: string) => {
    if (selectedRole?.slug === 'admin') return;
    setDraftKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.admin.settings.eyebrow}
        title={t.admin.settings.title}
        description={t.admin.settings.description}
      />

      {errorMsg ? <AlertBanner tone="crimson">{errorMsg}</AlertBanner> : null}

      {/* Platform Language & Localization Setup */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{t.admin.settings.localizationTitle}</CardTitle>
              <CardDescription>{t.admin.settings.localizationDesc}</CardDescription>
            </div>
            {canManageLocalization ? (
              <Button
                size="sm"
                disabled={saveLocMutation.isPending}
                onClick={() => saveLocMutation.mutate()}
              >
                {saveLocMutation.isPending ? t.common.saving : t.admin.settings.saveLocalization}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {locFeedback ? <AlertBanner tone="emerald">{locFeedback}</AlertBanner> : null}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="loc-default">{t.admin.settings.defaultLanguageLabel}</Label>
              <Select
                id="loc-default"
                value={defaultLocale}
                disabled={!canManageLocalization}
                onChange={(e) => {
                  const next = e.target.value as AppLocale;
                  setDefaultLocale(next);
                  setEnabledLocales((prev) => new Set(prev).add(next));
                }}
              >
                {SUPPORTED_LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {code === 'fa' ? t.meta.persianLabel : t.meta.englishLabel}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="loc-calendar">{t.admin.settings.calendarTypeLabel}</Label>
              <Select
                id="loc-calendar"
                value={calendarType}
                disabled={!canManageLocalization}
                onChange={(e) => setCalendarType(e.target.value as CalendarType)}
              >
                <option value="jalali">{t.admin.settings.jalaliOption}</option>
                <option value="gregorian">{t.admin.settings.gregorianOption}</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brand-fa">{t.admin.settings.brandNameFaLabel}</Label>
              <Input
                id="brand-fa"
                value={brandNameFa}
                disabled={!canManageLocalization}
                onChange={(e) => setBrandNameFa(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brand-en">{t.admin.settings.brandNameEnLabel}</Label>
              <Input
                id="brand-en"
                dir="ltr"
                value={brandNameEn}
                disabled={!canManageLocalization}
                onChange={(e) => setBrandNameEn(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t.admin.settings.enabledLanguagesLabel}</Label>
            <div className="flex flex-wrap gap-3">
              {SUPPORTED_LOCALES.map((code) => (
                <label
                  key={code}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/40 px-3 py-1.5 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={enabledLocales.has(code)}
                    disabled={!canManageLocalization || code === defaultLocale}
                    onChange={() => toggleEnabledLocale(code)}
                    className="accent-[var(--accent-cobalt)]"
                  />
                  <span>{code === 'fa' ? t.meta.persianLabel : t.meta.englishLabel}</span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {canManageRbac ? (
        <>
          {feedback ? <AlertBanner tone="emerald">{feedback}</AlertBanner> : null}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>{t.admin.settings.rolesTitle}</CardTitle>
                <CardDescription>{t.admin.settings.rolesDesc}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5 p-3">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => {
                      setSelectedRoleId(role.id);
                      setDraftKeys(new Set(role.permissionKeys));
                      setFeedback(null);
                    }}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-start text-xs transition-colors ${
                      selectedRole?.id === role.id
                        ? 'border-[var(--accent-cobalt)] bg-[var(--accent-cobalt)]/10'
                        : 'border-transparent hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <div>
                      <p className="font-medium text-[var(--ink-primary)]">
                        {translateRole(role.slug)}
                      </p>
                      <p className="text-[11px] text-[var(--ink-muted)]">
                        <span dir="ltr" className="font-mono-tabular">
                          {role.slug}
                        </span>{' '}
                        · {formatNumber(role.permissionKeys.length)} {t.admin.settings.permsCountSuffix}
                      </p>
                    </div>
                    <StatusBadge
                      label={translateStatus(role.scope)}
                      tone={role.scope === 'employee' ? 'amber' : 'cobalt'}
                    />
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle>
                      {selectedRole ? translateRole(selectedRole.slug) : t.admin.settings.rolesTitle}
                    </CardTitle>
                    <CardDescription>{selectedRole?.description}</CardDescription>
                  </div>
                  {selectedRole && selectedRole.slug !== 'admin' ? (
                    <Button
                      size="sm"
                      disabled={saveRbacMutation.isPending}
                      onClick={() =>
                        saveRbacMutation.mutate({
                          roleId: selectedRole.id,
                          permissionKeys: [...draftKeys],
                        })
                      }
                    >
                      {saveRbacMutation.isPending
                        ? t.common.saving
                        : t.admin.settings.savePermissions}
                    </Button>
                  ) : (
                    <StatusBadge label={t.admin.settings.adminLockedBadge} tone="slate" />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2">
                  {permissionsQuery.data?.map((perm) => {
                    const checked = draftKeys.has(perm.key);
                    return (
                      <label
                        key={perm.id}
                        className="flex cursor-pointer items-start gap-2.5 rounded-md border border-[var(--border-hairline)] px-3 py-2 text-xs hover:bg-[var(--bg-subtle)]/50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={selectedRole?.slug === 'admin'}
                          onChange={() => toggleKey(perm.key)}
                          className="mt-0.5 accent-[var(--accent-cobalt)]"
                        />
                        <span className="min-w-0">
                          <span dir="ltr" className="font-mono-tabular block text-start font-medium text-[var(--ink-primary)]">
                            {perm.key}
                          </span>
                          <span dir="ltr" className="block text-start text-[11px] text-[var(--ink-muted)]">
                            {perm.resource} · {perm.action}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
