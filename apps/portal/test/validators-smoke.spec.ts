import { createTicketSchema, loginSchema, presignUploadSchema } from '@portal/validators';
import { describe, expect, it } from 'vitest';

describe('Portal validation contracts', () => {
  it('normalizes login email to lowercase', () => {
    const parsed = loginSchema.parse({ email: 'Buyer@Apex-Aero.Local', password: 'secret' });
    expect(parsed.email).toBe('buyer@apex-aero.local');
  });

  it('requires presigned attachments to link to a domain entity', () => {
    const invalid = presignUploadSchema.safeParse({
      filename: 'drawing.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    });
    expect(invalid.success).toBe(false);
  });

  it('accepts valid customer support ticket creation payload', () => {
    const valid = createTicketSchema.safeParse({
      categoryId: '11111111-1111-4111-8111-111111111111',
      subject: 'Bracket chamfer question',
      description: 'Need confirmation on flange tolerance callout.',
    });
    expect(valid.success).toBe(true);
  });
});
