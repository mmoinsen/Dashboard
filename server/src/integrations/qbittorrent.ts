import { defineIntegration, limitOption, passwordField, usernameField } from './types.ts';
import type { Context } from './types.ts';
import { HttpError } from '../lib/http.ts';
import { bytes, duration, speedParts } from '../lib/format.ts';
import { bestScore } from '../lib/match.ts';
import type { ListItem, SearchResult, Tone } from '../shared/types.ts';

/** qBittorrent >= 5.2 accepts an API key (Bearer); older versions need the cookie login. */
function usesApiKey(ctx: Context) {
  return Boolean(ctx.service.config.apiKey);
}

async function login(ctx: Context) {
  const { username, password } = ctx.service.config;
  if (usesApiKey(ctx) || !username) return; // API key, or auth bypass for local networks
  const res = await ctx.http.request<Response>('/api/v2/auth/login', {
    method: 'POST',
    body: new URLSearchParams({ username, password: password ?? '' }),
    headers: { Referer: ctx.service.url, Origin: new URL(ctx.service.url).origin },
    raw: true,
  });
  const text = await res.text();
  if (!res.ok || text.trim() === 'Fails.') throw new HttpError(401, 'Login fehlgeschlagen');
  const cookie = res.headers.get('set-cookie')?.match(/SID=[^;]+/)?.[0];
  if (cookie) ctx.state.cookie = cookie;
}

/** Request with automatic (re-)login when the session cookie expired. */
async function qb<T = any>(ctx: Context, path: string, form?: Record<string, string>): Promise<T> {
  const doReq = () =>
    ctx.http.request<T>(path, {
      method: form ? 'POST' : 'GET',
      body: form ? new URLSearchParams(form) : undefined,
      headers: { ...(ctx.state.cookie ? { Cookie: ctx.state.cookie } : {}), Referer: ctx.service.url },
    });
  if (!ctx.state.cookie && ctx.service.config.username) await login(ctx);
  try {
    return await doReq();
  } catch (err) {
    if (!usesApiKey(ctx) && err instanceof HttpError && (err.status === 403 || err.status === 401)) {
      await login(ctx);
      return doReq();
    }
    throw err;
  }
}

/** qBittorrent 5 renamed pause/resume to stop/start. */
async function qbCompat(ctx: Context, modern: string, legacy: string, form: Record<string, string>) {
  try {
    await qb(ctx, `/api/v2/torrents/${modern}`, form);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) await qb(ctx, `/api/v2/torrents/${legacy}`, form);
    else throw err;
  }
}

/** Keep the last ~10 minutes of speed samples (taken whenever the widget refreshes). */
function recordSpeed(ctx: Context, info: any) {
  const hist: { t: number; dl: number; ul: number }[] = (ctx.state.speeds ??= []);
  const now = Date.now();
  if (!hist.length || now - hist[hist.length - 1].t > 2500) hist.push({ t: now, dl: info.dl_info_speed ?? 0, ul: info.up_info_speed ?? 0 });
  while (hist.length > 200 || (hist.length && now - hist[0].t > 10 * 60_000)) hist.shift();
  return hist;
}

function torrentItem(ctx: Context, t: any): ListItem {
  const [label, tone] = STATE[t.state] ?? [t.state, 'default' as Tone];
  const progress = Math.round(t.progress * 100);
  const paused = /paused|stopped/i.test(t.state);
  return {
    title: t.name,
    subtitle: `${label} · ${bytes(t.size)}${t.dlspeed ? ` · ↓ ${bytes(t.dlspeed)}/s` : ''}${t.upspeed ? ` · ↑ ${bytes(t.upspeed)}/s` : ''}${t.category ? ` · ${t.category}` : ''}`,
    meta: progress < 100 ? `${progress} % · ${duration(t.eta)}` : `Ratio ${t.ratio?.toFixed(2)}`,
    progress,
    status: tone,
    actions: [
      paused
        ? { service: ctx.service.id, action: 'resume', params: { hash: t.hash }, label: 'Fortsetzen' }
        : { service: ctx.service.id, action: 'pause', params: { hash: t.hash }, label: 'Pausieren' },
    ],
  };
}

const STATE: Record<string, [string, Tone]> = {
  downloading: ['Lädt', 'info'],
  forcedDL: ['Lädt (erzwungen)', 'info'],
  metaDL: ['Metadaten', 'info'],
  stalledDL: ['Hängt', 'warn'],
  uploading: ['Seeding', 'ok'],
  forcedUP: ['Seeding', 'ok'],
  stalledUP: ['Seeding', 'ok'],
  pausedDL: ['Pausiert', 'muted'],
  stoppedDL: ['Gestoppt', 'muted'],
  pausedUP: ['Fertig', 'ok'],
  stoppedUP: ['Fertig', 'ok'],
  queuedDL: ['Warteschlange', 'muted'],
  checkingDL: ['Prüfe', 'info'],
  error: ['Fehler', 'bad'],
  missingFiles: ['Dateien fehlen', 'bad'],
};

export default defineIntegration({
  id: 'qbittorrent',
  name: 'qBittorrent',
  icon: 'qbittorrent',
  category: 'downloads',
  description: 'Download/Upload-Geschwindigkeit, aktive Torrents, Pause/Fortsetzen',
  website: 'https://www.qbittorrent.org',
  bang: 'qb',
  fields: [
    {
      key: 'apiKey',
      label: 'API-Key (ab qBittorrent 5.2)',
      type: 'secret',
      help: 'Optionen → WebUI → API-Key. Wenn gesetzt, werden Benutzername/Passwort nicht benötigt.',
    },
    { ...usernameField, help: 'Für ältere Versionen ohne API-Key. Leer lassen, wenn die Authentifizierung für dein Netz deaktiviert ist.' },
    passwordField,
  ],
  headers: (c) => (c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}),
  defaultWidget: 'transfer',

  async health(ctx) {
    await qb(ctx, '/api/v2/app/version');
  },

  widgets: {
    transfer: {
      name: 'Übertragung',
      description: 'Geschwindigkeit und aktive Torrents',
      interval: 3,
      options: [
        limitOption(4, 'Anzahl Torrents'),
        {
          key: 'filter',
          label: 'Liste',
          type: 'select',
          default: 'active',
          options: [
            { value: 'active', label: 'Aktive' },
            { value: 'downloading', label: 'Downloads' },
            { value: 'seeding', label: 'Seeding' },
            { value: 'all', label: 'Alle' },
          ],
        },
      ],
      async fetch(ctx, o) {
        const [info, torrents, prefs] = await Promise.all([
          qb<any>(ctx, '/api/v2/transfer/info'),
          qb<any[]>(ctx, `/api/v2/torrents/info?filter=${encodeURIComponent(o.filter || 'active')}&sort=dlspeed&reverse=true`),
          qb<any>(ctx, '/api/v2/transfer/speedLimitsMode').catch(() => 0),
        ]);
        const all = await ctx.cache.get(`${ctx.service.id}:counts`, 30_000, async () => {
          const list = await qb<any[]>(ctx, '/api/v2/torrents/info');
          return {
            total: list.length,
            seeding: list.filter((t) => ['uploading', 'stalledUP', 'forcedUP'].includes(t.state)).length,
            downloading: list.filter((t) => ['downloading', 'stalledDL', 'forcedDL', 'metaDL', 'queuedDL'].includes(t.state)).length,
          };
        });
        recordSpeed(ctx, info);
        const dl = speedParts(info.dl_info_speed ?? 0);
        const ul = speedParts(info.up_info_speed ?? 0);
        const altMode = String(prefs) === '1';
        const items: ListItem[] = torrents.slice(0, Number(o.limit) || 4).map((t) => {
          const [label, tone] = STATE[t.state] ?? [t.state, 'default'];
          const progress = Math.round(t.progress * 100);
          return {
            title: t.name,
            subtitle: `${label} · ${bytes(t.size)}${t.dlspeed ? ` · ↓ ${bytes(t.dlspeed)}/s` : ''}${t.upspeed ? ` · ↑ ${bytes(t.upspeed)}/s` : ''}`,
            meta: progress < 100 ? `${progress} % · ${duration(t.eta)}` : `Ratio ${t.ratio?.toFixed(2)}`,
            progress,
            status: tone,
          };
        });
        return {
          summary: `${all.downloading} lädt · ${all.seeding} seeding${altMode ? ' · Tempolimit aktiv' : ''}`,
          status: info.connection_status === 'disconnected' ? 'bad' : info.connection_status === 'firewalled' ? 'warn' : 'ok',
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Download', value: dl.value, unit: dl.unit, tone: 'info' },
                { label: 'Upload', value: ul.value, unit: ul.unit, tone: 'accent' },
              ],
            },
            { type: 'list', items, empty: 'Keine aktiven Torrents' },
            {
              type: 'actions',
              items: [
                { service: ctx.service.id, action: 'pauseAll', label: 'Alle pausieren' },
                { service: ctx.service.id, action: 'resumeAll', label: 'Alle fortsetzen' },
                { service: ctx.service.id, action: 'toggleAltSpeed', label: altMode ? 'Tempolimit aus' : 'Tempolimit an' },
              ],
            },
          ],
        };
      },
      async detail(ctx) {
        const [info, list, prefs, main] = await Promise.all([
          qb<any>(ctx, '/api/v2/transfer/info'),
          qb<any[]>(ctx, '/api/v2/torrents/info?sort=name'),
          qb<any>(ctx, '/api/v2/transfer/speedLimitsMode').catch(() => 0),
          ctx.cache.get(`${ctx.service.id}:maindata`, 15_000, () => qb<any>(ctx, '/api/v2/sync/maindata?rid=0').catch(() => null)),
        ]);
        const hist = recordSpeed(ctx, info);
        const st = main?.server_state ?? {};
        const altMode = String(prefs) === '1';
        const groups: [string, (t: any) => boolean][] = [
          ['Fehler', (t) => ['error', 'missingFiles'].includes(t.state)],
          ['Lädt', (t) => ['downloading', 'forcedDL', 'metaDL', 'stalledDL', 'queuedDL', 'checkingDL'].includes(t.state)],
          ['Seeding', (t) => ['uploading', 'forcedUP', 'stalledUP'].includes(t.state)],
          ['Pausiert & fertig', () => true],
        ];
        const used = new Set<string>();
        const blocks: any[] = [
          {
            type: 'stats',
            items: [
              { label: 'Download', ...speedParts(info.dl_info_speed ?? 0), tone: 'info' },
              { label: 'Upload', ...speedParts(info.up_info_speed ?? 0), tone: 'accent' },
              { label: 'Sitzung ↓', value: bytes(info.dl_info_data) },
              { label: 'Sitzung ↑', value: bytes(info.up_info_data) },
              ...(st.alltime_dl != null ? [{ label: 'Gesamt ↓', value: bytes(st.alltime_dl) }, { label: 'Gesamt ↑', value: bytes(st.alltime_ul) }] : []),
              ...(st.global_ratio != null ? [{ label: 'Ratio', value: String(st.global_ratio) }] : []),
              ...(st.free_space_on_disk != null ? [{ label: 'Freier Speicher', value: bytes(st.free_space_on_disk) }] : []),
              { label: 'Verbindung', value: info.connection_status === 'connected' ? 'OK' : info.connection_status, tone: info.connection_status === 'connected' ? 'ok' : 'warn' },
            ],
          },
        ];
        if (hist.length > 1) {
          blocks.push({
            type: 'chart',
            label: 'Geschwindigkeit (letzte Minuten)',
            unit: 'MB/s',
            series: [
              { label: 'Download', points: hist.map((h) => Math.round((h.dl / 1048576) * 10) / 10), tone: 'info' },
              { label: 'Upload', points: hist.map((h) => Math.round((h.ul / 1048576) * 10) / 10), tone: 'accent' },
            ],
          });
        }
        for (const [title, match] of groups) {
          const items = list.filter((t) => !used.has(t.hash) && match(t));
          items.forEach((t) => used.add(t.hash));
          if (!items.length) continue;
          blocks.push({ type: 'heading', text: `${title} (${items.length})` });
          blocks.push({ type: 'list', items: items.slice(0, 100).map((t) => torrentItem(ctx, t)) });
        }
        blocks.push({
          type: 'actions',
          items: [
            { service: ctx.service.id, action: 'pauseAll', label: 'Alle pausieren' },
            { service: ctx.service.id, action: 'resumeAll', label: 'Alle fortsetzen' },
            { service: ctx.service.id, action: 'toggleAltSpeed', label: altMode ? 'Tempolimit aus' : 'Tempolimit an' },
          ],
        });
        return { summary: `${list.length} Torrents${altMode ? ' · Tempolimit aktiv' : ''}`, blocks };
      },
    },
  },

  async search(ctx, q) {
    const list = await ctx.cache.get(`${ctx.service.id}:all`, 15_000, () => qb<any[]>(ctx, '/api/v2/torrents/info'));
    const results: SearchResult[] = [];
    for (const t of list) {
      const score = bestScore(q.text, t.name.replace(/[._]/g, ' '));
      if (score < 0.6) continue;
      const [label] = STATE[t.state] ?? [t.state];
      const progress = Math.round(t.progress * 100);
      const paused = /paused|stopped/i.test(t.state);
      results.push({
        id: `qb:${t.hash}`,
        title: t.name,
        subtitle: `${label} · ${progress} % · ${bytes(t.size)}`,
        group: `${ctx.service.name} · Torrents`,
        kind: 'download',
        score: score * 0.6,
        actions: [
          paused
            ? { service: ctx.service.id, action: 'resume', params: { hash: t.hash }, label: 'Fortsetzen' }
            : { service: ctx.service.id, action: 'pause', params: { hash: t.hash }, label: 'Pausieren' },
        ],
      });
    }
    return results;
  },

  actions: {
    async pauseAll(ctx) {
      await qbCompat(ctx, 'stop', 'pause', { hashes: 'all' });
      return { ok: true, message: 'Alle Torrents pausiert' };
    },
    async resumeAll(ctx) {
      await qbCompat(ctx, 'start', 'resume', { hashes: 'all' });
      return { ok: true, message: 'Alle Torrents fortgesetzt' };
    },
    async pause(ctx, p) {
      await qbCompat(ctx, 'stop', 'pause', { hashes: String(p.hash) });
      ctx.cache.delete(`${ctx.service.id}:all`);
      return { ok: true, message: 'Pausiert' };
    },
    async resume(ctx, p) {
      await qbCompat(ctx, 'start', 'resume', { hashes: String(p.hash) });
      ctx.cache.delete(`${ctx.service.id}:all`);
      return { ok: true, message: 'Fortgesetzt' };
    },
    async toggleAltSpeed(ctx) {
      await qb(ctx, '/api/v2/transfer/toggleSpeedLimitsMode', {});
      return { ok: true, message: 'Tempolimit umgeschaltet' };
    },
  },
});
