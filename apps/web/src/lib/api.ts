import type { ApiErrorBody } from '@busbuddy/shared';
import { clientEnv } from './env';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

type TokenSource = () => Promise<string | null>;
let tokenSource: TokenSource | null = null;

export function setAccessTokenSource(source: TokenSource | null): void {
  tokenSource = source;
}

let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

export interface LocalBackend {
  handle(method: string, path: string, body: unknown): Promise<{ status: number; body?: unknown }>;
}

let localBackend: LocalBackend | null = null;

export function setLocalBackend(backend: LocalBackend | null): void {
  localBackend = backend;
}

export function usingLocalBackend(): boolean {
  return localBackend !== null;
}

async function send(method: string, path: string, body: unknown, signal?: AbortSignal): Promise<{ status: number; data: unknown }> {
  if (localBackend) {
    const res = await localBackend.handle(method, path, body === undefined ? undefined : JSON.parse(JSON.stringify(body)));
    return { status: res.status, data: res.body ?? null };
  }

  const headers: Record<string, string> = { Accept: 'application/json', 'X-BusBuddy-Client': 'web' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = tokenSource ? await tokenSource() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${clientEnv.apiBaseUrl}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network_error', 'Can’t reach BusBuddy. Check your connection and try again.');
  }
  if (res.status === 204) return { status: 204, data: null };
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const { status, data } = await send(method, path, body, signal);
  if (status === 204) return undefined as T;
  if (status < 200 || status >= 300) {
    const err = (data as ApiErrorBody | null)?.error;
    const apiError = new ApiError(status, err?.code ?? 'http_error', err?.message ?? `Request failed (${status}).`, err?.details);
    if (status === 401 && path !== '/me' && !path.startsWith('/auth/')) unauthorizedHandler?.();
    throw apiError;
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}
