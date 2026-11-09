import type { DB } from './db.ts';
import type { ConfigFile, FileService } from './config.ts';
import { getIntegration } from './integrations/index.ts';
import type { Context, IntegrationDef, ServiceInstance } from './integrations/types.ts';
import { HttpClient, describeError, joinUrl } from './lib/http.ts';
import { TtlCache } from './lib/cache.ts';
import type { SecretBox } from './lib/crypto.ts';
import type { ServicePublic, ServiceStatus } from './shared/types.ts';
import { FailureTracker, errorDetails, logger } from './lib/log.ts';

const log = logger('health');

const RESERVED = new Set(['id', 'type', 'name', 'url', 'publicUrl', 'icon', 'sort']);

export interface ServiceInput {
  id?: string;
  type: string;
  name: string;
  url?: string;
  publicUrl?: string;
  icon?: string;
  config?: Record<string, unknown>;
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'dienst'
  );
}

function secretKeys(def: IntegrationDef | undefined): Set<string> {
  return new Set((def?.fields ?? []).filter((f) => f.type === 'secret').map((f) => f.key));
}

export class ServiceManager {
  readonly cache = new TtlCache();
  private states = new Map<string, Record<string, any>>();
  private contexts = new Map<string, { ctx: Context; signature: string }>();
  private status = new Map<string, ServiceStatus>();
  private timer?: NodeJS.Timeout;

  private db: DB;
  private file: ConfigFile;
  private secrets: SecretBox;

  constructor(db: DB, file: ConfigFile, secrets: SecretBox) {
    this.db = db;
    this.file = file;
    this.secrets = secrets;
    file.onChange(() => {
      this.contexts.clear();
      this.cache.clear();
    });
  }

  // ---------- reading ----------

  private fromFile(s: FileService, index: number): ServiceInstance & { source: 'file'; sort: number } {
    const config: Record<string, any> = {};
    for (const [k, v] of Object.entries(s)) if (!RESERVED.has(k)) config[k] = v;
    const def = getIntegration(s.type);
    const url = String(s.url ?? '');
    return {
      id: s.id,
      type: s.type,
      name: s.name ?? def?.name ?? s.id,
      url,
      publicUrl: String(s.publicUrl ?? url),
      icon: s.icon ?? def?.icon ?? '',
      config,
      source: 'file',
      sort: typeof s.sort === 'number' ? s.sort : index,
    };
  }

  private fromDb(row: any): ServiceInstance & { source: 'ui'; sort: number } {
    const def = getIntegration(row.type);
    const secret = secretKeys(def);
    const raw = JSON.parse(row.config) as Record<string, any>;
    const config: Record<string, any> = {};
    for (const [k, v] of Object.entries(raw)) {
      try {
        config[k] = secret.has(k) && typeof v === 'string' ? this.secrets.decrypt(v) : v;
      } catch {
        config[k] = '';
      }
    }
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      url: row.url,
      publicUrl: row.public_url || row.url,
      icon: row.icon || def?.icon || '',
      config,
      source: 'ui',
      sort: row.sort,
    };
  }

  list() {
    const file = (this.file.current.services ?? []).map((s, i) => this.fromFile(s, i));
    const ids = new Set(file.map((s) => s.id));
    const rows = this.db.prepare('SELECT * FROM services ORDER BY sort, name').all() as any[];
    const ui = rows.map((r) => this.fromDb(r)).filter((s) => !ids.has(s.id));
    return [...file, ...ui].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  }

  get(id: string): ServiceInstance | undefined {
    return this.list().find((s) => s.id === id);
  }

  toPublic(s: ReturnType<ServiceManager['list']>[number]): ServicePublic {
    const secret = secretKeys(getIntegration(s.type));
    const config: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s.config)) config[k] = secret.has(k) ? Boolean(v) : v;
    return { id: s.id, type: s.type, name: s.name, url: s.url, publicUrl: s.publicUrl, icon: s.icon, source: s.source, config, sort: s.sort };
  }

  listPublic(): ServicePublic[] {
    return this.list().map((s) => this.toPublic(s));
  }

  // ---------- writing (UI-managed services only) ----------

  private validate(input: ServiceInput) {
    const def = getIntegration(input.type);
    if (!def || def.builtin) throw new Error(`Unbekannter Diensttyp: ${input.type}`);
    if (!input.name?.trim()) throw new Error('Name fehlt');
    if (def.needsUrl !== false) {
      if (!input.url || !/^https?:\/\/.+/i.test(input.url)) throw new Error('Bitte eine gültige URL mit http:// oder https:// angeben');
    }
    return def;
  }

  create(input: ServiceInput): ServicePublic {
    const def = this.validate(input);
    let id = input.id?.trim() ? slugify(input.id) : slugify(input.name);
    const existing = new Set(this.list().map((s) => s.id));
    const base = id;
    for (let i = 2; existing.has(id); i++) id = `${base}-${i}`;
    const config = this.encryptConfig(def, input.config ?? {}, {});
    const sort = (this.db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM services').get() as any).n + 100;
    this.db
      .prepare('INSERT INTO services (id, type, name, url, public_url, icon, config, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, input.type, input.name.trim(), input.url?.trim() ?? '', input.publicUrl?.trim() ?? '', input.icon?.trim() ?? '', JSON.stringify(config), sort);
    logger('services').info(`Dienst angelegt: ${input.name.trim()} (${id}, ${input.type})`, { url: input.url });
    return this.toPublic(this.list().find((s) => s.id === id)!);
  }

  update(id: string, input: ServiceInput): ServicePublic {
    const row = this.db.prepare('SELECT * FROM services WHERE id = ?').get(id) as any;
    if (!row) throw new Error(this.isFileService(id) ? 'Dieser Dienst wird über kompass.yaml verwaltet' : 'Dienst nicht gefunden');
    const def = this.validate({ ...input, type: row.type });
    const config = this.encryptConfig(def, input.config ?? {}, JSON.parse(row.config));
    this.db
      .prepare('UPDATE services SET name = ?, url = ?, public_url = ?, icon = ?, config = ? WHERE id = ?')
      .run(input.name.trim(), input.url?.trim() ?? '', input.publicUrl?.trim() ?? '', input.icon?.trim() ?? '', JSON.stringify(config), id);
    this.invalidate(id);
    this.health.forget(id);
    logger('services').info(`Dienst geändert: ${input.name.trim()} (${id})`, { url: input.url });
    return this.toPublic(this.list().find((s) => s.id === id)!);
  }

  remove(id: string) {
    if (this.isFileService(id)) throw new Error('Dieser Dienst wird über kompass.yaml verwaltet');
    this.db.prepare('DELETE FROM services WHERE id = ?').run(id);
    this.invalidate(id);
    this.status.delete(id);
    this.health.forget(id);
    logger('services').info(`Dienst gelöscht: ${id}`);
  }

  reorder(ids: string[]) {
    const stmt = this.db.prepare('UPDATE services SET sort = ? WHERE id = ?');
    ids.forEach((id, i) => stmt.run(1000 + i, id));
  }

  isFileService(id: string) {
    return (this.file.current.services ?? []).some((s) => s.id === id);
  }

  /** Secrets: empty input keeps the old value, so the UI never needs to see them. */
  private encryptConfig(def: IntegrationDef, input: Record<string, unknown>, previous: Record<string, any>) {
    const secret = secretKeys(def);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (secret.has(k)) {
        if (v === '' || v === true || v == null) {
          if (previous[k]) out[k] = previous[k];
        } else if (v === false) {
          /* explicit clear */
        } else out[k] = this.secrets.encrypt(String(v));
      } else if (v !== '' && v != null) out[k] = v;
    }
    return out;
  }

  private invalidate(id: string) {
    this.contexts.delete(id);
    this.states.delete(id);
    this.cache.delete(`${id}:`);
  }

  // ---------- contexts ----------

  context(service: ServiceInstance): Context {
    const def = getIntegration(service.type);
    const signature = JSON.stringify([service.url, service.config]);
    const cached = this.contexts.get(service.id);
    if (cached && cached.signature === signature) return cached.ctx;
    const conn = def?.connection?.(service) ?? {};
    const http = new HttpClient({
      baseUrl: service.url,
      insecure: Boolean(service.config.insecure),
      headers: Object.fromEntries(Object.entries(def?.headers?.(service.config) ?? {}).filter(([, v]) => v != null)) as Record<string, string>,
      ...conn,
    });
    let state = this.states.get(service.id);
    if (!state) this.states.set(service.id, (state = {}));
    const ctx: Context = {
      service,
      http,
      state,
      cache: this.cache,
      imageUrl: (path) => `/api/proxy/${encodeURIComponent(service.id)}?path=${encodeURIComponent(path)}`,
      link: (path = '') => (path ? joinUrl(service.publicUrl || service.url, path) : service.publicUrl || service.url),
    };
    this.contexts.set(service.id, { ctx, signature });
    return ctx;
  }

  /** Context for builtin integrations (no configured service). */
  builtinContext(def: IntegrationDef): Context {
    return this.context({ id: `builtin-${def.id}`, type: def.id, name: def.name, url: '', publicUrl: '', icon: def.icon, config: {} });
  }

  // ---------- health ----------

  private health = new FailureTracker();

  /** Health check. `test` = connection test from the service form (not stored). */
  async check(service: ServiceInstance, test = false): Promise<ServiceStatus> {
    const def = getIntegration(service.type);
    if (!def && this.health.update(`${service.id}:type`, 'missing') === 'failed') {
      log.warn(`Dienst "${service.id}": Integration "${service.type}" ist nicht installiert (Tippfehler in kompass.yaml oder Plugin fehlt?)`);
    }
    const ctx = this.context(service);
    let details: Record<string, unknown> | undefined;
    const t0 = Date.now();
    let st: ServiceStatus;
    try {
      let r: { ok: boolean; message?: string } | void;
      if (def?.health) r = await def.health(ctx);
      else {
        const res = await ctx.http.request<Response>('/', { raw: true, headers: { Accept: '*/*' } });
        await res.body?.cancel();
        r = { ok: res.status < 500 };
      }
      st = { ok: r ? r.ok : true, message: r ? r.message : undefined, ms: Date.now() - t0, checkedAt: Date.now() };
    } catch (err) {
      st = { ok: false, message: describeError(err), ms: Date.now() - t0, checkedAt: Date.now() };
      details = errorDetails(err);
      delete details.stack;
    }
    const label = `${service.name} (${service.id}, ${service.type})`;
    if (test) {
      if (st.ok) log.info(`Verbindungstest erfolgreich: ${service.name} (${service.type})`, { url: service.url, ms: st.ms });
      else log.warn(`Verbindungstest fehlgeschlagen: ${service.name} (${service.type}): ${st.message}`, { ...details, configured: service.url });
      return st;
    }
    const change = this.health.update(service.id, st.ok ? null : (st.message ?? 'offline'));
    if (change === 'failed') log.warn(`${label} ist nicht erreichbar: ${st.message}`, { ...details, configured: service.url || service.config.endpoint });
    else if (change === 'recovered') log.info(`${label} ist wieder erreichbar`, { ms: st.ms });
    this.status.set(service.id, st);
    return st;
  }

  statuses(): Record<string, ServiceStatus> {
    return Object.fromEntries(this.status);
  }

  startHealthChecks(intervalMs = 60_000) {
    let first = true;
    const run = async () => {
      const list = this.list();
      const results = await Promise.allSettled(list.map((s) => this.check(s)));
      if (first) {
        first = false;
        const ok = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
        log.info(`Erster Health-Check: ${ok} von ${list.length} Diensten erreichbar`);
      }
    };
    run();
    this.timer = setInterval(run, intervalMs);
    this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
  }
}
