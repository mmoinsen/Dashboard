import { daysOption, defineIntegration, limitOption } from './types.ts';
import type { Context } from './types.ts';
import { arrAddFields, arrDefaults, arrHeaders, arrQueue, libraryStatusBadge, posterOf } from './arr.ts';
import { bestScore } from '../lib/match.ts';
import { relativeDay } from '../lib/format.ts';
import type { ListItem, SearchResult } from '../shared/types.ts';

const API = '/api/v3';

function releaseOf(m: any): { date: Date; kind: string } | null {
  const now = Date.now() - 86400000;
  const options = [
    { d: m.digitalRelease, kind: 'Digital' },
    { d: m.physicalRelease, kind: 'Disc' },
    { d: m.inCinemas, kind: 'Kino' },
  ]
    .filter((o) => o.d)
    .map((o) => ({ date: new Date(o.d), kind: o.kind }))
    .filter((o) => o.date.getTime() >= now)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return options[0] ?? null;
}

/** Detail view shared by all radarr widgets: statistics, longer calendar, queue, actions. */
async function overviewDetail(ctx: Context) {
  const w = integration.widgets!;
  const [stats, cal, queue] = await Promise.all([
    w.stats.fetch(ctx, {}).catch((e) => ({ blocks: [{ type: 'text' as const, text: `Statistik: ${e.message}`, tone: 'warn' as const }] })),
    w.calendar.fetch(ctx, { days: 60, limit: 30 }),
    w.queue.fetch(ctx, { limit: 25 }).catch(() => null),
  ]);
  return {
    summary: cal.summary,
    blocks: [
      ...stats.blocks,
      { type: 'heading' as const, text: 'Kalender' },
      ...cal.blocks,
      ...(queue ? [{ type: 'heading' as const, text: queue.summary ?? 'Warteschlange' }, ...queue.blocks] : []),
      { type: 'actions' as const, items: [{ service: ctx.service.id, action: 'searchMissing', label: 'Fehlende Filme suchen' }] },
    ],
  };
}

const integration = defineIntegration({
  id: 'radarr',
  name: 'Radarr',
  icon: 'radarr',
  category: 'media',
  description: 'Film-Verwaltung: Kalender, Warteschlange, Suche & Hinzufügen',
  website: 'https://radarr.video',
  bang: 'rad',
  fields: arrAddFields,
  headers: arrHeaders,
  defaultWidget: 'calendar',

  async health(ctx) {
    await ctx.http.get(`${API}/system/status`);
  },

  widgets: {
    calendar: {
      name: 'Kalender',
      description: 'Kommende Veröffentlichungen',
      interval: 600,
      options: [daysOption(30), limitOption(6)],
      async fetch(ctx, o) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start.getTime() + (Number(o.days) || 30) * 86400000);
        const movies = await ctx.http.get<any[]>(`${API}/calendar`, {
          query: { start: start.toISOString(), end: end.toISOString() },
        });
        const items: ListItem[] = movies
          .map((m) => ({ m, r: releaseOf(m) }))
          .filter((x) => x.r)
          .sort((a, b) => a.r!.date.getTime() - b.r!.date.getTime())
          .slice(0, Number(o.limit) || 6)
          .map(({ m, r }) => ({
            title: m.title,
            subtitle: `${r!.kind}-Release · ${m.year}`,
            meta: relativeDay(r!.date),
            image: posterOf(m, ctx),
            badge: libraryStatusBadge(m.hasFile, m.monitored, false),
            url: ctx.link(`/movie/${m.titleSlug ?? m.tmdbId}`),
          }));
        return { summary: `${movies.length} Releases in ${Number(o.days) || 30} Tagen`, blocks: [{ type: 'list', items, empty: 'Keine Releases im Zeitraum' }] };
      },
    },
    queue: {
      name: 'Warteschlange',
      interval: 15,
      options: [limitOption(5)],
      async fetch(ctx, o) {
        const q = await arrQueue(ctx, API, Number(o.limit) || 5, (r) => ({ title: r.movie?.title ?? r.title, subtitle: r.title }));
        return { summary: `${q.total} in der Warteschlange`, blocks: [{ type: 'list', items: q.items, empty: 'Warteschlange leer' }] };
      },
    },
    stats: {
      name: 'Statistik',
      interval: 600,
      async fetch(ctx) {
        const movies = await ctx.http.get<any[]>(`${API}/movie`);
        const has = movies.filter((m) => m.hasFile).length;
        const missing = movies.filter((m) => !m.hasFile && m.monitored && m.isAvailable).length;
        return {
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Filme', value: movies.length },
                { label: 'Vorhanden', value: has },
                { label: 'Fehlend', value: missing, tone: missing ? 'warn' : 'ok' },
              ],
            },
          ],
        };
      },
    },
  },

  async search(ctx, q) {
    const results: SearchResult[] = [];
    const library = await ctx.cache.get(`${ctx.service.id}:movies`, 300_000, () => ctx.http.get<any[]>(`${API}/movie`));
    const known = new Set<number>();
    for (const m of library) {
      known.add(m.tmdbId);
      const score = bestScore(q.text, m.title, m.originalTitle, ...(m.alternateTitles ?? []).map((a: any) => a.title));
      if (score < 0.6) continue;
      results.push({
        id: `radarr:${m.id}`,
        title: m.title,
        subtitle: `Film · ${m.year} · ${m.hasFile ? 'vorhanden' : m.monitored ? 'fehlt' : 'nicht überwacht'}`,
        image: posterOf(m, ctx),
        url: ctx.link(`/movie/${m.titleSlug ?? m.tmdbId}`),
        group: `${ctx.service.name} · Bibliothek`,
        kind: 'media',
        score: score * 0.75,
        actions: !m.hasFile ? [{ service: ctx.service.id, action: 'searchMovie', params: { movieId: m.id }, label: 'Jetzt suchen' }] : undefined,
        detail: { title: m.title, image: posterOf(m, ctx), meta: [String(m.year), m.certification, m.runtime ? `${m.runtime} min` : ''].filter(Boolean), description: m.overview, source: ctx.service.name },
      });
    }
    if (q.text.length >= 3) {
      const lookup = await ctx.http.get<any[]>(`${API}/movie/lookup`, { query: { term: q.text } }).catch(() => []);
      for (const m of lookup.slice(0, 8)) {
        if (known.has(m.tmdbId) || m.id) continue;
        const score = bestScore(q.text, m.title, m.originalTitle);
        if (score < 0.5 && !q.explicit) continue;
        results.push({
          id: `radarr:lookup:${m.tmdbId}`,
          title: m.title,
          subtitle: `Film · ${m.year || '?'} · nicht in Bibliothek`,
          image: posterOf(m, ctx),
          group: `${ctx.service.name} · Hinzufügen`,
          kind: 'media',
          score: Math.max(score, 0.3) * 0.7,
          actions: [{ service: ctx.service.id, action: 'addMovie', params: { tmdbId: m.tmdbId }, label: `Zu ${ctx.service.name} hinzufügen`, tone: 'accent' }],
          detail: {
            title: m.title,
            image: posterOf(m, ctx),
            meta: [String(m.year || ''), m.runtime ? `${m.runtime} min` : '', m.ratings?.imdb?.value ? `IMDb ${m.ratings.imdb.value}` : ''].filter(Boolean),
            description: m.overview,
            source: `${ctx.service.name} (nicht in Bibliothek)`,
          },
        });
        if (results.length >= q.limit + 4) break;
      }
    }
    return results;
  },

  actions: {
    async addMovie(ctx, p) {
      const match = await ctx.http.get<any>(`${API}/movie/lookup/tmdb`, { query: { tmdbId: p.tmdbId } });
      if (!match?.tmdbId) return { ok: false, message: 'Film nicht gefunden' };
      const d = await arrDefaults(ctx, API);
      await ctx.http.post(`${API}/movie`, {
        ...match,
        qualityProfileId: d.qualityProfileId,
        rootFolderPath: d.rootFolderPath,
        monitored: true,
        minimumAvailability: 'released',
        addOptions: { searchForMovie: true },
      });
      ctx.cache.delete(`${ctx.service.id}:movies`);
      return { ok: true, message: `„${match.title}“ hinzugefügt, Suche gestartet` };
    },
    async searchMovie(ctx, p) {
      await ctx.http.post(`${API}/command`, { name: 'MoviesSearch', movieIds: [Number(p.movieId)] });
      return { ok: true, message: 'Suche gestartet' };
    },
    async searchMissing(ctx) {
      await ctx.http.post(`${API}/command`, { name: 'MissingMoviesSearch' });
      return { ok: true, message: 'Suche nach fehlenden Filmen gestartet' };
    },
  },
});

for (const w of Object.values(integration.widgets!)) w.detail = overviewDetail;

export default integration;
