import { apiKeyField, defineIntegration } from './types.ts';
import { bytes, num } from '../lib/format.ts';

export default defineIntegration({
  id: 'immich',
  name: 'Immich',
  icon: 'immich',
  category: 'media',
  description: 'Fotos, Videos und Speicherverbrauch (Admin-API-Key)',
  website: 'https://immich.app',
  fields: [apiKeyField],
  headers: (c) => ({ 'x-api-key': String(c.apiKey ?? '') }),
  defaultWidget: 'stats',

  async health(ctx) {
    await ctx.http.get('/api/server/ping');
  },

  widgets: {
    stats: {
      name: 'Statistik',
      interval: 900,
      async fetch(ctx) {
        const s = await ctx.http.get<any>('/api/server/statistics');
        return {
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Fotos', value: num(s.photos) },
                { label: 'Videos', value: num(s.videos) },
                { label: 'Benutzer', value: s.usageByUser?.length ?? 0 },
                { label: 'Speicher', value: bytes(s.usage) },
              ],
            },
          ],
        };
      },
    },
  },
});
