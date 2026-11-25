import { describe, expect, it } from 'vitest';
import { validateEnv } from '../src/infrastructure/config/env.schema';

describe('validateEnv', () => {
  it('applies valid defaults for local development', () => {
    const env = validateEnv({});
    expect(env.API_PORT).toBe(4000);
    expect(env.PORTAL_URL).toBe('http://localhost:3000');
    expect(env.ADMIN_URL).toBe('http://localhost:3001');
  });

  it('rejects short JWT secret', () => {
    expect(() => validateEnv({ JWT_ACCESS_SECRET: 'too-short' })).toThrow();
  });
});
