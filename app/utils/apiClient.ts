import { API_URL } from '../../config';
import { fetchWithRetry } from './networkHandler';
import { getAuthToken } from './authTokenStorage';

export type ApiFetchOptions = Omit<RequestInit, 'headers'> & {
  headers?: HeadersInit;
  skipAuth?: boolean;
  bearerToken?: string | null;
};

export function createIdempotencyKey(prefix = 'idem'): string {
  const now = Date.now();
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${now}-${random}`;
}

function normalizeBase(raw: string): string | null {
  if (!raw || !String(raw).trim()) return null;
  return String(raw).replace(/\/$/, '');
}

export function getApiBaseUrl(): string | null {
  return normalizeBase(API_URL);
}

export function resolveApiUrl(path: string): string | null {
  const base = getApiBaseUrl();
  if (!base) return null;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

async function mergeHeaders(init: ApiFetchOptions): Promise<Headers> {
  const headers = new Headers(init.headers ?? undefined);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (!init.skipAuth) {
    const token =
      init.bearerToken !== undefined
        ? init.bearerToken
        : await getAuthToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }
  return headers;
}

export async function apiFetch(path: string, init: ApiFetchOptions = {}): Promise<Response | null> {
  const url = resolveApiUrl(path);
  if (!url) return null;
  const headers = await mergeHeaders(init);
  const { skipAuth: _s, bearerToken: _b, headers: _h, ...rest } = init;
  return fetch(url, { ...rest, headers });
}

/** fetch avec retry / timeout (voir `fetchWithRetry`). */
export async function apiFetchWithRetry(
  path: string,
  init: ApiFetchOptions = {},
): Promise<Response | null> {
  const url = resolveApiUrl(path);
  if (!url) return null;
  const headers = await mergeHeaders(init);
  const { skipAuth: _s, bearerToken: _b, headers: _h, ...rest } = init;
  return fetchWithRetry(url, { ...rest, headers });
}
