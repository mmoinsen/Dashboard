import type { ActionRef, SearchResult } from './types.ts';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
    signal: init.signal,
  });
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new CustomEvent('kompass:unauthorized'));
    throw new ApiError(res.status, (data as any)?.error ?? `Fehler ${res.status}`);
  }
  return data as T;
}

export const get = <T = any>(path: string) => api<T>(path);
export const post = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const put = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'PUT', body });
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });

export async function runAction(a: ActionRef, extra: Record<string, unknown> = {}): Promise<{ ok: boolean; message?: string }> {
  return post('/actions', { service: a.service, action: a.action, params: { ...(a.params ?? {}), ...extra } });
}

export type SearchEvent =
  | { type: 'start'; providers: { id: string; name: string; icon: string }[]; explicit: boolean }
  | { type: 'results'; provider: string; name: string; icon: string; ms: number; results: SearchResult[] }
  | { type: 'error'; provider: string; name: string; error: string }
  | { type: 'done' };

/** Reads the NDJSON search stream and calls onEvent for each line as it arrives. */
export async function streamSearch(q: string, signal: AbortSignal, onEvent: (e: SearchEvent) => void) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal, credentials: 'same-origin' });
  if (!res.ok || !res.body) throw new ApiError(res.status, 'Suche fehlgeschlagen');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onEvent(JSON.parse(line));
    }
  }
}
