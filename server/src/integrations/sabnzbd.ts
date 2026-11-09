import { apiKeyField, defineIntegration, limitOption } from './types.ts';

export default defineIntegration({
  id: 'sabnzbd',
  name: 'SABnzbd',
  icon: 'sabnzbd',
  category: 'downloads',
  description: 'Usenet-Warteschlange und Geschwindigkeit, Pause/Fortsetzen',
  website: 'https://sabnzbd.org',
  fields: [apiKeyField],
  defaultWidget: 'queue',

  async health(ctx) {
    await ctx.http.get('/api', { query: { mode: 'version', output: 'json', apikey: ctx.service.config.apiKey } });
  },

  widgets: {
    queue: {
      name: 'Warteschlange',
      interval: 5,
      options: [limitOption(4)],
      async fetch(ctx, o) {
        const { queue } = await ctx.http.get<any>('/api', { query: { mode: 'queue', output: 'json', limit: Number(o.limit) || 4, apikey: ctx.service.config.apiKey } });
        const paused = queue.paused;
        return {
          summary: `${queue.noofslots_total ?? 0} in der Warteschlange · ${queue.sizeleft ?? ''} übrig`,
          status: paused ? 'warn' : 'ok',
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Geschwindigkeit', value: queue.speed ?? '0', unit: '/s', tone: 'info' },
                { label: 'Restzeit', value: queue.timeleft ?? '–' },
              ],
            },
            {
              type: 'list',
              empty: 'Nichts in der Warteschlange',
              items: (queue.slots ?? []).map((s: any) => ({
                title: s.filename,
                subtitle: `${s.status} · ${s.size}`,
                meta: `${s.percentage} % · ${s.timeleft}`,
                progress: Number(s.percentage),
                status: s.status === 'Paused' ? 'muted' : 'info',
              })),
            },
            {
              type: 'actions',
              items: [paused ? { service: ctx.service.id, action: 'resume', label: 'Fortsetzen', tone: 'accent' } : { service: ctx.service.id, action: 'pause', label: 'Pausieren' }],
            },
          ],
        };
      },
    },
  },

  actions: {
    async pause(ctx) {
      await ctx.http.get('/api', { query: { mode: 'pause', output: 'json', apikey: ctx.service.config.apiKey } });
      return { ok: true, message: 'Pausiert' };
    },
    async resume(ctx) {
      await ctx.http.get('/api', { query: { mode: 'resume', output: 'json', apikey: ctx.service.config.apiKey } });
      return { ok: true, message: 'Fortgesetzt' };
    },
  },
});
