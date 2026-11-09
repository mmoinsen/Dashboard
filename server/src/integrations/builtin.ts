// Builtin widgets that need no configured service.
import { defineIntegration } from './types.ts';
import { num } from '../lib/format.ts';

export const clock = defineIntegration({
  id: 'clock',
  name: 'Uhr',
  icon: 'mdi-clock',
  category: 'other',
  description: 'Uhrzeit und Datum',
  builtin: true,
  needsUrl: false,
  widgets: {
    clock: {
      name: 'Uhr',
      interval: 86400,
      options: [
        {
          key: 'style',
          label: 'Design',
          type: 'select',
          default: 'digital',
          options: [
            { value: 'digital', label: 'Digital' },
            { value: 'minimal', label: 'Minimal (groß & dünn)' },
            { value: 'analog', label: 'Analog' },
            { value: 'words', label: 'In Worten („Viertel nach fünf“)' },
          ],
        },
        {
          key: 'align',
          label: 'Ausrichtung',
          type: 'select',
          default: 'left',
          options: [
            { value: 'left', label: 'Links' },
            { value: 'center', label: 'Mittig' },
            { value: 'right', label: 'Rechts' },
          ],
        },
        { key: 'card', label: 'Mit Hintergrundkarte', type: 'boolean', default: false },
        { key: 'showDate', label: 'Datum anzeigen', type: 'boolean', default: true },
        { key: 'seconds', label: 'Sekunden anzeigen', type: 'boolean', default: false },
        { key: 'hour12', label: '12-Stunden-Format (AM/PM)', type: 'boolean', default: false },
        { key: 'timezone', label: 'Zeitzone (optional)', type: 'string', placeholder: 'z. B. Europe/Berlin oder America/New_York' },
      ],
      async fetch(_ctx, o) {
        const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
        return {
          blocks: [
            {
              type: 'clock',
              style: pick(o.style, ['digital', 'minimal', 'analog', 'words'] as const, 'digital'),
              align: pick(o.align, ['left', 'center', 'right'] as const, 'left'),
              seconds: Boolean(o.seconds),
              hour12: Boolean(o.hour12),
              showDate: o.showDate !== false,
              timezone: o.timezone || undefined,
            },
          ],
        };
      },
    },
  },
});

export const bookmarks = defineIntegration({
  id: 'bookmarks',
  name: 'Lesezeichen',
  icon: 'mdi-bookmark',
  category: 'other',
  description: 'Eigene Linkliste',
  builtin: true,
  needsUrl: false,
  widgets: {
    links: {
      name: 'Links',
      interval: 86400,
      options: [
        {
          key: 'links',
          label: 'Links',
          type: 'text',
          required: true,
          placeholder: 'Router = http://192.168.1.1\nGitHub = https://github.com | github',
          help: 'Eine Zeile pro Link: Titel = URL | Icon (optional)',
        },
      ],
      async fetch(_ctx, o) {
        const items = String(o.links ?? '')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => {
            const [left, icon] = l.split('|').map((s) => s.trim());
            const i = left.indexOf('=');
            const title = i > 0 ? left.slice(0, i).trim() : left;
            const url = i > 0 ? left.slice(i + 1).trim() : left;
            return { title, url: /^[a-z]+:\/\//i.test(url) ? url : `https://${url}`, icon: icon || undefined };
          });
        return { blocks: items.length ? [{ type: 'links', items }] : [{ type: 'text', text: 'Noch keine Links – im Bearbeiten-Modus hinzufügen.', tone: 'muted' }] };
      },
    },
  },
});

const WMO: Record<number, string> = {
  0: 'Klar',
  1: 'Überwiegend klar',
  2: 'Teilweise bewölkt',
  3: 'Bedeckt',
  45: 'Nebel',
  48: 'Raureifnebel',
  51: 'Leichter Niesel',
  53: 'Niesel',
  55: 'Starker Niesel',
  61: 'Leichter Regen',
  63: 'Regen',
  65: 'Starker Regen',
  66: 'Gefrierender Regen',
  67: 'Gefrierender Regen',
  71: 'Leichter Schnee',
  73: 'Schnee',
  75: 'Starker Schnee',
  77: 'Schneegriesel',
  80: 'Regenschauer',
  81: 'Regenschauer',
  82: 'Heftige Schauer',
  85: 'Schneeschauer',
  86: 'Schneeschauer',
  95: 'Gewitter',
  96: 'Gewitter mit Hagel',
  99: 'Gewitter mit Hagel',
};

export function weatherText(code: number) {
  return WMO[code] ?? 'Unbekannt';
}

export const weather = defineIntegration({
  id: 'weather',
  name: 'Wetter',
  icon: 'mdi-weather-partly-cloudy',
  category: 'other',
  description: 'Aktuelles Wetter und Vorhersage (Open-Meteo, kein API-Key nötig)',
  builtin: true,
  needsUrl: false,
  connection: () => ({ baseUrl: 'https://api.open-meteo.com' }),
  widgets: {
    forecast: {
      name: 'Wetter',
      interval: 900,
      options: [
        { key: 'name', label: 'Ort (Anzeige)', type: 'string', placeholder: 'Berlin' },
        { key: 'latitude', label: 'Breitengrad', type: 'number', required: true, placeholder: '52.52', min: -90, max: 90 },
        { key: 'longitude', label: 'Längengrad', type: 'number', required: true, placeholder: '13.41', min: -180, max: 180 },
        { key: 'days', label: 'Tage Vorhersage', type: 'number', default: 4, min: 1, max: 7 },
      ],
      async fetch(ctx, o) {
        if (o.latitude == null || o.longitude == null || o.latitude === '' || o.longitude === '') {
          return { blocks: [{ type: 'text', text: 'Bitte Koordinaten in den Widget-Einstellungen eintragen.', tone: 'muted' }] };
        }
        const days = Math.min(Number(o.days) || 4, 7);
        const r = await ctx.http.get<any>('/v1/forecast', {
          query: {
            latitude: o.latitude,
            longitude: o.longitude,
            current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m',
            daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
            timezone: 'auto',
            forecast_days: days,
          },
        });
        const c = r.current;
        const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
        return {
          summary: `${o.name ? `${o.name} · ` : ''}${weatherText(c.weather_code)}`,
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Jetzt', value: num(c.temperature_2m), unit: '°C', tone: 'accent' },
                { label: 'Gefühlt', value: num(c.apparent_temperature), unit: '°C' },
                { label: 'Wind', value: num(c.wind_speed_10m), unit: 'km/h' },
                { label: 'Feuchte', value: num(c.relative_humidity_2m), unit: '%' },
              ],
            },
            {
              type: 'list',
              items: (r.daily?.time ?? []).map((d: string, i: number) => ({
                title: i === 0 ? 'Heute' : weekday.format(new Date(d)),
                subtitle: weatherText(r.daily.weather_code[i]),
                meta: `${num(r.daily.temperature_2m_min[i])}° / ${num(r.daily.temperature_2m_max[i])}° · ${r.daily.precipitation_probability_max[i] ?? 0} % Regen`,
              })),
            },
          ],
        };
      },
    },
  },
});
