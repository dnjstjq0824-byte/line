// Audit P1-2: rate_limits TTL + atomic upsert (no SELECT-then-INSERT race).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket } from './test_helpers.mjs';

const BASE = 'https://localhost';

let isoCounter = 9100;
async function isolate(database) {
  const db = database || makeD1();
  const mod = await import(`./cf_worker.js?rlttl=${++isoCounter}`);
  const env = { DB: db, MEDIA_BUCKET: makeBucket() };
  const api = (path, method = 'GET', body = null, token = null, headers = {}) => mod.default.fetch(new Request(`${BASE}/api/v1/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === null ? undefined : JSON.stringify(body)
  }), env);
  return { api, db };
}

test('P1-2: first rate-limited call sweeps expired windows, keeps the current one', async () => {
  const { api, db } = await isolate();
  // version boots the schema (ensureSchema) without touching rateLimit.
  assert.equal((await api('version')).status, 200);
  const windowStart = Math.floor(Date.now() / 60000);
  db.raw.prepare('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, ?)').run('rl:stale-a', windowStart - 100, 60);
  db.raw.prepare('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, ?)').run('rl:stale-b', windowStart - 1, 3);
  db.raw.prepare('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, ?)').run('rl:current-keep', windowStart, 7);
  // Junk refresh is cheap (401) and counts against rl:refresh — first
  // rateLimit call in this isolate, so the TTL sweep must fire now.
  assert.equal((await api('auth/refresh', 'POST', { refresh_token: 'junk' })).status, 401);
  const rows = db.raw.prepare('SELECT key, window_start, count FROM rate_limits').all();
  const keys = rows.map((r) => r.key);
  assert.ok(!keys.includes('rl:stale-a'), '100-minute-old window swept');
  assert.ok(!keys.includes('rl:stale-b'), 'previous window swept');
  assert.ok(keys.includes('rl:current-keep'), 'current window row kept');
  assert.equal(rows.find((r) => r.key === 'rl:current-keep').count, 7, 'kept row untouched');
  assert.ok(keys.some((k) => k.startsWith('rl:refresh:')), 'current call recorded');
});

test('P1-2: concurrent hits count exactly — 120 open, rest 429, no lost increments', async () => {
  const { api } = await isolate();
  const results = await Promise.all(
    Array.from({ length: 130 }, () => api('auth/refresh', 'POST', { refresh_token: 'junk' }).then((r) => r.status))
  );
  const open = results.filter((s) => s === 401).length;
  const capped = results.filter((s) => s === 429).length;
  assert.equal(open, 120, `exactly the cap stays open (got ${open})`);
  assert.equal(capped, 10, `the overflow is 429 (got ${capped})`);
});
