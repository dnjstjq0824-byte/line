// Seeded-credential configuration.
//
// ensureSeed() runs at module scope. It used to read the override as
// `typeof env !== 'undefined' && env?.ADMIN_INITIAL_PASSWORD`, but `env` is never
// bound at module scope, so that guard was always false: ADMIN_INITIAL_PASSWORD and
// DEMO_INITIAL_PASSWORD were silently ignored and the password written in
// cf_worker.js was the only admin credential there was. An operator who set the
// documented variable had every reason to believe they had rotated it.
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

// The passwords that cf_worker.js falls back to when nothing is configured.
const SOURCE_ADMIN_PASSWORD = 'LunoAdmin#RotatedEdge$99xK';
const SOURCE_DEMO_PASSWORD = 'LunoUser#Rotated$72mP';

test('a configured ADMIN_INITIAL_PASSWORD replaces the one written in the source', async () => {
  const worker = await freshWorker();
  const configured = 'OperatorChosen#Admin$2026';
  const env = { ALLOW_LOCAL_DEMO: 'true', ADMIN_INITIAL_PASSWORD: configured };

  const accepted = await login(worker, env, 'admin@line.local', configured);
  assert.equal(accepted.status, 200, 'the configured admin password must be accepted');
  assert.ok((await accepted.json()).access_token, 'a session should be issued');

  const rejected = await login(worker, env, 'admin@line.local', SOURCE_ADMIN_PASSWORD);
  assert.equal(rejected.status, 401,
    'once overridden, the password written in cf_worker.js must no longer work');
});

test('a configured DEMO_INITIAL_PASSWORD replaces the one written in the source', async () => {
  const worker = await freshWorker();
  const configured = 'OperatorChosen#Demo$2026';
  const env = { ALLOW_LOCAL_DEMO: 'true', DEMO_INITIAL_PASSWORD: configured };

  const accepted = await login(worker, env, 'user@line.local', configured);
  assert.equal(accepted.status, 200, 'the configured demo password must be accepted');

  const rejected = await login(worker, env, 'user@line.local', SOURCE_DEMO_PASSWORD);
  assert.equal(rejected.status, 401,
    'once overridden, the password written in cf_worker.js must no longer work');
});

test('the source fallback applies only when nothing is configured', async () => {
  const worker = await freshWorker();
  const env = { ALLOW_LOCAL_DEMO: 'true' };
  assert.equal((await login(worker, env, 'admin@line.local', SOURCE_ADMIN_PASSWORD)).status, 200);
  assert.equal((await login(worker, env, 'user@line.local', SOURCE_DEMO_PASSWORD)).status, 200);
});

test('an empty or non-string override does not silently lock the account out', async () => {
  // An unset Cloudflare variable can arrive as '' rather than undefined. Falling
  // through to the documented fallback is right; seeding an empty password is not.
  for (const value of ['', null, undefined, 0]) {
    const worker = await freshWorker();
    const env = { ALLOW_LOCAL_DEMO: 'true', ADMIN_INITIAL_PASSWORD: value };
    assert.equal(
      (await login(worker, env, 'admin@line.local', SOURCE_ADMIN_PASSWORD)).status, 200,
      `ADMIN_INITIAL_PASSWORD=${JSON.stringify(value)} should fall back to the source password`,
    );
    assert.equal(
      (await login(worker, env, 'admin@line.local', '')).status, 401,
      'an empty password must never authenticate',
    );
  }
});
