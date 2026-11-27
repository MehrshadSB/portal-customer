import {
  createApiClient,
  createRealtimeSocket,
  uploadToPresignedUrl,
} from '@portal/api-client';
import type { AttachmentDto, PresignUploadResponseDto } from '@portal/types';

export const portalApi = createApiClient({
  surface: 'portal',
  baseUrl: '/api/v1',
});

export function createPortalSocket() {
  const origin = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return createRealtimeSocket('portal', origin);
}

export async function uploadPortalAttachment(
  file: File,
  target: {
    customerId?: string;
    orderId?: string;
    ticketId?: string;
    messageId?: string;
  },
): Promise<AttachmentDto> {
  const mimeType = file.type || 'application/octet-stream';
  const presign = (
    await portalApi.post<PresignUploadResponseDto>('/documents/presign-upload', {
      filename: file.name,
      mimeType,
      sizeBytes: file.size,
      visibility: 'customer_visible',
      ...target,
    })
  ).data;

  await uploadToPresignedUrl(presign.uploadUrl, file, presign.headers);

  const completed = (
    await portalApi.post<AttachmentDto>(`/documents/${presign.attachmentId}/complete`)
  ).data;
  return completed;
}

export async function downloadPortalAttachment(attachmentId: string): Promise<void> {
  const res = await portalApi.get<{ downloadUrl: string }>(
    `/documents/${attachmentId}/download-url`,
  );
  window.open(res.data.downloadUrl, '_blank', 'noopener,noreferrer');
}
