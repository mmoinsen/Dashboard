import { daysOption, defineIntegration, limitOption } from './types.ts';
import type { Context } from './types.ts';
import { arrAddFields, arrDefaults, arrHeaders, arrQueue, libraryStatusBadge, posterOf } from './arr.ts';
import { bestScore } from '../lib/match.ts';
import { episodeCode, relativeDay, timeOfDay } from '../lib/format.ts';
import type { ListItem, SearchResult } from '../shared/types.ts';

const API = '/api/v3';

/** Detail view shared by all sonarr widgets: statistics, longer calendar, queue, actions. */
async function overviewDetail(ctx: Context) {
  const w = integration.widgets!;
  const [stats, cal, queue] = await Promise.all([
    w.stats.fetch(ctx, {}).catch((e) => ({ blocks: [{ type: 'text' as const, text: `Statistik: ${e.message}`, tone: 'warn' as const }] })),
    w.calendar.fetch(ctx, { days: 14, limit: 30 }),
    w.queue.fetch(ctx, { limit: 25 }).catch(() => null),
  ]);
  return {
    summary: cal.summary,
    blocks: [
      ...stats.blocks,
      { type: 'heading' as const, text: 'Kalender' },
      ...cal.blocks,
      ...(queue ? [{ type: 'heading' as const, text: queue.summary ?? 'Warteschlange' }, ...queue.blocks] : []),
      { type: 'actions' as const, items: [{ service: ctx.service.id, action: 'searchMissing', label: 'Fehlende Episoden suchen' }] },
    ],
  };
}

const integration = defineIntegration({
  id: 'sonarr',
  name: 'Sonarr',
  icon: 'sonarr',
  category: 'media',
  description: 'Serien-Verwaltung: Kalender, Warteschlange, Suche & Hinzufügen',
  website: 'https://sonarr.tv',
  bang: 'son',
  fields: arrAddFields,
  headers: arrHeaders,
  defaultWidget: 'calendar',

  async health(ctx) {
    await ctx.http.get(`${API}/system/status`);
  },

  widgets: {
    calendar: {
      name: 'Kalender',
      description: 'Kommende Episoden',
      interval: 300,
      options: [daysOption(7), limitOption(6)],
      async fetch(ctx, o) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start.getTime() + (Number(o.days) || 7) * 86400000);
        const [eps, missing] = await Promise.all([
          ctx.http.get<any[]>(`${API}/calendar`, {
            query: { start: start.toISOString(), end: end.toISOString(), includeSeries: true },
          }),
          ctx.http.get<any>(`${API}/wanted/missing`, { query: { pageSize: 1 } }).catch(() => null),
        ]);
        const items: ListItem[] = eps.slice(0, Number(o.limit) || 6).map((e) => {
          const air = new Date(e.airDateUtc);
          return {
            title: e.series?.title ?? 'Unbekannt',
            subtitle: `${episodeCode(e.seasonNumber, e.episodeNumber)} · ${e.title ?? ''}`,
            meta: `${relativeDay(air)} · ${timeOfDay(air)}`,
            image: posterOf(e.series ?? {}, ctx),
            badge: libraryStatusBadge(e.hasFile, e.monitored, air < new Date()),
            url: e.series?.titleSlug ? ctx.link(`/series/${e.series.titleSlug}`) : undefined,
          };
        });
        return {
          summary: `${eps.length} Episoden in ${Number(o.days) || 7} Tagen${missing ? ` · ${missing.totalRecords} fehlen` : ''}`,
          blocks: [{ type: 'list', items, empty: 'Keine Episoden im Zeitraum' }],
        };
      },
    },
    queue: {
      name: 'Warteschlange',
      interval: 15,
      options: [limitOption(5)],
      async fetch(ctx, o) {
        const q = await arrQueue(ctx, API, Number(o.limit) || 5, (r) => ({
          title: r.series?.title ?? r.title,
          subtitle: r.episode ? `${episodeCode(r.episode.seasonNumber, r.episode.episodeNumber)} · ${r.episode.title}` : r.title,
        }));
        return { summary: `${q.total} in der Warteschlange`, blocks: [{ type: 'list', items: q.items, empty: 'Warteschlange leer' }] };
      },
    },
    stats: {
      name: 'Statistik',
      interval: 600,
      async fetch(ctx) {
        const [series, missing] = await Promise.all([
          ctx.http.get<any[]>(`${API}/series`),
          ctx.http.get<any>(`${API}/wanted/missing`, { query: { pageSize: 1 } }),
        ]);
        const episodes = series.reduce((n, s) => n + (s.statistics?.episodeFileCount ?? 0), 0);
        return {
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Serien', value: series.length },
                { label: 'Episoden', value: episodes },
                { label: 'Fehlend', value: missing.totalRecords, tone: missing.totalRecords ? 'warn' : 'ok' },
              ],
            },
          ],
        };
      },
    },
  },

  async search(ctx, q) {
    const results: SearchResult[] = [];
    const library = await ctx.cache.get(`${ctx.service.id}:series`, 300_000, () => ctx.http.get<any[]>(`${API}/series`));
    const known = new Set<number>();
    for (const s of library) {
      known.add(s.tvdbId);
      const score = bestScore(q.text, s.title, ...(s.alternateTitles ?? []).map((a: any) => a.title));
      if (score < 0.6) continue;
      const st = s.statistics ?? {};
      const missing = (st.episodeCount ?? 0) - (st.episodeFileCount ?? 0);
      results.push({
        id: `sonarr:${s.id}`,
        title: s.title,
        subtitle: `Serie · ${s.year} · ${st.episodeFileCount ?? 0}/${st.episodeCount ?? 0} Episoden${missing > 0 ? ` · ${missing} fehlen` : ''}`,
        image: posterOf(s, ctx),
        url: ctx.link(`/series/${s.titleSlug}`),
        group: `${ctx.service.name} · Bibliothek`,
        kind: 'media',
        score: score * 0.75,
        actions:
          missing > 0
            ? [{ service: ctx.service.id, action: 'searchSeries', params: { seriesId: s.id }, label: 'Fehlende suchen' }]
            : undefined,
        detail: { title: s.title, image: posterOf(s, ctx), meta: [String(s.year), s.network, s.status].filter(Boolean), description: s.overview, source: ctx.service.name },
      });
    }
    if (q.text.length >= 3) {
      const lookup = await ctx.http.get<any[]>(`${API}/series/lookup`, { query: { term: q.text } }).catch(() => []);
      for (const s of lookup.slice(0, 8)) {
        if (known.has(s.tvdbId) || s.id) continue;
        const score = bestScore(q.text, s.title);
        if (score < 0.5 && !q.explicit) continue;
        results.push({
          id: `sonarr:lookup:${s.tvdbId}`,
          title: s.title,
          subtitle: `Serie · ${s.year || '?'} · ${s.seasonCount ?? s.seasons?.length ?? '?'} Staffeln · nicht in Bibliothek`,
          image: posterOf(s, ctx),
          group: `${ctx.service.name} · Hinzufügen`,
          kind: 'media',
          score: Math.max(score, 0.3) * 0.7,
          actions: [{ service: ctx.service.id, action: 'addSeries', params: { tvdbId: s.tvdbId }, label: `Zu ${ctx.service.name} hinzufügen`, tone: 'accent' }],
          detail: { title: s.title, image: posterOf(s, ctx), meta: [String(s.year || ''), s.network].filter(Boolean), description: s.overview, source: `${ctx.service.name} (nicht in Bibliothek)` },
        });
        if (results.length >= q.limit + 4) break;
      }
    }
    return results;
  },

  actions: {
    async addSeries(ctx, p) {
      const [match] = await ctx.http.get<any[]>(`${API}/series/lookup`, { query: { term: `tvdb:${p.tvdbId}` } });
      if (!match) return { ok: false, message: 'Serie nicht gefunden' };
      const d = await arrDefaults(ctx, API);
      await ctx.http.post(`${API}/series`, {
        ...match,
        qualityProfileId: d.qualityProfileId,
        languageProfileId: match.languageProfileId ?? 1,
        rootFolderPath: d.rootFolderPath,
        monitored: true,
        seasonFolder: true,
        addOptions: { monitor: 'all', searchForMissingEpisodes: true },
      });
      ctx.cache.delete(`${ctx.service.id}:series`);
      return { ok: true, message: `„${match.title}“ hinzugefügt, Suche gestartet` };
    },
    async searchSeries(ctx, p) {
      await ctx.http.post(`${API}/command`, { name: 'SeriesSearch', seriesId: Number(p.seriesId) });
      return { ok: true, message: 'Suche gestartet' };
    },
    async searchMissing(ctx) {
      await ctx.http.post(`${API}/command`, { name: 'MissingEpisodeSearch' });
      return { ok: true, message: 'Suche nach fehlenden Episoden gestartet' };
    },
  },
});

for (const w of Object.values(integration.widgets!)) w.detail = overviewDetail;

export default integration;
