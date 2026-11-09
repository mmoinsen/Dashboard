import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.ts';

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'kompass-api-'));
  writeFileSync(join(dir, 'kompass.yaml'), 'services:\n  - id: website\n    type: website\n    name: Router\n    url: http://127.0.0.1:1\n');
  const { app } = await buildApp({ configDir: dir, healthChecks: false });
  return app;
}

function cookieOf(res: { headers: Record<string, any> }) {
  const c = res.headers['set-cookie'];
  return (Array.isArray(c) ? c[0] : c).split(';')[0];
}

test('setup, session cookie, users and per-user dashboards', async () => {
  const app = await setup();
  let r = await app.inject({ url: '/api/auth/state' });
  assert.equal(r.json().setupRequired, true);

  r = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'admin', password: 'kurz' } });
  assert.equal(r.statusCode, 400, 'short passwords are rejected');

  r = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'admin', password: 'geheim123' } });
  assert.equal(r.statusCode, 200);
  const admin = cookieOf(r);
  assert.match(String(r.headers['set-cookie']), /Max-Age=34560000/, 'session survives browser restarts (400 days)');
  assert.match(String(r.headers['set-cookie']), /HttpOnly/);

  r = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'x', password: 'geheim123' } });
  assert.equal(r.statusCode, 409, 'setup only once');

  // unauthenticated access is refused
  assert.equal((await app.inject({ url: '/api/bootstrap' })).statusCode, 401);

  r = await app.inject({ url: '/api/bootstrap', headers: { cookie: admin } });
  assert.equal(r.statusCode, 200);
  const boot = r.json();
  assert.equal(boot.services[0].source, 'file');
  assert.ok(boot.integrations.length > 20);
  assert.equal(boot.dashboard.pages[0].widgets.some((w: any) => w.service === 'website'), true, 'default dashboard contains service widgets');

  // admin creates a regular user
  r = await app.inject({ method: 'POST', url: '/api/users', headers: { cookie: admin }, payload: { username: 'sam', password: 'passwort1' } });
  assert.equal(r.statusCode, 200);
  r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'sam', password: 'passwort1' } });
  const sam = cookieOf(r);
  assert.equal((await app.inject({ url: '/api/users', headers: { cookie: sam } })).statusCode, 403, 'non-admins cannot manage users');
  assert.equal((await app.inject({ method: 'POST', url: '/api/services', headers: { cookie: sam }, payload: {} })).statusCode, 403);

  // dashboards are per user
  const own = { pages: [{ id: 'p', name: 'Meins', widgets: [] }] };
  await app.inject({ method: 'PUT', url: '/api/dashboard', headers: { cookie: sam }, payload: { dashboard: own } });
  assert.equal((await app.inject({ url: '/api/dashboard', headers: { cookie: sam } })).json().dashboard.pages[0].name, 'Meins');
  assert.notEqual((await app.inject({ url: '/api/dashboard', headers: { cookie: admin } })).json().dashboard.pages[0].name, 'Meins');

  // wrong password
  r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'sam', password: 'falsch' } });
  assert.equal(r.statusCode, 400);

  // logout invalidates the session
  await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: sam } });
  assert.equal((await app.inject({ url: '/api/bootstrap', headers: { cookie: sam } })).statusCode, 401);
  await app.close();
});

test('services: secrets are stored encrypted and never returned', async () => {
  const app = await setup();
  const r0 = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'admin', password: 'geheim123' } });
  const cookie = cookieOf(r0);
  let r = await app.inject({
    method: 'POST',
    url: '/api/services',
    headers: { cookie },
    payload: { type: 'sonarr', name: 'Sonarr', url: 'http://sonarr:8989', config: { apiKey: 'topsecret' } },
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().service.config.apiKey, true);
  assert.ok(!r.body.includes('topsecret'));

  // updating with an empty secret keeps the stored one
  r = await app.inject({ method: 'PUT', url: '/api/services/sonarr', headers: { cookie }, payload: { name: 'Sonarr 2', url: 'http://sonarr:8989', config: { apiKey: '' } } });
  assert.equal(r.json().service.config.apiKey, true);

  r = await app.inject({ url: '/api/services/export', headers: { cookie } });
  assert.match(r.body, /SONARR_API_KEY/);
  assert.ok(!r.body.includes('topsecret'));

  // file-managed services cannot be edited in the UI
  r = await app.inject({ method: 'DELETE', url: '/api/services/website', headers: { cookie } });
  assert.equal(r.statusCode, 400);

  // builtin widget works without a service
  r = await app.inject({ method: 'POST', url: '/api/widget', headers: { cookie }, payload: { service: 'clock', builtin: true, widget: 'clock' } });
  assert.equal(r.json().data.blocks[0].type, 'clock');
  await app.close();
});
