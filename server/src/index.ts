import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { buildApp } from './app.ts';
import { allIntegrations } from './integrations/index.ts';
import { errorDetails, logger } from './lib/log.ts';

const log = logger('app');

// Never die silently: anything that slips through ends up in `docker logs`.
process.on('unhandledRejection', (reason) => log.error('Unbehandelter Fehler (Promise)', errorDetails(reason)));
process.on('uncaughtException', (err) => {
  log.error('Unbehandelter Fehler – Kompass wird beendet', errorDetails(err));
  process.exit(1);
});

const here = fileURLToPath(new URL('.', import.meta.url));
const configDir = resolve(process.env.KOMPASS_CONFIG_DIR ?? '/config');
const webDir = resolve(process.env.KOMPASS_WEB_DIR ?? `${here}/../../web/dist`);
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';

let version = 'dev';
try {
  version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
} catch {
  /* ignore */
}
log.info(`Kompass ${version} startet (Node ${process.version}, Log-Level ${process.env.LOG_LEVEL ?? 'info'})`);

const { app, ctx } = await buildApp({
  configDir,
  webDir,
  logger: true,
  trustedHeader: process.env.KOMPASS_TRUSTED_HEADER || undefined,
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    log.info(`${sig} empfangen – Kompass wird beendet`);
    await app.close();
    process.exit(0);
  });
}

try {
  await app.listen({ port, host });
} catch (err) {
  log.error(`Port ${port} konnte nicht geöffnet werden`, errorDetails(err));
  process.exit(1);
}
const users = ctx.auth.userCount();
log.info(`Kompass läuft auf http://${host}:${port}`, {
  config: configDir,
  services: ctx.services.list().length,
  integrations: allIntegrations().length,
  users,
  trustedHeader: process.env.KOMPASS_TRUSTED_HEADER || undefined,
});
if (!users) log.info('Noch kein Benutzer – im Browser öffnen und den Administrator anlegen');
