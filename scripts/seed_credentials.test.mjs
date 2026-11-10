// Bootstrap-credential configuration (S2: fail closed).
//
// ensureSeed() seeds the admin/demo bootstrap accounts ONLY from operator-provided
// env secrets (ADMIN_INITIAL_PASSWORD / DEMO_INITIAL_PASSWORD, min 8 chars).
// There is no fallback password written in the source: without the env vars the
// accounts do not exist at all, and an empty/non-string override seeds nothing.
//
// boot() memoizes the seed, so each case needs its own module instance. Node caches
// module imports by URL, and a base64 data: URL of the same source is the same URL,
// so a unique trailing comment per instance is what actually forces a fresh module.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');

let instanceCount = 0;
async function freshWorker() {
  const unique = `${source}\n// fresh worker instance ${++instanceCount}\n`;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(unique).toString('base64')}`);
  return mod.default;
}

const HOST = 'https://localhost';

function login(worker, env, email, password) {
  return worker.fetch(new Request(`${HOST}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }), env);
}

// The passwords that used to be written in cf_worker.js. They must never work now.
const REVOKED_ADMIN_PASSWORD = 'LunoAdmin#2026!';
const REVOKED_DEMO_PASSWORD = 'LunoUser#2026!';

test('a configured ADMIN_INITIAL_PASSWORD seeds the admin account', async () => {
  const worker = await freshWorker();
  const configured = 'OperatorChosen#Admin$2026';
  const env = { ADMIN_INITIAL_PASSWORD: configured };

  const accepted = await login(worker, env, 'admin@luno.local', configured);
  assert.equal(accepted.status, 200, 'the configured admin password must be accepted');
  assert.ok((await accepted.json()).access_token, 'a session should be issued');

  const rejected = await login(worker, env, 'admin@luno.local', REVOKED_ADMIN_PASSWORD);
  assert.equal(rejected.status, 401,
    'the old source password must no longer work');
});

test('a configured DEMO_INITIAL_PASSWORD seeds the demo account', async () => {
  const worker = await freshWorker();
  const configured = 'OperatorChosen#Demo$2026';
  const env = { DEMO_INITIAL_PASSWORD: configured };

  const accepted = await login(worker, env, 'user@luno.local', configured);
  assert.equal(accepted.status, 200, 'the configured demo password must be accepted');

  const rejected = await login(worker, env, 'user@luno.local', REVOKED_DEMO_PASSWORD);
  assert.equal(rejected.status, 401,
    'the old source password must no longer work');
});

test('with nothing configured, bootstrap accounts do not exist (fail closed)', async () => {
  // S2: there is no source fallback anymore. With nothing configured the
  // bootstrap accounts do not exist, so every password is rejected.
  const worker = await freshWorker();
  const env = {};
  assert.equal((await login(worker, env, 'admin@luno.local', REVOKED_ADMIN_PASSWORD)).status, 401);
  assert.equal((await login(worker, env, 'user@luno.local', REVOKED_DEMO_PASSWORD)).status, 401);
  assert.equal((await login(worker, env, 'admin@luno.local', 'anything-at-all')).status, 401);
});

test('an empty or non-string override seeds nothing', async () => {
  // An unset Cloudflare variable can arrive as '' rather than undefined.
  // It must seed nothing: neither the empty password nor any fallback works.
  for (const value of ['', null, undefined, 0]) {
    const worker = await freshWorker();
    const env = { ADMIN_INITIAL_PASSWORD: value };
    assert.equal(
      (await login(worker, env, 'admin@luno.local', REVOKED_ADMIN_PASSWORD)).status, 401,
      `ADMIN_INITIAL_PASSWORD=${JSON.stringify(value)} must not fall back to a source password`,
    );
    assert.equal(
      (await login(worker, env, 'admin@luno.local', '')).status, 401,
      'an empty password must never authenticate',
    );
  }
});
