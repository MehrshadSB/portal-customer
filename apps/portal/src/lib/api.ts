import { createApiClient } from '@portal/api-client';

export const portalApi = createApiClient({
  surface: 'portal',
  baseUrl: '/api/v1',
});
