// B4/A-24: E2EE key bundles persist in D1 e2ee_keys (not isolate memory).
// One-time prekeys are consumed persistently; bundles survive a redeploy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from './test_helpers.mjs';

const BASE = 'https://localhost';

let isoCounter = 9300;
async function isolate(database) {
  const db = database || makeD1();
  const mod = await import(`./cf_worker.js?e2ee=${++isoCounter}`);
  const env = { DB: db };
  const api = (path, method = 'GET', body = null, token = null, headers = {}) => mod.default.fetch(new Request(`${BASE}/api/v1/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === null ? undefined : JSON.stringify(body)
  }), env);
  return { api, db };
}
async function signup(api, email, handle) {
  const reg = await api('auth/register', 'POST', { email, password: 'E2e#Keypass9', display_name: handle, handle });
  assert.equal(reg.status, 201, `register ${email}`);
  const login = await api('auth/login', 'POST', { email, password: 'E2e#Keypass9' });
  assert.equal(login.status, 200, `login ${email}`);
  return { id: (await reg.json()).id, ...(await login.json()) };
}
const BUNDLE = {
  identity_key: 'ed25519-pub-abc', signed_prekey: 'x25519-spk-xyz', prekey_sig: 'sig-valid',
  one_time_prekeys: ['otk-1', 'otk-2'],
};

test('B4: bundles persist, consume one-time prekeys, and survive redeploy', async () => {
  const { api, db } = await isolate();
  const a = await signup(api, 'e2e-a@local.test', 'e2ea');
  const b = await signup(api, 'e2e-b@local.test', 'e2eb');
  assert.equal((await api('devices/d-web/keys', 'PUT', BUNDLE, a.access_token)).status, 200);
  const row = db.raw.prepare('SELECT * FROM e2ee_keys WHERE user_id = ?').get(a.id);
  assert.ok(row, 'bundle persisted to D1');
  assert.equal(row.identity_key, 'ed25519-pub-abc');
  assert.equal(row.prekey_sig, 'sig-valid');

  const first = await (await api(`users/${a.id}/keys`, 'GET', null, b.access_token)).json();
  assert.equal(first.identity_key, 'ed25519-pub-abc');
  assert.equal(first.one_time_prekey, 'otk-1');
  const second = await (await api(`users/${a.id}/keys`, 'GET', null, b.access_token)).json();
  assert.equal(second.one_time_prekey, 'otk-2', 'consumption is persistent');
  const third = await (await api(`users/${a.id}/keys`, 'GET', null, b.access_token)).json();
  assert.equal(third.one_time_prekey, null);

  // A fresh isolate (redeploy) sees the same D1 bundle.
  const redeployed = await isolate(db);
  const c = await signup(redeployed.api, 'e2e-c@local.test', 'e2ec');
  const after = await (await redeployed.api(`users/${a.id}/keys`, 'GET', null, c.access_token)).json();
  assert.equal(after.identity_key, 'ed25519-pub-abc');
});

test('B4: key routes validate input and fail closed', async () => {
  const { api } = await isolate();
  const a = await signup(api, 'e2e2-a@local.test', 'e2e2a');
  assert.equal((await api('devices/d-web/keys', 'PUT', { signed_prekey: 'x' }, a.access_token)).status, 400);
  assert.equal((await api('users/never-registered/keys', 'GET', null, a.access_token)).status, 404);
});
