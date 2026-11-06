import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const env = { ALLOW_LOCAL_DEMO: 'true' };
const probe = (path, DB) => worker.fetch(new Request('http://localhost' + path), { ...env, ...(DB ? { DB } : {}) });

test('standalone readiness requires an actual database read and never boots or seeds storage', async () => {
  assert.equal((await probe('/readyz')).status, 503);
  let queries = [];
  const database = { prepare(sql) { queries.push(sql); return { async first() { return { ready: 1 }; }, async all() { return { results: [] }; } }; } };
  const ready = await probe('/readyz', database);
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).checks.database, 'healthy');
  assert.equal(queries.length, 2);
  assert.equal(queries[0], 'SELECT 1 AS ready');
  // Every required table is named, and LIMIT 0 keeps the probe at zero rows read.
  for (const table of ['users', 'wallets', 'luno_sessions', 'luno_messages', 'luno_read_cursors', 'luno_attachments', 'luno_ws_tickets', 'luno_audit']) assert.match(queries[1], new RegExp(`\\b${table}\\b`));
  assert.match(queries[1], /LIMIT 0$/);
  assert.doesNotMatch(queries[1], /sqlite_master/);
});

test('a reachable database with missing application tables is not ready', async () => {
  const database = { prepare() { return { async first() { return { ready: 1 }; }, async all() { throw new Error('D1_ERROR: no such table: luno_audit: SQLITE_ERROR'); } }; } };
  const ready = await probe('/readyz', database);
  assert.equal(ready.status, 503);
  assert.equal((await ready.json()).checks.schema, 'missing_required_tables');
});

test('database failures fail readiness while liveness remains available', async () => {
  const database = { prepare() { throw new Error('Database offline'); } };
  const ready = await probe('/readyz', database);
  assert.equal(ready.status, 503);
  assert.equal((await ready.json()).checks.database, 'unavailable');
  assert.equal((await probe('/healthz', database)).status, 200);
  const empty = await probe('/readyz', { prepare() { return { async first() { return null; } }; } });
  assert.equal(empty.status, 503);
});
