import { defineIntegration } from './types.ts';

/** Any web app without a dedicated integration: link + up/down + response time. */
export default defineIntegration({
  id: 'website',
  name: 'Website / Link',
  icon: 'mdi-web',
  category: 'other',
  description: 'Beliebiger Dienst als Link mit Erreichbarkeits-Check',
  fields: [
    { key: 'healthPath', label: 'Pfad für den Check', type: 'string', default: '/', help: 'z. B. /health oder /api/ping' },
    { key: 'expectStatus', label: 'Erwarteter Statuscode (leer = 2xx/3xx)', type: 'number', min: 100, max: 599 },
  ],
  defaultWidget: 'status',

  async health(ctx) {
    const res = await ctx.http.request<Response>(ctx.service.config.healthPath || '/', { raw: true, headers: { Accept: '*/*' } });
    await res.body?.cancel();
    const expect = Number(ctx.service.config.expectStatus);
    const ok = expect ? res.status === expect : res.status < 400;
    return { ok, message: ok ? undefined : `HTTP ${res.status}` };
  },

  widgets: {
    status: {
      name: 'Status',
      interval: 60,
      async fetch(ctx) {
        const t0 = Date.now();
        const res = await ctx.http.request<Response>(ctx.service.config.healthPath || '/', { raw: true, headers: { Accept: '*/*' } });
        await res.body?.cancel();
        const ms = Date.now() - t0;
        const history: number[] = (ctx.state.history ??= []);
        history.push(ms);
        if (history.length > 30) history.shift();
        const ok = res.status < 400;
        return {
          summary: ok ? 'Online' : `HTTP ${res.status}`,
          status: ok ? 'ok' : 'bad',
          blocks: [
            { type: 'stats', items: [{ label: 'Status', value: res.status, tone: ok ? 'ok' : 'bad' }, { label: 'Antwortzeit', value: ms, unit: 'ms' }] },
            ...(history.length > 2 ? [{ type: 'chart' as const, unit: 'ms', series: [{ label: 'Antwortzeit', points: [...history] }] }] : []),
          ],
        };
      },
    },
  },
});
