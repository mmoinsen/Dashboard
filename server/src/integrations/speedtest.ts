import { defineIntegration } from './types.ts';
import type { Context } from './types.ts';
import { ago, num } from '../lib/format.ts';

interface Result {
  download: number; // Mbit/s
  upload: number;
  ping: number;
  at?: string;
}

/** Supports Speedtest Tracker v1 API (token) and the older public endpoint. */
async function latest(ctx: Context): Promise<Result> {
  if (ctx.service.config.apiKey) {
    const r = await ctx.http.get<any>('/api/v1/results/latest');
    const d = r.data ?? r;
    return {
      download: d.download_bits ? d.download_bits / 1e6 : (d.download ?? 0) / 125000,
      upload: d.upload_bits ? d.upload_bits / 1e6 : (d.upload ?? 0) / 125000,
      ping: d.ping,
      at: d.created_at,
    };
  }
  const r = await ctx.http.get<any>('/api/speedtest/latest');
  const d = r.data ?? r;
  return { download: Number(d.download), upload: Number(d.upload), ping: Number(d.ping), at: d.created_at };
}

export default defineIntegration({
  id: 'speedtest-tracker',
  name: 'Speedtest Tracker',
  icon: 'speedtest-tracker',
  category: 'network',
  description: 'Letzte Messung von Download, Upload und Ping',
  website: 'https://github.com/alexjustesen/speedtest-tracker',
  fields: [{ key: 'apiKey', label: 'API-Token (v1)', type: 'secret', help: 'Leer = alte öffentliche API' }],
  headers: (c) => (c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}),
  defaultWidget: 'latest',

  async health(ctx) {
    await latest(ctx);
  },

  widgets: {
    latest: {
      name: 'Letzte Messung',
      interval: 300,
      async fetch(ctx) {
        const r = await latest(ctx);
        const history: number[][] = (ctx.state.history ??= [[], [], []]);
        if (ctx.state.lastAt !== r.at) {
          history[0].push(Math.round(r.download));
          history[1].push(Math.round(r.upload));
          history[2].push(r.at ? new Date(r.at).getTime() : Date.now());
          if (history[0].length > 24) history.forEach((h) => h.shift());
          ctx.state.lastAt = r.at;
        }
        return {
          summary: r.at ? `Letzter Test ${ago(r.at)}` : undefined,
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Download', value: num(r.download), unit: 'Mbit/s', tone: 'info' },
                { label: 'Upload', value: num(r.upload), unit: 'Mbit/s', tone: 'accent' },
                { label: 'Ping', value: num(r.ping), unit: 'ms' },
              ],
            },
            ...(history[0].length > 1
              ? [
                  {
                    type: 'chart' as const,
                    unit: 'Mbit/s',
                    times: [...(history[2] ?? [])],
                    series: [
                      { label: 'Download', points: [...history[0]], tone: 'info' as const },
                      { label: 'Upload', points: [...history[1]], tone: 'accent' as const },
                    ],
                  },
                ]
              : []),
          ],
        };
      },
    },
  },
});
