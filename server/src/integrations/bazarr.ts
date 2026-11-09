import { apiKeyField, defineIntegration, limitOption } from './types.ts';
import type { ListItem } from '../shared/types.ts';

export default defineIntegration({
  id: 'bazarr',
  name: 'Bazarr',
  icon: 'bazarr',
  category: 'media',
  description: 'Fehlende Untertitel für Serien und Filme',
  website: 'https://www.bazarr.media',
  fields: [{ ...apiKeyField, help: 'Einstellungen → Allgemein → Sicherheit' }],
  headers: (c) => ({ 'X-API-KEY': String(c.apiKey ?? '') }),
  defaultWidget: 'wanted',

  async health(ctx) {
    await ctx.http.get('/api/system/status');
  },

  widgets: {
    wanted: {
      name: 'Fehlende Untertitel',
      interval: 600,
      options: [limitOption(5)],
      async fetch(ctx, o) {
        const limit = Number(o.limit) || 5;
        const [badges, episodes, movies] = await Promise.all([
          ctx.http.get<any>('/api/badges'),
          ctx.http.get<any>('/api/episodes/wanted', { query: { start: 0, length: limit } }).catch(() => ({ data: [] })),
          ctx.http.get<any>('/api/movies/wanted', { query: { start: 0, length: limit } }).catch(() => ({ data: [] })),
        ]);
        const langs = (subs: any[] = []) => subs.map((s) => s.code2?.toUpperCase() ?? s.name).join(', ');
        const items: ListItem[] = [
          ...(episodes.data ?? []).map((e: any) => ({
            title: e.seriesTitle,
            subtitle: `${e.episode_number ?? ''} · ${e.episodeTitle ?? ''}`,
            badge: { text: langs(e.missing_subtitles), tone: 'warn' as const },
          })),
          ...(movies.data ?? []).map((m: any) => ({
            title: m.title,
            subtitle: 'Film',
            badge: { text: langs(m.missing_subtitles), tone: 'warn' as const },
          })),
        ].slice(0, limit);
        const providersDown = Number(badges.providers ?? 0);
        return {
          summary: `${badges.episodes ?? 0} Episoden · ${badges.movies ?? 0} Filme ohne Untertitel`,
          status: providersDown ? 'warn' : 'ok',
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Episoden', value: badges.episodes ?? 0, tone: badges.episodes ? 'warn' : 'ok' },
                { label: 'Filme', value: badges.movies ?? 0, tone: badges.movies ? 'warn' : 'ok' },
                { label: 'Provider-Fehler', value: providersDown, tone: providersDown ? 'bad' : 'ok' },
              ],
            },
            { type: 'list', items, empty: 'Alle Untertitel vorhanden' },
          ],
        };
      },
    },
  },

  actions: {
    async searchMissing(ctx) {
      await ctx.http.post('/api/system/tasks?taskid=wanted_search_missing_subtitles_series', undefined);
      await ctx.http.post('/api/system/tasks?taskid=wanted_search_missing_subtitles_movies', undefined);
      return { ok: true, message: 'Suche gestartet' };
    },
  },
});
