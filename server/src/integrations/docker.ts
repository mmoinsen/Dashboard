import { defineIntegration, limitOption } from './types.ts';
import type { Context } from './types.ts';
import { bytes, percent } from '../lib/format.ts';
import { bestScore } from '../lib/match.ts';
import type { ActionRef, ListItem, SearchResult, Tone } from '../shared/types.ts';

interface Container {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  health?: 'healthy' | 'unhealthy' | 'starting';
  project?: string;
}

async function containers(ctx: Context): Promise<Container[]> {
  return ctx.cache.get(`${ctx.service.id}:containers`, 5000, async () => {
    const list = await ctx.http.get<any[]>('/containers/json', { query: { all: true } });
    return list.map((c) => {
      const health = /\((healthy|unhealthy)\)/.exec(c.Status)?.[1] ?? (/health: starting/.test(c.Status) ? 'starting' : undefined);
      return {
        id: c.Id,
        name: (c.Names?.[0] ?? c.Id).replace(/^\//, ''),
        image: c.Image,
        state: c.State,
        status: c.Status,
        health: health as Container['health'],
        project: c.Labels?.['com.docker.compose.project'],
      };
    });
  });
}

function tone(c: Container): Tone {
  if (c.health === 'unhealthy' || c.state === 'dead' || c.state === 'restarting') return 'bad';
  if (c.health === 'starting' || c.state === 'paused' || c.state === 'created') return 'warn';
  if (c.state === 'running') return 'ok';
  return 'muted';
}

function label(c: Container): string {
  if (c.health) return c.health === 'starting' ? 'startet' : c.health;
  return { running: 'läuft', exited: 'gestoppt', paused: 'pausiert', restarting: 'startet neu', created: 'erstellt', dead: 'tot' }[c.state] ?? c.state;
}

function containerActions(ctx: Context, c: Container): ActionRef[] {
  const p = { id: c.id, name: c.name };
  if (c.state === 'running') {
    return [
      { service: ctx.service.id, action: 'restart', params: p, label: 'Neustarten' },
      { service: ctx.service.id, action: 'stop', params: p, label: 'Stoppen', tone: 'bad', confirm: `Container „${c.name}“ stoppen?` },
    ];
  }
  return [{ service: ctx.service.id, action: 'start', params: p, label: 'Starten', tone: 'accent' }];
}

async function stats(ctx: Context, id: string): Promise<{ cpu: number; mem: number } | null> {
  try {
    const s = await ctx.http.get<any>(`/containers/${id}/stats`, { query: { stream: false }, timeout: 5000 });
    const cpuDelta = s.cpu_stats.cpu_usage.total_usage - (s.precpu_stats.cpu_usage?.total_usage ?? 0);
    const sysDelta = s.cpu_stats.system_cpu_usage - (s.precpu_stats.system_cpu_usage ?? 0);
    const cpus = s.cpu_stats.online_cpus ?? s.cpu_stats.cpu_usage.percpu_usage?.length ?? 1;
    const cache = s.memory_stats.stats?.inactive_file ?? s.memory_stats.stats?.cache ?? 0;
    return { cpu: sysDelta > 0 ? (cpuDelta / sysDelta) * cpus * 100 : 0, mem: (s.memory_stats.usage ?? 0) - cache };
  } catch {
    return null;
  }
}

export default defineIntegration({
  id: 'docker',
  name: 'Docker',
  icon: 'docker',
  category: 'system',
  description: 'Container-Status und Health, CPU/RAM, Starten/Stoppen/Neustarten',
  website: 'https://www.docker.com',
  bang: 'd',
  needsUrl: false,
  fields: [
    {
      key: 'endpoint',
      label: 'Docker-Endpunkt',
      type: 'string',
      default: 'unix:///var/run/docker.sock',
      help: 'Socket (in den Container mounten) oder z. B. http://docker-socket-proxy:2375',
    },
  ],
  connection(service) {
    const ep = String(service.config.endpoint || 'unix:///var/run/docker.sock');
    if (ep.startsWith('unix://')) return { baseUrl: 'http://docker', socketPath: ep.slice('unix://'.length) };
    return { baseUrl: ep.replace(/^tcp:\/\//, 'http://') };
  },
  defaultWidget: 'containers',

  async health(ctx) {
    await ctx.http.get('/_ping');
  },

  widgets: {
    containers: {
      name: 'Container',
      interval: 15,
      options: [
        limitOption(8, 'Anzahl Container'),
        { key: 'filter', label: 'Nur diese Container (optional)', type: 'text', placeholder: 'jellyfin, sonarr, radarr' },
        { key: 'stats', label: 'CPU/RAM anzeigen', type: 'boolean', default: true },
        { key: 'problemsFirst', label: 'Probleme zuerst', type: 'boolean', default: true },
      ],
      async fetch(ctx, o) {
        let list = await containers(ctx);
        const filter = String(o.filter ?? '')
          .split(/[\s,]+/)
          .filter(Boolean);
        if (filter.length) list = list.filter((c) => filter.some((f) => c.name.includes(f)));
        const order: Record<Tone, number> = { bad: 0, warn: 1, ok: 2, muted: 3, default: 4, accent: 4, info: 4 };
        if (o.problemsFirst !== false) list = [...list].sort((a, b) => order[tone(a)] - order[tone(b)] || a.name.localeCompare(b.name));
        else list = [...list].sort((a, b) => a.name.localeCompare(b.name));
        const shown = list.slice(0, Number(o.limit) || 8);
        const st = o.stats !== false ? await Promise.all(shown.map((c) => (c.state === 'running' ? stats(ctx, c.id) : null))) : [];
        const all = await containers(ctx);
        const running = all.filter((c) => c.state === 'running').length;
        const unhealthy = all.filter((c) => tone(c) === 'bad').length;
        const items: ListItem[] = shown.map((c, i) => ({
          title: c.name,
          subtitle: label(c),
          meta: st[i] ? `${percent(st[i]!.cpu)} · ${bytes(st[i]!.mem)}` : c.status,
          status: tone(c),
          actions: containerActions(ctx, c),
        }));
        return {
          summary: `${running}/${all.length} laufen${unhealthy ? ` · ${unhealthy} mit Problemen` : ''}`,
          status: unhealthy ? 'bad' : 'ok',
          blocks: [{ type: 'list', items, empty: 'Keine Container' }],
        };
      },
    },
    summary: {
      name: 'Zusammenfassung',
      interval: 30,
      async fetch(ctx) {
        const all = await containers(ctx);
        const running = all.filter((c) => c.state === 'running').length;
        const problems = all.filter((c) => tone(c) === 'bad');
        return {
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Laufen', value: running, tone: 'ok' },
                { label: 'Gestoppt', value: all.length - running, tone: 'muted' },
                { label: 'Probleme', value: problems.length, tone: problems.length ? 'bad' : 'ok' },
              ],
            },
            ...(problems.length ? [{ type: 'list' as const, items: problems.map((c) => ({ title: c.name, subtitle: label(c), status: 'bad' as const, actions: containerActions(ctx, c) })) }] : []),
          ],
        };
      },
    },
  },

  async search(ctx, q) {
    const list = await containers(ctx);
    const out: SearchResult[] = [];
    for (const c of list) {
      const score = bestScore(q.text, c.name, c.image.split(':')[0].split('/').pop(), c.project);
      if (score < 0.6) continue;
      out.push({
        id: `docker:${c.id}`,
        title: c.name,
        subtitle: `Container · ${label(c)} · ${c.image}`,
        group: `${ctx.service.name} · Container`,
        kind: 'container',
        score: score * 0.7,
        actions: containerActions(ctx, c),
      });
    }
    return out;
  },

  actions: {
    async start(ctx, p) {
      await ctx.http.post(`/containers/${p.id}/start`);
      ctx.cache.delete(`${ctx.service.id}:containers`);
      return { ok: true, message: `${p.name} gestartet` };
    },
    async stop(ctx, p) {
      await ctx.http.post(`/containers/${p.id}/stop`, undefined, { timeout: 30000 });
      ctx.cache.delete(`${ctx.service.id}:containers`);
      return { ok: true, message: `${p.name} gestoppt` };
    },
    async restart(ctx, p) {
      await ctx.http.post(`/containers/${p.id}/restart`, undefined, { timeout: 60000 });
      ctx.cache.delete(`${ctx.service.id}:containers`);
      return { ok: true, message: `${p.name} neu gestartet` };
    },
  },
});
