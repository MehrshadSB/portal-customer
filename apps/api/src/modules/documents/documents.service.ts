import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AttachmentDto,
  type PaginationMeta,
  PERMISSIONS,
  type PresignUploadResponseDto,
} from '@portal/types';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  type ListDocumentsQueryInput,
  MAX_UPLOAD_SIZE_BYTES,
  type PresignUploadInput,
} from '@portal/validators';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { AuthenticatedActor, RequestMetadata } from '../../common/types/auth-context';
import type { AppEnv } from '../../infrastructure/config/env.schema';
import { DRIZZLE_DB, type DrizzleDb } from '../../infrastructure/database/database.module';
import {
  attachments,
  conversations,
  messages,
  orderProgressEvents,
  orders,
  tickets,
  users,
} from '../../infrastructure/database/schema';
import { S3_CLIENT } from '../../infrastructure/storage/storage.module';
import { AuditService } from '../audit/audit.service';

const ALLOWED_MIME_SET = new Set<string>(ALLOWED_DOCUMENT_MIME_TYPES);
const CAD_OCTET_EXTENSIONS = new Set([
  '.step',
  '.stp',
  '.iges',
  '.igs',
  '.dxf',
  '.dwg',
  '.stl',
  '.3mf',
  '.bin',
]);

function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
  return cleaned || 'file';
}

function validateMagicBytes(mimeType: string, filename: string, header: Uint8Array): boolean {
  if (header.length === 0) return false;

  if (mimeType === 'application/pdf') {
    return (
      header.length >= 5 &&
      header[0] === 0x25 &&
      header[1] === 0x50 &&
      header[2] === 0x44 &&
      header[3] === 0x46 &&
      header[4] === 0x2d
    );
  }
  if (mimeType === 'image/png') {
    return (
      header.length >= 8 &&
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47
    );
  }
  if (mimeType === 'image/jpeg') {
    return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  }
  if (mimeType === 'image/webp') {
    return (
      header.length >= 12 &&
      Buffer.from(header.subarray(0, 4)).toString('ascii') === 'RIFF' &&
      Buffer.from(header.subarray(8, 12)).toString('ascii') === 'WEBP'
    );
  }
  if (
    mimeType === 'application/zip' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return (
      header.length >= 4 &&
      header[0] === 0x50 &&
      header[1] === 0x4b &&
      (header[2] === 0x03 || header[2] === 0x05)
    );
  }
  if (mimeType === 'text/csv') {
    return !header.includes(0);
  }
  if (mimeType === 'application/octet-stream') {
    const ext = extname(filename).toLowerCase();
    if (!CAD_OCTET_EXTENSIONS.has(ext)) return false;
    if (header.length >= 2 && header[0] === 0x4d && header[1] === 0x5a) return false;
    if (
      header.length >= 4 &&
      header[0] === 0x7f &&
      header[1] === 0x45 &&
      header[2] === 0x4c &&
      header[3] === 0x46
    ) {
      return false;
    }
    const textPreview = Buffer.from(header.subarray(0, 512))
      .toString('utf8')
      .trimStart()
      .toLowerCase();
    if (
      textPreview.startsWith('<!doctype') ||
      textPreview.startsWith('<html') ||
      textPreview.startsWith('<script') ||
      textPreview.startsWith('<svg')
    ) {
      return false;
    }
    return true;
  }
  return false;
}

@Injectable()
export class DocumentsService {
  private readonly bucket: string;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    config: ConfigService<AppEnv, true>,
    private readonly auditService: AuditService,
  ) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
  }

  private async resolveTargetCustomerId(
    dto: PresignUploadInput,
    actor: AuthenticatedActor,
  ): Promise<string> {
    let resolvedCustomerId = dto.customerId ?? null;

    if (dto.orderId) {
      const [order] = await this.db
        .select({ id: orders.id, customerId: orders.customerId })
        .from(orders)
        .where(and(eq(orders.id, dto.orderId), isNull(orders.deletedAt)));
      if (!order) {
        throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
      }
      if (resolvedCustomerId && resolvedCustomerId !== order.customerId) {
        throw new BadRequestException({
          code: 'ATTACHMENT_ENTITY_MISMATCH',
          message: 'Order does not belong to specified customer',
        });
      }
      resolvedCustomerId = order.customerId;
    }

    if (dto.orderProgressEventId) {
      const [evt] = await this.db
        .select({
          id: orderProgressEvents.id,
          customerId: orders.customerId,
        })
        .from(orderProgressEvents)
        .innerJoin(orders, eq(orderProgressEvents.orderId, orders.id))
        .where(eq(orderProgressEvents.id, dto.orderProgressEventId));
      if (!evt) {
        throw new NotFoundException({
          code: 'PROGRESS_EVENT_NOT_FOUND',
          message: 'Order progress event not found',
        });
      }
      if (resolvedCustomerId && resolvedCustomerId !== evt.customerId) {
        throw new BadRequestException({
          code: 'ATTACHMENT_ENTITY_MISMATCH',
          message: 'Progress event belongs to a different customer',
        });
      }
      resolvedCustomerId = evt.customerId;
    }

    if (dto.ticketId) {
      const [ticket] = await this.db
        .select({ id: tickets.id, customerId: tickets.customerId })
        .from(tickets)
        .where(and(eq(tickets.id, dto.ticketId), isNull(tickets.deletedAt)));
      if (!ticket) {
        throw new NotFoundException({ code: 'TICKET_NOT_FOUND', message: 'Ticket not found' });
      }
      if (resolvedCustomerId && resolvedCustomerId !== ticket.customerId) {
        throw new BadRequestException({
          code: 'ATTACHMENT_ENTITY_MISMATCH',
          message: 'Ticket belongs to a different customer',
        });
      }
      resolvedCustomerId = ticket.customerId;
    }

    if (dto.messageId) {
      const [msg] = await this.db
        .select({
          id: messages.id,
          customerId: conversations.customerId,
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(and(eq(messages.id, dto.messageId), isNull(messages.deletedAt)));
      if (!msg) {
        throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'Message not found' });
      }
      if (resolvedCustomerId && resolvedCustomerId !== msg.customerId) {
        throw new BadRequestException({
          code: 'ATTACHMENT_ENTITY_MISMATCH',
          message: 'Message belongs to a different customer',
        });
      }
      resolvedCustomerId = msg.customerId;
    }

    if (!resolvedCustomerId) {
      if (actor.userType === 'customer' && actor.customerId) {
        resolvedCustomerId = actor.customerId;
      } else {
        throw new BadRequestException({
          code: 'CUSTOMER_REQUIRED',
          message: 'Customer organization could not be resolved for attachment',
        });
      }
    }

    if (actor.userType === 'customer' && resolvedCustomerId !== actor.customerId) {
      throw new ForbiddenException({
        code: 'TENANT_ISOLATION_VIOLATION',
        message: 'Cannot upload attachments to another customer organization',
      });
    }

    return resolvedCustomerId;
  }

  async presignUpload(
    dto: PresignUploadInput,
    actor: AuthenticatedActor,
  ): Promise<PresignUploadResponseDto> {
    if (!ALLOWED_MIME_SET.has(dto.mimeType)) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: `MIME type ${dto.mimeType} is not allowed`,
      });
    }

    if (actor.userType === 'customer' && dto.visibility === 'internal_only') {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Customer users cannot upload internal-only attachments',
      });
    }

    const customerId = await this.resolveTargetCustomerId(dto, actor);
    const visibility = actor.userType === 'customer' ? 'customer_visible' : dto.visibility;
    const storageKey = `customers/${customerId}/${randomUUID()}-${sanitizeFilename(dto.filename)}`;

    const [created] = await this.db
      .insert(attachments)
      .values({
        customerId,
        uploadedByUserId: actor.id,
        storageKey,
        originalFilename: dto.filename,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        uploadStatus: 'pending',
        visibility,
        orderId: dto.orderId ?? null,
        orderProgressEventId: dto.orderProgressEventId ?? null,
        ticketId: dto.ticketId ?? null,
        messageId: dto.messageId ?? null,
      })
      .returning();

    if (!created) throw new Error('Failed to create pending attachment record');

    const expiresInSeconds = 600;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: dto.mimeType,
    });
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });

    return {
      attachmentId: created.id,
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': dto.mimeType },
      expiresInSeconds,
    };
  }

  async completeUpload(
    id: string,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<AttachmentDto> {
    const [att] = await this.db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id), isNull(attachments.deletedAt)));

    if (!att) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Attachment not found' });
    }
    if (actor.userType === 'customer' && att.customerId !== actor.customerId) {
      throw new ForbiddenException({
        code: 'TENANT_ISOLATION_VIOLATION',
        message: 'Access to another customer attachment is prohibited',
      });
    }
    if (att.uploadedByUserId !== actor.id && actor.userType !== 'employee') {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Only the uploader can finalize this attachment',
      });
    }

    if (att.uploadStatus === 'ready') {
      return this.getDtoById(att.id);
    }

    let contentLength = 0;
    try {
      const head = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: att.storageKey }),
      );
      contentLength = Number(head.ContentLength ?? 0);
    } catch {
      await this.db
        .update(attachments)
        .set({ uploadStatus: 'failed' })
        .where(eq(attachments.id, att.id));
      throw new BadRequestException({
        code: 'UPLOAD_OBJECT_MISSING',
        message: 'Uploaded file was not found in storage',
      });
    }

    if (contentLength < 1 || contentLength > MAX_UPLOAD_SIZE_BYTES) {
      await this.safeDeleteS3Object(att.storageKey);
      await this.db
        .update(attachments)
        .set({ uploadStatus: 'failed' })
        .where(eq(attachments.id, att.id));
      throw new BadRequestException({
        code: 'INVALID_FILE_SIZE',
        message: 'Uploaded file size exceeds limits or is empty',
      });
    }

    const obj = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: att.storageKey }),
    );
    const bytes = obj.Body ? await obj.Body.transformToByteArray() : new Uint8Array();
    const header = bytes.subarray(0, 4096);

    if (!validateMagicBytes(att.mimeType, att.originalFilename, header)) {
      await this.safeDeleteS3Object(att.storageKey);
      await this.db
        .update(attachments)
        .set({ uploadStatus: 'failed' })
        .where(eq(attachments.id, att.id));
      throw new BadRequestException({
        code: 'INVALID_FILE_SIGNATURE',
        message: 'File content does not match declared MIME type or contains disallowed content',
      });
    }

    const checksumSha256 = createHash('sha256').update(bytes).digest('hex');

    await this.db.transaction(async (tx) => {
      await tx
        .update(attachments)
        .set({
          uploadStatus: 'ready',
          sizeBytes: bytes.length,
          checksumSha256,
        })
        .where(eq(attachments.id, att.id));

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: actor.userType,
          customerId: att.customerId,
          action: 'document.uploaded',
          entityType: 'attachment',
          entityId: att.id,
          summary: `Uploaded document ${att.originalFilename}`,
          afterJson: {
            filename: att.originalFilename,
            mimeType: att.mimeType,
            sizeBytes: bytes.length,
            visibility: att.visibility,
          },
          meta,
        },
        tx,
      );
    });

    return this.getDtoById(att.id);
  }

  async list(
    query: ListDocumentsQueryInput,
    actor: AuthenticatedActor,
  ): Promise<{ items: AttachmentDto[]; meta: PaginationMeta }> {
    const conditions = [isNull(attachments.deletedAt), eq(attachments.uploadStatus, 'ready')];

    if (actor.userType === 'customer') {
      conditions.push(eq(attachments.customerId, actor.customerId ?? ''));
      conditions.push(eq(attachments.visibility, 'customer_visible'));
    } else {
      if (query.customerId) conditions.push(eq(attachments.customerId, query.customerId));
      if (query.visibility) conditions.push(eq(attachments.visibility, query.visibility));
      if (!actor.permissions.includes(PERMISSIONS.DOCUMENT_READ_INTERNAL)) {
        conditions.push(eq(attachments.visibility, 'customer_visible'));
      }
    }

    if (query.orderId) conditions.push(eq(attachments.orderId, query.orderId));
    if (query.ticketId) conditions.push(eq(attachments.ticketId, query.ticketId));
    if (query.messageId) conditions.push(eq(attachments.messageId, query.messageId));
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(sql`${attachments.originalFilename} ILIKE ${pattern}`);
    }

    const whereClause = and(...conditions);
    const offset = (query.page - 1) * query.limit;

    const [countRow] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(attachments)
      .where(whereClause);
    const total = countRow?.total ?? 0;

    const rows = await this.db
      .select({
        id: attachments.id,
        customerId: attachments.customerId,
        uploadedByUserId: attachments.uploadedByUserId,
        uploadedByName: users.fullName,
        originalFilename: attachments.originalFilename,
        mimeType: attachments.mimeType,
        sizeBytes: attachments.sizeBytes,
        uploadStatus: attachments.uploadStatus,
        visibility: attachments.visibility,
        orderId: attachments.orderId,
        orderProgressEventId: attachments.orderProgressEventId,
        ticketId: attachments.ticketId,
        messageId: attachments.messageId,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .leftJoin(users, eq(attachments.uploadedByUserId, users.id))
      .where(whereClause)
      .orderBy(desc(attachments.createdAt))
      .limit(query.limit)
      .offset(offset);

    return {
      items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async getDownloadUrl(
    id: string,
    actor: AuthenticatedActor,
  ): Promise<{ downloadUrl: string; filename: string; expiresInSeconds: number }> {
    const [att] = await this.db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.id, id),
          eq(attachments.uploadStatus, 'ready'),
          isNull(attachments.deletedAt),
        ),
      );

    if (!att) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' });
    }

    if (actor.userType === 'customer') {
      if (att.customerId !== actor.customerId) {
        throw new ForbiddenException({
          code: 'TENANT_ISOLATION_VIOLATION',
          message: 'Access to another customer document is prohibited',
        });
      }
      if (att.visibility === 'internal_only') {
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: 'Document is internal only',
        });
      }
    } else if (
      att.visibility === 'internal_only' &&
      !actor.permissions.includes(PERMISSIONS.DOCUMENT_READ_INTERNAL)
    ) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Insufficient permission to download internal documents',
      });
    }

    const expiresInSeconds = 120;
    const safeName = att.originalFilename.replace(/["\\\r\n]/g, '_');
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: att.storageKey,
      ResponseContentDisposition: `attachment; filename="${safeName}"`,
    });
    const downloadUrl = await getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });

    return { downloadUrl, filename: att.originalFilename, expiresInSeconds };
  }

  async deleteDocument(
    id: string,
    actor: AuthenticatedActor,
    meta: RequestMetadata,
  ): Promise<void> {
    const [att] = await this.db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id), isNull(attachments.deletedAt)));

    if (!att) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' });
    }

    if (actor.userType === 'customer' && att.customerId !== actor.customerId) {
      throw new ForbiddenException({
        code: 'TENANT_ISOLATION_VIOLATION',
        message: 'Access to another customer document is prohibited',
      });
    }

    const canDeleteAll = actor.permissions.includes(PERMISSIONS.DOCUMENT_DELETE_ALL);
    if (!canDeleteAll && att.uploadedByUserId !== actor.id) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'You can only delete documents you uploaded',
      });
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(attachments)
        .set({ deletedAt: new Date() })
        .where(eq(attachments.id, att.id));

      await this.auditService.record(
        {
          actorUserId: actor.id,
          actorType: actor.userType,
          customerId: att.customerId,
          action: 'document.deleted',
          entityType: 'attachment',
          entityId: att.id,
          summary: `Deleted document ${att.originalFilename}`,
          beforeJson: { filename: att.originalFilename, visibility: att.visibility },
          meta,
        },
        tx,
      );
    });

    await this.safeDeleteS3Object(att.storageKey);
  }

  async cleanupExpiredPendingUploads(olderThanMinutes = 120): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const staleRows = await this.db
      .select({ id: attachments.id, storageKey: attachments.storageKey })
      .from(attachments)
      .where(and(eq(attachments.uploadStatus, 'pending'), lt(attachments.createdAt, cutoff)));

    for (const row of staleRows) {
      await this.safeDeleteS3Object(row.storageKey);
      await this.db
        .update(attachments)
        .set({ uploadStatus: 'failed' })
        .where(eq(attachments.id, row.id));
    }
    return staleRows.length;
  }

  async getDtoById(id: string): Promise<AttachmentDto> {
    const [row] = await this.db
      .select({
        id: attachments.id,
        customerId: attachments.customerId,
        uploadedByUserId: attachments.uploadedByUserId,
        uploadedByName: users.fullName,
        originalFilename: attachments.originalFilename,
        mimeType: attachments.mimeType,
        sizeBytes: attachments.sizeBytes,
        uploadStatus: attachments.uploadStatus,
        visibility: attachments.visibility,
        orderId: attachments.orderId,
        orderProgressEventId: attachments.orderProgressEventId,
        ticketId: attachments.ticketId,
        messageId: attachments.messageId,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .leftJoin(users, eq(attachments.uploadedByUserId, users.id))
      .where(eq(attachments.id, id));

    if (!row) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' });
    }
    return { ...row, createdAt: row.createdAt.toISOString() };
  }

  private async safeDeleteS3Object(storageKey: string): Promise<void> {
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
    } catch {
      // Ignore missing object cleanup errors
    }
  }
}
