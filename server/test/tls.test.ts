import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.ts';

/** A Proxmox-like HTTPS server with a self-signed certificate. */
function selfSignedServer(): Promise<{ port: number; close: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), 'kompass-tls-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=pve.local', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' });
  const server = https.createServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }, (req, res) => {
    res.writeHead(req.headers.authorization?.startsWith('PVEAPIToken=') ? 200 : 401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: { version: '8.4.1' } }));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ port: (server.address() as AddressInfo).port, close: () => server.close() })));
}

let hasOpenssl = true;
try {
  execFileSync('openssl', ['version'], { stdio: 'ignore' });
} catch {
  hasOpenssl = false;
}

test('connection test honours "TLS-Zertifikat nicht prüfen" (self-signed Proxmox, http:// URL)', { skip: !hasOpenssl && 'openssl not installed' }, async () => {
  const pve = await selfSignedServer();
  const dir = mkdtempSync(join(tmpdir(), 'kompass-api-'));
  writeFileSync(join(dir, 'kompass.yaml'), '');
  const { app } = await buildApp({ configDir: dir, healthChecks: false });
  try {
  const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'admin', password: 'geheim123' } });
  const cookie = String(setup.headers['set-cookie']).split(';')[0];
  const base = { type: 'proxmox', name: 'Proxmox', url: `http://127.0.0.1:${pve.port}` };

  // without the option: rejected, with a message that says what to do
  let r = await app.inject({ method: 'POST', url: '/api/services/test', headers: { cookie }, payload: { ...base, config: { tokenId: 'k@pve!d', tokenSecret: 'x', insecure: false } } });
  assert.equal(r.json().status.ok, false);
  assert.match(r.json().status.message, /TLS-Zertifikat nicht prüfen/);

  // with the option (sent as boolean true by the form): works, and http:// was upgraded to https://
  r = await app.inject({ method: 'POST', url: '/api/services/test', headers: { cookie }, payload: { ...base, config: { tokenId: 'k@pve!d', tokenSecret: 'x', insecure: true } } });
  assert.equal(r.json().status.ok, true, r.json().status.message);

  // the saved service works the same way
  r = await app.inject({ method: 'POST', url: '/api/services', headers: { cookie }, payload: { ...base, config: { tokenId: 'k@pve!d', tokenSecret: 'x', insecure: true } } });
  const id = r.json().service.id;
  r = await app.inject({ method: 'POST', url: `/api/services/${id}/check`, headers: { cookie } });
  assert.equal(r.json().status.ok, true, r.json().status.message);
  } finally {
    await app.close();
    pve.close();
  }
});
