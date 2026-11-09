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
import { configureLogger, errorDetails, logger } from './lib/log.ts';
import { ServiceManager } from './services.ts';
import { authRoutes } from './routes/auth.ts';
import { serviceRoutes } from './routes/services.ts';
import { searchRoutes } from './routes/search.ts';
import { dashboardRoutes } from './routes/dashboard.ts';
import { iconRoutes } from './routes/icons.ts';
import { aiRoutes } from './routes/ai.ts';

export interface AppContext {
  db: DB;
  auth: Auth;
  file: ConfigFile;
  services: ServiceManager;
  secrets: SecretBox;
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

  // All output goes through lib/log.ts (LOG_LEVEL / LOG_FORMAT); tests run silent.
  configureLogger({ silent: !opts.logger });
  const httpLog = logger('http');
  const appLog = logger('app');
  const app = Fastify({ logger: false, trustProxy: true, bodyLimit: 1024 * 1024 });
  const log = (msg: string) => appLog.info(msg);

  const db = openDb(join(configDir, 'kompass.db'));
  const secrets = new SecretBox(join(configDir, 'secret.key'));
  const file = new ConfigFile(join(configDir, 'kompass.yaml'));
  const services = new ServiceManager(db, file, secrets);
  const auth = new Auth(db);
  await loadPlugins(join(configDir, 'plugins'));

  const ctx: AppContext = { db, auth, file, services, secrets, configDir, log, trustedHeader: opts.trustedHeader?.toLowerCase() };

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

  // Every request at debug level; slow ones (> 3 s, except streams) as warning.
  app.addHook('onResponse', async (req, reply) => {
    const ms = Math.round(reply.elapsedTime);
    const url = req.url.split('?')[0];
    if (url === '/healthz' || url.startsWith('/assets/') || url.startsWith('/api/icons/')) return;
    const extra = { status: reply.statusCode, ms, user: req.user?.username, ip: req.ip };
    if (ms > 3000 && url !== '/api/search') httpLog.warn(`Langsame Anfrage ${req.method} ${url}`, extra);
    else httpLog.debug(`${req.method} ${url}`, extra);
  });

  app.setErrorHandler((err: any, req, reply) => {
    // Our own validation errors ("Name fehlt") are thrown as plain Errors → 400.
    // Fastify errors carry statusCode; anything >= 500 or without a message is a bug.
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 400;
    const where = `${req.method} ${req.url.split('?')[0]}`;
    if (status >= 500) httpLog.error(`Serverfehler bei ${where}`, { ...errorDetails(err), user: req.user?.username });
    else if (err instanceof TypeError || err instanceof ReferenceError) httpLog.error(`Unerwarteter Fehler bei ${where}`, { ...errorDetails(err), user: req.user?.username });
    else httpLog.debug(`Abgelehnt ${where}: ${err.message}`, { status, user: req.user?.username });
    reply.status(status).send({ error: err.message ?? String(err) });
  });

  // Errors from the browser (JS exceptions, failed saves) end up in the container log too.
  const clientLog = logger('browser');
  const clientBudget = new Map<string, { n: number; reset: number }>();
  app.post('/api/client-error', async (req, reply) => {
    const now = Date.now();
    const b = clientBudget.get(req.ip) ?? { n: 0, reset: now + 60_000 };
    if (now > b.reset) Object.assign(b, { n: 0, reset: now + 60_000 });
    b.n++;
    clientBudget.set(req.ip, b);
    if (b.n > 20) return reply.status(429).send();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
    clientLog.error(str(body.message, 500) ?? 'Unbekannter Fehler im Browser', {
      where: str(body.where, 100),
      page: str(body.page, 200),
      user: req.user?.username,
      ip: req.ip,
      browser: str(req.headers['user-agent'], 160),
      secureContext: typeof body.secureContext === 'boolean' ? body.secureContext : undefined,
      stack: str(body.stack, 2000),
    });
    return { ok: true };
  });

  await app.register(authRoutes(ctx), { prefix: '/api' });
  await app.register(serviceRoutes(ctx), { prefix: '/api' });
  await app.register(searchRoutes(ctx), { prefix: '/api' });
  await app.register(dashboardRoutes(ctx), { prefix: '/api' });
  await app.register(iconRoutes(ctx), { prefix: '/api' });
  await app.register(aiRoutes(ctx), { prefix: '/api' });

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
