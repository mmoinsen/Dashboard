import { apiKeyField, defineIntegration, limitOption } from './types.ts';
import type { Context } from './types.ts';
import { bestScore } from '../lib/match.ts';
import { duration, episodeCode, ticksToSeconds } from '../lib/format.ts';
import type { ListItem, SearchResult } from '../shared/types.ts';

const TYPE_LABEL: Record<string, string> = {
  Movie: 'Film',
  Series: 'Serie',
  Episode: 'Episode',
  MusicAlbum: 'Album',
  Audio: 'Titel',
  MusicArtist: 'Künstler',
  BoxSet: 'Sammlung',
};

function itemLink(ctx: Context, item: any) {
  return ctx.link(`/web/#/details?id=${item.Id}${item.ServerId ? `&serverId=${item.ServerId}` : ''}`);
}

function itemImage(ctx: Context, item: any, height = 300) {
  const id = item.ImageTags?.Primary ? item.Id : item.SeriesPrimaryImageTag ? item.SeriesId : item.AlbumPrimaryImageTag ? item.AlbumId : null;
  return id ? ctx.imageUrl(`/Items/${id}/Images/Primary?fillHeight=${height}&quality=85`) : undefined;
}

function displayTitle(item: any) {
  if (item.Type === 'Episode') return `${item.SeriesName} · ${episodeCode(item.ParentIndexNumber, item.IndexNumber)}`;
  if (item.Type === 'Audio') return `${item.Name} – ${item.AlbumArtist ?? item.Artists?.[0] ?? ''}`;
  return item.Name;
}

/** Shared by Jellyfin and Emby (same API). */
export function jellyfinLike(id: 'jellyfin' | 'emby', name: string) {
  const integration = defineIntegration({
    id,
    name,
    icon: id,
    category: 'media',
    description: 'Aktive Streams, zuletzt hinzugefügt, Bibliothekssuche mit Zusammenfassung',
    website: id === 'jellyfin' ? 'https://jellyfin.org' : 'https://emby.media',
    bang: id === 'jellyfin' ? 'jf' : 'emby',
    fields: [
      { ...apiKeyField, help: 'Dashboard → API-Schlüssel' },
      { key: 'userId', label: 'Benutzer-ID (optional)', type: 'string', help: 'Für „Weiterschauen“ und Fortschritt in der Suche' },
    ],
    headers: (c) => ({ 'X-Emby-Token': String(c.apiKey ?? ''), Authorization: `MediaBrowser Token="${c.apiKey ?? ''}"` }),
    defaultWidget: 'sessions',

    async health(ctx) {
      await ctx.http.get('/System/Info');
    },

    widgets: {
      sessions: {
        name: 'Aktive Streams',
        interval: 10,
        async fetch(ctx) {
          const sessions = await ctx.http.get<any[]>('/Sessions', { query: { activeWithinSeconds: 900 } });
          const playing = sessions.filter((s) => s.NowPlayingItem);
          const transcodes = playing.filter((s) => s.TranscodingInfo && !s.TranscodingInfo.IsVideoDirect).length;
          const items: ListItem[] = playing.map((s) => {
            const item = s.NowPlayingItem;
            const pos = ticksToSeconds(s.PlayState?.PositionTicks);
            const total = ticksToSeconds(item.RunTimeTicks);
            const tc = s.TranscodingInfo;
            const mode = tc && !tc.IsVideoDirect ? `Transcode ${tc.Height ? `${tc.Height}p` : ''}` : 'Direct Play';
            return {
              title: displayTitle(item),
              subtitle: `${s.UserName ?? ''} · ${s.DeviceName ?? s.Client} · ${mode}`,
              meta: `${s.PlayState?.IsPaused ? 'Pausiert · ' : ''}${duration(pos)} / ${duration(total)}`,
              image: itemImage(ctx, item, 160),
              progress: total ? Math.round((pos / total) * 100) : undefined,
              status: s.PlayState?.IsPaused ? 'muted' : 'accent',
              url: itemLink(ctx, item),
            };
          });
          return {
            summary: playing.length ? `${playing.length} Stream${playing.length > 1 ? 's' : ''}${transcodes ? ` · ${transcodes} Transcode` : ''}` : 'Niemand schaut gerade',
            blocks: [{ type: 'list', items, empty: 'Keine aktiven Streams' }],
          };
        },
      },
      latest: {
        name: 'Zuletzt hinzugefügt',
        interval: 600,
        size: 2,
        options: [
          limitOption(8),
          {
            key: 'types',
            label: 'Medientypen',
            type: 'select',
            default: 'Movie,Series',
            options: [
              { value: 'Movie,Series', label: 'Filme & Serien' },
              { value: 'Movie', label: 'Filme' },
              { value: 'Series,Episode', label: 'Serien' },
              { value: 'MusicAlbum', label: 'Musik' },
            ],
          },
        ],
        async fetch(ctx, o) {
          const res = await ctx.http.get<any>('/Items', {
            query: {
              SortBy: 'DateCreated',
              SortOrder: 'Descending',
              IncludeItemTypes: String(o.types || 'Movie,Series'),
              Recursive: true,
              Limit: Number(o.limit) || 8,
              Fields: 'PrimaryImageAspectRatio',
            },
          });
          return {
            blocks: [
              {
                type: 'posters',
                items: (res.Items ?? []).map((i: any) => ({
                  title: i.Name,
                  subtitle: i.ProductionYear ? String(i.ProductionYear) : TYPE_LABEL[i.Type],
                  image: itemImage(ctx, i, 300),
                  url: itemLink(ctx, i),
                })),
              },
            ],
          };
        },
      },
      resume: {
        name: 'Weiterschauen',
        description: 'Benötigt die Benutzer-ID in den Diensteinstellungen',
        interval: 300,
        options: [limitOption(5)],
        async fetch(ctx, o) {
          const userId = ctx.service.config.userId;
          if (!userId) return { blocks: [{ type: 'text', text: 'Bitte Benutzer-ID in den Diensteinstellungen eintragen.', tone: 'warn' }] };
          const res = await ctx.http.get<any>(`/Users/${userId}/Items/Resume`, { query: { Limit: Number(o.limit) || 5, MediaTypes: 'Video' } });
          return {
            blocks: [
              {
                type: 'list',
                empty: 'Nichts angefangen',
                items: (res.Items ?? []).map((i: any) => ({
                  title: displayTitle(i),
                  subtitle: i.Type === 'Episode' ? i.Name : String(i.ProductionYear ?? ''),
                  image: itemImage(ctx, i, 160),
                  progress: Math.round(i.UserData?.PlayedPercentage ?? 0),
                  url: itemLink(ctx, i),
                })),
              },
            ],
          };
        },
      },
      stats: {
        name: 'Bibliothek',
        interval: 3600,
        async fetch(ctx) {
          const c = await ctx.http.get<any>('/Items/Counts');
          return {
            blocks: [
              {
                type: 'stats',
                items: [
                  { label: 'Filme', value: c.MovieCount ?? 0 },
                  { label: 'Serien', value: c.SeriesCount ?? 0 },
                  { label: 'Episoden', value: c.EpisodeCount ?? 0 },
                  { label: 'Alben', value: c.AlbumCount ?? 0 },
                ],
              },
            ],
          };
        },
      },
    },

    async search(ctx, q) {
      const userId = ctx.service.config.userId;
      const res = await ctx.http.get<any>(userId ? `/Users/${userId}/Items` : '/Items', {
        query: {
          searchTerm: q.text,
          IncludeItemTypes: 'Movie,Series,Episode,MusicAlbum,MusicArtist,Audio,BoxSet',
          Recursive: true,
          Limit: q.limit + 6,
          Fields: 'Overview,Genres,ProductionYear,CommunityRating,OfficialRating,RunTimeTicks',
        },
      });
      return (res.Items ?? []).map((i: any): SearchResult => {
        let score = bestScore(q.text, i.Name, i.OriginalTitle, i.SeriesName);
        if (i.Type === 'Movie' || i.Type === 'Series') score = Math.min(1, score + 0.05);
        if (i.Type === 'Episode' || i.Type === 'Audio') score *= 0.8;
        const runtime = ticksToSeconds(i.RunTimeTicks);
        const played = i.UserData?.PlayedPercentage;
        const meta = [
          TYPE_LABEL[i.Type] ?? i.Type,
          i.ProductionYear ? String(i.ProductionYear) : '',
          runtime ? duration(runtime) : '',
          i.OfficialRating ?? '',
          i.CommunityRating ? `★ ${i.CommunityRating.toFixed(1)}` : '',
        ].filter(Boolean);
        return {
          id: `${ctx.service.id}:${i.Id}`,
          title: displayTitle(i),
          subtitle: [meta.slice(0, 3).join(' · '), i.UserData?.Played ? 'gesehen' : played ? `zu ${Math.round(played)} % gesehen` : ''].filter(Boolean).join(' · '),
          image: itemImage(ctx, i, 300),
          url: itemLink(ctx, i),
          group: `${ctx.service.name} · In deiner Bibliothek`,
          kind: 'media',
          // Owned media is what people usually want: boost above "add to *arr".
          score: Math.max(score, 0.55),
          actions: [{ service: ctx.service.id, action: 'open', params: { url: itemLink(ctx, i) }, label: played ? 'Fortsetzen' : 'Abspielen', tone: 'accent' }],
          detail: {
            title: i.Name,
            image: itemImage(ctx, i, 450),
            meta: [...meta.slice(1), ...(i.Genres ?? []).slice(0, 2)],
            description: i.Overview,
            progress: played ? Math.round(played) : undefined,
            progressLabel: played && runtime ? `Weiter bei ${duration((runtime * played) / 100)}` : undefined,
            source: ctx.service.name,
          },
        };
      });
    },

    actions: {
      // "open" is handled client side (url param); kept so the action ref is valid.
      async open() {
        return { ok: true };
      },
    },
  });

  /** Detail view for all widgets: streams, continue watching, library, recently added. */
  const detail = async (ctx: Context) => {
    const w = integration.widgets!;
    const [sessions, stats, latest, resume] = await Promise.all([
      w.sessions.fetch(ctx, {}),
      w.stats.fetch(ctx, {}).catch(() => null),
      w.latest.fetch(ctx, { limit: 16, types: 'Movie,Series' }).catch(() => null),
      ctx.service.config.userId ? w.resume.fetch(ctx, { limit: 8 }).catch(() => null) : Promise.resolve(null),
    ]);
    return {
      summary: sessions.summary,
      blocks: [
        { type: 'heading' as const, text: 'Läuft gerade' },
        ...sessions.blocks,
        ...(resume ? [{ type: 'heading' as const, text: 'Weiterschauen' }, ...resume.blocks] : []),
        ...(stats ? [{ type: 'heading' as const, text: 'Bibliothek' }, ...stats.blocks] : []),
        ...(latest ? [{ type: 'heading' as const, text: 'Zuletzt hinzugefügt' }, ...latest.blocks] : []),
      ],
    };
  };
  for (const widget of Object.values(integration.widgets!)) widget.detail = detail;
  return integration;
}

export default jellyfinLike('jellyfin', 'Jellyfin');
