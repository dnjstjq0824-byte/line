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
  const database = { prepare(sql) { queries.push(sql); return { async first() { return { ready: 1 }; } }; } };
  const ready = await probe('/readyz', database);
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).checks.database, 'healthy');
  assert.deepEqual(queries, ['SELECT 1 AS ready']);
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
