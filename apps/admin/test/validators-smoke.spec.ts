import {
  advanceOrderProgressSchema,
  createOrderSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from '@portal/validators';
import { describe, expect, it } from 'vitest';

describe('Admin validation contracts', () => {
  it('normalizes operator mobile phone for OTP login', () => {
    const req = requestOtpSchema.parse({ phone: '۰۹۱۲۰۰۰۰۰۰۱' });
    expect(req.phone).toBe('+989120000001');

    const ver = verifyOtpSchema.parse({ phone: '+989120000001', code: '654321' });
    expect(ver.code).toBe('654321');
  });

  it('validates custom manufacturing order with optional line items', () => {
    const valid = createOrderSchema.safeParse({
      customerId: '11111111-1111-4111-8111-111111111111',
      title: 'CNC Titanium Manifold Run',
      priority: 'high',
      items: [
        {
          partNumber: 'MAN-101',
          name: 'Main Block',
          quantity: 12,
          unit: 'pcs',
        },
      ],
    });
    expect(valid.success).toBe(true);
  });

  it('validates workflow stage advancement input', () => {
    const valid = advanceOrderProgressSchema.safeParse({
      toStatusId: '22222222-2222-4222-8222-222222222222',
      isCustomerVisible: true,
      note: 'Passed CMM check',
    });
    expect(valid.success).toBe(true);
  });
});
