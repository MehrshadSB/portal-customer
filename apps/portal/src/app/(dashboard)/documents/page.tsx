'use client';

import { useI18n } from '@portal/i18n/react';
import { PERMISSIONS, type AttachmentDto } from '@portal/types';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  FileDropzone,
  Input,
  PageHeader,
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
  const { t, formatDateTime, translateStatus } = useI18n();
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

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.documents.eyebrow}
        title={t.documents.title}
        description={t.documents.portalDescription}
      />

      {canUpload && user?.customerId ? (
        <FileDropzone
          onUploadFile={async (file) => {
            await uploadPortalAttachment(file, { customerId: user.customerId ?? undefined });
            await queryClient.invalidateQueries({ queryKey: ['portal', 'documents'] });
          }}
        />
      ) : null}

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-[var(--ink-muted)]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.common.search}
          className="ps-9"
        />
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
                        <StatusBadge label={translateStatus(doc.visibility)} tone="emerald" />
                      </td>
                      <td className="font-mono-tabular px-4 py-2.5 text-[var(--ink-muted)]">
                        {formatDateTime(doc.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 text-end">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void downloadPortalAttachment(doc.id)}
                          >
                            <Download className="h-3.5 w-3.5" />
                            {t.common.download}
                          </Button>
                          {doc.uploadedByUserId === user?.id ? (
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
