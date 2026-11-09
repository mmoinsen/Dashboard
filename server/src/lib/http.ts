import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';

export class HttpError extends Error {
  status: number;
  body: string;
  /** Request URL without query string (which may contain API keys). */
  url?: string;
  constructor(status: number, message: string, body = '', url?: string) {
    super(message);
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

/** URL safe for logs: no query string, no credentials. */
export function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return url.split('?')[0];
  }
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON body (object) or raw string / URLSearchParams. */
  body?: unknown;
  timeout?: number;
  /** Return the raw Response instead of parsing it. */
  raw?: boolean;
}

export interface HttpClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  /** Skip TLS verification (self-signed certificates). */
  insecure?: boolean;
  /** Connect through a unix socket (e.g. /var/run/docker.sock). */
  socketPath?: string;
  timeout?: number;
}

const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
const socketAgents = new Map<string, Agent>();

function dispatcherFor(opts: HttpClientOptions): Dispatcher | undefined {
  if (opts.socketPath) {
    let agent = socketAgents.get(opts.socketPath);
    if (!agent) {
      agent = new Agent({ connect: { socketPath: opts.socketPath } });
      socketAgents.set(opts.socketPath, agent);
    }
    return agent;
  }
  return opts.insecure ? insecureAgent : undefined;
}

export function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

/** Small fetch wrapper with base URL, default headers, timeouts and JSON handling. */
export class HttpClient {
  readonly opts: HttpClientOptions;
  constructor(opts: HttpClientOptions) {
    this.opts = opts;
  }

  url(path: string, query?: RequestOptions['query']): string {
    const u = new URL(joinUrl(this.opts.baseUrl, path));
    if (query) {
      for (const [k, v] of Object.entries(query)) if (v !== undefined) u.searchParams.set(k, String(v));
    }
    return u.toString();
  }

  async request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json', ...this.opts.headers, ...options.headers };
    let body: any;
    if (options.body !== undefined) {
      if (typeof options.body === 'string' || options.body instanceof URLSearchParams) {
        body = options.body;
        if (options.body instanceof URLSearchParams) headers['Content-Type'] ??= 'application/x-www-form-urlencoded';
      } else {
        body = JSON.stringify(options.body);
        headers['Content-Type'] ??= 'application/json';
      }
    }
    const fullUrl = this.url(path, options.query);
    const method = options.method ?? (body !== undefined ? 'POST' : 'GET');
    let res;
    try {
      res = await undiciFetch(fullUrl, {
        method,
        headers,
        body,
        dispatcher: dispatcherFor(this.opts),
        signal: AbortSignal.timeout(options.timeout ?? this.opts.timeout ?? 8000),
      } as any);
    } catch (err) {
      // network errors (refused, DNS, timeout): remember where we tried to go
      if (err && typeof err === 'object') (err as any).url = `${method} ${this.opts.socketPath ? `unix:${this.opts.socketPath}` : ''}${safeUrl(fullUrl)}`;
      throw err;
    }
    if (options.raw) return res as unknown as T;
    const text = await res.text();
    if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} ${res.statusText}`, text.slice(0, 500), `${method} ${safeUrl(fullUrl)}`);
    if (!text) return undefined as T;
    const type = res.headers.get('content-type') ?? '';
    if (type.includes('json') || /^[\[{]/.test(text.trim())) {
      try {
        return JSON.parse(text) as T;
      } catch {
        /* fall through */
      }
    }
    return text as unknown as T;
  }

  get<T = any>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'GET' });
  }
  post<T = any>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }
  put<T = any>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }
  delete<T = any>(path: string, options: Omit<RequestOptions, 'method'> = {}) {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export function describeError(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 401 || err.status === 403) return 'Zugriff verweigert – API-Key/Login prüfen';
    if (err.status === 404) return 'Endpunkt nicht gefunden – URL/Version prüfen';
    return err.message;
  }
  const e = err as any;
  const code = e?.cause?.code ?? e?.cause?.errors?.[0]?.code ?? e?.code;
  if (e?.name === 'TimeoutError' || code === 'UND_ERR_CONNECT_TIMEOUT') return 'Zeitüberschreitung';
  if (code === 'ECONNREFUSED') return 'Verbindung abgelehnt';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Host nicht gefunden';
  if (code === 'ENOENT') return 'Socket nicht gefunden';
  if (typeof code === 'string' && code.includes('CERT')) return 'TLS-Zertifikat ungültig (Option „TLS ignorieren“)';
  return e?.message ?? String(err);
}
