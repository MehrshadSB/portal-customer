import { createApiClient } from '@portal/api-client';

export const adminApi = createApiClient({
  surface: 'admin',
  baseUrl: '/api/v1',
});
