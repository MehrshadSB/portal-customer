'use client';

import { useI18n } from '@portal/i18n/react';
import type { AttachmentDto, MessageDto } from '@portal/types';
import { Download, Lock, Paperclip, Send, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';
import { AlertBanner } from './alert-banner';
import { Button } from './button';
import { Textarea } from './select';
import { StatusBadge } from './status-badge';

export interface ConversationThreadProps {
  messages: MessageDto[];
  currentUserId: string;
  canSendPublic: boolean;
  canSendInternal?: boolean;
  isLoading?: boolean;
  onSendMessage: (payload: {
    body: string;
    visibility: 'public' | 'internal';
    attachmentIds?: string[];
  }) => Promise<void>;
  onUploadAttachment?: (
    file: File,
    visibility: 'customer_visible' | 'internal_only',
  ) => Promise<AttachmentDto>;
  onDownloadAttachment: (attachmentId: string) => void;
}

export function ConversationThread({
  messages,
  currentUserId,
  canSendPublic,
  canSendInternal = false,
  isLoading = false,
  onSendMessage,
  onUploadAttachment,
  onDownloadAttachment,
}: ConversationThreadProps) {
  const { t, formatDateTime, translateError } = useI18n();
  const [body, setBody] = React.useState('');
  const [visibility, setVisibility] = React.useState<'public' | 'internal'>('public');
  const [pendingAttachments, setPendingAttachments] = React.useState<AttachmentDto[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const canCompose = visibility === 'internal' ? canSendInternal : canSendPublic;

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUploadAttachment) return;
    setError(null);
    setUploading(true);
    try {
      const attVisibility = visibility === 'internal' ? 'internal_only' : 'customer_visible';
      const uploaded = await onUploadAttachment(file, attVisibility);
      setPendingAttachments((prev) => [...prev, uploaded]);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      setError(translateError(code, err instanceof Error ? err.message : 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || !canCompose) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSendMessage({
        body: trimmed,
        visibility,
        attachmentIds: pendingAttachments.map((a) => a.id),
      });
      setBody('');
      setPendingAttachments([]);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      setError(translateError(code, err instanceof Error ? err.message : 'Unable to send message'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="max-h-[480px] space-y-3 overflow-y-auto rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3">
        {isLoading ? (
          <p className="py-6 text-center text-xs text-[var(--ink-muted)]">{t.common.loading}</p>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--ink-muted)]">
            {t.conversations.emptyMessages}
          </p>
        ) : (
          messages.map((msg) => {
            if (msg.messageType === 'system_event') {
              return (
                <div key={msg.id} className="flex justify-center py-1">
                  <span className="rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1 text-[11px] text-[var(--ink-muted)]">
                    {msg.body} · {formatDateTime(msg.createdAt)}
                  </span>
                </div>
              );
            }

            const isOwn = msg.senderUserId === currentUserId;
            const isInternal = msg.visibility === 'internal';

            return (
              <div
                key={msg.id}
                className={cn(
                  'rounded-md border p-3 text-xs',
                  isInternal
                    ? 'border-amber-300 bg-[var(--signal-amber-surface)]/70 dark:border-amber-800'
                    : isOwn
                      ? 'border-[var(--accent-cobalt)]/30 bg-[var(--accent-cobalt)]/5'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-surface)]',
                )}
              >
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--ink-primary)]">
                      {msg.senderName}
                    </span>
                    <StatusBadge
                      label={t.statuses[msg.senderType] ?? msg.senderType}
                      tone={msg.senderType === 'employee' ? 'amber' : 'cobalt'}
                    />
                    {isInternal ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        <Lock className="h-2.5 w-2.5" />
                        {t.conversations.internalBadge}
                      </span>
                    ) : null}
                  </div>
                  <span className="font-mono-tabular text-[11px] text-[var(--ink-muted)]">
                    {formatDateTime(msg.createdAt)}
                  </span>
                </div>

                <p className="whitespace-pre-wrap leading-relaxed text-[var(--ink-primary)]">
                  {msg.body}
                </p>

                {msg.attachments.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {msg.attachments.map((att) => (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() => onDownloadAttachment(att.id)}
                        className="inline-flex items-center gap-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-medium text-[var(--accent-cobalt)] hover:bg-[var(--bg-subtle)]"
                      >
                        <Download className="h-3 w-3" />
                        <span dir="ltr">{att.originalFilename}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {canSendPublic || canSendInternal ? (
        <form
          onSubmit={handleSend}
          className={cn(
            'space-y-3 rounded-md border p-3',
            visibility === 'internal'
              ? 'border-amber-300 bg-[var(--signal-amber-surface)]/60 dark:border-amber-800'
              : 'border-[var(--border-hairline)] bg-[var(--bg-surface)]',
          )}
        >
          {canSendInternal ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setVisibility('public');
                  setPendingAttachments((prev) =>
                    prev.filter((a) => a.visibility === 'customer_visible'),
                  );
                }}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  visibility === 'public'
                    ? 'border-[var(--accent-cobalt)] bg-[var(--accent-cobalt)] text-white'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-muted)]',
                )}
              >
                {t.conversations.publicMode}
              </button>
              <button
                type="button"
                onClick={() => setVisibility('internal')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  visibility === 'internal'
                    ? 'border-amber-600 bg-amber-600 text-white'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-muted)]',
                )}
              >
                <Lock className="h-3 w-3" />
                {t.conversations.internalMode}
              </button>
            </div>
          ) : null}

          {visibility === 'internal' ? (
            <AlertBanner tone="amber">{t.conversations.internalComposerWarning}</AlertBanner>
          ) : null}

          <Textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              visibility === 'internal'
                ? t.conversations.messagePlaceholderInternal
                : t.conversations.messagePlaceholderPublic
            }
          />

          {pendingAttachments.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {pendingAttachments.map((att) => (
                <span
                  key={att.id}
                  className="inline-flex items-center gap-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px]"
                >
                  <span dir="ltr">{att.originalFilename}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingAttachments((prev) => prev.filter((item) => item.id !== att.id))
                    }
                    className="text-[var(--ink-muted)] hover:text-[var(--signal-crimson)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {error ? <AlertBanner tone="crimson">{error}</AlertBanner> : null}

          <div className="flex items-center justify-between gap-2">
            <div>
              {onUploadAttachment ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFilePick}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {uploading ? t.documents.uploading : t.conversations.attachFiles}
                  </Button>
                </>
              ) : null}
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || uploading || !body.trim() || !canCompose}
            >
              <Send className="h-3.5 w-3.5" />
              {visibility === 'internal'
                ? t.conversations.saveInternalNote
                : t.conversations.sendReply}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
