import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { makeD1 } from './test_helpers.mjs';

// Item 7: password recovery actually works (Go parity). S1 contract: the
// single-use code is NEVER in the HTTP response. Without a configured mail
// sender the endpoint fails closed (501); with the mock sender the code is
// delivered to the mock outbox and the client completes the flow with the
// challenge id from the 202 response plus the out-of-band code. Challenges
// live in D1 when bound so verify survives cross-isolate reads, memory
// otherwise.
const viewSource = await readFile(new URL('../apps/user-web/src/views/AuthView.vue', import.meta.url), 'utf8');
const i18nSource = await readFile(new URL('../apps/user-web/src/luno-i18n.ts', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
const inventorySource = await readFile(new URL('./zero_store_inventory.test.mjs', import.meta.url), 'utf8');

function memoryApi(worker, outbox) {
  const env = { ADMIN_INITIAL_PASSWORD: 'Worker#Admin1', DEMO_INITIAL_PASSWORD: 'Worker#Demo12', RECOVERY_MAIL_PROVIDER: 'mock' };
  const api = (path, token, method = 'GET', body) => worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
  return { api, outbox };
}

let memorySerial = 0;
async function memoryWorker() {
  // A trailing comment keeps every data-URL import a distinct module, so each
  // test gets a fresh isolate (memory state and mock outbox).
  const src = `${workerSource}\n// memory isolate ${++memorySerial}\n`;
  const ns = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
  return memoryApi(ns.default, ns.recoveryMailOutbox);
}

function mockCode(outbox, email) {
  const found = [...outbox].reverse().find((m) => m.email === email);
  assert.ok(found, `mock mail delivered to ${email}`);
  return found.code;
}

async function register(api, email) {
  const reg = await api('auth/register', null, 'POST', { email, password: 'Str0ng!Passw0rd', display_name: email, handle: email.split('@')[0].replace(/[^a-z0-9_.]/g, '_') });
  assert.equal(reg.status, 201);
  return (await reg.json()).id;
}

async function login(api, email, password) {
  const res = await api('auth/login', null, 'POST', { email, password });
  assert.equal(res.status, 200);
  return (await res.json()).access_token;
}

test('full reset flow: recover, verify, new password logs in, old does not', async () => {
  const { api, outbox } = await memoryWorker();
  await register(api, 'rc-flow@luno-test.local');
  const rec = await api('auth/recover', null, 'POST', { email: 'rc-flow@luno-test.local' });
  assert.equal(rec.status, 202);
  const { status, challenge_id, recovery_code } = await rec.json();
  assert.equal(status, 'recovery_token_sent_if_account_exists');
  assert.ok(challenge_id, 'challenge id returned');
  assert.equal(recovery_code, undefined, 'code never in the response');
  const done = await api('auth/recover/verify', null, 'POST', { challenge_id, recovery_code: mockCode(outbox, 'rc-flow@luno-test.local'), new_password: 'N3w!RecoveryPass' });
  assert.equal(done.status, 200);
  assert.equal((await done.json()).status, 'password_reset');
  await login(api, 'rc-flow@luno-test.local', 'N3w!RecoveryPass');
  assert.equal((await api('auth/login', null, 'POST', { email: 'rc-flow@luno-test.local', password: 'Str0ng!Passw0rd' })).status, 401);
});

test('unknown email answers exactly like a known one (no enumeration)', async () => {
  const { api, outbox } = await memoryWorker();
  await register(api, 'rc-known@luno-test.local');
  const known = await (await api('auth/recover', null, 'POST', { email: 'rc-known@luno-test.local' })).json();
  const rec = await api('auth/recover', null, 'POST', { email: 'nobody-here@luno-test.local' });
  assert.equal(rec.status, 202);
  const body = await rec.json();
  assert.deepEqual(Object.keys(body).sort(), Object.keys(known).sort(), 'same response shape');
  assert.equal(body.status, 'recovery_token_sent_if_account_exists');
  assert.ok(body.challenge_id && body.challenge_id !== known.challenge_id, 'decoy challenge id');
  assert.equal(body.recovery_code, undefined);
  assert.equal(outbox.length, 1, 'no mail sent for the unknown email');
  assert.equal((await api('auth/recover', null, 'POST', { email: 'not-an-email' })).status, 400);
});

test('verify rejects bad codes, short passwords, and replayed challenges', async () => {
  const { api, outbox } = await memoryWorker();
  await register(api, 'rc-neg@luno-test.local');
  const { challenge_id } = await (await api('auth/recover', null, 'POST', { email: 'rc-neg@luno-test.local' })).json();
  const recovery_code = mockCode(outbox, 'rc-neg@luno-test.local');
  assert.equal((await api('auth/recover/verify', null, 'POST', { challenge_id, recovery_code: 'wrong-code-00000000', new_password: 'N3w!RecoveryPass' })).status, 401);
  assert.equal((await api('auth/recover/verify', null, 'POST', { challenge_id: 'no-such-id', recovery_code, new_password: 'N3w!RecoveryPass' })).status, 401);
  assert.equal((await api('auth/recover/verify', null, 'POST', { challenge_id, recovery_code, new_password: 'short' })).status, 400);
  assert.equal((await api('auth/recover/verify', null, 'POST', { challenge_id })).status, 400);
  assert.equal((await api('auth/recover/verify', null, 'POST', { challenge_id, recovery_code, new_password: 'N3w!RecoveryPass' })).status, 200);
  assert.equal((await api('auth/recover/verify', null, 'POST', { challenge_id, recovery_code, new_password: 'Another!Pass12' })).status, 409);
});

test('reset revokes every existing session', async () => {
  const { api, outbox } = await memoryWorker();
  await register(api, 'rc-revoke@luno-test.local');
  const before = await login(api, 'rc-revoke@luno-test.local', 'Str0ng!Passw0rd');
  assert.equal((await api('me', before)).status, 200);
  const { challenge_id } = await (await api('auth/recover', null, 'POST', { email: 'rc-revoke@luno-test.local' })).json();
  assert.equal((await api('auth/recover/verify', null, 'POST', { challenge_id, recovery_code: mockCode(outbox, 'rc-revoke@luno-test.local'), new_password: 'N3w!RecoveryPass' })).status, 200);
  assert.equal((await api('me', before)).status, 401);
});

let d1Serial = 0;
async function d1Isolate(db) {
  const ns = await import(`./cf_worker.js?recovery=${++d1Serial}`);
  const env = { ADMIN_INITIAL_PASSWORD: 'Worker#Admin1', DEMO_INITIAL_PASSWORD: 'Worker#Demo12', RECOVERY_MAIL_PROVIDER: 'mock', DB: db };
  const api = (path, token, method = 'GET', body) => ns.default.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
  return { api, outbox: ns.recoveryMailOutbox };
}

test('D1 challenges verify across isolates; expired challenges fail closed', async () => {
  const db = makeD1();
  try {
    const first = await d1Isolate(db);
    await register(first.api, 'rc-d1@luno-test.local');
    const { challenge_id } = await (await first.api('auth/recover', null, 'POST', { email: 'rc-d1@luno-test.local' })).json();
    const recovery_code = mockCode(first.outbox, 'rc-d1@luno-test.local');
    assert.ok(challenge_id);
    const second = await d1Isolate(db);
    assert.equal((await second.api('auth/recover/verify', null, 'POST', { challenge_id, recovery_code, new_password: 'N3w!RecoveryPass' })).status, 200);
    await login(second.api, 'rc-d1@luno-test.local', 'N3w!RecoveryPass');
    const again = await (await first.api('auth/recover', null, 'POST', { email: 'rc-d1@luno-test.local' })).json();
    const againCode = mockCode(first.outbox, 'rc-d1@luno-test.local');
    db.raw.exec(`UPDATE luno_recovery_challenges SET expires_at = 1 WHERE id = '${again.challenge_id}'`);
    assert.equal((await second.api('auth/recover/verify', null, 'POST', { challenge_id: again.challenge_id, recovery_code: againCode, new_password: 'Another!Pass12' })).status, 401);
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
