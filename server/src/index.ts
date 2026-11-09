import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const configDir = resolve(process.env.KOMPASS_CONFIG_DIR ?? '/config');
const webDir = resolve(process.env.KOMPASS_WEB_DIR ?? `${here}/../../web/dist`);
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';

const { app, ctx } = await buildApp({
  configDir,
  webDir,
  logger: true,
  trustedHeader: process.env.KOMPASS_TRUSTED_HEADER || undefined,
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    process.exit(0);
  });
}

await app.listen({ port, host });
ctx.log(`Kompass läuft auf http://${host}:${port} (Konfiguration: ${configDir})`);
