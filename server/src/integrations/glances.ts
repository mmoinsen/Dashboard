import { defineIntegration } from './types.ts';
import type { Context } from './types.ts';
import { bytes, duration, num } from '../lib/format.ts';
import type { BarItem, Tone } from '../shared/types.ts';

const api = (ctx: Context) => `/api/${ctx.service.config.version || '4'}`;
const level = (p: number): Tone => (p > 90 ? 'bad' : p > 75 ? 'warn' : 'accent');

export default defineIntegration({
  id: 'glances',
  name: 'Glances',
  icon: 'glances',
  category: 'system',
  description: 'CPU, RAM, Laufwerke, Temperaturen und Netzwerk des Servers',
  website: 'https://nicolargo.github.io/glances/',
  fields: [
    {
      key: 'version',
      label: 'API-Version',
      type: 'select',
      default: '4',
      options: [
        { value: '4', label: 'Glances 4' },
        { value: '3', label: 'Glances 3' },
      ],
    },
    { key: 'username', label: 'Benutzer (optional)', type: 'string' },
    { key: 'password', label: 'Passwort (optional)', type: 'secret' },
  ],
  headers: (c) => (c.username ? { Authorization: `Basic ${Buffer.from(`${c.username}:${c.password ?? ''}`).toString('base64')}` } : {}),
  defaultWidget: 'system',

  async health(ctx) {
    await ctx.http.get(`${api(ctx)}/status`).catch(() => ctx.http.get(`${api(ctx)}/cpu`));
  },

  widgets: {
    system: {
      name: 'System',
      interval: 5,
      options: [{ key: 'disks', label: 'Laufwerke anzeigen (Mountpoints, optional)', type: 'string', placeholder: '/, /mnt/tank' }],
      async fetch(ctx, o) {
        const base = api(ctx);
        const [quick, fs, sensors, uptime, load] = await Promise.all([
          ctx.http.get<any>(`${base}/quicklook`),
          ctx.http.get<any[]>(`${base}/fs`).catch(() => []),
          ctx.http.get<any[]>(`${base}/sensors`).catch(() => []),
          ctx.http.get<any>(`${base}/uptime`).catch(() => null),
          ctx.http.get<any>(`${base}/load`).catch(() => null),
        ]);
        const temps = sensors.filter((s) => s.type === 'temperature_core' || /package|tctl|cpu/i.test(s.label));
        const temp = temps.length ? Math.max(...temps.map((t) => t.value)) : undefined;
        const wanted = String(o.disks ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const disks = (wanted.length && !o.detail ? fs.filter((d) => wanted.includes(d.mnt_point)) : fs.filter((d) => !/^\/(boot|snap|etc)/.test(d.mnt_point))).slice(0, o.detail ? 30 : 4);
        const bars: BarItem[] = [
          { label: 'CPU', value: `${num(quick.cpu, 0)} %${temp ? ` · ${num(temp, 0)} °C` : ''}`, percent: quick.cpu, tone: level(quick.cpu) },
          { label: 'RAM', value: `${num(quick.mem, 0)} %`, percent: quick.mem, tone: level(quick.mem) },
          ...disks.map((d) => ({ label: d.mnt_point, value: `${bytes(d.used)} / ${bytes(d.size)}`, percent: d.percent, tone: level(d.percent) })),
        ];
        const up = typeof uptime === 'string' ? uptime : uptime?.seconds ? duration(uptime.seconds) : undefined;
        const blocks: any[] = [{ type: 'bars', items: bars }];
        if (o.detail) {
          if (load) blocks.unshift({ type: 'stats', items: [{ label: 'Load 1 min', value: num(load.min1, 2) }, { label: '5 min', value: num(load.min5, 2) }, { label: '15 min', value: num(load.min15, 2) }, { label: 'Kerne', value: load.cpucore ?? '–' }] });
          const temps2 = sensors.filter((t) => t.unit === 'C' || /temp/.test(t.type ?? ''));
          if (temps2.length) {
            blocks.push({ type: 'heading', text: 'Temperaturen' });
            blocks.push({ type: 'stats', items: temps2.slice(0, 16).map((t) => ({ label: t.label, value: num(t.value, 0), unit: '°C', tone: t.value > 80 ? 'bad' : t.value > 65 ? 'warn' : 'default' })) });
          }
        }
        return {
          summary: [up ? `Uptime ${up}` : '', load ? `Load ${num(load.min1, 2)}` : ''].filter(Boolean).join(' · '),
          blocks,
        };
      },
    },
  },
});
