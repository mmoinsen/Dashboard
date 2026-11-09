import type { FastifyReply, FastifyRequest } from 'fastify';
import type { DB } from './db.ts';
import { hashPassword, randomToken, sha256, verifyPassword } from './lib/crypto.ts';
import type { UserPublic, UserSettings } from './shared/types.ts';

export const SESSION_COOKIE = 'kompass_session';
/** Browsers cap cookie lifetime at 400 days; the session slides forward on use. */
const SESSION_DAYS = 400;
const DAY = 86_400_000;

export interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  is_admin: number;
  settings: string;
  created_at: string;
}

export function toPublicUser(u: UserRow): UserPublic {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    isAdmin: Boolean(u.is_admin),
    createdAt: u.created_at,
    settings: JSON.parse(u.settings || '{}') as UserSettings,
  };
}

export function validateUsername(username: unknown): string {
  const u = String(username ?? '').trim();
  if (!/^[a-zA-Z0-9._-]{2,32}$/.test(u)) throw new Error('Benutzername: 2–32 Zeichen, nur Buchstaben, Zahlen, . _ -');
  return u;
}

export function validatePassword(password: unknown): string {
  const p = String(password ?? '');
  if (p.length < 8) throw new Error('Das Passwort muss mindestens 8 Zeichen lang sein');
  return p;
}

export class Auth {
  private failures = new Map<string, { count: number; until: number }>();

  private db: DB;
  constructor(db: DB) {
    this.db = db;
  }

  userCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as any).n;
  }

  getUser(id: number): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }

  getUserByName(username: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
  }

  listUsers(): UserRow[] {
    return this.db.prepare('SELECT * FROM users ORDER BY is_admin DESC, username').all() as unknown as UserRow[];
  }

  async createUser(username: string, password: string, displayName: string, isAdmin: boolean): Promise<UserRow> {
    const name = validateUsername(username);
    if (this.getUserByName(name)) throw new Error('Dieser Benutzername ist bereits vergeben');
    const hash = await hashPassword(validatePassword(password));
    const r = this.db
      .prepare('INSERT INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, ?)')
      .run(name, displayName?.trim() || name, hash, isAdmin ? 1 : 0);
    return this.getUser(Number(r.lastInsertRowid))!;
  }

  async setPassword(userId: number, password: string) {
    const hash = await hashPassword(validatePassword(password));
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  }

  /** Throttle brute force: after 5 failures per IP+user, wait progressively longer. */
  async login(username: string, password: string, ip: string): Promise<UserRow> {
    const key = `${ip}|${String(username).toLowerCase()}`;
    const f = this.failures.get(key);
    if (f && f.until > Date.now()) throw new Error(`Zu viele Versuche – bitte ${Math.ceil((f.until - Date.now()) / 1000)} s warten`);
    const user = this.getUserByName(String(username ?? '').trim());
    const ok = user ? await verifyPassword(String(password ?? ''), user.password_hash) : false;
    if (!user || !ok) {
      const count = (f?.count ?? 0) + 1;
      this.failures.set(key, { count, until: count >= 5 ? Date.now() + Math.min(2 ** (count - 5), 300) * 1000 : 0 });
      throw new Error('Benutzername oder Passwort falsch');
    }
    this.failures.delete(key);
    return user;
  }

  createSession(userId: number, userAgent?: string): string {
    const token = randomToken();
    const now = Date.now();
    this.db
      .prepare('INSERT INTO sessions (token_hash, user_id, user_agent, created_at, last_seen, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(sha256(token), userId, userAgent?.slice(0, 200) ?? null, now, now, now + SESSION_DAYS * DAY);
    return token;
  }

  /** Returns the user for a session token and whether the cookie should be refreshed. */
  resolveSession(token: string): { user: UserRow; refresh: boolean } | null {
    const hash = sha256(token);
    const s = this.db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(hash) as any;
    if (!s) return null;
    const now = Date.now();
    if (s.expires_at < now) {
      this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
      return null;
    }
    const user = this.getUser(s.user_id);
    if (!user) return null;
    const refresh = now - s.last_seen > DAY;
    if (refresh) this.db.prepare('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?').run(now, now + SESSION_DAYS * DAY, hash);
    return { user, refresh };
  }

  destroySession(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  }

  destroyUserSessions(userId: number, exceptToken?: string) {
    if (exceptToken) this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, sha256(exceptToken));
    else this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  cleanup() {
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  }
}

export function setSessionCookie(req: FastifyRequest, reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: req.protocol === 'https',
    maxAge: SESSION_DAYS * 86400,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}
