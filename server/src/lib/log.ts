// Central logger. Writes to stdout/stderr so `docker logs kompass` shows everything.
//
//   LOG_LEVEL=debug|info|warn|error   (default: info)
//   LOG_FORMAT=text|json              (default: text; json for Loki/Graylog & co.)

export type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const LABEL: Record<Level, string> = { debug: 'DEBUG', info: 'INFO ', warn: 'WARN ', error: 'ERROR' };

let threshold = ORDER[(process.env.LOG_LEVEL?.toLowerCase() as Level) ?? 'info'] ?? ORDER.info;
let json = process.env.LOG_FORMAT?.toLowerCase() === 'json';
let silent = false;

export function configureLogger(opts: { level?: Level; json?: boolean; silent?: boolean }) {
  if (opts.level) threshold = ORDER[opts.level] ?? threshold;
  if (opts.json !== undefined) json = opts.json;
  if (opts.silent !== undefined) silent = opts.silent;
}

export function isDebug() {
  return threshold <= ORDER.debug;
}

function fmtExtra(extra?: Record<string, unknown>): string {
  if (!extra) return '';
  const parts = Object.entries(extra)
    .filter(([k, v]) => v !== undefined && k !== 'stack')
    .map(([k, v]) => `${k}=${typeof v === 'string' && !/\s/.test(v) ? v : JSON.stringify(v)}`);
  return parts.length ? `  ${parts.join(' ')}` : '';
}

function write(level: Level, tag: string, msg: string, extra?: Record<string, unknown>) {
  if (silent || ORDER[level] < threshold) return;
  const time = new Date().toISOString();
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  if (json) {
    stream.write(JSON.stringify({ time, level, tag, msg, ...extra }) + '\n');
    return;
  }
  let line = `${time} ${LABEL[level]} [${tag}] ${msg}${fmtExtra(extra)}`;
  if (extra?.stack && (level === 'error' || isDebug())) line += `\n${String(extra.stack)}`;
  stream.write(line + '\n');
}

export interface Logger {
  debug(msg: string, extra?: Record<string, unknown>): void;
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
}

/** Logger for one area of the app, e.g. logger('widget'). */
export function logger(tag: string): Logger {
  return {
    debug: (m, e) => write('debug', tag, m, e),
    info: (m, e) => write('info', tag, m, e),
    warn: (m, e) => write('warn', tag, m, e),
    error: (m, e) => write('error', tag, m, e),
  };
}

/** Technical details of an error for the log (the UI gets the friendly text). */
export function errorDetails(err: unknown): Record<string, unknown> {
  const e = err as any;
  const cause = e?.cause?.errors?.[0] ?? e?.cause;
  return {
    error: e?.message ?? String(err),
    status: e?.status,
    url: e?.url,
    code: cause?.code ?? e?.code,
    cause: cause?.message && cause.message !== e?.message ? cause.message : undefined,
    body: typeof e?.body === 'string' && e.body ? e.body.slice(0, 300) : undefined,
    stack: e?.stack,
  };
}

/**
 * Remembers the last error per key so a widget polling every 3 s does not write the
 * same failure 1200 times an hour: logs when an error first appears or changes, and
 * once when it recovers.
 */
export class FailureTracker {
  private last = new Map<string, string>();

  /** Returns 'failed' | 'recovered' | null (= nothing new to log). */
  update(key: string, error: string | null): 'failed' | 'recovered' | null {
    const prev = this.last.get(key);
    if (error) {
      if (prev === error) return null;
      this.last.set(key, error);
      return 'failed';
    }
    if (prev !== undefined) {
      this.last.delete(key);
      return 'recovered';
    }
    return null;
  }

  forget(prefix: string) {
    for (const k of this.last.keys()) if (k.startsWith(prefix)) this.last.delete(k);
  }
}
