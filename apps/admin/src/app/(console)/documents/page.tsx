'use client';

import { useI18n } from '@portal/i18n/react';
import {
  ATTACHMENT_VISIBILITIES,
  PERMISSIONS,
  type AttachmentDto,
  type CustomerDto,
} from '@portal/types';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  FileDropzone,
  Input,
  PageHeader,
  Select,
  StatusBadge,
} from '@portal/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FolderLock, Search, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useAdminSession } from '@/hooks/use-admin-session';
import {
  adminApi,
  downloadAdminAttachment,
  uploadAdminAttachment,
} from '@/lib/api';

export default function AdminDocumentsPage() {
  const { user, hasPermission } = useAdminSession(false);
  const { t, formatDateTime, translateStatus } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const [visibilityFilter, setVisibilityFilter] = React.useState('');
  const [uploadCustomerId, setUploadCustomerId] = React.useState('');
  const [uploadVisibility, setUploadVisibility] = React.useState<'customer_visible' | 'internal_only'>('customer_visible');

  const canUpload = hasPermission(PERMISSIONS.DOCUMENT_UPLOAD);
  const canDeleteAll = hasPermission(PERMISSIONS.DOCUMENT_DELETE_ALL);

  const customersQuery = useQuery({
    queryKey: ['admin', 'customers', 'lookup'],
    queryFn: () => adminApi.get<CustomerDto[]>('/customers?limit=100'),
    enabled: canUpload,
  });

  const firstCustId = customersQuery.data?.data?.[0]?.id;
  React.useEffect(() => {
    if (firstCustId && !uploadCustomerId) {
      setUploadCustomerId(firstCustId);
    }
  }, [firstCustId, uploadCustomerId]);

  const docsQuery = useQuery({
    queryKey: ['admin', 'documents', { search, visibilityFilter }],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '50' });
      if (search.trim()) params.set('search', search.trim());
      if (visibilityFilter) params.set('visibility', visibilityFilter);
      return adminApi.get<AttachmentDto[]>(`/documents?${params.toString()}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.delete(`/documents/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'documents'] });
    },
  });

  const items = docsQuery.data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.documents.eyebrow}
        title={t.documents.title}
        description={t.documents.adminDescription}
      />

      {canUpload ? (
        <div className="space-y-3 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <div className="flex flex-wrap gap-3">
            <Select
              value={uploadCustomerId}
              onChange={(e) => setUploadCustomerId(e.target.value)}
              className="w-64"
            >
              {customersQuery.data?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customerCode} — {c.companyName}
                </option>
              ))}
            </Select>
            <Select
              value={uploadVisibility}
              onChange={(e) =>
                setUploadVisibility(e.target.value as 'customer_visible' | 'internal_only')
              }
              className="w-48"
            >
              <option value="customer_visible">{t.documents.customerVisible}</option>
              <option value="internal_only">{t.documents.internalOnly}</option>
            </Select>
          </div>
          <FileDropzone
            disabled={!uploadCustomerId}
            onUploadFile={async (file) => {
              await uploadAdminAttachment(file, {
                customerId: uploadCustomerId,
                visibility: uploadVisibility,
              });
              await queryClient.invalidateQueries({ queryKey: ['admin', 'documents'] });
            }}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-[var(--ink-muted)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.common.search}
            className="ps-9"
          />
        </div>
        <Select
          value={visibilityFilter}
          onChange={(e) => setVisibilityFilter(e.target.value)}
          className="w-48"
        >
          <option value="">{t.common.allStatuses}</option>
          {ATTACHMENT_VISIBILITIES.map((v) => (
            <option key={v} value={v}>
              {translateStatus(v)}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {docsQuery.isLoading ? (
            <p className="p-6 text-xs text-[var(--ink-muted)]">{t.common.loading}</p>
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<FolderLock className="h-4 w-4" />}
                title={t.documents.emptyTitle}
                description={t.documents.emptyDesc}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--ink-muted)]">
                    <th className="px-4 py-2.5 font-medium">{t.documents.filename}</th>
                    <th className="px-4 py-2.5 font-medium">{t.documents.size}</th>
                    <th className="px-4 py-2.5 font-medium">{t.documents.uploadedBy}</th>
                    <th className="px-4 py-2.5 font-medium">{t.documents.visibility}</th>
                    <th className="px-4 py-2.5 font-medium">{t.common.timestamp}</th>
                    <th className="px-4 py-2.5 text-end font-medium">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {items.map((doc) => (
                    <tr key={doc.id} className="hover:bg-[var(--bg-subtle)]/50">
                      <td dir="ltr" className="px-4 py-2.5 text-start font-medium">
                        {doc.originalFilename}
                      </td>
                      <td dir="ltr" className="font-mono-tabular px-4 py-2.5 text-start">
                        {Math.max(1, Math.round(doc.sizeBytes / 1024))} KB
                      </td>
                      <td className="px-4 py-2.5 text-[var(--ink-muted)]">
                        {doc.uploadedByName ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          label={translateStatus(doc.visibility)}
                          tone={doc.visibility === 'internal_only' ? 'amber' : 'emerald'}
                        />
                      </td>
                      <td className="font-mono-tabular px-4 py-2.5 text-[var(--ink-muted)]">
                        {formatDateTime(doc.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 text-end">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void downloadAdminAttachment(doc.id)}
                          >
                            <Download className="h-3.5 w-3.5" />
                            {t.common.download}
                          </Button>
                          {canDeleteAll || doc.uploadedByUserId === user?.id ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMutation.mutate(doc.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-[var(--signal-crimson)]" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
