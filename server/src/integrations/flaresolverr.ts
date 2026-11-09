import { defineIntegration } from './types.ts';

export default defineIntegration({
  id: 'flaresolverr',
  name: 'FlareSolverr',
  icon: 'flaresolverr',
  category: 'downloads',
  description: 'Erreichbarkeit, Version und offene Browser-Sessions',
  website: 'https://github.com/FlareSolverr/FlareSolverr',
  defaultWidget: 'status',

  async health(ctx) {
    const r = await ctx.http.get<any>('/');
    return { ok: /ready/i.test(r?.msg ?? ''), message: r?.msg };
  },

  widgets: {
    status: {
      name: 'Status',
      interval: 60,
      async fetch(ctx) {
        const t0 = Date.now();
        const info = await ctx.http.get<any>('/');
        const ms = Date.now() - t0;
        const sessions = await ctx.http.post<any>('/v1', { cmd: 'sessions.list' }).catch(() => null);
        const ready = /ready/i.test(info?.msg ?? '');
        return {
          summary: ready ? 'Bereit' : info?.msg,
          status: ready ? 'ok' : 'warn',
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Status', value: ready ? 'Bereit' : 'Fehler', tone: ready ? 'ok' : 'bad' },
                { label: 'Version', value: info?.version ?? '–' },
                { label: 'Sessions', value: sessions?.sessions?.length ?? 0 },
                { label: 'Antwort', value: ms, unit: 'ms' },
              ],
            },
          ],
        };
      },
    },
  },
});
