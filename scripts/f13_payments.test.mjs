// Stage 10 (F13): money stays off unless PAYMENTS_ENABLED=true. Charge,
// send and store orders answer 503 + PAYMENTS_DISABLED by default with zero
// balance movement; the flag re-enables the mechanics. Accounts carry a
// plan (default personal) and /version advertises the switch for clients.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket } from './test_helpers.mjs';

let f13Serial = 0;
async function f13Isolate(db, bucket, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f13=${++f13Serial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', ...(bucket ? { MEDIA_BUCKET: bucket } : {}), ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api };
}

const PW = 'Str0ng!Passw0rd';

async function registerLogin(api, email) {
  const reg = await api('auth/register', 'POST', { email, password: PW, display_name: email.split('@')[0] });
  assert.equal(reg.status, 201);
  const s = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(s.status, 200);
  const sess = await s.json();
  return { ...(await reg.json()), ...sess, token: sess.access_token };
}

test('F13: money routes fail closed by default with zero movement', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f13Isolate(db, bucket);
    const a = await registerLogin(api, 'f13-a@luno-test.local');
    const b = await registerLogin(api, 'f13-b@luno-test.local');
    await api('friends', 'POST', { friend_id: b.id }, a.token);
    db.raw.prepare('UPDATE wallets SET balance = 10000 WHERE user_id = ?').run(a.id);
    for (const [path, payload] of [
      ['wallet/charge', { amount: 5000 }],
      ['wallet/send', { to_user_id: b.id, amount: 1000 }],
      ['store/orders', { pack_id: 'pack-1' }],
    ]) {
      const res = await api(path, 'POST', payload, a.token);
      assert.equal(res.status, 503, path);
      assert.equal((await res.json()).code, 'PAYMENTS_DISABLED', path);
    }
    assert.equal(db.raw.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(a.id).balance, 10000, 'no movement');
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM wallet_transactions').get().n, 0, 'no ledger rows');
    assert.equal((await (await api('version', 'GET', null, a.token)).json()).payments_enabled, false);
    assert.equal((await (await api('me', 'GET', null, a.token)).json()).plan, 'personal');
  } finally { db.raw.close(); }
});

test('F13: the flag re-enables the mechanics, nothing else', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f13Isolate(db, bucket, { PAYMENTS_ENABLED: 'true' });
    const a = await registerLogin(api, 'f13-c@luno-test.local');
    const b = await registerLogin(api, 'f13-d@luno-test.local');
    await api('friends', 'POST', { friend_id: b.id }, a.token);
    assert.equal((await api('wallet/charge', 'POST', { amount: 5000 }, a.token)).status, 201);
    assert.equal((await api('wallet/send', 'POST', { to_user_id: b.id, amount: 1000 }, a.token)).status, 201);
    assert.equal((await api('store/orders', 'POST', { pack_id: 'pack-1' }, a.token)).status, 201);
    assert.equal((await (await api('version', 'GET', null, a.token)).json()).payments_enabled, true);
    assert.equal(db.raw.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(a.id).balance, 1500, '5000 - 1000 - 2500');
  } finally { db.raw.close(); }
});
