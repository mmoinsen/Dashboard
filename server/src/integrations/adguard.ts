import { defineIntegration, passwordField, usernameField } from './types.ts';
import { num, percent } from '../lib/format.ts';

export default defineIntegration({
  id: 'adguard',
  name: 'AdGuard Home',
  icon: 'adguard-home',
  category: 'network',
  description: 'DNS-Anfragen, Blockquote, Schutz pausieren',
  website: 'https://adguard.com/adguard-home.html',
  fields: [usernameField, passwordField],
  headers: (c) => (c.username ? { Authorization: `Basic ${Buffer.from(`${c.username}:${c.password ?? ''}`).toString('base64')}` } : {}),
  defaultWidget: 'summary',

  async health(ctx) {
    await ctx.http.get('/control/status');
  },

  widgets: {
    summary: {
      name: 'Übersicht',
      interval: 30,
      async fetch(ctx) {
        const [stats, status] = await Promise.all([ctx.http.get<any>('/control/stats'), ctx.http.get<any>('/control/status')]);
        const total = stats.num_dns_queries ?? 0;
        const blocked = (stats.num_blocked_filtering ?? 0) + (stats.num_replaced_safebrowsing ?? 0) + (stats.num_replaced_parental ?? 0);
        const on = status.protection_enabled;
        return {
          summary: on ? 'Schutz aktiv' : 'Schutz pausiert',
          status: on ? 'ok' : 'warn',
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Anfragen', value: num(total) },
                { label: 'Blockiert', value: num(blocked) },
                { label: 'Quote', value: percent(total ? (blocked / total) * 100 : 0) },
                { label: 'Ø Antwort', value: num((stats.avg_processing_time ?? 0) * 1000, 1), unit: 'ms' },
              ],
            },
            {
              type: 'actions',
              items: on
                ? [{ service: ctx.service.id, action: 'protection', params: { enabled: false, duration: 300000 }, label: '5 min pausieren' }]
                : [{ service: ctx.service.id, action: 'protection', params: { enabled: true }, label: 'Schutz aktivieren', tone: 'accent' }],
            },
          ],
        };
      },
    },
  },

  actions: {
    async protection(ctx, p) {
      await ctx.http.post('/control/protection', { enabled: Boolean(p.enabled), duration: p.duration ? Number(p.duration) : undefined });
      return { ok: true, message: p.enabled ? 'Schutz aktiviert' : 'Schutz pausiert' };
    },
  },
});
