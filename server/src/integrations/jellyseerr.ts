import { apiKeyField, defineIntegration } from './types.ts';
import type { Context } from './types.ts';
import { bestScore } from '../lib/match.ts';
import type { SearchResult } from '../shared/types.ts';

const STATUS: Record<number, string> = { 2: 'Angefragt', 3: 'In Bearbeitung', 4: 'Teilweise verfügbar', 5: 'Verfügbar' };
const poster = (p?: string) => (p ? `https://image.tmdb.org/t/p/w300${p}` : undefined);

function seerr(id: 'jellyseerr' | 'overseerr', name: string) {
  return defineIntegration({
    id,
    name,
    icon: id,
    category: 'media',
    description: 'Anfragen-Übersicht; Filme & Serien per Suche anfragen',
    website: id === 'jellyseerr' ? 'https://github.com/Fallenbagel/jellyseerr' : 'https://overseerr.dev',
    bang: id === 'jellyseerr' ? 'js' : 'os',
    // Only explicit by default: Sonarr/Radarr already cover "add" in the default search.
    searchByDefault: false,
    fields: [apiKeyField],
    headers: (c) => ({ 'X-Api-Key': String(c.apiKey ?? '') }),
    defaultWidget: 'requests',

    async health(ctx) {
      await ctx.http.get('/api/v1/status');
    },

    widgets: {
      requests: {
        name: 'Anfragen',
        interval: 300,
        async fetch(ctx) {
          const c = await ctx.http.get<any>('/api/v1/request/count');
          return {
            summary: c.pending ? `${c.pending} warten auf Freigabe` : 'Keine offenen Anfragen',
            status: c.pending ? 'warn' : 'ok',
            blocks: [
              {
                type: 'stats',
                items: [
                  { label: 'Offen', value: c.pending ?? 0, tone: c.pending ? 'warn' : 'default' },
                  { label: 'In Bearbeitung', value: c.processing ?? 0 },
                  { label: 'Verfügbar', value: c.available ?? 0, tone: 'ok' },
                  { label: 'Gesamt', value: c.total ?? 0 },
                ],
              },
            ],
          };
        },
      },
    },

    async search(ctx: Context, q) {
      const r = await ctx.http.get<any>('/api/v1/search', { query: { query: q.text, page: 1, language: 'de' } });
      return (r.results ?? [])
        .filter((m: any) => m.mediaType === 'movie' || m.mediaType === 'tv')
        .slice(0, 8)
        .map((m: any): SearchResult => {
          const title = m.title ?? m.name;
          const status = m.mediaInfo?.status as number | undefined;
          const year = (m.releaseDate ?? m.firstAirDate ?? '').slice(0, 4);
          return {
            id: `${id}:${m.mediaType}:${m.id}`,
            title,
            subtitle: `${m.mediaType === 'movie' ? 'Film' : 'Serie'} · ${year || '?'}${status ? ` · ${STATUS[status] ?? ''}` : ''}`,
            image: poster(m.posterPath),
            url: ctx.link(`/${m.mediaType}/${m.id}`),
            group: `${ctx.service.name} · Anfragen`,
            kind: 'media',
            score: bestScore(q.text, title, m.originalTitle ?? m.originalName) * 0.7,
            actions: !status || status < 2 ? [{ service: ctx.service.id, action: 'request', params: { mediaType: m.mediaType, mediaId: m.id }, label: 'Anfragen', tone: 'accent' }] : undefined,
            detail: { title, image: poster(m.posterPath), meta: [year, m.voteAverage ? `★ ${m.voteAverage.toFixed(1)}` : ''].filter(Boolean), description: m.overview, source: ctx.service.name },
          };
        });
    },

    actions: {
      async request(ctx, p) {
        const body: any = { mediaType: p.mediaType, mediaId: Number(p.mediaId) };
        if (p.mediaType === 'tv') body.seasons = 'all';
        await ctx.http.post('/api/v1/request', body);
        return { ok: true, message: 'Angefragt' };
      },
    },
  });
}

export const overseerr = seerr('overseerr', 'Overseerr');
export default seerr('jellyseerr', 'Jellyseerr');
