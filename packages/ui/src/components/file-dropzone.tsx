'use client';

import { useI18n } from '@portal/i18n/react';
import { UploadCloud } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';
import { AlertBanner } from './alert-banner';
import { Button } from './button';

export interface FileDropzoneProps {
  onUploadFile: (file: File) => Promise<void>;
  disabled?: boolean;
}

export function FileDropzone({ onUploadFile, disabled = false }: FileDropzoneProps) {
  const { t, translateError } = useI18n();
  const [uploading, setUploading] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const processFile = async (file: File | undefined) => {
    if (!file || disabled || uploading) return;
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

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    await processFile(file);
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !uploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          void processFile(file);
        }}
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-dashed p-4 transition-colors duration-[var(--dur-micro)]',
          dragging
            ? 'border-[var(--color-focus)] bg-[var(--color-paper-2)]'
            : 'border-[var(--color-rule-2)] bg-[var(--color-paper)]',
        )}
      >
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-[var(--color-cotton)] text-[var(--color-ink-2)]"
          >
            <UploadCloud className="h-4 w-4" />
          </div>
          <div className="text-xs">
            <p className="font-medium text-[var(--color-ink)]">{t.documents.dropzoneLabel}</p>
            <p className="text-xs text-[var(--color-muted)]">{t.documents.dropzoneHint}</p>
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
