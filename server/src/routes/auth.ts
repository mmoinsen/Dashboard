import type { FastifyInstance } from 'fastify';
import { requireAdmin, requireUser, type AppContext } from '../app.ts';
import { SESSION_COOKIE, clearSessionCookie, setSessionCookie, toPublicUser, validateUsername } from '../auth.ts';
import { verifyPassword } from '../lib/crypto.ts';
import type { UserSettings } from '../shared/types.ts';

function sanitizeSettings(input: any, previous: UserSettings): UserSettings {
  const out: UserSettings = { ...previous };
  if (typeof input?.theme === 'string') out.theme = input.theme.slice(0, 64);
  if (Array.isArray(input?.customThemes)) out.customThemes = input.customThemes.slice(0, 30);
  if (typeof input?.searchEngine === 'string') out.searchEngine = input.searchEngine.slice(0, 64);
  if (typeof input?.openLinksInNewTab === 'boolean') out.openLinksInNewTab = input.openLinksInNewTab;
  if (typeof input?.greeting === 'boolean') out.greeting = input.greeting;
  if (JSON.stringify(out).length > 200_000) throw new Error('Einstellungen zu groß');
  return out;
}

export const authRoutes = (ctx: AppContext) => async (app: FastifyInstance) => {
  const { auth } = ctx;

  app.get('/auth/state', async (req) => ({
    setupRequired: auth.userCount() === 0,
    user: req.user ? toPublicUser(req.user) : null,
  }));

  app.post('/auth/setup', async (req, reply) => {
    if (auth.userCount() > 0) return reply.status(409).send({ error: 'Ersteinrichtung bereits abgeschlossen' });
    const b = req.body as any;
    const user = await auth.createUser(b?.username, b?.password, b?.displayName, true);
    setSessionCookie(req, reply, auth.createSession(user.id, req.headers['user-agent']));
    return { user: toPublicUser(user) };
  });

  app.post('/auth/login', async (req, reply) => {
    const b = req.body as any;
    const user = await auth.login(b?.username, b?.password, req.ip);
    setSessionCookie(req, reply, auth.createSession(user.id, req.headers['user-agent']));
    return { user: toPublicUser(user) };
  });

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) auth.destroySession(token);
    clearSessionCookie(reply);
    return { ok: true };
  });

  // ----- own account -----

  app.put('/me', { preHandler: requireUser }, async (req) => {
    const b = req.body as any;
    const u = req.user!;
    const displayName = typeof b?.displayName === 'string' && b.displayName.trim() ? b.displayName.trim().slice(0, 64) : u.display_name;
    const settings = sanitizeSettings(b?.settings ?? {}, JSON.parse(u.settings || '{}'));
    ctx.db.prepare('UPDATE users SET display_name = ?, settings = ? WHERE id = ?').run(displayName, JSON.stringify(settings), u.id);
    return { user: toPublicUser(auth.getUser(u.id)!) };
  });

  app.put('/me/password', { preHandler: requireUser }, async (req) => {
    const b = req.body as any;
    if (!(await verifyPassword(String(b?.current ?? ''), req.user!.password_hash))) throw new Error('Aktuelles Passwort ist falsch');
    await auth.setPassword(req.user!.id, b?.next);
    auth.destroyUserSessions(req.user!.id, req.cookies[SESSION_COOKIE]);
    return { ok: true };
  });

  app.post('/me/logout-others', { preHandler: requireUser }, async (req) => {
    auth.destroyUserSessions(req.user!.id, req.cookies[SESSION_COOKIE]);
    return { ok: true };
  });

  // ----- user management (admin) -----

  app.get('/users', { preHandler: requireAdmin }, async () => ({ users: auth.listUsers().map(toPublicUser) }));

  app.post('/users', { preHandler: requireAdmin }, async (req) => {
    const b = req.body as any;
    const user = await auth.createUser(b?.username, b?.password, b?.displayName, Boolean(b?.isAdmin));
    return { user: toPublicUser(user) };
  });

  app.put('/users/:id', { preHandler: requireAdmin }, async (req) => {
    const id = Number((req.params as any).id);
    const b = req.body as any;
    const user = auth.getUser(id);
    if (!user) throw new Error('Benutzer nicht gefunden');
    const admins = auth.listUsers().filter((u) => u.is_admin).length;
    const isAdmin = typeof b?.isAdmin === 'boolean' ? b.isAdmin : Boolean(user.is_admin);
    if (user.is_admin && !isAdmin && admins <= 1) throw new Error('Es muss mindestens einen Administrator geben');
    const username = b?.username ? validateUsername(b.username) : user.username;
    if (username.toLowerCase() !== user.username.toLowerCase() && auth.getUserByName(username)) throw new Error('Benutzername bereits vergeben');
    ctx.db
      .prepare('UPDATE users SET username = ?, display_name = ?, is_admin = ? WHERE id = ?')
      .run(username, String(b?.displayName ?? user.display_name).trim() || username, isAdmin ? 1 : 0, id);
    if (b?.password) {
      await auth.setPassword(id, b.password);
      auth.destroyUserSessions(id, id === req.user!.id ? req.cookies[SESSION_COOKIE] : undefined);
    }
    return { user: toPublicUser(auth.getUser(id)!) };
  });

  app.delete('/users/:id', { preHandler: requireAdmin }, async (req) => {
    const id = Number((req.params as any).id);
    if (id === req.user!.id) throw new Error('Du kannst dich nicht selbst löschen');
    ctx.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return { ok: true };
  });
};
