import { defineIntegration } from './types.ts';
import type { StatItem } from '../shared/types.ts';

/** Read a dotted path like "data.items.0.name" from an object. */
export function getPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * Parse field mappings, one per line:  Label = json.path | unit
 * e.g. "Download = data.download | Mbit/s"
 */
export function parseMappings(text: string) {
  return String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [left, unit] = l.split('|').map((s) => s.trim());
      const eq = left.indexOf('=');
      return eq === -1 ? { label: left, path: left, unit } : { label: left.slice(0, eq).trim(), path: left.slice(eq + 1).trim(), unit };
    });
}

/**
 * Escape hatch for services without a dedicated integration: call any JSON API
 * and show selected fields as stat tiles. No code required.
 */
export default defineIntegration({
  id: 'customapi',
  name: 'Eigene JSON-API',
  icon: 'mdi-code-json',
  category: 'other',
  description: 'Beliebige JSON-API abfragen und Felder als Kacheln anzeigen – ohne Code',
  fields: [
    { key: 'headers', label: 'Zusätzliche Header', type: 'text', placeholder: 'X-Api-Key: abc123', help: 'Ein Header pro Zeile' },
  ],
  headers(c) {
    const h: Record<string, string> = {};
    for (const line of String(c.headers ?? '').split('\n')) {
      const i = line.indexOf(':');
      if (i > 0) h[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return h;
  },
  defaultWidget: 'fields',

  widgets: {
    fields: {
      name: 'Felder',
      interval: 60,
      options: [
        { key: 'path', label: 'API-Pfad', type: 'string', default: '/', placeholder: '/api/stats' },
        { key: 'mappings', label: 'Felder', type: 'text', required: true, placeholder: 'Benutzer = data.users\nSpeicher = data.disk.used | GB', help: 'Eine Zeile pro Feld: Label = json.pfad | Einheit' },
      ],
      async fetch(ctx, o) {
        const data = await ctx.http.get<any>(o.path || '/');
        const items: StatItem[] = parseMappings(o.mappings).map((m) => {
          const v = getPath(data, m.path);
          return { label: m.label, value: v == null ? '–' : typeof v === 'object' ? JSON.stringify(v) : v, unit: m.unit };
        });
        return { blocks: items.length ? [{ type: 'stats', items }] : [{ type: 'text', text: 'Bitte Felder in den Widget-Einstellungen festlegen.', tone: 'muted' }] };
      },
    },
  },
});
