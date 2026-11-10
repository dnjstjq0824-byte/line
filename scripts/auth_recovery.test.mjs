import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { makeD1 } from './test_helpers.mjs';

// Item 7: password recovery actually works (Go parity). The worker mints a
// single-use 15-minute challenge and returns the code inline (no email
// sender is configured — same documented dev-mode contract as Go); verify
// resets the password and revokes every session. Challenges live in D1 when
// bound so verify survives cross-isolate reads, memory otherwise.
const viewSource = await readFile(new URL('../apps/user-web/src/views/AuthView.vue', import.meta.url), 'utf8');
const i18nSource = await readFile(new URL('../apps/user-web/src/luno-i18n.ts', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
const inventorySource = await readFile(new URL('./zero_store_inventory.test.mjs', import.meta.url), 'utf8');

function memoryApi(worker) {
  const env = { ADMIN_INITIAL_PASSWORD: 'Worker#Admin1', DEMO_INITIAL_PASSWORD: 'Worker#Demo12' };
  return (path, token, method = 'GET', body) => worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
}

async function memoryWorker() {
  const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);
  return worker;
}

async function register(api, email) {
  const reg = await api('auth/register', null, 'POST', { email, password: 'Str0ng!Passw0rd', display_name: email, handle: email.split('@')[0] });
  assert.equal(reg.status, 201);
  return (await reg.json()).id;
}

async function login(api, email, password) {
  const res = await api('auth/login', null, 'POST', { email, password });
  assert.equal(res.status, 200);
  return (await res.json()).access_token;
}

test('full reset flow: recover, verify, new password logs in, old does not', async () => {
  const api = memoryApi(await memoryWorker());
  await register(api, 'rc-flow@luno-test.local');
  const rec = await api('auth/recover', null, 'POST', { email: 'rc-flow@luno-test.local' });
  assert.equal(rec.status, 200);
  const { status, challenge_id, recovery_code } = await rec.json();
  assert.equal(status, 'recovery_token_sent_if_account_exists');
  assert.ok(challenge_id && recovery_code && recovery_code.length >= 16);
  const done = await api('auth/recover/verify', null, 'POST', { challenge_id, recovery_code, new_password: 'N3w!RecoveryPass' });
  assert.equal(done.status, 200);
  assert.equal((await done.json()).status, 'password_reset');
  await login(api, 'rc-flow@luno-test.local', 'N3w!RecoveryPass');
  assert.equal((await api('auth/login', null, 'POST', { email: 'rc-flow@luno-test.local', password: 'Str0ng!Passw0rd' })).status, 401);
});

test('unknown email gets the same status with no challenge (no enumeration)', async () => {
  const api = memoryApi(await memoryWorker());
  const rec = await api('auth/recover', null, 'POST', { email: 'nobody-here@luno-test.local' });
  assert.equal(rec.status, 200);
  const body = await rec.json();
  assert.equal(body.status, 'recovery_token_sent_if_account_exists');
  assert.equal(body.challenge_id, undefined);
  assert.equal(body.recovery_code, undefined);
  assert.equal((await api('auth/recover', null, 'POST', { email: 'not-an-email' })).status, 400);
});

test('verify rejects bad codes, short passwords, and replayed challenges', async () => {
  const api = memoryApi(await memoryWorker());
  await register(api, 'rc-neg@luno-test.local');
  const { challenge_id, recovery_code } = await (await api('auth/recover', null, 'POST', { email: 'rc-neg@luno-test.local' })).json();
  assert.equal((await api('auth/recover/verify', null, 'POST', { challenge_id, recovery_code: 'wrong-code-00000000', new_password: 'N3w!RecoveryPass' })).status, 401);
  assert.equal((await api('auth/recover/verify', null, 'POST', { challenge_id: 'no-such-id', recovery_code, new_password: 'N3w!RecoveryPass' })).status, 401);
  assert.equal((await api('auth/recover/verify', null, 'POST', { challenge_id, recovery_code, new_password: 'short' })).status, 400);
  assert.equal((await api('auth/recover/verify', null, 'POST', { challenge_id })).status, 400);
  assert.equal((await api('auth/recover/verify', null, 'POST', { challenge_id, recovery_code, new_password: 'N3w!RecoveryPass' })).status, 200);
  assert.equal((await api('auth/recover/verify', null, 'POST', { challenge_id, recovery_code, new_password: 'Another!Pass12' })).status, 409);
});

test('reset revokes every existing session', async () => {
  const api = memoryApi(await memoryWorker());
  await register(api, 'rc-revoke@luno-test.local');
  const before = await login(api, 'rc-revoke@luno-test.local', 'Str0ng!Passw0rd');
  assert.equal((await api('me', before)).status, 200);
  const { challenge_id, recovery_code } = await (await api('auth/recover', null, 'POST', { email: 'rc-revoke@luno-test.local' })).json();
  assert.equal((await api('auth/recover/verify', null, 'POST', { challenge_id, recovery_code, new_password: 'N3w!RecoveryPass' })).status, 200);
  assert.equal((await api('me', before)).status, 401);
});

let d1Serial = 0;
async function d1Isolate(db) {
  const { default: worker } = await import(`./cf_worker.js?recovery=${++d1Serial}`);
  const env = { ADMIN_INITIAL_PASSWORD: 'Worker#Admin1', DEMO_INITIAL_PASSWORD: 'Worker#Demo12', DB: db };
  return (path, token, method = 'GET', body) => worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
}

test('D1 challenges verify across isolates; expired challenges fail closed', async () => {
  const db = makeD1();
  try {
    const first = await d1Isolate(db);
    await register(first, 'rc-d1@luno-test.local');
    const { challenge_id, recovery_code } = await (await first('auth/recover', null, 'POST', { email: 'rc-d1@luno-test.local' })).json();
    assert.ok(challenge_id);
    const second = await d1Isolate(db);
    assert.equal((await second('auth/recover/verify', null, 'POST', { challenge_id, recovery_code, new_password: 'N3w!RecoveryPass' })).status, 200);
    await login(second, 'rc-d1@luno-test.local', 'N3w!RecoveryPass');
    const again = await (await first('auth/recover', null, 'POST', { email: 'rc-d1@luno-test.local' })).json();
    db.raw.exec(`UPDATE luno_recovery_challenges SET expires_at = 1 WHERE id = '${again.challenge_id}'`);
    assert.equal((await second('auth/recover/verify', null, 'POST', { challenge_id: again.challenge_id, recovery_code: again.recovery_code, new_password: 'Another!Pass12' })).status, 401);
  } finally { db.raw.close(); }
});

test('recovery challenges are a classified ephemeral store', () => {
  assert.ok(workerSource.includes('const recoveryChallenges = new Map()'));
  assert.ok(/EPHEMERAL = new Set\(\[[\s\S]*?'recoveryChallenges'/.test(inventorySource));
});

test('login view opens a real recovery dialog instead of the coming-soon toast', () => {
  assert.ok(!viewSource.includes("@click=\"note = t('soon_tag')\""));
  assert.ok(viewSource.includes('showRecoverModal'));
  assert.ok(viewSource.includes('auth/recover/verify'));
  assert.match(viewSource, /auth\/recover'[^v]/);
});

test('recovery dialog strings exist in all four locales', () => {
  for (const key of ['mvRecoverTitle', 'mvRecoverEmail', 'mvRecoverSend', 'mvRecoverCode', 'mvRecoverCodeHint', 'mvRecoverNewPw', 'mvRecoverReset', 'mvRecoverDone', 'mvRecoverCancel']) {
    const hits = i18nSource.match(new RegExp(key + '\\b', 'g')) || [];
    assert.equal(hits.length, 4, key);
  }
});
