import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/infrastructure/database/schema';
import { DocumentsService } from '../src/modules/documents/documents.service';
import {
  createIntegrationTestContext,
  loginAsOtp,
  teardownIntegrationTestContext,
  TEST_PHONES,
  type TestContext,
} from './helpers/test-app';

describe('Document Vault (S3 Presign, Magic Bytes, Visibility & Orphan Cleanup) (Integration)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createIntegrationTestContext();
  });

  afterAll(async () => {
    if (ctx) await teardownIntegrationTestContext(ctx);
  });

  it('completes 3-step PDF upload, rejects spoofed signatures, and isolates internal_only documents', async () => {
    const custA = await loginAsOtp(ctx, 'portal', TEST_PHONES.custAAdmin);
    const support = await loginAsOtp(ctx, 'admin', TEST_PHONES.support);

    const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

    // 1. Customer presigns PDF upload -> PUT to RustFS -> complete -> download URL
    const presignRes = await request(ctx.app.getHttpServer())
      .post('/api/v1/documents/presign-upload')
      .set('X-App-Surface', 'portal')
      .set('Cookie', custA.cookieHeader)
      .set('X-CSRF-Token', custA.csrfToken)
      .send({
        filename: 'drawing-rev-c.pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdfBytes.length,
        customerId: ctx.ids.customerAId,
      })
      .expect(201);

    const { attachmentId, uploadUrl, headers } = presignRes.body.data as {
      attachmentId: string;
      uploadUrl: string;
      headers: Record<string, string>;
    };

    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers,
      body: pdfBytes,
    });
    expect(putRes.ok).toBe(true);

    const completeRes = await request(ctx.app.getHttpServer())
      .post(`/api/v1/documents/${attachmentId}/complete`)
      .set('X-App-Surface', 'portal')
      .set('Cookie', custA.cookieHeader)
      .set('X-CSRF-Token', custA.csrfToken)
      .expect(201);
    expect(completeRes.body.data.uploadStatus).toBe('ready');

    const dlRes = await request(ctx.app.getHttpServer())
      .get(`/api/v1/documents/${attachmentId}/download-url`)
      .set('X-App-Surface', 'portal')
      .set('Cookie', custA.cookieHeader)
      .expect(200);
    const dlFetch = await fetch(dlRes.body.data.downloadUrl as string);
    expect(dlFetch.ok).toBe(true);

    // 2. Spoofed payload declared as PDF must fail magic-byte validation
    const spoofBytes = Buffer.from('MZ_FAKE_EXECUTABLE_NOT_PDF');
    const spoofPresign = await request(ctx.app.getHttpServer())
      .post('/api/v1/documents/presign-upload')
      .set('X-App-Surface', 'portal')
      .set('Cookie', custA.cookieHeader)
      .set('X-CSRF-Token', custA.csrfToken)
      .send({
        filename: 'spoof.pdf',
        mimeType: 'application/pdf',
        sizeBytes: spoofBytes.length,
        customerId: ctx.ids.customerAId,
      })
      .expect(201);

    await fetch(spoofPresign.body.data.uploadUrl as string, {
      method: 'PUT',
      headers: spoofPresign.body.data.headers as Record<string, string>,
      body: spoofBytes,
    });

    const badComplete = await request(ctx.app.getHttpServer())
      .post(`/api/v1/documents/${spoofPresign.body.data.attachmentId}/complete`)
      .set('X-App-Surface', 'portal')
      .set('Cookie', custA.cookieHeader)
      .set('X-CSRF-Token', custA.csrfToken)
      .expect(400);
    expect(badComplete.body.error.code).toBe('INVALID_FILE_SIGNATURE');

    // 3. Internal-only document uploaded by staff is hidden & forbidden from customer
    const internalPresign = await request(ctx.app.getHttpServer())
      .post('/api/v1/documents/presign-upload')
      .set('X-App-Surface', 'admin')
      .set('Cookie', support.cookieHeader)
      .set('X-CSRF-Token', support.csrfToken)
      .send({
        filename: 'internal-costing.pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdfBytes.length,
        visibility: 'internal_only',
        customerId: ctx.ids.customerAId,
      })
      .expect(201);

    await fetch(internalPresign.body.data.uploadUrl as string, {
      method: 'PUT',
      headers: internalPresign.body.data.headers as Record<string, string>,
      body: pdfBytes,
    });

    await request(ctx.app.getHttpServer())
      .post(`/api/v1/documents/${internalPresign.body.data.attachmentId}/complete`)
      .set('X-App-Surface', 'admin')
      .set('Cookie', support.cookieHeader)
      .set('X-CSRF-Token', support.csrfToken)
      .expect(201);

    const custDocs = await request(ctx.app.getHttpServer())
      .get('/api/v1/documents')
      .set('X-App-Surface', 'portal')
      .set('Cookie', custA.cookieHeader)
      .expect(200);
    expect(
      (custDocs.body.data as Array<{ id: string }>).some(
        (d) => d.id === internalPresign.body.data.attachmentId,
      ),
    ).toBe(false);

    await request(ctx.app.getHttpServer())
      .get(`/api/v1/documents/${internalPresign.body.data.attachmentId}/download-url`)
      .set('X-App-Surface', 'portal')
      .set('Cookie', custA.cookieHeader)
      .expect(403);

    // 4. Orphan cleanup marks stale pending uploads as failed
    const stalePresign = await request(ctx.app.getHttpServer())
      .post('/api/v1/documents/presign-upload')
      .set('X-App-Surface', 'portal')
      .set('Cookie', custA.cookieHeader)
      .set('X-CSRF-Token', custA.csrfToken)
      .send({
        filename: 'abandoned.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 128,
        customerId: ctx.ids.customerAId,
      })
      .expect(201);

    await ctx.db
      .update(schema.attachments)
      .set({ createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) })
      .where(eq(schema.attachments.id, stalePresign.body.data.attachmentId as string));

    const docsService = ctx.app.get(DocumentsService);
    const cleaned = await docsService.cleanupExpiredPendingUploads(120);
    expect(cleaned).toBeGreaterThanOrEqual(1);

    const [afterRow] = await ctx.db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.id, stalePresign.body.data.attachmentId as string));
    expect(afterRow?.uploadStatus).toBe('failed');
  });
});
