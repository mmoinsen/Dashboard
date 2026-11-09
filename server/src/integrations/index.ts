import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { IntegrationDef } from './types.ts';
import { errorDetails, logger } from '../lib/log.ts';
import type { IntegrationInfo } from '../shared/types.ts';

import adguard from './adguard.ts';
import bazarr from './bazarr.ts';
import { bookmarks, clock, weather } from './builtin.ts';
import couchdb from './couchdb.ts';
import customapi from './customapi.ts';
import docker from './docker.ts';
import flaresolverr from './flaresolverr.ts';
import glances from './glances.ts';
import gluetun from './gluetun.ts';
import homeassistant from './homeassistant.ts';
import immich from './immich.ts';
import jellyfin, { jellyfinLike } from './jellyfin.ts';
import jellyseerr, { overseerr } from './jellyseerr.ts';
import lidarr from './lidarr.ts';
import nginx from './nginx.ts';
import npm from './npm.ts';
import pihole from './pihole.ts';
import plex from './plex.ts';
import prowlarr from './prowlarr.ts';
import proxmox from './proxmox.ts';
import qbittorrent from './qbittorrent.ts';
import radarr from './radarr.ts';
import sabnzbd from './sabnzbd.ts';
import sonarr from './sonarr.ts';
import speedtest from './speedtest.ts';
import uptimekuma from './uptimekuma.ts';
import website from './website.ts';

const BUILTIN: IntegrationDef[] = [
  // media
  jellyfin,
  jellyfinLike('emby', 'Emby'),
  plex,
  sonarr,
  radarr,
  lidarr,
  bazarr,
  jellyseerr,
  overseerr,
  immich,
  // downloads
  qbittorrent,
  sabnzbd,
  prowlarr,
  flaresolverr,
  // smart home
  homeassistant,
  // network
  gluetun,
  pihole,
  adguard,
  nginx,
  npm,
  speedtest,
  // system
  proxmox,
  docker,
  glances,
  uptimekuma,
  // productivity
  couchdb,
  // generic
  website,
  customapi,
  // builtin widgets
  clock,
  weather,
  bookmarks,
];

const registry = new Map<string, IntegrationDef>();
for (const def of BUILTIN) registry.set(def.id, def);

export function getIntegration(id: string): IntegrationDef | undefined {
  return registry.get(id);
}

export function allIntegrations(): IntegrationDef[] {
  return [...registry.values()];
}

/**
 * Load user plugins from <configDir>/plugins/*.{js,mjs,ts}. Each file default-exports an
 * integration definition (see docs/integrations.md). A plugin may override a builtin.
 */
export async function loadPlugins(dir: string) {
  const log = logger('plugins');
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir)) {
    if (!/\.(m?js|ts)$/.test(file)) continue;
    try {
      const mod = await import(pathToFileURL(resolve(join(dir, file))).href);
      const defs: IntegrationDef[] = Array.isArray(mod.default) ? mod.default : [mod.default];
      for (const def of defs) {
        if (!def?.id || !def?.name) throw new Error('default export needs at least id and name');
        const replaced = registry.has(def.id);
        registry.set(def.id, def);
        log.info(`Plugin geladen: ${def.name} (${def.id}) aus ${file}${replaced ? ' – ersetzt eingebaute Integration' : ''}`);
      }
    } catch (err) {
      log.error(`Plugin ${file} konnte nicht geladen werden`, errorDetails(err));
    }
  }
}

export function describe(def: IntegrationDef): IntegrationInfo {
  return {
    id: def.id,
    name: def.name,
    icon: def.icon,
    category: def.category,
    description: def.description,
    website: def.website,
    urlPlaceholder: def.urlPlaceholder,
    urlHelp: def.urlHelp,
    defaultInsecure: def.defaultInsecure,
    fields: def.fields ?? [],
    widgets: Object.entries(def.widgets ?? {}).map(([id, w]) => ({
      id,
      name: w.name,
      description: w.description,
      interval: w.interval ?? 60,
      options: w.options ?? [],
      size: w.size,
      hasDetail: Boolean(w.detail),
    })),
    searchable: Boolean(def.search),
    bang: def.bang,
    builtin: def.builtin,
    needsUrl: def.needsUrl !== false,
  };
}
