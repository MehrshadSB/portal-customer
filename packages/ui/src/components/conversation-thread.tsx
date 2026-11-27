'use client';

import { useI18n } from '@portal/i18n/react';
import type { AttachmentDto, MessageDto } from '@portal/types';
import { Download, Lock, Paperclip, Send, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';
import { AlertBanner } from './alert-banner';
import { Button } from './button';
import { Textarea } from './select';
import { SkeletonLine } from './skeleton';
import { StatusBadge } from './status-badge';

export interface ConversationThreadProps {
  messages: MessageDto[];
  currentUserId: string;
  canSendPublic: boolean;
  canSendInternal?: boolean;
  isLoading?: boolean;
  embedded?: boolean;
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
  embedded = false,
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
    <div className={cn(embedded ? 'divide-y divide-[var(--color-rule)]' : 'space-y-4')}>
      <div
        className={cn(
          'max-h-[480px] space-y-3 overflow-y-auto p-4',
          embedded
            ? 'bg-[var(--color-paper)]/50'
            : 'rounded-[var(--radius-card)] border border-[var(--color-rule)] bg-[var(--color-paper)]',
        )}
      >
        {isLoading ? (
          <div className="space-y-3 py-2" aria-busy="true">
            <SkeletonLine className="w-2/3" />
            <SkeletonLine className="w-1/2" />
            <SkeletonLine className="w-3/4" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--color-muted)]">
            {t.conversations.emptyMessages}
          </p>
        ) : (
          messages.map((msg) => {
            if (msg.messageType === 'system_event') {
              return (
                <div
                  key={msg.id}
                  className="flex items-center gap-3 py-1.5 text-xs text-[var(--color-muted)]"
                >
                  <span className="h-px flex-1 bg-[var(--color-rule)]" aria-hidden="true" />
                  <span className="font-medium text-[var(--color-ink-2)]">{msg.body}</span>
                  <time className="font-mono-tabular text-xs text-[var(--color-muted)]">
                    {formatDateTime(msg.createdAt)}
                  </time>
                  <span className="h-px flex-1 bg-[var(--color-rule)]" aria-hidden="true" />
                </div>
              );
            }

            const isOwn = msg.senderUserId === currentUserId;
            const isInternal = msg.visibility === 'internal';

            return (
              <article
                key={msg.id}
                className={cn(
                  'rounded-[var(--radius-input)] border p-3.5 text-sm',
                  isInternal
                    ? 'border-[var(--color-signal-amber-border)] bg-[var(--color-signal-amber-bg)]'
                    : isOwn
                      ? 'border-[var(--color-rule-2)] bg-[var(--color-cotton)]'
                      : 'border-[var(--color-rule)] bg-[var(--color-cotton)]',
                )}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--color-ink)]">
                      {msg.senderName}
                    </span>
                    <StatusBadge
                      label={t.statuses[msg.senderType] ?? msg.senderType}
                      tone={msg.senderType === 'employee' ? 'amber' : 'cobalt'}
                    />
                    {isInternal ? (
                      <span className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--color-signal-amber)] px-1.5 py-0.5 text-xs font-medium text-[var(--color-board-type)]">
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        {t.conversations.internalBadge}
                      </span>
                    ) : null}
                  </div>
                  <time className="font-mono-tabular text-xs text-[var(--color-muted)]">
                    {formatDateTime(msg.createdAt)}
                  </time>
                </div>

                <p className="max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-ink)]">
                  {msg.body}
                </p>

                {msg.attachments.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {msg.attachments.map((att) => (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() => onDownloadAttachment(att.id)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-input)] border border-[var(--color-rule-2)] bg-[var(--color-paper)] px-2.5 py-1 text-xs font-medium text-[var(--color-ink)] transition-colors duration-[var(--dur-micro)] hover:bg-[var(--color-paper-2)] active:translate-y-px"
                      >
                        <Download className="h-3.5 w-3.5 text-[var(--color-muted)]" aria-hidden="true" />
                        <span dir="ltr">{att.originalFilename}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>

      {canSendPublic || canSendInternal ? (
        <form
          onSubmit={handleSend}
          className={cn(
            'space-y-3 p-4',
            embedded ? '' : 'rounded-[var(--radius-card)] border',
            visibility === 'internal'
              ? embedded
                ? 'bg-[var(--color-signal-amber-bg)]/55'
                : 'border-[var(--color-signal-amber-border)] bg-[var(--color-signal-amber-bg)]/55'
              : embedded
                ? 'bg-[var(--color-cotton)]'
                : 'border-[var(--color-rule)] bg-[var(--color-cotton)]',
          )}
        >
          {canSendInternal ? (
            <div className="app-groove inline-flex flex-wrap items-center gap-1 rounded-[var(--radius-input)] p-1">
              <button
                type="button"
                aria-pressed={visibility === 'public'}
                onClick={() => {
                  setVisibility('public');
                  setPendingAttachments((prev) =>
                    prev.filter((a) => a.visibility === 'customer_visible'),
                  );
                }}
                className={cn(
                  'cursor-pointer rounded-[4px] px-3 py-1 text-xs font-medium transition-colors duration-[var(--dur-micro)]',
                  visibility === 'public'
                    ? 'bg-[var(--color-cotton)] text-[var(--color-ink)] shadow-[var(--shadow-card)]'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]',
                )}
              >
                {t.conversations.publicMode}
              </button>
              <button
                type="button"
                aria-pressed={visibility === 'internal'}
                onClick={() => setVisibility('internal')}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] px-3 py-1 text-xs font-medium transition-colors duration-[var(--dur-micro)]',
                  visibility === 'internal'
                    ? 'bg-[var(--color-signal-amber)] text-[var(--color-board-type)] shadow-[var(--shadow-card)]'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]',
                )}
              >
                <Lock className="h-3 w-3" aria-hidden="true" />
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
            aria-label={t.conversations.sendReply}
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
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-2.5 py-1 text-xs"
                >
                  <span dir="ltr">{att.originalFilename}</span>
                  <button
                    type="button"
                    aria-label={t.common.delete}
                    onClick={() =>
                      setPendingAttachments((prev) => prev.filter((item) => item.id !== att.id))
                    }
                    className="cursor-pointer text-[var(--color-muted)] hover:text-[var(--color-signal-crimson)]"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="min-h-[1lh]">
            {error ? <AlertBanner tone="crimson">{error}</AlertBanner> : null}
          </div>

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
                    <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
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
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
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
