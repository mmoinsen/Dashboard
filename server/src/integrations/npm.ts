import { defineIntegration } from './types.ts';
import type { Context } from './types.ts';
import { HttpError } from '../lib/http.ts';
import { bestScore } from '../lib/match.ts';
import type { SearchResult } from '../shared/types.ts';

async function token(ctx: Context, force = false): Promise<string> {
  if (!force && ctx.state.token && ctx.state.expires > Date.now()) return ctx.state.token;
  const r = await ctx.http.post<any>('/api/tokens', { identity: ctx.service.config.email, secret: ctx.service.config.password });
  ctx.state.token = r.token;
  ctx.state.expires = new Date(r.expires).getTime() - 60_000;
  return r.token;
}

async function npmGet<T = any>(ctx: Context, path: string): Promise<T> {
  try {
    return await ctx.http.get<T>(path, { headers: { Authorization: `Bearer ${await token(ctx)}` } });
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) return ctx.http.get<T>(path, { headers: { Authorization: `Bearer ${await token(ctx, true)}` } });
    throw err;
  }
}

async function hosts(ctx: Context): Promise<any[]> {
  return ctx.cache.get(`${ctx.service.id}:hosts`, 60_000, () => npmGet<any[]>(ctx, '/api/nginx/proxy-hosts'));
}

export default defineIntegration({
  id: 'nginx-proxy-manager',
  name: 'Nginx Proxy Manager',
  icon: 'nginx-proxy-manager',
  category: 'network',
  description: 'Proxy-Hosts, Zertifikate; Domains über die Suche öffnen',
  website: 'https://nginxproxymanager.com',
  bang: 'npm',
  fields: [
    { key: 'email', label: 'E-Mail', type: 'string', required: true },
    { key: 'password', label: 'Passwort', type: 'secret', required: true },
  ],
  defaultWidget: 'hosts',

  async health(ctx) {
    await ctx.http.get('/api/');
  },

  widgets: {
    hosts: {
      name: 'Proxy-Hosts',
      interval: 300,
      async fetch(ctx) {
        const [list, certs] = await Promise.all([hosts(ctx), npmGet<any[]>(ctx, '/api/nginx/certificates').catch(() => [])]);
        const soon = certs.filter((c) => c.expires_on && new Date(c.expires_on).getTime() - Date.now() < 14 * 86400000);
        const offline = list.filter((h) => h.meta?.nginx_online === false);
        return {
          summary: `${list.length} Hosts · ${certs.length} Zertifikate`,
          status: offline.length || soon.length ? 'warn' : 'ok',
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Hosts', value: list.length },
                { label: 'Aktiv', value: list.filter((h) => h.enabled).length },
                { label: 'Offline', value: offline.length, tone: offline.length ? 'bad' : 'ok' },
                { label: 'Zert. laufen ab', value: soon.length, tone: soon.length ? 'warn' : 'ok' },
              ],
            },
          ],
        };
      },
    },
  },

  async search(ctx, q) {
    const list = await hosts(ctx);
    const out: SearchResult[] = [];
    for (const h of list) {
      const domain = h.domain_names?.[0];
      const score = bestScore(q.text, ...(h.domain_names ?? []), h.forward_host);
      if (score < 0.6) continue;
      out.push({
        id: `npm:${h.id}`,
        title: domain,
        subtitle: `→ ${h.forward_scheme}://${h.forward_host}:${h.forward_port}${h.enabled ? '' : ' · deaktiviert'}`,
        url: `${h.ssl_forced || h.certificate_id ? 'https' : 'http'}://${domain}`,
        group: `${ctx.service.name} · Domains`,
        kind: 'service',
        score: score * 0.8,
      });
    }
    return out;
  },
});
