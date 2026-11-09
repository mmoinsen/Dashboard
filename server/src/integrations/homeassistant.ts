import { defineIntegration } from './types.ts';
import type { Context } from './types.ts';
import { bestScore, normalize } from '../lib/match.ts';
import type { ActionRef, SearchResult, StatItem, ToggleItem } from '../shared/types.ts';

/** Words people type in German/English, mapped to Home Assistant domains. */
const DOMAIN_ALIASES: Record<string, string[]> = {
  light: ['licht', 'lichter', 'lampe', 'lampen', 'leuchte', 'light', 'lights', 'beleuchtung'],
  switch: ['schalter', 'steckdose', 'switch', 'plug'],
  cover: ['rollladen', 'rolladen', 'rollo', 'jalousie', 'markise', 'cover', 'blinds', 'garage', 'tor'],
  climate: ['heizung', 'thermostat', 'klima', 'temperatur', 'climate', 'heating'],
  lock: ['schloss', 'tuer', 'tur', 'lock', 'door'],
  fan: ['ventilator', 'luefter', 'fan'],
  media_player: ['tv', 'fernseher', 'lautsprecher', 'speaker', 'musik', 'media'],
  scene: ['szene', 'scene', 'stimmung'],
  script: ['skript', 'script'],
  automation: ['automation', 'automatisierung'],
  vacuum: ['staubsauger', 'saugroboter', 'vacuum'],
  input_boolean: ['helfer', 'toggle'],
  sensor: ['sensor', 'temperatur', 'luftfeuchtigkeit', 'verbrauch', 'strom'],
};

const TOGGLEABLE = new Set(['light', 'switch', 'fan', 'input_boolean', 'automation', 'media_player', 'climate', 'cover', 'lock', 'vacuum']);
const SEARCHABLE = new Set([...TOGGLEABLE, 'scene', 'script', 'sensor', 'binary_sensor', 'person', 'button', 'input_button']);

const DOMAIN_LABEL: Record<string, string> = {
  light: 'Licht',
  switch: 'Schalter',
  fan: 'Ventilator',
  cover: 'Abdeckung',
  climate: 'Klima',
  lock: 'Schloss',
  media_player: 'Medien',
  scene: 'Szene',
  script: 'Skript',
  automation: 'Automation',
  sensor: 'Sensor',
  binary_sensor: 'Sensor',
  input_boolean: 'Helfer',
  person: 'Person',
  vacuum: 'Staubsauger',
  button: 'Taste',
  input_button: 'Taste',
};

const STATE_LABEL: Record<string, string> = {
  on: 'An',
  off: 'Aus',
  open: 'Offen',
  closed: 'Geschlossen',
  opening: 'Öffnet',
  closing: 'Schließt',
  locked: 'Verriegelt',
  unlocked: 'Entriegelt',
  home: 'Zuhause',
  not_home: 'Unterwegs',
  playing: 'Spielt',
  paused: 'Pausiert',
  idle: 'Bereit',
  heat: 'Heizen',
  cool: 'Kühlen',
  auto: 'Automatik',
  docked: 'Angedockt',
  cleaning: 'Saugt',
  unavailable: 'Nicht verfügbar',
  unknown: 'Unbekannt',
};

function domainOf(entityId: string) {
  return entityId.split('.')[0];
}

function isOn(e: any) {
  const d = domainOf(e.entity_id);
  if (d === 'cover') return e.state === 'open' || e.state === 'opening';
  if (d === 'lock') return e.state === 'locked';
  if (d === 'climate') return e.state !== 'off';
  if (d === 'media_player') return !['off', 'standby', 'unavailable'].includes(e.state);
  if (d === 'vacuum') return e.state === 'cleaning';
  return e.state === 'on';
}

function stateText(e: any) {
  const a = e.attributes ?? {};
  const d = domainOf(e.entity_id);
  let s = STATE_LABEL[e.state] ?? e.state;
  if (a.unit_of_measurement) s = `${e.state} ${a.unit_of_measurement}`;
  if (d === 'light' && e.state === 'on' && a.brightness != null) s += ` · ${Math.round((a.brightness / 255) * 100)} %`;
  if (d === 'climate') {
    if (a.current_temperature != null) s = `${a.current_temperature} °C`;
    if (a.temperature != null) s += ` → ${a.temperature} °C`;
  }
  if (d === 'cover' && a.current_position != null) s += ` · ${a.current_position} %`;
  if (d === 'media_player' && a.media_title) s += ` · ${a.media_title}`;
  return s;
}

function toggleAction(ctx: Context, e: any): ActionRef | undefined {
  const d = domainOf(e.entity_id);
  if (d === 'scene' || d === 'script' || d === 'button' || d === 'input_button') {
    return { service: ctx.service.id, action: 'activate', params: { entity_id: e.entity_id }, label: 'Ausführen', tone: 'accent' };
  }
  if (!TOGGLEABLE.has(d)) return undefined;
  return { service: ctx.service.id, action: 'toggle', params: { entity_id: e.entity_id }, label: isOn(e) ? 'Ausschalten' : 'Einschalten' };
}

function toToggle(ctx: Context, e: any): ToggleItem {
  const d = domainOf(e.entity_id);
  const a = e.attributes ?? {};
  const item: ToggleItem = {
    title: a.friendly_name ?? e.entity_id,
    subtitle: stateText(e),
    on: isOn(e),
    action: toggleAction(ctx, e),
    readonly: !toggleAction(ctx, e) || e.state === 'unavailable',
  };
  const modes: string[] = a.supported_color_modes ?? [];
  if (d === 'light' && modes.some((m) => m !== 'onoff')) {
    item.slider = {
      value: e.state === 'on' && a.brightness != null ? Math.round((a.brightness / 255) * 100) : 0,
      min: 0,
      max: 100,
      unit: '%',
      action: { service: ctx.service.id, action: 'brightness', params: { entity_id: e.entity_id }, label: 'Helligkeit' },
    };
  }
  if (d === 'climate' && a.temperature != null) {
    item.slider = {
      value: a.temperature,
      min: a.min_temp ?? 7,
      max: a.max_temp ?? 30,
      unit: '°C',
      action: { service: ctx.service.id, action: 'temperature', params: { entity_id: e.entity_id }, label: 'Temperatur' },
    };
  }
  if (d === 'cover' && a.current_position != null) {
    item.slider = {
      value: a.current_position,
      min: 0,
      max: 100,
      unit: '%',
      action: { service: ctx.service.id, action: 'position', params: { entity_id: e.entity_id }, label: 'Position' },
    };
  }
  return item;
}

async function states(ctx: Context, fresh = false): Promise<any[]> {
  if (fresh) ctx.cache.delete(`${ctx.service.id}:states`);
  return ctx.cache.get(`${ctx.service.id}:states`, 3000, () => ctx.http.get<any[]>('/api/states'));
}

async function callService(ctx: Context, domain: string, service: string, data: Record<string, unknown>) {
  await ctx.http.post(`/api/services/${domain}/${service}`, data);
  ctx.cache.delete(`${ctx.service.id}:states`);
}

function parseEntityList(v: unknown): string[] {
  return String(v ?? '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default defineIntegration({
  id: 'homeassistant',
  name: 'Home Assistant',
  icon: 'home-assistant',
  category: 'smarthome',
  description: 'Entitäten schalten und dimmen, Sensoren anzeigen, Szenen per Suche ausführen',
  website: 'https://www.home-assistant.io',
  bang: 'ha',
  fields: [{ key: 'token', label: 'Long-Lived Access Token', type: 'secret', required: true, help: 'Profil → Sicherheit → Langlebige Zugriffstokens' }],
  headers: (c) => ({ Authorization: `Bearer ${c.token ?? ''}` }),
  defaultWidget: 'overview',

  async health(ctx) {
    await ctx.http.get('/api/');
  },

  widgets: {
    entities: {
      name: 'Entitäten',
      description: 'Ausgewählte Schalter, Lichter, Thermostate und Sensoren',
      interval: 5,
      options: [
        {
          key: 'entities',
          label: 'Entitäten',
          type: 'text',
          required: true,
          placeholder: 'light.wohnzimmer, switch.kaffeemaschine, sensor.aussentemperatur',
          help: 'Entity-IDs, durch Komma oder Zeilenumbruch getrennt',
        },
      ],
      async fetch(ctx, o) {
        const ids = parseEntityList(o.entities);
        const all = await states(ctx);
        const byId = new Map(all.map((e) => [e.entity_id, e]));
        const picked = ids.map((id) => byId.get(id)).filter(Boolean);
        const toggles = picked.filter((e) => !['sensor', 'binary_sensor', 'person', 'weather'].includes(domainOf(e.entity_id)));
        const sensors = picked.filter((e) => ['sensor', 'binary_sensor', 'person', 'weather'].includes(domainOf(e.entity_id)));
        const blocks: any[] = [];
        if (sensors.length) {
          blocks.push({
            type: 'stats',
            items: sensors.map(
              (e): StatItem => ({
                label: e.attributes?.friendly_name ?? e.entity_id,
                value: STATE_LABEL[e.state] ?? e.state,
                unit: e.attributes?.unit_of_measurement,
              }),
            ),
          });
        }
        if (toggles.length) blocks.push({ type: 'toggles', items: toggles.map((e) => toToggle(ctx, e)) });
        if (!ids.length) blocks.push({ type: 'text', text: 'Bitte Entitäten in den Widget-Einstellungen auswählen.', tone: 'muted' });
        const missing = ids.filter((id) => !byId.has(id));
        if (missing.length) blocks.push({ type: 'text', text: `Nicht gefunden: ${missing.join(', ')}`, tone: 'warn' });
        const onCount = toggles.filter(isOn).length;
        return { summary: toggles.length ? `${onCount} von ${toggles.length} an` : undefined, blocks };
      },
    },
    overview: {
      name: 'Übersicht',
      description: 'Lichter an, offene Fenster, wer ist zuhause',
      interval: 15,
      async fetch(ctx) {
        const all = await states(ctx);
        const lightsOn = all.filter((e) => domainOf(e.entity_id) === 'light' && e.state === 'on');
        const open = all.filter((e) => domainOf(e.entity_id) === 'binary_sensor' && ['window', 'door', 'opening', 'garage_door'].includes(e.attributes?.device_class) && e.state === 'on');
        const people = all.filter((e) => domainOf(e.entity_id) === 'person');
        const home = people.filter((p) => p.state === 'home');
        const unavailable = all.filter((e) => e.state === 'unavailable').length;
        return {
          summary: `${all.length} Entitäten${unavailable ? ` · ${unavailable} nicht verfügbar` : ''}`,
          blocks: [
            {
              type: 'stats',
              items: [
                { label: 'Lichter an', value: lightsOn.length, tone: lightsOn.length ? 'warn' : 'default' },
                { label: 'Offen', value: open.length, tone: open.length ? 'warn' : 'ok' },
                { label: 'Zuhause', value: people.length ? `${home.length}/${people.length}` : '–' },
              ],
            },
            ...(lightsOn.length ? [{ type: 'toggles' as const, items: lightsOn.slice(0, 6).map((e) => toToggle(ctx, e)) }] : []),
            ...(open.length ? [{ type: 'list' as const, items: open.map((e) => ({ title: e.attributes?.friendly_name ?? e.entity_id, subtitle: 'Offen', status: 'warn' as const })) }] : []),
          ],
        };
      },
    },
  },

  async search(ctx, q) {
    const all = await states(ctx);
    const nq = normalize(q.text);
    const qWords = nq.split(' ');
    // "licht wohnzimmer" -> domain light + filter "wohnzimmer"
    const aliasDomains = new Set<string>();
    const rest: string[] = [];
    for (const w of qWords) {
      const domains = Object.entries(DOMAIN_ALIASES).filter(([, words]) => words.includes(w)).map(([d]) => d);
      if (domains.length) domains.forEach((d) => aliasDomains.add(d));
      else rest.push(w);
    }
    const restText = rest.join(' ');
    const results: SearchResult[] = [];
    for (const e of all) {
      const d = domainOf(e.entity_id);
      if (!SEARCHABLE.has(d)) continue;
      const name = e.attributes?.friendly_name ?? e.entity_id;
      let score = bestScore(q.text, name, e.entity_id.split('.')[1].replace(/_/g, ' '));
      if (aliasDomains.has(d)) {
        const restScore = restText ? bestScore(restText, name, e.entity_id) : 1;
        if (restScore > 0) score = Math.max(score, 0.7 + 0.25 * restScore);
      }
      if (score < 0.6) continue;
      if (d === 'sensor' || d === 'binary_sensor') score *= 0.85;
      const action = toggleAction(ctx, e);
      results.push({
        id: `ha:${e.entity_id}`,
        title: name,
        subtitle: `${DOMAIN_LABEL[d] ?? d} · ${stateText(e)} · ${e.entity_id}`,
        group: `${ctx.service.name} · Entitäten`,
        kind: 'entity',
        score,
        url: ctx.link(`/config/entities?search=${encodeURIComponent(e.entity_id)}`),
        toggle: action && TOGGLEABLE.has(d) ? toToggle(ctx, e) : undefined,
        actions: action && !TOGGLEABLE.has(d) ? [action] : undefined,
      });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, q.explicit ? 30 : 10);
  },

  actions: {
    async toggle(ctx, p) {
      const id = String(p.entity_id);
      const d = domainOf(id);
      const e = (await states(ctx, true)).find((s) => s.entity_id === id);
      if (d === 'cover') await callService(ctx, 'cover', 'toggle', { entity_id: id });
      else if (d === 'lock') await callService(ctx, 'lock', e && isOn(e) ? 'unlock' : 'lock', { entity_id: id });
      else if (d === 'vacuum') await callService(ctx, 'vacuum', e && isOn(e) ? 'return_to_base' : 'start', { entity_id: id });
      else if (d === 'climate' || d === 'media_player') await callService(ctx, d, e && isOn(e) ? 'turn_off' : 'turn_on', { entity_id: id });
      else await callService(ctx, d === 'automation' ? 'automation' : 'homeassistant', 'toggle', { entity_id: id });
      return { ok: true };
    },
    async activate(ctx, p) {
      const id = String(p.entity_id);
      const d = domainOf(id);
      await callService(ctx, d, d.endsWith('button') ? 'press' : 'turn_on', { entity_id: id });
      return { ok: true, message: 'Ausgeführt' };
    },
    async brightness(ctx, p) {
      const v = Number(p.value);
      await callService(ctx, 'light', v > 0 ? 'turn_on' : 'turn_off', v > 0 ? { entity_id: p.entity_id, brightness_pct: v } : { entity_id: p.entity_id });
      return { ok: true };
    },
    async temperature(ctx, p) {
      await callService(ctx, 'climate', 'set_temperature', { entity_id: p.entity_id, temperature: Number(p.value) });
      return { ok: true };
    },
    async position(ctx, p) {
      await callService(ctx, 'cover', 'set_cover_position', { entity_id: p.entity_id, position: Number(p.value) });
      return { ok: true };
    },
  },
});
