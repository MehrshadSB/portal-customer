'use client';

import { useI18n } from '@portal/i18n/react';
import { UploadCloud } from 'lucide-react';
import * as React from 'react';
import { AlertBanner } from './alert-banner';
import { Button } from './button';

export interface FileDropzoneProps {
  onUploadFile: (file: File) => Promise<void>;
  disabled?: boolean;
}

export function FileDropzone({ onUploadFile, disabled = false }: FileDropzoneProps) {
  const { t, translateError } = useI18n();
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      await onUploadFile(file);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      setError(translateError(code, err instanceof Error ? err.message : 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)]/40 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--accent-cobalt)]">
            <UploadCloud className="h-4 w-4" />
          </div>
          <div className="text-xs">
            <p className="font-medium text-[var(--ink-primary)]">{t.documents.dropzoneLabel}</p>
            <p className="text-[11px] text-[var(--ink-muted)]">{t.documents.dropzoneHint}</p>
          </div>
        </div>
        <div>
          <input ref={inputRef} type="file" className="hidden" onChange={handleChange} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? t.documents.uploading : t.documents.uploadDocument}
          </Button>
        </div>
      </div>
      {error ? <AlertBanner tone="crimson">{error}</AlertBanner> : null}
    </div>
  );
}
