// E9 (F11): passphrase-encrypted backup blob store. The server keeps the
// blob and never sees the passphrase; blobs are strictly per-user.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, F24_CONSENT } from './test_helpers.mjs';

let serial = 0;
async function isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?e9=${++serial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api };
}
const PW = 'Str0ng!Passw0rd';
async function regLogin(api, email) {
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
  assert.equal(reg.status, 201, `register ${email}`);
  const id = (await reg.json()).id;
  const token = (await (await api('auth/login', 'POST', { email, password: PW })).json()).access_token;
  return { id, token };
}
const BLOB = { v: 1, salt: 'c2FsdA', iv: 'aXY', ct: 'Y2lwaGVy' };

test('E9: backup round-trips per user, absent reads null', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e9b-a@luno-test.local');
    const b = await regLogin(api, 'e9b-b@luno-test.local');
    assert.equal((await (await api('e2ee/backup', 'GET', null, a.token)).json()).backup, null);
    const put = await api('e2ee/backup', 'PUT', { blob: BLOB }, a.token);
    assert.equal(put.status, 200);
    assert.equal((await put.json()).status, 'backup_stored');
    const got = await (await api('e2ee/backup', 'GET', null, a.token)).json();
    assert.deepEqual(got.backup, BLOB);
    assert.ok(got.byte_len > 0 && typeof got.updated_at === 'string');
    assert.equal((await (await api('e2ee/backup', 'GET', null, b.token)).json()).backup, null);
    assert.equal((await api('e2ee/backup', 'DELETE', null, a.token)).status, 200);
    assert.equal((await (await api('e2ee/backup', 'GET', null, a.token)).json()).backup, null);
  } finally { db.raw.close(); }
});

test('E9: device add and remove announce to E2EE rooms', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e9d-a@luno-test.local');
    const b = await regLogin(api, 'e9d-b@luno-test.local');
    const dm = await (await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
    assert.equal((await api('devices/dd1/keys', 'PUT', { identity_key: 'ik-1' }, a.token)).status, 200);
    assert.equal((await api('devices/dd1/keys', 'DELETE', null, a.token)).status, 200);
    const msgs = await (await api(`conversations/${dm.id}/messages?limit=10`, 'GET', null, b.token)).json();
    const actions = msgs.messages.filter((m) => m.kind === 'security_notice').map((m) => m.metadata?.e2ee_action);
    assert.ok(actions.includes('added'), 'peer sees device-added notice');
    assert.ok(actions.includes('removed'), 'peer sees device-removed notice');
  } finally { db.raw.close(); }
});

test('E9: device lists show identities without consuming prekeys', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e9l-a@luno-test.local');
    const b = await regLogin(api, 'e9l-b@luno-test.local');
    assert.equal((await api('devices/dl1/keys', 'PUT', { identity_key: 'ik-1', one_time_prekeys: ['o1'] }, a.token)).status, 200);
    assert.equal((await api('devices/dl2/keys', 'PUT', { identity_key: 'ik-2' }, a.token)).status, 200);
    const mine = await (await api('me/e2ee-devices', 'GET', null, a.token)).json();
    assert.deepEqual(mine.devices.map((d) => d.device_id).sort(), ['dl1', 'dl2']);
    assert.ok(mine.devices.every((d) => typeof d.identity_key === 'string' && typeof d.updated_at === 'string'));
    const peer = await (await api(`users/${a.id}/e2ee-devices`, 'GET', null, b.token)).json();
    assert.equal(peer.devices.length, 2);
    const bundle = await (await api(`users/${a.id}/keys?all=1`, 'GET', null, b.token)).json();
    assert.ok(bundle.devices.some((d) => d.one_time_prekey === 'o1'), 'listing consumed nothing');
  } finally { db.raw.close(); }
});

test('E9: backup validates shape and size', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e9v-a@luno-test.local');
    assert.equal((await api('e2ee/backup', 'PUT', { blob: { v: 1 } }, a.token)).status, 400);
    assert.equal((await api('e2ee/backup', 'PUT', { blob: { ...BLOB, v: 2 } }, a.token)).status, 400);
    assert.equal((await api('e2ee/backup', 'PUT', {}, a.token)).status, 400);
    const big = await api('e2ee/backup', 'PUT', { blob: { ...BLOB, ct: 'x'.repeat(300 * 1024) } }, a.token);
    assert.equal(big.status, 413);
    assert.equal((await big.json()).code, 'BACKUP_TOO_LARGE');
    assert.equal((await api('e2ee/backup', 'GET', null, null)).status, 401);
  } finally { db.raw.close(); }
});
