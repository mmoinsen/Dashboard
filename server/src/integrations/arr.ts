// Shared helpers for the *arr family (Sonarr, Radarr, Lidarr, Prowlarr).
import type { Context } from './types.ts';
import type { FieldDef, ListItem, Tone } from '../shared/types.ts';
import { bytes } from '../lib/format.ts';

export const arrHeaders = (c: Record<string, any>) => ({ 'X-Api-Key': String(c.apiKey ?? '') });

export const arrAddFields: FieldDef[] = [
  { key: 'apiKey', label: 'API-Key', type: 'secret', required: true, help: 'Einstellungen → Allgemein → API-Schlüssel' },
  {
    key: 'qualityProfileId',
    label: 'Qualitätsprofil-ID für neue Einträge',
    type: 'number',
    help: 'Leer = erstes Profil',
  },
  { key: 'rootFolder', label: 'Root-Ordner für neue Einträge', type: 'string', help: 'Leer = erster Root-Ordner' },
];

export interface ArrDefaults {
  qualityProfileId: number;
  rootFolderPath: string;
  metadataProfileId?: number;
}

/** Profile + root folder used when adding new items, cached for 10 minutes. */
export async function arrDefaults(ctx: Context, api: string): Promise<ArrDefaults> {
  return ctx.cache.get(`${ctx.service.id}:defaults`, 600_000, async () => {
    const [profiles, roots] = await Promise.all([
      ctx.http.get<any[]>(`${api}/qualityprofile`),
      ctx.http.get<any[]>(`${api}/rootfolder`),
    ]);
    const cfg = ctx.service.config;
    const root = cfg.rootFolder ? roots.find((r) => r.path === cfg.rootFolder) ?? { path: cfg.rootFolder } : roots[0];
    if (!root) throw new Error('Kein Root-Ordner konfiguriert');
    const out: ArrDefaults = {
      qualityProfileId: Number(cfg.qualityProfileId) || root.defaultQualityProfileId || profiles[0]?.id,
      rootFolderPath: root.path,
    };
    if (api === '/api/v1') {
      const meta = await ctx.http.get<any[]>(`${api}/metadataprofile`).catch(() => []);
      out.metadataProfileId = root.defaultMetadataProfileId || meta[0]?.id;
    }
    return out;
  });
}

export function posterOf(item: any, ctx: Context): string | undefined {
  const img = (item.images ?? []).find((i: any) => i.coverType === 'poster') ?? item.images?.[0];
  if (!img) return undefined;
  if (img.remoteUrl) return img.remoteUrl;
  if (img.url) return ctx.imageUrl(img.url.replace(/^.*?(\/MediaCover)/, '/MediaCover'));
  return undefined;
}

function queueTone(r: any): Tone {
  if (r.trackedDownloadStatus === 'warning' || r.status === 'warning') return 'warn';
  if (r.trackedDownloadStatus === 'error' || r.status === 'failed') return 'bad';
  return 'info';
}

/** Generic download queue widget for Sonarr/Radarr/Lidarr. */
export async function arrQueue(ctx: Context, api: string, limit: number, label: (r: any) => { title: string; subtitle?: string }) {
  const include = api === '/api/v1' ? { includeArtist: true, includeAlbum: true } : { includeSeries: true, includeEpisode: true, includeMovie: true };
  const q = await ctx.http.get<any>(`${api}/queue`, { query: { pageSize: limit, sortKey: 'timeleft', ...include } });
  const records: any[] = q.records ?? [];
  const items: ListItem[] = records.map((r) => {
    const { title, subtitle } = label(r);
    const progress = r.size ? Math.round(((r.size - r.sizeleft) / r.size) * 100) : 0;
    const warn = r.statusMessages?.[0]?.messages?.[0] ?? r.errorMessage;
    return {
      title,
      subtitle: warn ?? subtitle,
      meta: r.timeleft ? `${progress} % · ${r.timeleft}` : `${progress} % · ${bytes(r.size)}`,
      progress,
      status: queueTone(r),
    };
  });
  return { total: q.totalRecords ?? records.length, items };
}

export function libraryStatusBadge(hasFile: boolean, monitored: boolean, released = true): { text: string; tone: Tone } {
  if (hasFile) return { text: 'Vorhanden', tone: 'ok' };
  if (!monitored) return { text: 'Nicht überwacht', tone: 'muted' };
  return released ? { text: 'Fehlt', tone: 'warn' } : { text: 'Erwartet', tone: 'info' };
}
