import { defineIntegration } from './types.ts';
import { num } from '../lib/format.ts';

/** Parses the output of nginx' stub_status module. */
export function parseStubStatus(text: string) {
  const active = Number(/Active connections:\s*(\d+)/.exec(text)?.[1] ?? NaN);
  const counters = /\n\s*(\d+)\s+(\d+)\s+(\d+)\s*\n/.exec(text);
  const rw = /Reading:\s*(\d+)\s*Writing:\s*(\d+)\s*Waiting:\s*(\d+)/.exec(text);
  if (isNaN(active)) throw new Error('Keine stub_status-Ausgabe – ist stub_status aktiviert?');
  return {
    active,
    accepts: Number(counters?.[1] ?? 0),
    handled: Number(counters?.[2] ?? 0),
    requests: Number(counters?.[3] ?? 0),
    reading: Number(rw?.[1] ?? 0),
    writing: Number(rw?.[2] ?? 0),
    waiting: Number(rw?.[3] ?? 0),
  };
}

export default defineIntegration({
  id: 'nginx',
  name: 'nginx',
  icon: 'nginx',
  category: 'network',
  description: 'Verbindungen und Anfragen über das stub_status-Modul',
  website: 'https://nginx.org',
  fields: [
    {
      key: 'statusPath',
      label: 'Pfad zu stub_status',
      type: 'string',
      default: '/nginx_status',
      help: 'location /nginx_status { stub_status; allow 172.16.0.0/12; deny all; }',
    },
  ],
  defaultWidget: 'status',

  async health(ctx) {
    await ctx.http.get(ctx.service.config.statusPath || '/nginx_status');
  },

  widgets: {
    status: {
      name: 'Verbindungen',
      interval: 10,
      async fetch(ctx) {
        const text = await ctx.http.get<string>(ctx.service.config.statusPath || '/nginx_status', { headers: { Accept: 'text/plain' } });
        const s = parseStubStatus(String(text));
        // requests per second since the previous poll
        const now = Date.now();
        const prev = ctx.state.prev as { t: number; requests: number } | undefined;
        const rps = prev && s.requests >= prev.requests ? (s.requests - prev.requests) / ((now - prev.t) / 1000) : undefined;
        ctx.state.prev = { t: now, requests: s.requests };
        const history: number[] = (ctx.state.history ??= []);
        const times: number[] = (ctx.state.times ??= []);
        if (rps != null) {
          history.push(Math.round(rps * 10) / 10);
          times.push(now);
          if (history.length > 40) {
            history.shift();
            times.shift();
          }
        }
        return {
          summary: `${num(s.requests)} Anfragen gesamt`,
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Aktiv', value: s.active },
                { label: 'Anfragen/s', value: rps != null ? num(rps, 1) : '…' },
                { label: 'Lesen / Schreiben', value: `${s.reading} / ${s.writing}` },
                { label: 'Wartend', value: s.waiting },
              ],
            },
            ...(history.length > 1 ? [{ type: 'chart' as const, unit: 'req/s', times: [...times], series: [{ label: 'Anfragen/s', points: [...history] }] }] : []),
          ],
        };
      },
    },
  },
});
