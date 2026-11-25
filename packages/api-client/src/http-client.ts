import type { ApiErrorResponse, ApiSuccessResponse, AppSurface } from '@portal/types';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: ApiErrorResponse['error']['details'];

  constructor(
    status: number,
    message: string,
    code = 'API_ERROR',
    requestId?: string,
    details?: ApiErrorResponse['error']['details'],
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

export interface ApiClientConfig {
  surface: AppSurface;
  baseUrl?: string;
  onUnauthorized?: () => void;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

const SKIP_REFRESH_PATHS = ['/login', '/refresh', '/forgot-password', '/reset-password', '/accept-invite'];

export function createApiClient(config: ApiClientConfig) {
  const baseUrl = config.baseUrl ?? '/api/v1';
  let refreshInFlight: Promise<boolean> | null = null;

  async function refreshSession(): Promise<boolean> {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      try {
        const csrfToken = readCookie(`${config.surface}_csrf_token`);
        const res = await fetch(`${baseUrl}/auth/${config.surface}/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'X-App-Surface': config.surface,
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
        });
        return res.ok;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  }

  function shouldSkipRefresh(path: string): boolean {
    const prefix = `/auth/${config.surface}`;
    return SKIP_REFRESH_PATHS.some((suffix) => path.startsWith(`${prefix}${suffix}`));
  }

  async function request<T>(path: string, init: RequestInit = {}, allowRetry = true): Promise<T> {
    const method = (init.method ?? 'GET').toUpperCase();
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const csrfToken = isMutation ? readCookie(`${config.surface}_csrf_token`) : null;

    const headers = new Headers(init.headers);
    headers.set('X-App-Surface', config.surface);
    if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken);
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      method,
      credentials: 'include',
      headers,
    });

    if (response.status === 401 && allowRetry && !shouldSkipRefresh(path)) {
      const refreshed = await refreshSession();
      if (refreshed) {
        return request<T>(path, init, false);
      }
      config.onUnauthorized?.();
    }

    if (!response.ok) {
      let payload: ApiErrorResponse | null = null;
      try {
        payload = (await response.json()) as ApiErrorResponse;
      } catch {
        payload = null;
      }

      throw new ApiClientError(
        response.status,
        payload?.error?.message ?? response.statusText,
        payload?.error?.code ?? 'HTTP_ERROR',
        payload?.error?.requestId,
        payload?.error?.details,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  return {
    get: <T>(path: string, init?: RequestInit) =>
      request<ApiSuccessResponse<T>>(path, { ...init, method: 'GET' }),
    post: <T>(path: string, body?: unknown, init?: RequestInit) =>
      request<ApiSuccessResponse<T>>(path, {
        ...init,
        method: 'POST',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
      request<ApiSuccessResponse<T>>(path, {
        ...init,
        method: 'PATCH',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    delete: <T>(path: string, init?: RequestInit) =>
      request<ApiSuccessResponse<T>>(path, { ...init, method: 'DELETE' }),
  };
}
