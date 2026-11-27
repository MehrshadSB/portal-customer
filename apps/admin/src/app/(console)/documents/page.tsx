'use client';

import { useI18n } from '@portal/i18n/react';
import {
  ATTACHMENT_VISIBILITIES,
  PERMISSIONS,
  type AttachmentDto,
  type CustomerDto,
} from '@portal/types';
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  EmptyState,
  FileDropzone,
  Input,
  PageHeader,
  Select,
  SkeletonTable,
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
  const { t, formatDateTime, formatNumber, translateError, translateStatus } = useI18n();
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

      {docsQuery.isError ? (
        <AlertBanner tone="crimson">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {translateError(
                typeof docsQuery.error === 'object' &&
                  docsQuery.error !== null &&
                  'code' in docsQuery.error
                  ? String(docsQuery.error.code)
                  : undefined,
                docsQuery.error instanceof Error ? docsQuery.error.message : t.common.noData,
              )}
            </span>
            <Button variant="outline" size="sm" onClick={() => void docsQuery.refetch()}>
              {t.common.retry}
            </Button>
          </div>
        </AlertBanner>
      ) : null}

      {canUpload ? (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Select
              aria-label={t.orders.customer}
              value={uploadCustomerId}
              onChange={(e) => setUploadCustomerId(e.target.value)}
              className="w-72"
            >
              {customersQuery.data?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.customerCode} (${c.companyName})`}
                </option>
              ))}
            </Select>
            <Select
              aria-label={t.documents.visibility}
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
        </section>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-rule)] bg-[var(--color-paper-2)]/65 p-4">
          <div className="relative min-w-60 flex-1">
            <Search
              className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-[var(--color-muted)]"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t.common.search}
              placeholder={t.common.search}
              className="ps-9"
            />
          </div>
          <Select
            aria-label={t.documents.visibility}
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

        <CardContent className="p-0">
          {docsQuery.isLoading ? (
            <SkeletonTable rows={5} columns={6} />
          ) : docsQuery.isError ? null : items.length === 0 ? (
            <EmptyState
              embedded
              headingLevel="h2"
              icon={<FolderLock className="h-4 w-4" aria-hidden="true" />}
              title={t.documents.emptyTitle}
              description={t.documents.emptyDesc}
              action={
                search || visibilityFilter ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setVisibilityFilter('');
                    }}
                  >
                    {t.common.clearFilters}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-rule)] bg-[var(--color-paper-2)]/75 text-[var(--color-muted)]">
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.documents.filename}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">{t.documents.size}</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.documents.uploadedBy}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.documents.visibility}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">
                      {t.common.timestamp}
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-end font-medium">
                      {t.common.actions}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-rule)]">
                  {items.map((doc) => (
                    <tr
                      key={doc.id}
                      className="transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper)]"
                    >
                      <td className="px-4 py-3 text-start font-medium text-[var(--color-ink)]">
                        <span dir="ltr" className="inline-block">
                          {doc.originalFilename}
                        </span>
                      </td>
                      <td className="font-mono-tabular px-4 py-3 text-start">
                        <span dir="ltr" className="inline-block">
                          {formatNumber(Math.max(1, Math.round(doc.sizeBytes / 1024)))} KB
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">
                        {doc.uploadedByName ?? '-'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={translateStatus(doc.visibility)}
                          tone={doc.visibility === 'internal_only' ? 'amber' : 'emerald'}
                        />
                      </td>
                      <td className="font-mono-tabular px-4 py-3 text-[var(--color-muted)]">
                        {formatDateTime(doc.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void downloadAdminAttachment(doc.id)}
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            {t.common.download}
                          </Button>
                          {canDeleteAll || doc.uploadedByUserId === user?.id ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`${t.common.delete} ${doc.originalFilename}`}
                              onClick={() => deleteMutation.mutate(doc.id)}
                            >
                              <Trash2
                                className="h-3.5 w-3.5 text-[var(--color-signal-crimson)]"
                                aria-hidden="true"
                              />
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
