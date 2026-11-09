import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.ts';

/**
 * Behaves like Proxmox: a token with PVEAuditor sees everything; a token without rights
 * (privilege separation, nothing assigned) only sees the node, without CPU/RAM, and no guests.
 */
function fakeProxmox(): Promise<{ port: number; close: () => void }> {
  const server = http.createServer((req, res) => {
    const auditor = req.headers.authorization === 'PVEAPIToken=k@pve!full=secret';
    const json = (data: unknown) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data }));
    };
    if (req.url === '/api2/json/version') return json({ version: '8.4.1' });
    if (req.url === '/api2/json/access/permissions') return json(auditor ? { '/': { 'Sys.Audit': 1, 'VM.Audit': 1 } } : {});
    if (req.url === '/api2/json/cluster/resources') {
      return json(
        auditor
          ? [
              { id: 'node/pve', type: 'node', node: 'pve', status: 'online', cpu: 0.1, maxcpu: 8, mem: 8e9, maxmem: 32e9 },
              { id: 'qemu/100', type: 'qemu', node: 'pve', vmid: 100, name: 'docker', status: 'running', cpu: 0.05, mem: 2e9, maxmem: 4e9, uptime: 3600, template: 0 },
            ]
          : [{ id: 'node/pve', type: 'node', node: 'pve', status: 'online' }],
      );
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ port: (server.address() as AddressInfo).port, close: () => server.close() })));
}

test('Proxmox: missing token permissions are detected and explained', async () => {
  const pve = await fakeProxmox();
  const dir = mkdtempSync(join(tmpdir(), 'kompass-pve-'));
  writeFileSync(
    join(dir, 'kompass.yaml'),
    `services:
  - { id: limited, type: proxmox, url: "http://127.0.0.1:${pve.port}", tokenId: "k@pve!none", tokenSecret: "secret" }
  - { id: full, type: proxmox, url: "http://127.0.0.1:${pve.port}", tokenId: "k@pve!full", tokenSecret: "secret" }
`,
  );
  const { app } = await buildApp({ configDir: dir, healthChecks: false });
  try {
    const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'admin', password: 'geheim123' } });
    const cookie = String(setup.headers['set-cookie']).split(';')[0];
    const widget = async (service: string, w: string) =>
      (await app.inject({ method: 'POST', url: '/api/widget', headers: { cookie }, payload: { service, widget: w } })).json().data;

    // the fake server speaks plain HTTP on a random port: http:// must stay http:// (only :8006 is upgraded)
    const limited = await widget('limited', 'overview');
    assert.equal(limited.summary, 'Berechtigung fehlt');
    const text = JSON.stringify(limited.blocks);
    assert.match(text, /Sys\.Audit/);
    assert.match(text, /VM\.Audit/);
    assert.match(text, /PVEAuditor/);
    assert.match(text, /k@pve!none/, 'names the token to fix');
    assert.doesNotMatch(text, /von \? Kernen/, 'no misleading empty CPU bar');

    const full = await widget('full', 'overview');
    assert.match(full.summary, /1\/1 Nodes online · 1 Gäste laufen/);
    assert.doesNotMatch(JSON.stringify(full.blocks), /Sys\.Audit/);
    const guests = await widget('full', 'guests');
    assert.equal(guests.blocks[0].items[0].title, 'docker');
  } finally {
    await app.close();
    pve.close();
  }
});
