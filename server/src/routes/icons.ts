import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetch } from 'undici';
import type { AppContext } from '../app.ts';
import { logger } from '../lib/log.ts';

const log = logger('icons');

/**
 * Service icons come from the dashboard-icons collection (homarr-labs/dashboard-icons),
 * "mdi-*" names from Material Design Icons. Both are downloaded once and cached in
 * /config/cache/icons, so the dashboard works offline afterwards.
 */
const SOURCES = (name: string) =>
  name.startsWith('mdi-')
    ? [{ url: `https://cdn.jsdelivr.net/npm/@mdi/svg@7.4.47/svg/${name.slice(4)}.svg`, ext: 'svg' }]
    : [
        { url: `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/${name}.svg`, ext: 'svg' },
        { url: `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/${name}.png`, ext: 'png' },
        { url: `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/webp/${name}.webp`, ext: 'webp' },
      ];

const TYPES: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp' };
const MISSING_TTL = 24 * 3600_000;

export const iconRoutes = (ctx: AppContext) => async (app: FastifyInstance) => {
  const dir = join(ctx.configDir, 'cache', 'icons');
  const inflight = new Map<string, Promise<{ ext: string; data: Buffer } | null>>();

  let networkWarned = false;
  let offlineUntil = 0;
  async function download(name: string) {
    if (Date.now() < offlineUntil) return null; // CDN recently unreachable: don't wait for timeouts again
    let networkError: string | undefined;
    for (const src of SOURCES(name)) {
      try {
        const res = await fetch(src.url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;
        const data = Buffer.from(await res.arrayBuffer());
        writeFileSync(join(dir, `${name}.${src.ext}`), data);
        log.debug(`Icon "${name}" heruntergeladen`, { source: src.url });
        networkWarned = false;
        return { ext: src.ext, data };
      } catch (err) {
        const e = err as any;
        networkError = e?.cause?.code ?? e?.name ?? e?.message;
      }
    }
    if (networkError) {
      // Do not cache as "missing": the icon may exist, we just could not reach the CDN.
      if (!networkWarned) log.warn(`Icons können nicht geladen werden – ist cdn.jsdelivr.net erreichbar? Es werden Buchstaben angezeigt, neuer Versuch in 5 min.`, { error: networkError });
      networkWarned = true;
      offlineUntil = Date.now() + 5 * 60_000;
      return null;
    }
    log.info(`Icon "${name}" gibt es nicht in dashboard-icons – im Dienst ein anderes Icon eintragen`);
    writeFileSync(join(dir, `${name}.missing`), '');
    return null;
  }

  app.get('/icons/:name', async (req, reply) => {
    const name = String((req.params as any).name).toLowerCase().replace(/\.(svg|png|webp)$/, '');
    if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(name)) return reply.status(400).send();
    for (const ext of ['svg', 'png', 'webp']) {
      const f = join(dir, `${name}.${ext}`);
      if (existsSync(f)) return reply.header('Content-Type', TYPES[ext]).header('Cache-Control', 'public, max-age=604800').send(readFileSync(f));
    }
    const missing = join(dir, `${name}.missing`);
    if (existsSync(missing) && Date.now() - statSync(missing).mtimeMs < MISSING_TTL) return reply.status(404).send();
    let p = inflight.get(name);
    if (!p) {
      p = download(name).finally(() => inflight.delete(name));
      inflight.set(name, p);
    }
    const r = await p;
    if (!r) return reply.status(404).header('Cache-Control', 'public, max-age=3600').send();
    return reply.header('Content-Type', TYPES[r.ext]).header('Cache-Control', 'public, max-age=604800').send(r.data);
  });
};
