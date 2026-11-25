import { advanceOrderProgressSchema, createOrderSchema, loginSchema } from '@portal/validators';
import { describe, expect, it } from 'vitest';

describe('Admin validation contracts', () => {
  it('normalizes operator login email', () => {
    const parsed = loginSchema.parse({ email: 'Admin@Platform.Local', password: 'secret' });
    expect(parsed.email).toBe('admin@platform.local');
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
