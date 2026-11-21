// E6: group sender keys through the real server API. Three members deal,
// read, survive a member exit (rotation locks the leaver out), and Keep
// rooms seal to the owner's own devices.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, F24_CONSENT } from './test_helpers.mjs';
import { E2eeStore, MemoryKV } from '../apps/user-web/src/e2ee/store.ts';

let serial = 0;
async function isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?e6=${++serial}`);
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

test('E6: parcel relay validates shared rooms and ownership', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e6p-a@luno-test.local');
    const b = await regLogin(api, 'e6p-b@luno-test.local');
    const c = await regLogin(api, 'e6p-c@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'g', member_ids: [b.id] }, a.token)).json();
    const put = await api('e2ee/sk', 'POST', { to_user: b.id, room: room.id, gen: 1, envelopes: { w1: { v: 1 } } }, a.token);
    assert.equal(put.status, 201);
    // Stranger cannot deal into (or out of) the room.
    assert.equal((await api('e2ee/sk', 'POST', { to_user: a.id, room: room.id, gen: 1, envelopes: { w1: {} } }, c.token)).status, 403);
    // Recipient fetches; others see nothing; delete is owner-only.
    const got = await (await api('e2ee/sk', 'GET', null, b.token)).json();
    assert.equal(got.parcels.length, 1);
    assert.equal((await (await api('e2ee/sk', 'GET', null, c.token)).json()).parcels.length, 0);
    assert.equal((await api(`e2ee/sk/${got.parcels[0].id}`, 'DELETE', null, c.token)).status, 404);
    assert.equal((await api(`e2ee/sk/${got.parcels[0].id}`, 'DELETE', null, b.token)).status, 200);
    assert.equal((await (await api('e2ee/sk', 'GET', null, b.token)).json()).parcels.length, 0);
  } finally { db.raw.close(); }
});

test('E6: three members exchange group mail; exit rotates the leaver out', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e6g-a@luno-test.local');
    const b = await regLogin(api, 'e6g-b@luno-test.local');
    const c = await regLogin(api, 'e6g-c@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'g', member_ids: [b.id, c.id] }, a.token)).json();
    const mk = (u, did) => new E2eeStore({
      kv: new MemoryKV(),
      api: (p, m, bo) => api(p, m || 'GET', bo || null, u.token).then((r) => r.json()),
      userId: u.id, deviceId: did,
    });
    const sa = mk(a, 'w1');
    const sb = mk(b, 'w2');
    const sc = mk(c, 'w3');
    await sa.ready();
    await sb.ready();
    await sc.ready();
    const ref = (members) => ({ id: room.id, kind: 'group', memberIds: members, e2ee: true });
    const post = async (store, u, text, members) => {
      const ct = await store.encryptRoom(ref(members), { kind: 'text', body: text });
      const r = await api(`conversations/${room.id}/messages`, 'POST', { kind: 'ciphertext', body: ct }, u.token);
      assert.equal(r.status, 201, `post by ${u.id}`);
      return (await r.json()).body;
    };
    // Gen 1: everyone reads.
    const m1 = await post(sa, a, 'gen1 hello', [a.id, b.id, c.id]);
    assert.equal((await sb.decryptBody(a.id, m1))?.body, 'gen1 hello');
    assert.equal((await sc.decryptBody(a.id, m1))?.body, 'gen1 hello');
    const m2 = await post(sb, b, 'gen1 reply', [a.id, b.id, c.id]);
    assert.equal((await sa.decryptBody(b.id, m2))?.body, 'gen1 reply');
    assert.equal((await sc.decryptBody(b.id, m2))?.body, 'gen1 reply');
    // C leaves; the next send rotates. C keeps history but reads nothing new.
    assert.equal((await api(`conversations/${room.id}`, 'DELETE', null, c.token)).status, 200);
    const m3 = await post(sa, a, 'after exit', [a.id, b.id]);
    assert.equal((await sb.decryptBody(a.id, m3))?.body, 'after exit');
    assert.equal(await sc.decryptBody(a.id, m3), null, 'leaver locked out');
    // D1 holds ciphertext/parcels only.
    const rows = db.raw.prepare('SELECT body FROM luno_messages WHERE conversation_id = ?').all(room.id);
    for (const r of rows) {
      assert.ok(!String(r.body).includes('gen1 hello') && !String(r.body).includes('after exit'), 'no plaintext in D1');
    }
  } finally { db.raw.close(); }
});

test('E6: Keep rooms seal to owner devices only', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e6k-a@luno-test.local');
    const b = await regLogin(api, 'e6k-b@luno-test.local');
    const list = await (await api('conversations', 'GET', null, a.token)).json();
    const keep = list.conversations.find((c) => c.id === `conv-keep-${a.id}`);
    assert.ok(keep, 'keep room exists');
    const mk = (u, did) => new E2eeStore({
      kv: new MemoryKV(),
      api: (p, m, bo) => api(p, m || 'GET', bo || null, u.token).then((r) => r.json()),
      userId: u.id, deviceId: did,
    });
    const sa = mk(a, 'w1');
    const sb = mk(b, 'w9');
    await sa.ready();
    await sb.ready();
    const ref = { id: keep.id, kind: keep.kind, memberIds: [a.id], e2ee: true };
    const ct = await sa.encryptRoom(ref, { kind: 'text', body: 'my own secret' });
    assert.equal((await api(`conversations/${keep.id}/messages`, 'POST', { kind: 'ciphertext', body: ct }, a.token)).status, 201);
    assert.equal((await sa.decryptBody(a.id, ct))?.body, 'my own secret');
    assert.equal(await sb.decryptBody(a.id, ct), null, 'strangers read nothing');
  } finally { db.raw.close(); }
});
