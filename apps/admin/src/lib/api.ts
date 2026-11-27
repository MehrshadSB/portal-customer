import {
  createApiClient,
  createRealtimeSocket,
  uploadToPresignedUrl,
} from '@portal/api-client';
import type { AttachmentDto, PresignUploadResponseDto } from '@portal/types';

export const adminApi = createApiClient({
  surface: 'admin',
  baseUrl: '/api/v1',
});

export function createAdminSocket() {
  const origin = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return createRealtimeSocket('admin', origin);
}

export async function uploadAdminAttachment(
  file: File,
  target: {
    customerId?: string;
    orderId?: string;
    ticketId?: string;
    messageId?: string;
    visibility?: 'customer_visible' | 'internal_only';
  },
): Promise<AttachmentDto> {
  const mimeType = file.type || 'application/octet-stream';
  const presign = (
    await adminApi.post<PresignUploadResponseDto>('/documents/presign-upload', {
      filename: file.name,
      mimeType,
      sizeBytes: file.size,
      visibility: target.visibility ?? 'customer_visible',
      customerId: target.customerId,
      orderId: target.orderId,
      ticketId: target.ticketId,
      messageId: target.messageId,
    })
  ).data;

  await uploadToPresignedUrl(presign.uploadUrl, file, presign.headers);

  const completed = (
    await adminApi.post<AttachmentDto>(`/documents/${presign.attachmentId}/complete`)
  ).data;
  return completed;
}

export async function downloadAdminAttachment(attachmentId: string): Promise<void> {
  const res = await adminApi.get<{ downloadUrl: string }>(
    `/documents/${attachmentId}/download-url`,
  );
  window.open(res.data.downloadUrl, '_blank', 'noopener,noreferrer');
}
