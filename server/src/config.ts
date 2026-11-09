import { existsSync, readFileSync, unwatchFile, watchFile } from 'node:fs';
import { parse } from 'yaml';
import type { AppSettings, SearchEngine } from './shared/types.ts';

export interface FileService {
  id: string;
  type: string;
  name?: string;
  url?: string;
  publicUrl?: string;
  icon?: string;
  [key: string]: unknown;
}

export interface FileConfig {
  settings?: Partial<AppSettings>;
  services?: FileService[];
}

export const DEFAULT_ENGINES: SearchEngine[] = [
  { id: 'google', name: 'Google', bang: 'g', url: 'https://www.google.com/search?q={q}', icon: 'google' },
  { id: 'duckduckgo', name: 'DuckDuckGo', bang: 'ddg', url: 'https://duckduckgo.com/?q={q}', icon: 'duckduckgo' },
  { id: 'bing', name: 'Bing', bang: 'b', url: 'https://www.bing.com/search?q={q}', icon: 'bing' },
  { id: 'youtube', name: 'YouTube', bang: 'yt', url: 'https://www.youtube.com/results?search_query={q}', icon: 'youtube' },
  { id: 'wikipedia', name: 'Wikipedia', bang: 'w', url: 'https://de.wikipedia.org/w/index.php?search={q}', icon: 'wikipedia' },
  { id: 'github', name: 'GitHub', bang: 'gh', url: 'https://github.com/search?q={q}', icon: 'github' },
  { id: 'maps', name: 'Google Maps', bang: 'maps', url: 'https://www.google.com/maps/search/{q}', icon: 'google-maps' },
  { id: 'imdb', name: 'IMDb', bang: 'imdb', url: 'https://www.imdb.com/find/?q={q}', icon: 'imdb' },
];

export const DEFAULT_SETTINGS: AppSettings = {
  title: 'Kompass',
  search: { defaultEngine: 'google', suggestions: true, engines: DEFAULT_ENGINES },
};

/** Replace ${VAR} and ${VAR:-default} with environment variables (recursively). */
export function substituteEnv<T>(value: T, env: NodeJS.ProcessEnv = process.env): T {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/gi, (_, name: string, def?: string) => env[name] ?? def ?? '') as T;
  }
  if (Array.isArray(value)) return value.map((v) => substituteEnv(v, env)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substituteEnv(v, env)])) as T;
  }
  return value;
}

export function parseConfig(text: string): FileConfig {
  const raw = (parse(text) ?? {}) as FileConfig;
  const cfg = substituteEnv(raw);
  const seen = new Set<string>();
  for (const s of cfg.services ?? []) {
    if (!s.id || !s.type) throw new Error(`Dienst ohne id/type in kompass.yaml: ${JSON.stringify(s)}`);
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(s.id)) throw new Error(`Ungültige Dienst-ID "${s.id}" (erlaubt: a-z, 0-9, - und _)`);
    if (seen.has(s.id)) throw new Error(`Doppelte Dienst-ID "${s.id}" in kompass.yaml`);
    seen.add(s.id);
  }
  return cfg;
}

/** Loads kompass.yaml and reloads it on change. */
export class ConfigFile {
  current: FileConfig = {};
  error: string | null = null;
  private listeners: (() => void)[] = [];
  readonly path: string;

  private log: (msg: string) => void;

  constructor(path: string, log: (msg: string) => void) {
    this.path = path;
    this.log = log;
    this.load();
    watchFile(path, { interval: 2000 }, () => {
      this.load();
      this.listeners.forEach((l) => l());
    });
  }

  private load() {
    if (!existsSync(this.path)) {
      this.current = {};
      this.error = null;
      return;
    }
    try {
      this.current = parseConfig(readFileSync(this.path, 'utf8'));
      this.error = null;
      this.log(`Konfiguration geladen: ${this.path} (${this.current.services?.length ?? 0} Dienste)`);
    } catch (err) {
      this.error = (err as Error).message;
      this.log(`Fehler in ${this.path}: ${this.error}`);
    }
  }

  onChange(fn: () => void) {
    this.listeners.push(fn);
  }

  close() {
    unwatchFile(this.path);
  }
}
