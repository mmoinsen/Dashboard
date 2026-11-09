import { daysOption, defineIntegration, limitOption } from './types.ts';
import { arrAddFields, arrDefaults, arrHeaders, arrQueue, libraryStatusBadge, posterOf } from './arr.ts';
import { bestScore } from '../lib/match.ts';
import { relativeDay } from '../lib/format.ts';
import type { SearchResult } from '../shared/types.ts';

const API = '/api/v1';

export default defineIntegration({
  id: 'lidarr',
  name: 'Lidarr',
  icon: 'lidarr',
  category: 'media',
  description: 'Musik-Verwaltung: Kalender, Warteschlange, Künstler suchen & hinzufügen',
  website: 'https://lidarr.audio',
  bang: 'lid',
  fields: arrAddFields,
  headers: arrHeaders,
  defaultWidget: 'calendar',

  async health(ctx) {
    await ctx.http.get(`${API}/system/status`);
  },

  widgets: {
    calendar: {
      name: 'Kalender',
      description: 'Kommende Alben',
      interval: 900,
      options: [daysOption(30), limitOption(6)],
      async fetch(ctx, o) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start.getTime() + (Number(o.days) || 30) * 86400000);
        const albums = await ctx.http.get<any[]>(`${API}/calendar`, { query: { start: start.toISOString(), end: end.toISOString(), includeArtist: true } });
        return {
          summary: `${albums.length} Alben in ${Number(o.days) || 30} Tagen`,
          blocks: [
            {
              type: 'list',
              empty: 'Keine Veröffentlichungen',
              items: albums.slice(0, Number(o.limit) || 6).map((a) => ({
                title: a.title,
                subtitle: a.artist?.artistName,
                meta: relativeDay(new Date(a.releaseDate)),
                image: posterOf(a, ctx),
                badge: libraryStatusBadge((a.statistics?.trackFileCount ?? 0) > 0, a.monitored, false),
              })),
            },
          ],
        };
      },
    },
    queue: {
      name: 'Warteschlange',
      interval: 15,
      options: [limitOption(5)],
      async fetch(ctx, o) {
        const q = await arrQueue(ctx, API, Number(o.limit) || 5, (r) => ({ title: r.album?.title ?? r.title, subtitle: r.artist?.artistName }));
        return { summary: `${q.total} in der Warteschlange`, blocks: [{ type: 'list', items: q.items, empty: 'Warteschlange leer' }] };
      },
    },
    stats: {
      name: 'Statistik',
      interval: 900,
      async fetch(ctx) {
        const [artists, missing] = await Promise.all([
          ctx.http.get<any[]>(`${API}/artist`),
          ctx.http.get<any>(`${API}/wanted/missing`, { query: { pageSize: 1 } }),
        ]);
        const tracks = artists.reduce((n, a) => n + (a.statistics?.trackFileCount ?? 0), 0);
        return {
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Künstler', value: artists.length },
                { label: 'Titel', value: tracks },
                { label: 'Alben fehlen', value: missing.totalRecords, tone: missing.totalRecords ? 'warn' : 'ok' },
              ],
            },
          ],
        };
      },
    },
  },

  async search(ctx, q) {
    const results: SearchResult[] = [];
    const library = await ctx.cache.get(`${ctx.service.id}:artists`, 300_000, () => ctx.http.get<any[]>(`${API}/artist`));
    const known = new Set<string>();
    for (const a of library) {
      known.add(a.foreignArtistId);
      const score = bestScore(q.text, a.artistName);
      if (score < 0.6) continue;
      results.push({
        id: `lidarr:${a.id}`,
        title: a.artistName,
        subtitle: `Künstler · ${a.statistics?.albumCount ?? '?'} Alben · ${a.statistics?.trackFileCount ?? 0} Titel`,
        image: posterOf(a, ctx),
        url: ctx.link(`/artist/${a.foreignArtistId}`),
        group: `${ctx.service.name} · Bibliothek`,
        kind: 'media',
        score: score * 0.75,
        detail: { title: a.artistName, image: posterOf(a, ctx), description: a.overview, source: ctx.service.name },
      });
    }
    if (q.text.length >= 3) {
      const lookup = await ctx.http.get<any[]>(`${API}/artist/lookup`, { query: { term: q.text } }).catch(() => []);
      for (const a of lookup.slice(0, 6)) {
        if (known.has(a.foreignArtistId) || a.id) continue;
        const score = bestScore(q.text, a.artistName);
        if (score < 0.5 && !q.explicit) continue;
        results.push({
          id: `lidarr:lookup:${a.foreignArtistId}`,
          title: a.artistName,
          subtitle: `Künstler · ${a.disambiguation || a.artistType || ''} · nicht in Bibliothek`,
          image: posterOf(a, ctx),
          group: `${ctx.service.name} · Hinzufügen`,
          kind: 'media',
          score: Math.max(score, 0.3) * 0.65,
          actions: [{ service: ctx.service.id, action: 'addArtist', params: { foreignArtistId: a.foreignArtistId }, label: `Zu ${ctx.service.name} hinzufügen`, tone: 'accent' }],
          detail: { title: a.artistName, image: posterOf(a, ctx), description: a.overview, source: `${ctx.service.name} (nicht in Bibliothek)` },
        });
      }
    }
    return results;
  },

  actions: {
    async addArtist(ctx, p) {
      const [match] = await ctx.http.get<any[]>(`${API}/artist/lookup`, { query: { term: `lidarr:${p.foreignArtistId}` } });
      if (!match) return { ok: false, message: 'Künstler nicht gefunden' };
      const d = await arrDefaults(ctx, API);
      await ctx.http.post(`${API}/artist`, {
        ...match,
        qualityProfileId: d.qualityProfileId,
        metadataProfileId: d.metadataProfileId,
        rootFolderPath: d.rootFolderPath,
        monitored: true,
        addOptions: { monitor: 'all', searchForMissingAlbums: true },
      });
      ctx.cache.delete(`${ctx.service.id}:artists`);
      return { ok: true, message: `„${match.artistName}“ hinzugefügt` };
    },
  },
});
