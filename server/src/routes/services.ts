import type { FastifyInstance } from 'fastify';
import { stringify } from 'yaml';
import { requireAdmin, requireUser, type AppContext } from '../app.ts';
import { allIntegrations, describe, getIntegration } from '../integrations/index.ts';
import type { Context } from '../integrations/types.ts';
import { describeError } from '../lib/http.ts';
import { sha256 } from '../lib/crypto.ts';
import type { ServiceInput } from '../services.ts';
import type { WidgetData } from '../shared/types.ts';

export const serviceRoutes = (ctx: AppContext) => async (app: FastifyInstance) => {
  const { services } = ctx;

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
    const status = await services.check({
      id: `test-${Date.now()}`,
      type: b.type,
      name: b.name || def.name,
      url: b.url ?? '',
      publicUrl: b.publicUrl ?? b.url ?? '',
      icon: '',
      config,
    });
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

  // ----- widgets -----

  app.post('/widget', { preHandler: requireUser }, async (req, reply) => {
    const b = req.body as { service: string; builtin?: boolean; widget: string; options?: Record<string, unknown> };
    let wctx: Context;
    let def;
    if (b.builtin) {
      def = getIntegration(b.service);
      if (!def?.builtin) throw new Error('Unbekanntes Widget');
      wctx = services.builtinContext(def);
    } else {
      const s = services.get(b.service);
      if (!s) return reply.status(404).send({ error: 'Dienst nicht gefunden (gelöscht?)' });
      def = getIntegration(s.type);
      if (!def) return reply.status(404).send({ error: `Integration „${s.type}“ nicht installiert` });
      wctx = services.context(s);
    }
    const w = def.widgets?.[b.widget];
    if (!w) return reply.status(404).send({ error: `Widget „${b.widget}“ gibt es nicht` });
    const options = { ...Object.fromEntries((w.options ?? []).filter((o) => o.default !== undefined).map((o) => [o.key, o.default])), ...(b.options ?? {}) };
    const ttl = Math.max((w.interval ?? 60) * 1000 - 500, 1000);
    const key = `${wctx.service.id}:w:${b.widget}:${sha256(JSON.stringify(options))}`;
    try {
      const data = await services.cache.get<WidgetData>(key, ttl, () => w.fetch(wctx, options));
      return { data, interval: w.interval ?? 60 };
    } catch (err) {
      return { error: describeError(err), interval: w.interval ?? 60 };
    }
  });

  // ----- actions -----

  app.post('/actions', { preHandler: requireUser }, async (req) => {
    const b = req.body as { service: string; action: string; params?: Record<string, unknown> };
    const s = services.get(b.service);
    if (!s) throw new Error('Dienst nicht gefunden');
    const def = getIntegration(s.type);
    const fn = def?.actions?.[b.action];
    if (!fn) throw new Error(`Aktion „${b.action}“ gibt es nicht`);
    const actx = services.context(s);
    try {
      const r = (await fn(actx, b.params ?? {})) ?? { ok: true };
      // Widgets of this service should show the new state immediately.
      services.cache.delete(`${s.id}:w:`);
      return r;
    } catch (err) {
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
        return reply.status(res.ok ? 415 : res.status).send();
      }
      reply.header('Content-Type', type).header('Cache-Control', 'private, max-age=86400');
      return reply.send(Buffer.from(await res.arrayBuffer()));
    } catch {
      return reply.status(502).send();
    }
  });
};
