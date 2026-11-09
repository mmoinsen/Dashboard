import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Auth, SESSION_COOKIE, setSessionCookie, type UserRow } from './auth.ts';
import { ConfigFile } from './config.ts';
import { openDb, type DB } from './db.ts';
import { loadPlugins } from './integrations/index.ts';
import { SecretBox } from './lib/crypto.ts';
import { ServiceManager } from './services.ts';
import { authRoutes } from './routes/auth.ts';
import { serviceRoutes } from './routes/services.ts';
import { searchRoutes } from './routes/search.ts';
import { dashboardRoutes } from './routes/dashboard.ts';
import { iconRoutes } from './routes/icons.ts';

export interface AppContext {
  db: DB;
  auth: Auth;
  file: ConfigFile;
  services: ServiceManager;
  configDir: string;
  log: (msg: string) => void;
  trustedHeader?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserRow;
  }
}

export interface AppOptions {
  configDir: string;
  webDir?: string;
  logger?: boolean;
  healthChecks?: boolean;
  trustedHeader?: string;
}

export async function buildApp(opts: AppOptions): Promise<{ app: FastifyInstance; ctx: AppContext }> {
  const { configDir } = opts;
  mkdirSync(join(configDir, 'cache', 'icons'), { recursive: true });
  mkdirSync(join(configDir, 'plugins'), { recursive: true });

  // Fastify's own logger only reports problems; Kompass' messages go through log().
  const app = Fastify({ logger: opts.logger ? { level: 'warn' } : false, trustProxy: true, bodyLimit: 1024 * 1024 });
  const log = (msg: string) => (opts.logger ? console.log(`[${new Date().toISOString()}] ${msg}`) : undefined);

  const db = openDb(join(configDir, 'kompass.db'));
  const secrets = new SecretBox(join(configDir, 'secret.key'));
  const file = new ConfigFile(join(configDir, 'kompass.yaml'), log);
  const services = new ServiceManager(db, file, secrets);
  const auth = new Auth(db);
  await loadPlugins(join(configDir, 'plugins'), log);

  const ctx: AppContext = { db, auth, file, services, configDir, log, trustedHeader: opts.trustedHeader?.toLowerCase() };

  await app.register(cookie);

  // Resolve the session for every request (cheap: one indexed lookup).
  app.addHook('onRequest', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      const s = auth.resolveSession(token);
      if (s) {
        req.user = s.user;
        if (s.refresh) setSessionCookie(req, reply, token);
        return;
      }
    }
    // Optional SSO via reverse proxy (Authelia, Authentik, ...): trust a username header.
    if (ctx.trustedHeader) {
      const name = req.headers[ctx.trustedHeader];
      if (typeof name === 'string' && name) {
        const user = auth.getUserByName(name);
        if (user) {
          req.user = user;
          setSessionCookie(req, reply, auth.createSession(user.id, req.headers['user-agent']));
        }
      }
    }
  });

  app.setErrorHandler((err: any, _req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 400;
    reply.status(status).send({ error: err.message ?? String(err) });
  });

  await app.register(authRoutes(ctx), { prefix: '/api' });
  await app.register(serviceRoutes(ctx), { prefix: '/api' });
  await app.register(searchRoutes(ctx), { prefix: '/api' });
  await app.register(dashboardRoutes(ctx), { prefix: '/api' });
  await app.register(iconRoutes(ctx), { prefix: '/api' });

  app.get('/healthz', async () => ({ ok: true }));

  if (opts.webDir && existsSync(opts.webDir)) {
    await app.register(fastifyStatic, { root: opts.webDir, maxAge: '1h' });
    // SPA fallback
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'Nicht gefunden' });
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  }

  if (opts.healthChecks !== false) services.startHealthChecks();
  const cleanup = setInterval(() => auth.cleanup(), 6 * 3600_000);
  cleanup.unref();
  app.addHook('onClose', async () => {
    clearInterval(cleanup);
    services.stop();
    file.close();
    db.close();
  });

  return { app, ctx };
}

// ---------- guards ----------

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.status(401).send({ error: 'Nicht angemeldet' });
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.status(401).send({ error: 'Nicht angemeldet' });
  if (!req.user.is_admin) return reply.status(403).send({ error: 'Nur für Administratoren' });
}
