import { apiKeyField, defineIntegration } from './types.ts';
import { arrHeaders } from './arr.ts';
import { bytes, num } from '../lib/format.ts';
import type { SearchResult } from '../shared/types.ts';

const API = '/api/v1';

export default defineIntegration({
  id: 'prowlarr',
  name: 'Prowlarr',
  icon: 'prowlarr',
  category: 'downloads',
  description: 'Indexer-Status, Statistiken und manuelle Release-Suche (mit !pr)',
  website: 'https://prowlarr.com',
  bang: 'pr',
  // Indexer searches are slow and noisy, so only when explicitly requested via "!pr".
  searchByDefault: false,
  fields: [apiKeyField],
  headers: arrHeaders,
  defaultWidget: 'indexers',

  async health(ctx) {
    await ctx.http.get(`${API}/system/status`);
  },

  widgets: {
    indexers: {
      name: 'Indexer',
      interval: 120,
      async fetch(ctx) {
        const [indexers, status, stats] = await Promise.all([
          ctx.http.get<any[]>(`${API}/indexer`),
          ctx.http.get<any[]>(`${API}/indexerstatus`).catch(() => []),
          ctx.http.get<any>(`${API}/indexerstats`).catch(() => ({ indexers: [] })),
        ]);
        const failing = new Map(status.filter((s) => s.disabledTill && new Date(s.disabledTill) > new Date()).map((s) => [s.indexerId, s]));
        const enabled = indexers.filter((i) => i.enable);
        const statsById = new Map((stats.indexers ?? []).map((s: any) => [s.indexerId, s]));
        const totalQueries = (stats.indexers ?? []).reduce((n: number, s: any) => n + (s.numberOfQueries ?? 0), 0);
        const totalGrabs = (stats.indexers ?? []).reduce((n: number, s: any) => n + (s.numberOfGrabs ?? 0), 0);
        return {
          summary: `${enabled.length} aktiv · ${failing.size} gestört`,
          status: failing.size ? 'warn' : 'ok',
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Indexer', value: enabled.length },
                { label: 'Anfragen', value: num(totalQueries) },
                { label: 'Grabs', value: num(totalGrabs) },
              ],
            },
            {
              type: 'list',
              items: enabled
                .sort((a, b) => Number(failing.has(b.id)) - Number(failing.has(a.id)))
                .slice(0, 6)
                .map((i) => {
                  const s: any = statsById.get(i.id);
                  const f = failing.get(i.id);
                  return {
                    title: i.name,
                    subtitle: f ? `Deaktiviert bis ${new Date(f.disabledTill).toLocaleTimeString('de-DE')}` : s ? `${num(s.numberOfQueries)} Anfragen · ${num(s.averageResponseTime)} ms` : i.protocol,
                    status: f ? 'bad' : 'ok',
                  };
                }),
            },
          ],
        };
      },
    },
  },

  async search(ctx, q) {
    if (q.text.length < 3) return [];
    const releases = await ctx.http.get<any[]>(`${API}/search`, { query: { query: q.text, type: 'search', limit: 50 }, timeout: 20000 });
    return releases
      .sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0))
      .slice(0, 15)
      .map(
        (r, i): SearchResult => ({
          id: `prowlarr:${r.guid}`,
          title: r.title,
          subtitle: `${r.indexer} · ${bytes(r.size)}${r.seeders != null ? ` · ${r.seeders} Seeder` : ''} · ${r.ageHours != null ? `${Math.round(r.ageHours / 24)} d` : ''}`,
          group: `${ctx.service.name} · Releases`,
          kind: 'download',
          url: r.infoUrl,
          score: 0.6 - i * 0.01,
          actions: [{ service: ctx.service.id, action: 'grab', params: { guid: r.guid, indexerId: r.indexerId }, label: 'An Download-Client senden', tone: 'accent' }],
        }),
      );
  },

  actions: {
    async grab(ctx, p) {
      await ctx.http.post(`${API}/search`, { guid: p.guid, indexerId: Number(p.indexerId) });
      return { ok: true, message: 'An Download-Client gesendet' };
    },
  },
});
