import { defineIntegration, passwordField, usernameField } from './types.ts';
import { bytes, num } from '../lib/format.ts';

/** Obsidian LiveSync stores vaults in CouchDB, so this integration talks CouchDB. */
export default defineIntegration({
  id: 'obsidian-livesync',
  name: 'Obsidian LiveSync',
  icon: 'obsidian',
  category: 'productivity',
  description: 'CouchDB-Status, Vault-Größe und Dokumente für Self-hosted LiveSync',
  website: 'https://github.com/vrtmrz/obsidian-livesync',
  fields: [
    { ...usernameField, required: true },
    { ...passwordField, required: true },
    { key: 'database', label: 'Datenbank (Vault)', type: 'string', help: 'Leer = alle Datenbanken anzeigen' },
  ],
  headers: (c) => (c.username ? { Authorization: `Basic ${Buffer.from(`${c.username}:${c.password ?? ''}`).toString('base64')}` } : {}),
  defaultWidget: 'status',

  async health(ctx) {
    const r = await ctx.http.get<any>('/_up');
    return { ok: r?.status === 'ok' };
  },

  widgets: {
    status: {
      name: 'Sync-Status',
      interval: 120,
      async fetch(ctx) {
        const [info, up] = await Promise.all([ctx.http.get<any>('/'), ctx.http.get<any>('/_up').catch(() => null)]);
        let dbs: string[] = ctx.service.config.database ? [ctx.service.config.database] : [];
        if (!dbs.length) dbs = (await ctx.http.get<string[]>('/_all_dbs').catch(() => [])).filter((d) => !d.startsWith('_'));
        const details = await Promise.all(dbs.slice(0, 6).map((d) => ctx.http.get<any>(`/${encodeURIComponent(d)}`).catch(() => null)));
        const ok = up?.status === 'ok';
        return {
          summary: `CouchDB ${info?.version ?? ''} · ${ok ? 'erreichbar' : 'Problem'}`,
          status: ok ? 'ok' : 'bad',
          blocks: [
            {
              type: 'list',
              empty: 'Keine Datenbanken gefunden',
              items: details.filter(Boolean).map((d: any) => ({
                title: d.db_name,
                subtitle: `${num(d.doc_count)} Dokumente · ${bytes(d.sizes?.active ?? d.data_size)}`,
                meta: d.doc_del_count ? `${num(d.doc_del_count)} gelöscht` : undefined,
                status: 'ok' as const,
              })),
            },
          ],
        };
      },
    },
  },
});
