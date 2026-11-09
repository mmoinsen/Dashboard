import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculate, looksLikeUrl, parseQuery, webIntent } from '../src/shared/query.ts';
import { matchScore, normalize } from '../src/lib/match.ts';
import { parseConfig, substituteEnv } from '../src/config.ts';
import { SecretBox, hashPassword, verifyPassword } from '../src/lib/crypto.ts';
import { parseStubStatus } from '../src/integrations/nginx.ts';
import { getPath, parseMappings } from '../src/integrations/customapi.ts';
import { selectProviders } from '../src/routes/search.ts';
import type { ServiceInstance } from '../src/integrations/types.ts';

test('parseQuery handles prefixes at start and end, and commands', () => {
  assert.deepEqual(parseQuery('!g katzen'), { bang: 'g', text: 'katzen', command: false });
  assert.deepEqual(parseQuery('katzen !yt'), { bang: 'yt', text: 'katzen', command: false });
  assert.deepEqual(parseQuery('> abmelden'), { text: 'abmelden', command: true });
  assert.deepEqual(parseQuery('dune part two'), { text: 'dune part two', command: false });
  assert.deepEqual(parseQuery('!jf'), { bang: 'jf', text: '', command: false });
});

test('webIntent rates questions higher than titles', () => {
  assert.ok(webIntent('wie hoch ist der eiffelturm?') > 0.9);
  assert.ok(webIntent('dune') < 0.6);
});

test('looksLikeUrl and calculate', () => {
  assert.equal(looksLikeUrl('github.com/foo'), 'https://github.com/foo');
  assert.equal(looksLikeUrl('192.168.1.1:8080'), 'http://192.168.1.1:8080');
  assert.equal(looksLikeUrl('licht wohnzimmer'), null);
  assert.equal(calculate('12*(3+4)/2'), 42);
  assert.equal(calculate('2^10'), 1024);
  assert.equal(calculate('1,5+1,5'), 3);
  assert.equal(calculate('dune'), null);
  assert.equal(calculate('2024'), null);
});

test('matchScore prefers exact and prefix matches, handles umlauts', () => {
  assert.equal(matchScore('dune', 'Dune'), 1);
  assert.ok(matchScore('dune', 'Dune: Part Two') > matchScore('dune', 'Frank Herbert’s Dune'));
  assert.ok(matchScore('kueche', 'Licht Küche') > 0.7);
  assert.equal(normalize('Größe Ärger'), 'groesse aerger');
  assert.equal(matchScore('xyz', 'Sonarr'), 0);
});

test('config: env substitution and validation', () => {
  assert.equal(substituteEnv('${FOO}', { FOO: 'bar' }), 'bar');
  assert.equal(substituteEnv('${MISSING:-def}', {}), 'def');
  process.env.TEST_KEY = 'secret';
  const cfg = parseConfig('services:\n  - id: sonarr\n    type: sonarr\n    apiKey: ${TEST_KEY}\n');
  assert.equal(cfg.services?.[0].apiKey, 'secret');
  assert.throws(() => parseConfig('services:\n  - id: a\n    type: x\n  - id: a\n    type: y\n'), /Doppelte/);
  assert.throws(() => parseConfig('services:\n  - type: x\n'), /ohne id/);
});

test('secrets: encryption round trip and password hashing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kompass-'));
  const box = new SecretBox(join(dir, 'key'));
  const enc = box.encrypt('api-key-123');
  assert.ok(enc.startsWith('enc:') && !enc.includes('api-key'));
  assert.equal(new SecretBox(join(dir, 'key')).decrypt(enc), 'api-key-123');
  const hash = await hashPassword('geheim123');
  assert.ok(await verifyPassword('geheim123', hash));
  assert.ok(!(await verifyPassword('falsch', hash)));
});

test('nginx stub_status parser', () => {
  const s = parseStubStatus('Active connections: 7 \nserver accepts handled requests\n 10 10 48 \nReading: 0 Writing: 2 Waiting: 5 \n');
  assert.deepEqual(s, { active: 7, accepts: 10, handled: 10, requests: 48, reading: 0, writing: 2, waiting: 5 });
});

test('custom API mappings', () => {
  const m = parseMappings('Download = data.down | Mbit/s\n# Kommentar\nusers');
  assert.deepEqual(m, [
    { label: 'Download', path: 'data.down', unit: 'Mbit/s' },
    { label: 'users', path: 'users', unit: undefined },
  ]);
  assert.equal(getPath({ a: { b: [{ c: 3 }] } }, 'a.b.0.c'), 3);
});

test('selectProviders: default, integration bang, category bang, web bang', () => {
  const svc = (id: string, type: string): ServiceInstance => ({ id, type, name: id, url: '', publicUrl: '', icon: '', config: {} });
  const all = [svc('jellyfin', 'jellyfin'), svc('sonarr', 'sonarr'), svc('ha', 'homeassistant'), svc('prowlarr', 'prowlarr'), svc('pihole', 'pihole')];
  const ids = (r: { providers: ServiceInstance[] }) => r.providers.map((p) => p.id).sort();
  // prowlarr is opt-in only, pihole has no search
  assert.deepEqual(ids(selectProviders(all)), ['ha', 'jellyfin', 'sonarr']);
  assert.deepEqual(ids(selectProviders(all, 'jf')), ['jellyfin']);
  assert.deepEqual(ids(selectProviders(all, 'pr')), ['prowlarr']);
  assert.deepEqual(ids(selectProviders(all, 'm')), ['jellyfin', 'sonarr']);
  assert.equal(selectProviders(all, 'g').explicit, false);
});

test('FailureTracker logs a failure once and its recovery once', async () => {
  const { FailureTracker } = await import('../src/lib/log.ts');
  const t = new FailureTracker();
  assert.equal(t.update('qb', null), null, 'healthy from the start: nothing to log');
  assert.equal(t.update('qb', 'Verbindung abgelehnt'), 'failed');
  assert.equal(t.update('qb', 'Verbindung abgelehnt'), null, 'same error again is not repeated');
  assert.equal(t.update('qb', 'Zeitüberschreitung'), 'failed', 'a different error is logged');
  assert.equal(t.update('qb', null), 'recovered');
  assert.equal(t.update('qb', null), null);
});

test('safeUrl strips query strings (API keys) from logged URLs', async () => {
  const { safeUrl } = await import('../src/lib/http.ts');
  assert.equal(safeUrl('http://sab:8080/api?mode=queue&apikey=SECRET'), 'http://sab:8080/api');
  assert.equal(safeUrl('http://user:pw@pihole/admin/api.php?auth=x'), 'http://pihole/admin/api.php');
});
