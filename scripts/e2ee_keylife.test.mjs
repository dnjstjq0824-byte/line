// E9 (F11): store export/import round-trip, safety numbers, verified
// marks, and complete wipes — through the real server API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, F24_CONSENT } from './test_helpers.mjs';
import { E2eeStore, MemoryKV } from '../apps/user-web/src/e2ee/store.ts';
import { formatSafetyNumber, safetyNumberDigits } from '../apps/shared/e2ee/keys.ts';

let serial = 0;
async function isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?e9s=${++serial}`);
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

test('E9: safety numbers match both ways, verify sticks, change flags', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e9n-a@luno-test.local');
    const b = await regLogin(api, 'e9n-b@luno-test.local');
    const apiA = (p, m, bo) => api(p, m || 'GET', bo || null, a.token).then((r) => r.json());
    const apiB = (p, m, bo) => api(p, m || 'GET', bo || null, b.token).then((r) => r.json());
    const alice = new E2eeStore({ kv: new MemoryKV(), api: apiA, userId: a.id, deviceId: 'w1' });
    const bob = new E2eeStore({ kv: new MemoryKV(), api: apiB, userId: b.id, deviceId: 'w2' });
    await alice.ready();
    await bob.ready();
    const ab = await alice.safetyNumbers(b.id);
    assert.equal(ab.length, 1);
    assert.match(ab[0].number, /^[0-9]{60}$/);
    assert.equal(ab[0].lines.length, 3);
    assert.ok(ab[0].lines.every((l) => l.replace(/ /g, '').length === 20));
    assert.equal(ab[0].verified, false);
    assert.equal(ab[0].changed, false);
    const ba = await bob.safetyNumbers(a.id);
    assert.equal(ba.length, 1);
    assert.equal(ba[0].number, ab[0].number, 'symmetric across peers');
    await alice.setVerified(b.id, 'w2', ab[0].edPub);
    assert.equal((await alice.safetyNumbers(b.id))[0].verified, true);
    // Bob re-registers with a fresh identity: Alice sees "changed".
    const bob2 = new E2eeStore({ kv: new MemoryKV(), api: apiB, userId: b.id, deviceId: 'w2' });
    await bob2.ready();
    const after = await alice.safetyNumbers(b.id);
    assert.equal(after[0].verified, false);
    assert.equal(after[0].changed, true);
    assert.notEqual(after[0].number, ab[0].number);
  } finally { db.raw.close(); }
});

test('E9: safety digits are order-independent and line-split', async () => {
  const x = new Uint8Array(32).map((_, i) => i);
  const y = new Uint8Array(32).map((_, i) => 255 - i);
  assert.equal(safetyNumberDigits(x, y), safetyNumberDigits(y, x));
  assert.match(safetyNumberDigits(x, y), /^[0-9]{60}$/);
  assert.deepEqual(formatSafetyNumber('0123456789'.repeat(6)).map((l) => l.replace(/ /g, '')), [
    '01234567890123456789',
    '01234567890123456789',
    '01234567890123456789',
  ]);
});

test('E9: export/import moves sessions to a new device', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e9m-a@luno-test.local');
    const b = await regLogin(api, 'e9m-b@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
    const ref = { id: room.id, kind: room.kind, memberIds: [a.id, b.id], e2ee: true };
    const apiA = (p, m, bo) => api(p, m || 'GET', bo || null, a.token).then((r) => r.json());
    const apiB = (p, m, bo) => api(p, m || 'GET', bo || null, b.token).then((r) => r.json());
    const alice = new E2eeStore({ kv: new MemoryKV(), api: apiA, userId: a.id, deviceId: 'w1' });
    const bob = new E2eeStore({ kv: new MemoryKV(), api: apiB, userId: b.id, deviceId: 'w2' });
    await alice.ready();
    await bob.ready();
    const ct1 = await alice.encryptRoom(ref, { kind: 'text', body: 'before backup' });
    assert.equal((await bob.decryptBody(a.id, ct1))?.body, 'before backup');
    const ctBack = await bob.encryptRoom(ref, { kind: 'text', body: 'bob reply held' });
    const snap = await alice.exportState();
    assert.equal(snap.v, 1);
    assert.ok(snap.identity && typeof snap.identity === 'object');
    assert.ok(Object.keys(snap.sessions).length >= 1, 'sessions exported');
    // Same-device reinstall: sessions restore, the held reply opens.
    const aliceR = new E2eeStore({ kv: new MemoryKV(), api: apiA, userId: a.id, deviceId: 'w1' });
    await aliceR.importState(snap);
    assert.equal((await aliceR.decryptBody(b.id, ctBack))?.body, 'bob reply held');
    // New device, same user: identity restores, sessions re-handshake.
    const alice2 = new E2eeStore({ kv: new MemoryKV(), api: apiA, userId: a.id, deviceId: 'w3' });
    await alice2.importState(snap);
    assert.equal(alice2.myIdentity(), alice.myIdentity(), 'identity restored');
    assert.equal(await alice2.decryptBody(b.id, ctBack), null, 'no forked session');
    const ct2 = await alice2.encryptRoom(ref, { kind: 'text', body: 'after restore' });
    assert.equal((await bob.decryptBody(a.id, ct2))?.body, 'after restore');
    // Guard rails: foreign users and shapeless payloads are refused.
    const mallory = new E2eeStore({ kv: new MemoryKV(), api: apiB, userId: b.id, deviceId: 'w9' });
    await assert.rejects(() => mallory.importState(snap), /not for this user/);
    await assert.rejects(() => alice2.importState({ v: 1, userId: a.id }), /no identity/);
  } finally { db.raw.close(); }
});

test('E9: wipe clears keys, sessions and indexes', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e9w-a@luno-test.local');
    const b = await regLogin(api, 'e9w-b@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
    const ref = { id: room.id, kind: room.kind, memberIds: [a.id, b.id], e2ee: true };
    const apiA = (p, m, bo) => api(p, m || 'GET', bo || null, a.token).then((r) => r.json());
    const apiB = (p, m, bo) => api(p, m || 'GET', bo || null, b.token).then((r) => r.json());
    const kv = new MemoryKV();
    const alice = new E2eeStore({ kv, api: apiA, userId: a.id, deviceId: 'w1' });
    const bob = new E2eeStore({ kv: new MemoryKV(), api: apiB, userId: b.id, deviceId: 'w2' });
    await alice.ready();
    await bob.ready();
    const before = alice.myIdentity();
    await alice.encryptRoom(ref, { kind: 'text', body: 'x' });
    await alice.setVerified(b.id, 'w2', 'ed-test');
    await alice.wipe();
    assert.equal(await kv.get(`e2ee:${a.id}:w1:identity`), null);
    assert.equal(await kv.get(`e2ee:${a.id}:w1:sessIdx`), null);
    assert.equal(await kv.get(`e2ee:${a.id}:w1:vfyIdx`), null);
    const fresh = new E2eeStore({ kv, api: apiA, userId: a.id, deviceId: 'w1' });
    await fresh.ready();
    assert.notEqual(fresh.myIdentity(), before, 'a fresh identity is minted');
  } finally { db.raw.close(); }
});
