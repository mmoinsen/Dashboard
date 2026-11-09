import type { FastifyInstance } from 'fastify';
import { stringify } from 'yaml';
import { requireAdmin, requireUser, type AppContext } from '../app.ts';
import { allIntegrations, describe, getIntegration } from '../integrations/index.ts';
import type { Context } from '../integrations/types.ts';
import { describeError } from '../lib/http.ts';
import { sha256 } from '../lib/crypto.ts';
import { FailureTracker, errorDetails, logger } from '../lib/log.ts';

const widgetLog = logger('widget');
const actionLog = logger('action');
const proxyLog = logger('proxy');

/** Fill in defaults and clamp numbers to their declared bounds (a -3 "limit" becomes 1). */
export function normalizeOptions(fields: FieldDef[], input: Record<string, unknown> = {}): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of fields) if (f.default !== undefined) out[f.key] = f.default;
  for (const [k, v] of Object.entries(input)) if (v !== '' && v != null) out[k] = v;
  for (const f of fields) {
    if (f.type !== 'number' || out[f.key] == null) continue;
    let n = Number(out[f.key]);
    if (!Number.isFinite(n)) {
      delete out[f.key];
      if (f.default !== undefined) out[f.key] = f.default;
      continue;
    }
    if (f.min != null) n = Math.max(n, f.min);
    if (f.max != null) n = Math.min(n, f.max);
    out[f.key] = n;
  }
  return out;
}

/** A TypeError without a network cause means the integration choked on unexpected data. */
function isCodeError(err: unknown) {
  return (err instanceof TypeError || err instanceof RangeError || err instanceof SyntaxError) && !(err as any).cause;
}
import type { ServiceInput } from '../services.ts';
import type { FieldDef, WidgetData } from '../shared/types.ts';

export const serviceRoutes = (ctx: AppContext) => async (app: FastifyInstance) => {
  const { services } = ctx;
  const widgetFailures = new FailureTracker();
  const proxyFailures = new FailureTracker();

  app.get('/integrations', { preHandler: requireUser }, async () => ({ integrations: allIntegrations().map(describe) }));

  app.get('/services', { preHandler: requireUser }, async () => ({ services: services.listPublic(), configError: ctx.file.error }));

  app.get('/services/status', { preHandler: requireUser }, async () => ({ status: services.statuses() }));

  app.post('/services', { preHandler: requireAdmin }, async (req) => {
    const svc = services.create(req.body as ServiceInput);
    const instance = services.get(svc.id);
    if (instance) services.check(instance);
    return { service: svc };
  });

  app.put('/services/:id', { preHandler: requireAdmin }, async (req) => {
    const id = (req.params as any).id;
    const svc = services.update(id, req.body as ServiceInput);
    const instance = services.get(id);
    if (instance) services.check(instance);
    return { service: svc };
  });

  app.delete('/services/:id', { preHandler: requireAdmin }, async (req) => {
    services.remove((req.params as any).id);
    return { ok: true };
  });

  app.put('/services-order', { preHandler: requireAdmin }, async (req) => {
    const ids = (req.body as any)?.ids;
    if (!Array.isArray(ids)) throw new Error('ids fehlt');
    services.reorder(ids.map(String));
    return { ok: true };
  });

  /** Test a configuration before saving it. Existing secrets are reused when left empty. */
  app.post('/services/test', { preHandler: requireAdmin }, async (req) => {
    const b = req.body as ServiceInput & { existingId?: string };
    const def = getIntegration(b.type);
    if (!def) throw new Error('Unbekannter Diensttyp');
    const existing = b.existingId ? services.get(b.existingId) : undefined;
    const config: Record<string, any> = { ...(existing?.config ?? {}) };
    for (const [k, v] of Object.entries(b.config ?? {})) if (v !== '' && v !== true && v != null) config[k] = v;
    const status = await services.check(
      {
      id: `test-${Date.now()}`,
      type: b.type,
      name: b.name || def.name,
      url: b.url ?? '',
      publicUrl: b.publicUrl ?? b.url ?? '',
      icon: '',
      config,
      },
      true,
    );
    return { status };
  });

  app.post('/services/:id/check', { preHandler: requireUser }, async (req) => {
    const s = services.get((req.params as any).id);
    if (!s) throw new Error('Dienst nicht gefunden');
    return { status: await services.check(s) };
  });

  /** UI services as YAML (secrets replaced by env placeholders) to move them into kompass.yaml. */
  app.get('/services/export', { preHandler: requireAdmin }, async (_req, reply) => {
    const list = services.list().filter((s) => s.source === 'ui');
    const out = list.map((s) => {
      const def = getIntegration(s.type);
      const secret = new Set((def?.fields ?? []).filter((f) => f.type === 'secret').map((f) => f.key));
      const entry: Record<string, unknown> = { id: s.id, type: s.type, name: s.name };
      if (s.url) entry.url = s.url;
      if (s.publicUrl && s.publicUrl !== s.url) entry.publicUrl = s.publicUrl;
      if (s.icon && s.icon !== def?.icon) entry.icon = s.icon;
      for (const [k, v] of Object.entries(s.config)) {
        entry[k] = secret.has(k) ? `\${${s.id.toUpperCase().replace(/-/g, '_')}_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}}` : v;
      }
      return entry;
    });
    reply.header('Content-Type', 'text/yaml; charset=utf-8');
    return stringify({ services: out });
  });

  /** Choices for picker fields, e.g. the Home Assistant entity list. */
  app.get('/services/:id/options/:source', { preHandler: requireUser }, async (req, reply) => {
    const { id, source } = req.params as { id: string; source: string };
    const s = services.get(id);
    const def = s && getIntegration(s.type);
    if (!s || !def?.fieldOptions) return reply.status(404).send({ error: 'Keine Auswahl verfügbar' });
    try {
      return { options: await def.fieldOptions(services.context(s), source) };
    } catch (err) {
      widgetLog.warn(`Auswahlliste "${source}" von ${s.name} nicht ladbar: ${describeError(err)}`);
      return reply.status(502).send({ error: describeError(err) });
    }
  });

  // ----- widgets -----

  app.post('/widget', { preHandler: requireUser }, async (req, reply) => {
    const b = req.body as { service: string; builtin?: boolean; widget: string; options?: Record<string, unknown>; detail?: boolean };
    let wctx: Context;
    let def;
    if (b.builtin) {
      def = getIntegration(b.service);
      if (!def?.builtin) throw new Error('Unbekanntes Widget');
      wctx = services.builtinContext(def);
    } else {
      const s = services.get(b.service);
      if (!s) {
        if (widgetFailures.update(`${b.service}:missing`, 'missing') === 'failed') widgetLog.warn(`Widget "${b.widget}" verweist auf Dienst "${b.service}", den es nicht (mehr) gibt`, { user: req.user?.username });
        return reply.status(404).send({ error: 'Dienst nicht gefunden (gelöscht?)' });
      }
      def = getIntegration(s.type);
      if (!def) {
        if (widgetFailures.update(`${s.id}:type`, 'missing') === 'failed') widgetLog.warn(`Dienst "${s.id}": Integration "${s.type}" ist nicht installiert`);
        return reply.status(404).send({ error: `Integration „${s.type}“ nicht installiert` });
      }
      wctx = services.context(s);
    }
    const w = def.widgets?.[b.widget];
    if (!w) {
      widgetLog.warn(`Widget "${b.widget}" gibt es bei ${def.name} nicht (Integration aktualisiert?)`, { service: b.service });
      return reply.status(404).send({ error: `Widget „${b.widget}“ gibt es nicht` });
    }
    const options = normalizeOptions(w.options ?? [], b.options);
    // Detail view: the widget's own detail(), or the normal fetch with more entries.
    const detail = Boolean(b.detail);
    if (detail && !w.detail) {
      options.detail = true;
      options.limit = Math.min(Math.max(Number(options.limit) || 5, 5) * 4, 100);
    }
    const run = detail && w.detail ? w.detail.bind(w) : w.fetch.bind(w);
    const ttl = Math.max((w.interval ?? 60) * 1000 - 500, 1000);
    const key = `${wctx.service.id}:w:${b.widget}:${detail ? 'detail:' : ''}${sha256(JSON.stringify(options))}`;
    const label = `${wctx.service.name}/${w.name}${detail ? ' (Details)' : ''}`;
    const trackKey = `${wctx.service.id}:${b.widget}${detail ? ':detail' : ''}`;
    try {
      const t0 = Date.now();
      const data = await services.cache.get<WidgetData>(key, ttl, async () => {
        const d = await run(wctx, options);
        widgetLog.debug(`${label} aktualisiert`, { ms: Date.now() - t0 });
        return d;
      });
      if (widgetFailures.update(trackKey, null) === 'recovered') widgetLog.info(`${label} funktioniert wieder`);
      return { data, interval: w.interval ?? 60 };
    } catch (err) {
      const message = describeError(err);
      if (widgetFailures.update(trackKey, message) === 'failed') {
        const details = errorDetails(err);
        if (isCodeError(err)) {
          widgetLog.error(`${label}: unerwartete Antwort des Dienstes – evtl. inkompatible Version`, details);
        } else {
          delete details.stack;
          widgetLog.warn(`${label} fehlgeschlagen: ${message}`, details);
        }
      }
      return { error: message, interval: w.interval ?? 60 };
    }
  });

  // ----- actions -----

  app.post('/actions', { preHandler: requireUser }, async (req) => {
    const b = req.body as { service: string; action: string; params?: Record<string, unknown> };
    const s = services.get(b.service);
    if (!s) throw new Error('Dienst nicht gefunden');
    const def = getIntegration(s.type);
    const fn = def?.actions?.[b.action];
    if (!fn) {
      actionLog.warn(`Aktion "${b.action}" gibt es bei ${s.name} nicht`, { user: req.user?.username });
      throw new Error(`Aktion „${b.action}“ gibt es nicht`);
    }
    const actx = services.context(s);
    const who = req.user?.username;
    try {
      const r = (await fn(actx, b.params ?? {})) ?? { ok: true };
      // Widgets of this service should show the new state immediately.
      services.cache.delete(`${s.id}:w:`);
      if (r.ok) actionLog.info(`${who} → ${s.name}: ${b.action}${r.message ? ` (${r.message})` : ''}`, { params: b.params });
      else actionLog.warn(`${who} → ${s.name}: ${b.action} abgelehnt: ${r.message ?? ''}`, { params: b.params });
      return r;
    } catch (err) {
      const details = errorDetails(err);
      if (!isCodeError(err)) delete details.stack;
      actionLog.error(`${who} → ${s.name}: ${b.action} fehlgeschlagen`, { ...details, params: b.params });
      return { ok: false, message: describeError(err) };
    }
  });

  // ----- image proxy (keeps API keys server side) -----

  app.get('/proxy/:service', { preHandler: requireUser }, async (req, reply) => {
    const s = services.get((req.params as any).service);
    const path = String((req.query as any).path ?? '');
    if (!s || !path.startsWith('/') || path.startsWith('//')) return reply.status(400).send({ error: 'Ungültig' });
    const pctx = services.context(s);
    try {
      const res = await pctx.http.request<Response>(path, { raw: true, headers: { Accept: 'image/*' }, timeout: 15000 });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !type.startsWith('image/')) {
        await res.body?.cancel();
        const why = res.ok ? `kein Bild (${type || 'ohne Content-Type'})` : `HTTP ${res.status}`;
        if (proxyFailures.update(`${s.id}:${res.status}`, why) === 'failed') proxyLog.warn(`Bild von ${s.name} nicht ladbar: ${why}`, { path: path.split('?')[0] });
        return reply.status(res.ok ? 415 : res.status).send();
      }
      reply.header('Content-Type', type).header('Cache-Control', 'private, max-age=86400');
      return reply.send(Buffer.from(await res.arrayBuffer()));
    } catch (err) {
      if (proxyFailures.update(`${s.id}:net`, describeError(err)) === 'failed') proxyLog.warn(`Bild von ${s.name} nicht ladbar: ${describeError(err)}`, { path: path.split('?')[0] });
      return reply.status(502).send();
    }
  });
};
