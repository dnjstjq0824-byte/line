// E2 (F11): server key directory, per-device bundles, signature check,
// key-change notices, ciphertext-only enforcement, minimum app build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, randomBytes } from 'node:crypto';
import { makeD1, F24_CONSENT } from './test_helpers.mjs';

let serial = 0;
async function isolate(db, extraEnv = {}, headers = {}) {
  const mod = await import(`./cf_worker.js?e2=${++serial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null, more = {}) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers, ...more },
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
async function makeAdmin(db, email) {
  const { api } = await isolate(db);
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: 'admin' });
  assert.equal(reg.status, 201);
  const id = (await reg.json()).id;
  const adm = await isolate(db, { ADMIN_USER_IDS: id });
  const token = (await (await adm.api('auth/login', 'POST', { email, password: PW })).json()).access_token;
  return { api: adm.api, token, id };
}
const b64u = (buf) => Buffer.from(buf).toString('base64url');
function edKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const ed = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  return { publicKey, privateKey, ed };
}
function xKey() { return randomBytes(32); }

test('E2: device keys need ownership to delete; missing is 404', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e2d-a@luno-test.local');
    const b = await regLogin(api, 'e2d-b@luno-test.local');
    assert.equal((await api('devices/da1/keys', 'PUT', { identity_key: 'ik-a' }, a.token)).status, 200);
    assert.equal((await api('devices/da1/keys', 'DELETE', null, b.token)).status, 403);
    assert.equal((await api('devices/da1/keys', 'DELETE', null, a.token)).status, 200);
    assert.equal((await api('devices/da1/keys', 'DELETE', null, a.token)).status, 404);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM e2ee_keys WHERE user_id = ?').get(a.id).n, 0);
  } finally { db.raw.close(); }
});

test('E2: ?all=1 returns every device bundle, each consuming one prekey', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e2m-a@luno-test.local');
    const b = await regLogin(api, 'e2m-b@luno-test.local');
    assert.equal((await api('devices/d1/keys', 'PUT', { identity_key: 'ik-1', one_time_prekeys: ['a1', 'a2'] }, a.token)).status, 200);
    assert.equal((await api('devices/d2/keys', 'PUT', { identity_key: 'ik-2', one_time_prekeys: ['b1'] }, a.token)).status, 200);
    const all = await (await api(`users/${a.id}/keys?all=1`, 'GET', null, b.token)).json();
    assert.equal(all.devices.length, 2);
    assert.deepEqual(all.devices.map((d) => d.one_time_prekey).sort(), ['a1', 'b1']);
    const again = await (await api(`users/${a.id}/keys?all=1`, 'GET', null, b.token)).json();
    assert.deepEqual(again.devices.map((d) => d.one_time_prekey).sort(), ['a2', null]);
  } finally { db.raw.close(); }
});

test('E2: well-formed bundles with a bad prekey signature are rejected', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e2s-a@luno-test.local');
    const { privateKey, ed } = edKeys();
    const x = xKey();
    const spk = randomBytes(32);
    const good = sign(null, spk, privateKey).subarray(0, 64);
    const identity = `${b64u(x)}.${b64u(ed)}`;
    assert.equal((await api('devices/ds/keys', 'PUT', {
      identity_key: identity, signed_prekey: b64u(spk), prekey_sig: b64u(good),
    }, a.token)).status, 200);
    const badSig = Buffer.from(good);
    badSig[0] ^= 0xff;
    const res = await api('devices/ds2/keys', 'PUT', {
      identity_key: identity, signed_prekey: b64u(spk), prekey_sig: b64u(badSig),
    }, a.token);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'INVALID_PREKEY_SIG');
  } finally { db.raw.close(); }
});

test('E2: E2EE rooms take ciphertext only; bot rooms stay plaintext', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db, { E2EE_ENFORCED: 'true' });
    const a = await regLogin(api, 'e2e-a@luno-test.local');
    const b = await regLogin(api, 'e2e-b@luno-test.local');
    const dm = await (await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
    const plain = await api(`conversations/${dm.id}/messages`, 'POST', { body: 'hi' }, a.token);
    assert.equal(plain.status, 400);
    assert.equal((await plain.json()).code, 'E2EE_CIPHERTEXT_REQUIRED');
    assert.equal((await api(`conversations/${dm.id}/messages`, 'POST', { kind: 'ciphertext', body: 'enc' }, a.token)).status, 201);
    // Enforcement off: plaintext passes again.
    const off = await isolate(db);
    assert.equal((await off.api(`conversations/${dm.id}/messages`, 'POST', { body: 'hi' }, a.token)).status, 201);
    // A room with a bot member is exempt.
    const admin = await makeAdmin(db, 'e2e-admin@luno-test.local');
    const bot = await (await admin.api('admin/bots', 'POST', { display_name: 'Room Bot', handle: 'e2e_roombot' }, admin.token)).json();
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'g', member_ids: [b.id, bot.id] }, a.token)).json();
    assert.equal((await api(`conversations/${room.id}/messages`, 'POST', { body: 'bot room ok' }, a.token)).status, 201);
  } finally { db.raw.close(); }
});

test('E2: identity change posts a security notice and an audit row', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e2n-a@luno-test.local');
    const b = await regLogin(api, 'e2n-b@luno-test.local');
    const dm = await (await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
    assert.equal((await api('devices/dn/keys', 'PUT', { identity_key: 'ik-old' }, a.token)).status, 200);
    assert.equal((await api('devices/dn/keys', 'PUT', { identity_key: 'ik-new' }, a.token)).status, 200);
    const msgs = await (await api(`conversations/${dm.id}/messages?limit=10`, 'GET', null, b.token)).json();
    assert.ok(msgs.messages.some((m) => m.kind === 'security_notice'), 'peer sees the notice');
    const audit = db.raw.prepare("SELECT COUNT(*) n FROM luno_audit WHERE action = 'e2ee.key_change'").get();
    assert.equal(audit.n, 1);
  } finally { db.raw.close(); }
});

test('E2: below-minimum native builds get 426; feed stays open', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db, { APP_MIN_BUILD: '25' });
    const a = await regLogin(api, 'e2v-a@luno-test.local');
    const old = await api('me', 'GET', null, a.token, { 'X-App-Build': '20' });
    assert.equal(old.status, 426);
    assert.equal((await old.json()).code, 'APP_UPGRADE_REQUIRED');
    assert.equal((await api('me', 'GET', null, a.token, { 'X-App-Build': '25' })).status, 200);
    assert.equal((await api('me', 'GET', null, a.token)).status, 200, 'headerless callers pass');
    assert.equal((await api('app/latest', 'GET', null, null, { 'X-App-Build': '20' })).status, 200);
  } finally { db.raw.close(); }
});
