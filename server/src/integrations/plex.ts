import { defineIntegration } from './types.ts';
import type { Context } from './types.ts';
import { bestScore } from '../lib/match.ts';
import { duration, episodeCode } from '../lib/format.ts';
import type { SearchResult } from '../shared/types.ts';

const thumb = (ctx: Context, path?: string) => (path ? ctx.imageUrl(`/photo/:/transcode?width=300&height=450&minSize=1&url=${encodeURIComponent(path)}`) : undefined);
const title = (m: any) => (m.type === 'episode' ? `${m.grandparentTitle} · ${episodeCode(m.parentIndex, m.index)}` : m.title);

export default defineIntegration({
  id: 'plex',
  name: 'Plex',
  icon: 'plex',
  category: 'media',
  description: 'Aktive Streams und Bibliothekssuche',
  website: 'https://www.plex.tv',
  bang: 'plex',
  fields: [{ key: 'token', label: 'X-Plex-Token', type: 'secret', required: true }],
  headers: (c) => ({ 'X-Plex-Token': String(c.token ?? '') }),
  defaultWidget: 'sessions',

  async health(ctx) {
    await ctx.http.get('/identity');
  },

  widgets: {
    sessions: {
      name: 'Aktive Streams',
      interval: 10,
      async fetch(ctx) {
        const r = await ctx.http.get<any>('/status/sessions');
        const list: any[] = r.MediaContainer?.Metadata ?? [];
        return {
          summary: list.length ? `${list.length} Streams` : 'Niemand schaut gerade',
          blocks: [
            {
              type: 'list',
              empty: 'Keine aktiven Streams',
              items: list.map((m) => ({
                title: title(m),
                subtitle: `${m.User?.title ?? ''} · ${m.Player?.title ?? ''} · ${m.TranscodeSession ? 'Transcode' : 'Direct Play'}`,
                meta: `${duration((m.viewOffset ?? 0) / 1000)} / ${duration((m.duration ?? 0) / 1000)}`,
                progress: m.duration ? Math.round(((m.viewOffset ?? 0) / m.duration) * 100) : undefined,
                image: thumb(ctx, m.grandparentThumb ?? m.thumb),
                status: m.Player?.state === 'paused' ? ('muted' as const) : ('accent' as const),
              })),
            },
          ],
        };
      },
    },
  },

  async search(ctx, q) {
    const r = await ctx.http.get<any>('/hubs/search', { query: { query: q.text, limit: 6 } });
    const out: SearchResult[] = [];
    for (const hub of r.MediaContainer?.Hub ?? []) {
      if (!['movie', 'show', 'episode', 'artist', 'album'].includes(hub.type)) continue;
      for (const m of hub.Metadata ?? []) {
        out.push({
          id: `plex:${m.ratingKey}`,
          title: title(m),
          subtitle: [hub.title, m.year].filter(Boolean).join(' · '),
          image: thumb(ctx, m.thumb),
          url: ctx.link(`/web/index.html#!/server/${r.MediaContainer.machineIdentifier ?? ''}/details?key=${encodeURIComponent(m.key)}`),
          group: `${ctx.service.name} · In deiner Bibliothek`,
          kind: 'media',
          score: Math.max(bestScore(q.text, m.title, m.grandparentTitle), 0.55),
          detail: { title: m.title, image: thumb(ctx, m.thumb), meta: [String(m.year ?? ''), m.contentRating ?? ''].filter(Boolean), description: m.summary, source: ctx.service.name },
        });
      }
    }
    return out;
  },
});
