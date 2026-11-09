import { defineIntegration } from './types.ts';
import type { Context } from './types.ts';
import { HttpError } from '../lib/http.ts';
import { num, percent } from '../lib/format.ts';

// ---- Pi-hole v6 (REST API with session ids) ----
async function v6Auth(ctx: Context) {
  const password = ctx.service.config.password;
  if (!password) return;
  const r = await ctx.http.post<any>('/api/auth', { password });
  if (!r?.session?.valid) throw new HttpError(401, 'Login fehlgeschlagen');
  ctx.state.sid = r.session.sid;
}

async function v6<T = any>(ctx: Context, path: string, body?: unknown): Promise<T> {
  if (!ctx.state.sid && ctx.service.config.password) await v6Auth(ctx);
  const req = () =>
    ctx.http.request<T>(path, {
      method: body ? 'POST' : 'GET',
      body,
      headers: ctx.state.sid ? { 'X-FTL-SID': ctx.state.sid } : {},
    });
  try {
    return await req();
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) {
      await v6Auth(ctx);
      return req();
    }
    throw err;
  }
}

// ---- Pi-hole v5 (legacy api.php) ----
function v5<T = any>(ctx: Context, query: Record<string, string>) {
  return ctx.http.get<T>('/admin/api.php', { query: { ...query, auth: ctx.service.config.password || undefined } });
}

interface Summary {
  total: number;
  blocked: number;
  percent: number;
  domains: number;
  clients: number;
  enabled: boolean;
}

async function summary(ctx: Context): Promise<Summary> {
  if (ctx.service.config.version === 'v5') {
    const s = await v5<any>(ctx, { summaryRaw: '' });
    return {
      total: s.dns_queries_today,
      blocked: s.ads_blocked_today,
      percent: s.ads_percentage_today,
      domains: s.domains_being_blocked,
      clients: s.unique_clients,
      enabled: s.status === 'enabled',
    };
  }
  const [s, b] = await Promise.all([v6<any>(ctx, '/api/stats/summary'), v6<any>(ctx, '/api/dns/blocking')]);
  return {
    total: s.queries?.total,
    blocked: s.queries?.blocked,
    percent: s.queries?.percent_blocked,
    domains: s.gravity?.domains_being_blocked,
    clients: s.clients?.active,
    enabled: b.blocking === 'enabled',
  };
}

export default defineIntegration({
  id: 'pihole',
  name: 'Pi-hole',
  icon: 'pi-hole',
  category: 'network',
  description: 'DNS-Anfragen, Blockquote, Blockieren pausieren',
  website: 'https://pi-hole.net',
  fields: [
    {
      key: 'version',
      label: 'Version',
      type: 'select',
      default: 'v6',
      options: [
        { value: 'v6', label: 'Pi-hole 6' },
        { value: 'v5', label: 'Pi-hole 5' },
      ],
    },
    { key: 'password', label: 'Passwort / App-Passwort (v6) bzw. API-Token (v5)', type: 'secret' },
  ],
  defaultWidget: 'summary',

  async health(ctx) {
    await summary(ctx);
  },

  widgets: {
    summary: {
      name: 'Übersicht',
      interval: 30,
      async fetch(ctx) {
        const s = await summary(ctx);
        return {
          summary: s.enabled ? `Blockieren aktiv · ${num(s.domains)} Domains` : 'Blockieren pausiert',
          status: s.enabled ? 'ok' : 'warn',
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Anfragen', value: num(s.total) },
                { label: 'Blockiert', value: num(s.blocked) },
                { label: 'Quote', value: percent(s.percent) },
                { label: 'Clients', value: num(s.clients) },
              ],
            },
            {
              type: 'actions',
              items: s.enabled
                ? [
                    { service: ctx.service.id, action: 'disable', params: { seconds: 300 }, label: '5 min pausieren' },
                    { service: ctx.service.id, action: 'disable', params: { seconds: 3600 }, label: '1 h pausieren' },
                  ]
                : [{ service: ctx.service.id, action: 'enable', label: 'Blockieren aktivieren', tone: 'accent' }],
            },
          ],
        };
      },
    },
  },

  actions: {
    async disable(ctx, p) {
      const seconds = Number(p.seconds) || 300;
      if (ctx.service.config.version === 'v5') await v5(ctx, { disable: String(seconds) });
      else await v6(ctx, '/api/dns/blocking', { blocking: false, timer: seconds });
      return { ok: true, message: `Blockieren für ${Math.round(seconds / 60)} min pausiert` };
    },
    async enable(ctx) {
      if (ctx.service.config.version === 'v5') await v5(ctx, { enable: '' });
      else await v6(ctx, '/api/dns/blocking', { blocking: true, timer: null });
      return { ok: true, message: 'Blockieren aktiv' };
    },
  },
});
