import { defineIntegration } from './types.ts';
import type { ListItem } from '../shared/types.ts';

export default defineIntegration({
  id: 'uptime-kuma',
  name: 'Uptime Kuma',
  icon: 'uptime-kuma',
  category: 'system',
  description: 'Monitore einer Statusseite: online/offline und Antwortzeit',
  website: 'https://uptime.kuma.pet',
  fields: [{ key: 'slug', label: 'Statusseiten-Slug', type: 'string', required: true, help: 'Der Teil nach /status/ in der URL' }],
  defaultWidget: 'monitors',

  async health(ctx) {
    await ctx.http.get(`/api/status-page/${ctx.service.config.slug}`);
  },

  widgets: {
    monitors: {
      name: 'Monitore',
      interval: 60,
      async fetch(ctx) {
        const slug = ctx.service.config.slug;
        const [page, beats] = await Promise.all([ctx.http.get<any>(`/api/status-page/${slug}`), ctx.http.get<any>(`/api/status-page/heartbeat/${slug}`)]);
        const monitors = (page.publicGroupList ?? []).flatMap((g: any) => g.monitorList ?? []);
        const items: ListItem[] = monitors.map((m: any) => {
          const list = beats.heartbeatList?.[m.id] ?? [];
          const last = list[list.length - 1];
          const up = last?.status === 1;
          const uptime = beats.uptimeList?.[`${m.id}_24`];
          return {
            title: m.name,
            subtitle: last ? (up ? `Online · ${last.ping ?? '–'} ms` : last.msg || 'Offline') : 'Keine Daten',
            meta: uptime != null ? `${(uptime * 100).toFixed(2)} % (24 h)` : undefined,
            status: !last ? 'muted' : up ? 'ok' : last.status === 2 ? 'warn' : 'bad',
          };
        });
        const down = items.filter((i) => i.status === 'bad').length;
        items.sort((a, b) => Number(b.status === 'bad') - Number(a.status === 'bad'));
        return { summary: down ? `${down} von ${items.length} offline` : `Alle ${items.length} online`, status: down ? 'bad' : 'ok', blocks: [{ type: 'list', items }] };
      },
    },
  },
});
