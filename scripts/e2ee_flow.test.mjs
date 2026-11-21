// E5: 1:1 E2EE through the real server API. Two web E2EE stores (plus a
// second device) register, exchange, reply, edit and recall across fresh
// isolates sharing one D1; the D1 rows themselves must contain no plaintext.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, F24_CONSENT } from './test_helpers.mjs';
import { E2eeStore, MemoryKV } from '../apps/user-web/src/e2ee/store.ts';

let serial = 0;
async function isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?e5=${++serial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', E2EE_ENFORCED: 'true', ...extraEnv };
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
const SECRET_A = 'e5-alice-secret-statement';
const SECRET_B = 'e5-bob-reply-statement';

test('E5: 1:1 send/receive/reply across isolates, D1 holds no plaintext', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e5-a@luno-test.local');
    const b = await regLogin(api, 'e5-b@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
    const ref = { id: room.id, kind: room.kind, memberIds: [a.id, b.id], e2ee: true };
    const apiA = (p, m, bo) => api(p, m || 'GET', bo || null, a.token).then((r) => r.json());
    const apiB = (p, m, bo) => api(p, m || 'GET', bo || null, b.token).then((r) => r.json());
    const alice = new E2eeStore({ kv: new MemoryKV(), api: apiA, userId: a.id, deviceId: 'w1' });
    const bob = new E2eeStore({ kv: new MemoryKV(), api: apiB, userId: b.id, deviceId: 'w2' });
    await alice.ready();
    await bob.ready();
    const ct1 = await alice.encryptRoom(ref, { kind: 'text', body: SECRET_A });
    const posted = await api(`conversations/${room.id}/messages`, 'POST', { kind: 'ciphertext', body: ct1 }, a.token);
    assert.equal(posted.status, 201);
    // Fresh isolate (new server process, same D1): Bob reads and decrypts.
    const cold = await isolate(db);
    const got = await (await cold.api(`conversations/${room.id}/messages?limit=10`, 'GET', null, b.token)).json();
    const first = got.messages.find((m) => m.kind === 'ciphertext');
    assert.ok(first, 'ciphertext delivered');
    const open = await bob.decryptBody(a.id, first.body);
    assert.equal(open?.body, SECRET_A);
    // Bob replies; Alice decrypts on yet another isolate.
    const ct2 = await bob.encryptRoom(ref, { kind: 'text', body: SECRET_B });
    assert.equal((await cold.api(`conversations/${room.id}/messages`, 'POST', { kind: 'ciphertext', body: ct2 }, b.token)).status, 201);
    const third = await isolate(db);
    const got2 = await (await third.api(`conversations/${room.id}/messages?limit=10`, 'GET', null, a.token)).json();
    const reply = [...got2.messages].reverse().find((m) => m.kind === 'ciphertext' && m.sender_id === b.id);
    assert.equal((await alice.decryptBody(b.id, reply.body))?.body, SECRET_B);
    // D1 rows carry ciphertext only.
    const rows = db.raw.prepare('SELECT body FROM luno_messages WHERE conversation_id = ?').all(room.id);
    assert.ok(rows.length >= 2);
    for (const r of rows) {
      assert.ok(!String(r.body).includes(SECRET_A) && !String(r.body).includes(SECRET_B), 'no plaintext in D1');
    }
    // The one-time intro marker sits above the first ciphertext.
    const seqs = db.raw.prepare("SELECT sequence FROM luno_messages WHERE conversation_id = ? AND kind = 'system'").all(room.id);
    assert.equal(seqs.length, 1, 'exactly one intro marker');
  } finally { db.raw.close(); }
});

test('E5: second device fans out; edit and recall stay encrypted', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e5d-a@luno-test.local');
    const b = await regLogin(api, 'e5d-b@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
    const ref = { id: room.id, kind: room.kind, memberIds: [a.id, b.id], e2ee: true };
    const apiA = (p, m, bo) => api(p, m || 'GET', bo || null, a.token).then((r) => r.json());
    const apiB = (p, m, bo) => api(p, m || 'GET', bo || null, b.token).then((r) => r.json());
    const a1 = new E2eeStore({ kv: new MemoryKV(), api: apiA, userId: a.id, deviceId: 'w1' });
    const a2 = new E2eeStore({ kv: new MemoryKV(), api: apiA, userId: a.id, deviceId: 'w2' });
    const bob = new E2eeStore({ kv: new MemoryKV(), api: apiB, userId: b.id, deviceId: 'w3' });
    await a1.ready();
    await a2.ready();
    await bob.ready();
    const ct = await a1.encryptRoom(ref, { kind: 'text', body: 'for both my screens' });
    const posted = await api(`conversations/${room.id}/messages`, 'POST', { kind: 'ciphertext', body: ct }, a.token);
    assert.equal(posted.status, 201);
    const mid = (await posted.json()).id;
    // Second device decrypts the same blob.
    const got = await (await api(`conversations/${room.id}/messages?limit=5`, 'GET', null, a.token)).json();
    const wire = got.messages.find((m) => m.id === mid);
    assert.equal((await a2.decryptBody(a.id, wire.body))?.body, 'for both my screens');
    // Bob reads the original first (session established), then the edit.
    assert.equal((await bob.decryptBody(a.id, wire.body))?.body, 'for both my screens');
    // Edit replaces the envelope; recall wipes it; both stay opaque.
    const editCt = await a1.encryptRoom(ref, { kind: 'text', body: 'edited under seal' });
    const patched = await api(`conversations/${room.id}/messages/${mid}`, 'PATCH', { body: editCt }, a.token);
    assert.equal(patched.status, 200);
    const got2 = await (await api(`conversations/${room.id}/messages?limit=5`, 'GET', null, b.token)).json();
    const edited = got2.messages.find((m) => m.id === mid);
    assert.equal((await bob.decryptBody(a.id, edited.body))?.body, 'edited under seal');
    assert.equal((await api(`conversations/${room.id}/messages/${mid}`, 'DELETE', null, a.token)).status, 200);
    const rows = db.raw.prepare('SELECT body FROM luno_messages WHERE conversation_id = ?').all(room.id);
    for (const r of rows) {
      assert.ok(!String(r.body).includes('both my screens') && !String(r.body).includes('edited under seal'), 'no plaintext in D1');
    }
  } finally { db.raw.close(); }
});

test('E5: group rooms refuse until sender keys (E6)', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e5g-a@luno-test.local');
    const store = new E2eeStore({ kv: new MemoryKV(), api: (p, m, b) => api(p, m || 'GET', b || null, a.token).then((r) => r.json()), userId: a.id, deviceId: 'w1' });
    await store.ready();
    await assert.rejects(store.encryptRoom({ id: 'g', kind: 'group', memberIds: [], e2ee: true }, { kind: 'text', body: 'x' }), /GROUP_E2EE_PENDING/);
  } finally { db.raw.close(); }
});
