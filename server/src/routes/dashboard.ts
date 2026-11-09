import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { requireAdmin, requireUser, type AppContext } from '../app.ts';
import { toPublicUser } from '../auth.ts';
import { DEFAULT_SETTINGS } from '../config.ts';
import { getSetting, setSetting } from '../db.ts';
import { allIntegrations, describe, getIntegration } from '../integrations/index.ts';
import type { AppSettings, Dashboard, DashboardPage, WidgetInstance } from '../shared/types.ts';

/** Defaults ⊕ kompass.yaml ⊕ settings saved in the UI. */
export function effectiveSettings(ctx: AppContext): AppSettings {
  const file = ctx.file.current.settings ?? {};
  const ui = getSetting<Partial<AppSettings>>(ctx.db, 'settings') ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...file,
    ...ui,
    search: { ...DEFAULT_SETTINGS.search, ...(file.search ?? {}), ...(ui.search ?? {}) },
  };
}

/** A sensible first dashboard: one default widget per configured service. */
export function defaultDashboard(ctx: AppContext): Dashboard {
  const widgets: WidgetInstance[] = [{ id: randomUUID(), service: 'clock', builtin: true, widget: 'clock', w: 1 }];
  const settings = effectiveSettings(ctx);
  if (settings.weather) {
    widgets.push({ id: randomUUID(), service: 'weather', builtin: true, widget: 'forecast', w: 1, options: { ...settings.weather } });
  }
  for (const s of ctx.services.list()) {
    const def = getIntegration(s.type);
    const widget = def?.defaultWidget ?? Object.keys(def?.widgets ?? {})[0];
    if (!widget) continue;
    widgets.push({ id: randomUUID(), service: s.id, widget, w: def?.widgets?.[widget]?.size ?? 1 });
    if (widgets.length >= 16) break;
  }
  return { pages: [{ id: 'home', name: 'Übersicht', showSearch: true, showServices: true, widgets }] };
}

function sanitizeDashboard(input: any): Dashboard {
  if (!input || !Array.isArray(input.pages) || !input.pages.length) throw new Error('Ungültiges Dashboard');
  if (input.pages.length > 20) throw new Error('Maximal 20 Seiten');
  const pages: DashboardPage[] = input.pages.map((p: any) => {
    if (!Array.isArray(p.widgets) || p.widgets.length > 100) throw new Error('Ungültige Widgets');
    return {
      id: String(p.id || randomUUID()).slice(0, 64),
      name: String(p.name || 'Seite').slice(0, 40),
      showSearch: p.showSearch !== false,
      showServices: p.showServices !== false,
      widgets: p.widgets.map(
        (w: any): WidgetInstance => ({
          id: String(w.id || randomUUID()).slice(0, 64),
          service: String(w.service ?? '').slice(0, 64),
          builtin: Boolean(w.builtin) || undefined,
          widget: String(w.widget ?? '').slice(0, 64),
          title: w.title ? String(w.title).slice(0, 60) : undefined,
          options: w.options && typeof w.options === 'object' ? w.options : undefined,
          w: Math.min(Math.max(Number(w.w) || 1, 1), 4),
        }),
      ),
    };
  });
  const out = { pages };
  if (JSON.stringify(out).length > 500_000) throw new Error('Dashboard zu groß');
  return out;
}

export const dashboardRoutes = (ctx: AppContext) => async (app: FastifyInstance) => {
  function loadDashboard(userId: number): Dashboard {
    const row = ctx.db.prepare('SELECT data FROM dashboards WHERE user_id = ?').get(userId) as { data: string } | undefined;
    if (row) return JSON.parse(row.data);
    const d = defaultDashboard(ctx);
    ctx.db.prepare('INSERT INTO dashboards (user_id, data) VALUES (?, ?)').run(userId, JSON.stringify(d));
    return d;
  }

  /** Everything the client needs to render, in one round trip. */
  app.get('/bootstrap', { preHandler: requireUser }, async (req) => ({
    user: toPublicUser(req.user!),
    settings: effectiveSettings(ctx),
    integrations: allIntegrations().map(describe),
    services: ctx.services.listPublic(),
    status: ctx.services.statuses(),
    dashboard: loadDashboard(req.user!.id),
    configError: ctx.file.error,
  }));

  app.get('/dashboard', { preHandler: requireUser }, async (req) => ({ dashboard: loadDashboard(req.user!.id) }));

  app.put('/dashboard', { preHandler: requireUser }, async (req) => {
    const d = sanitizeDashboard((req.body as any)?.dashboard);
    ctx.db
      .prepare("INSERT INTO dashboards (user_id, data, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
      .run(req.user!.id, JSON.stringify(d));
    return { dashboard: d };
  });

  app.post('/dashboard/reset', { preHandler: requireUser }, async (req) => {
    const d = defaultDashboard(ctx);
    ctx.db.prepare('DELETE FROM dashboards WHERE user_id = ?').run(req.user!.id);
    ctx.db.prepare('INSERT INTO dashboards (user_id, data) VALUES (?, ?)').run(req.user!.id, JSON.stringify(d));
    return { dashboard: d };
  });

  app.get('/settings', { preHandler: requireUser }, async () => ({ settings: effectiveSettings(ctx) }));

  app.put('/settings', { preHandler: requireAdmin }, async (req) => {
    const b = (req.body as any)?.settings ?? {};
    const current = getSetting<Partial<AppSettings>>(ctx.db, 'settings') ?? {};
    const next: Partial<AppSettings> = { ...current };
    if (typeof b.title === 'string') next.title = b.title.slice(0, 40) || 'Kompass';
    if (b.search) {
      next.search = { ...(current.search ?? DEFAULT_SETTINGS.search) };
      if (typeof b.search.defaultEngine === 'string') next.search.defaultEngine = b.search.defaultEngine;
      if (typeof b.search.suggestions === 'boolean') next.search.suggestions = b.search.suggestions;
      if (Array.isArray(b.search.engines)) {
        next.search.engines = b.search.engines
          .filter((e: any) => e?.name && e?.url?.includes('{q}') && e?.bang)
          .map((e: any) => ({ id: String(e.id || e.bang), name: String(e.name), bang: String(e.bang).replace(/^!/, '').toLowerCase(), url: String(e.url), icon: e.icon ? String(e.icon) : undefined }));
      }
    }
    if (b.weather === null) delete next.weather;
    else if (b.weather && isFinite(Number(b.weather.latitude)) && isFinite(Number(b.weather.longitude))) {
      next.weather = { latitude: Number(b.weather.latitude), longitude: Number(b.weather.longitude), name: b.weather.name ? String(b.weather.name) : undefined };
    }
    setSetting(ctx.db, 'settings', next);
    return { settings: effectiveSettings(ctx) };
  });
};
