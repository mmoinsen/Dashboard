import { defineIntegration } from './types.ts';
import type { Context } from './types.ts';
import { HttpError } from '../lib/http.ts';

async function vpnStatus(ctx: Context): Promise<string> {
  try {
    return (await ctx.http.get<any>('/v1/vpn/status')).status;
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return (await ctx.http.get<any>('/v1/openvpn/status')).status;
    throw err;
  }
}

async function forwardedPort(ctx: Context): Promise<number | undefined> {
  for (const path of ['/v1/portforward', '/v1/openvpn/portforwarded']) {
    try {
      const r = await ctx.http.get<any>(path);
      return r.port || undefined;
    } catch {
      /* try next */
    }
  }
  return undefined;
}

export default defineIntegration({
  id: 'gluetun',
  name: 'Gluetun',
  icon: 'gluetun',
  category: 'network',
  description: 'VPN-Status, öffentliche IP, Standort und weitergeleiteter Port (Control-Server, Port 8000)',
  website: 'https://github.com/qdm12/gluetun',
  fields: [
    { key: 'apiKey', label: 'API-Key (optional)', type: 'secret', help: 'Falls der Control-Server mit auth (apikey) abgesichert ist' },
    { key: 'username', label: 'Benutzer (Basic Auth, optional)', type: 'string' },
    { key: 'password', label: 'Passwort (Basic Auth, optional)', type: 'secret' },
  ],
  headers: (c) => {
    const h: Record<string, string> = {};
    if (c.apiKey) h['X-API-Key'] = String(c.apiKey);
    if (c.username) h.Authorization = `Basic ${Buffer.from(`${c.username}:${c.password ?? ''}`).toString('base64')}`;
    return h;
  },
  defaultWidget: 'status',

  async health(ctx) {
    const s = await vpnStatus(ctx);
    return { ok: s === 'running', message: s === 'running' ? undefined : `VPN ${s}` };
  },

  widgets: {
    status: {
      name: 'VPN-Status',
      interval: 30,
      async fetch(ctx) {
        const [status, ip, port] = await Promise.all([vpnStatus(ctx), ctx.http.get<any>('/v1/publicip/ip').catch(() => ({})), forwardedPort(ctx)]);
        const running = status === 'running';
        const location = [ip.city, ip.region, ip.country].filter(Boolean).join(', ');
        return {
          summary: running ? `Verbunden${location ? ` · ${location}` : ''}` : `VPN ${status}`,
          status: running ? 'ok' : 'bad',
          blocks: [
            {
              type: 'kv',
              items: [
                { label: 'Status', value: running ? 'Verbunden' : status },
                { label: 'Öffentliche IP', value: ip.public_ip ?? '–' },
                { label: 'Standort', value: location || '–' },
                { label: 'Anbieter', value: ip.organization ?? '–' },
                ...(port ? [{ label: 'Weitergeleiteter Port', value: String(port) }] : []),
              ],
            },
            { type: 'actions', items: [{ service: ctx.service.id, action: 'reconnect', label: 'Neu verbinden', confirm: 'VPN-Verbindung neu aufbauen?' }] },
          ],
        };
      },
    },
  },

  actions: {
    async reconnect(ctx) {
      const set = async (status: string) => {
        try {
          await ctx.http.put('/v1/vpn/status', { status });
        } catch (err) {
          if (err instanceof HttpError && err.status === 404) await ctx.http.put('/v1/openvpn/status', { status });
          else throw err;
        }
      };
      await set('stopped');
      await set('running');
      return { ok: true, message: 'VPN wird neu verbunden' };
    },
  },
});
