import { ATTACHMENT_VISIBILITIES } from '@portal/types';
import { z } from 'zod';
import { uuidSchema } from './common';

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/zip',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
] as const;

export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const presignUploadSchema = z
  .object({
    filename: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(3).max(150),
    sizeBytes: z.coerce.number().int().min(1).max(MAX_UPLOAD_SIZE_BYTES),
    visibility: z.enum(ATTACHMENT_VISIBILITIES).default('customer_visible'),
    customerId: uuidSchema.optional(),
    orderId: uuidSchema.optional(),
    orderProgressEventId: uuidSchema.optional(),
    ticketId: uuidSchema.optional(),
    messageId: uuidSchema.optional(),
  })
  .refine(
    (data) =>
      Boolean(
        data.customerId ||
          data.orderId ||
          data.orderProgressEventId ||
          data.ticketId ||
          data.messageId,
      ),
    {
      message: 'Attachment must reference at least one customer, order, ticket, or message entity',
    },
  );

export type PresignUploadInput = z.infer<typeof presignUploadSchema>;
