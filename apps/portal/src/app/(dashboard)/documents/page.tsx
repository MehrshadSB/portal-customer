'use client';

import { useI18n } from '@portal/i18n/react';
import { PERMISSIONS, type AttachmentDto } from '@portal/types';
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  EmptyState,
  FileDropzone,
  Input,
  PageHeader,
  SkeletonTable,
  StatusBadge,
} from '@portal/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FolderLock, Search, Trash2 } from 'lucide-react';
import * as React from 'react';
import { usePortalSession } from '@/hooks/use-portal-session';
import {
  downloadPortalAttachment,
  portalApi,
  uploadPortalAttachment,
} from '@/lib/api';

export default function PortalDocumentsPage() {
  const { user, hasPermission } = usePortalSession(false);
  const { t, formatDateTime, formatNumber, translateError, translateStatus } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');

  const canUpload = hasPermission(PERMISSIONS.DOCUMENT_UPLOAD);

  const docsQuery = useQuery({
    queryKey: ['portal', 'documents', { search }],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '50' });
      if (search.trim()) params.set('search', search.trim());
      return portalApi.get<AttachmentDto[]>(`/documents?${params.toString()}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => portalApi.delete(`/documents/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['portal', 'documents'] });
    },
  });

  const items = docsQuery.data?.data ?? [];
  const docError = docsQuery.error ?? deleteMutation.error;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.documents.eyebrow}
        title={t.documents.title}
        description={t.documents.portalDescription}
      />

      {docError ? (
        <AlertBanner tone="crimson">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {translateError(
                typeof docError === 'object' && docError !== null && 'code' in docError
                  ? String(docError.code)
                  : undefined,
                docError instanceof Error ? docError.message : t.common.noData,
              )}
            </span>
            {docsQuery.isError ? (
              <Button variant="outline" size="sm" onClick={() => void docsQuery.refetch()}>
                {t.common.retry}
              </Button>
            ) : null}
          </div>
        </AlertBanner>
      ) : null}

      {canUpload && user?.customerId ? (
        <FileDropzone
          onUploadFile={async (file) => {
            await uploadPortalAttachment(file, { customerId: user.customerId ?? undefined });
            await queryClient.invalidateQueries({ queryKey: ['portal', 'documents'] });
          }}
        />
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-rule)] bg-[var(--color-paper-2)]/60 px-4 py-3">
          <div className="relative w-full max-w-md">
            <Search
              className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-[var(--color-muted)]"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.common.search}
              aria-label={t.common.search}
              className="ps-9"
            />
          </div>
        </div>

        <CardContent className="p-0">
          {docsQuery.isLoading ? (
            <SkeletonTable rows={5} columns={6} />
          ) : docsQuery.isError ? null : items.length === 0 ? (
            <EmptyState
              embedded
              headingLevel="h2"
              icon={<FolderLock className="h-4 w-4" />}
              title={t.documents.emptyTitle}
              description={t.documents.emptyDesc}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-rule)] bg-[var(--color-paper-2)] text-[var(--color-muted)]">
                    <th className="px-4 py-2.5 font-medium">{t.documents.filename}</th>
                    <th className="px-4 py-2.5 font-medium">{t.documents.size}</th>
                    <th className="px-4 py-2.5 font-medium">{t.documents.uploadedBy}</th>
                    <th className="px-4 py-2.5 font-medium">{t.documents.visibility}</th>
                    <th className="px-4 py-2.5 font-medium">{t.common.timestamp}</th>
                    <th className="px-4 py-2.5 text-end font-medium">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-rule)]">
                  {items.map((doc) => (
                    <tr
                      key={doc.id}
                      className="transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper-2)]/60"
                    >
                      <td className="px-4 py-2.5 text-start font-medium text-[var(--color-ink)]">
                        <span dir="ltr" className="inline-block">
                          {doc.originalFilename}
                        </span>
                      </td>
                      <td className="font-mono-tabular px-4 py-2.5 text-start text-[var(--color-ink-2)]">
                        <span dir="ltr" className="inline-block">
                          {formatNumber(Math.max(1, Math.round(doc.sizeBytes / 1024)))} KB
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">
                        {doc.uploadedByName ?? '-'}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge label={translateStatus(doc.visibility)} tone="emerald" />
                      </td>
                      <td className="font-mono-tabular px-4 py-2.5 text-[var(--color-muted)]">
                        {formatDateTime(doc.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 text-end">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void downloadPortalAttachment(doc.id)}
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            {t.common.download}
                          </Button>
                          {doc.uploadedByUserId === user?.id ? (
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
