// Stage 10 (F6): group chat — invites with expiry/revoke, owner/admin
// roles, privileged-only settings, room photo in R2, system messages for
// membership + setting changes, 500-member cap, per-message read counts,
// mentions, and leaver isolation. All durable across isolates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket , F24_CONSENT } from './test_helpers.mjs';

let f6Serial = 0;
async function f6Isolate(db, bucket, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f6=${++f6Serial}`);
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
const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10];
const pngDataUrl = (...tail) => `data:image/png;base64,${Buffer.from([...PNG_MAGIC, ...tail]).toString('base64')}`;

async function registerLogin(api, email) {
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
  assert.equal(reg.status, 201);
  const s = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(s.status, 200);
  const sess = await s.json();
  return { ...(await reg.json()), ...sess, token: sess.access_token };
}

async function makeRoom(api, owner, memberIds, title = 'F6 Room') {
  const res = await api('conversations', 'POST', { kind: 'group', title, member_ids: memberIds }, owner.token);
  assert.equal(res.status, 201);
  return res.json();
}

async function messagesOf(api, cid, token) {
  const res = await api(`conversations/${cid}/messages?limit=100`, 'GET', null, token);
  assert.equal(res.status, 200);
  return (await res.json()).messages;
}

test('F6: invites join strangers, expire, and revoke', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f6Isolate(db, bucket);
    const a = await registerLogin(api, 'f6-ia@luno-test.local');
    const b = await registerLogin(api, 'f6-ib@luno-test.local');
    const c = await registerLogin(api, 'f6-ic@luno-test.local');
    const room = await makeRoom(api, a, [b.id]);
    assert.equal((await api(`conversations/${room.id}/invites`, 'POST', {}, b.token)).status, 403, 'plain member cannot mint');
    const inv = await (await api(`conversations/${room.id}/invites`, 'POST', { expires_in_hours: 1 }, a.token)).json();
    assert.ok(inv.token);
    assert.ok(String(inv.invite_url).includes(inv.token));
    const joined = await api('conversations/join', 'POST', { token: inv.token }, c.token);
    assert.equal(joined.status, 200, 'stranger joins by link');
    const after = await (await api(`conversations/${room.id}`, 'GET', null, a.token)).json();
    assert.ok(after.members.some((m) => m.id === c.id), 'join durable in members');
    assert.ok((await messagesOf(api, room.id, a.token)).some((m) => m.kind === 'system' && m.body.includes('초대 링크')), 'join system message');
    assert.equal((await api('conversations/join', 'POST', { token: inv.token }, c.token)).status, 409, 'already a member');
    const short = await (await api(`conversations/${room.id}/invites`, 'POST', { expires_in_hours: 1 }, a.token)).json();
    db.raw.prepare('UPDATE luno_invites SET expires_at = ? WHERE token = ?').run(Date.now() - 1000, short.token);
    assert.equal((await api('conversations/join', 'POST', { token: short.token }, b.token)).status, 410, 'expired invite gone');
    assert.equal((await api(`conversations/${room.id}/invites/${inv.token}`, 'DELETE', null, b.token)).status, 403, 'plain member cannot revoke');
    assert.equal((await api(`conversations/${room.id}/invites/${inv.token}`, 'DELETE', null, a.token)).status, 200);
    assert.equal((await api('conversations/join', 'POST', { token: inv.token }, b.token)).status, 404, 'revoked invite gone');
  } finally { db.raw.close(); }
});

test('F6: admins kick and configure, plain members get 403', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f6Isolate(db, bucket);
    const a = await registerLogin(api, 'f6-ra@luno-test.local');
    const b = await registerLogin(api, 'f6-rb@luno-test.local');
    const c = await registerLogin(api, 'f6-rc@luno-test.local');
    const d = await registerLogin(api, 'f6-rd@luno-test.local');
    const room = await makeRoom(api, a, [b.id, c.id, d.id]);
    assert.equal((await api(`conversations/${room.id}/members/${b.id}/role`, 'PATCH', { role: 'admin' }, c.token)).status, 403);
    assert.equal((await api(`conversations/${room.id}/members/${b.id}/role`, 'PATCH', { role: 'admin' }, a.token)).status, 200);
    const listed = await (await api(`conversations/${room.id}`, 'GET', null, a.token)).json();
    assert.equal(listed.members.find((m) => m.id === b.id).role, 'admin');
    assert.equal(listed.members.find((m) => m.id === a.id).role, 'owner');
    assert.equal(listed.my_role, 'owner');
    assert.equal((await api(`conversations/${room.id}`, 'PATCH', { title: 'By Admin' }, b.token)).status, 200);
    assert.equal((await api(`conversations/${room.id}`, 'PATCH', { title: 'By Plain' }, c.token)).status, 403, 'plain rename forbidden');
    assert.equal((await api(`conversations/${room.id}`, 'PATCH', { notice: 'x' }, c.token)).status, 403, 'plain notice forbidden');
    assert.equal((await api(`conversations/${room.id}/members/${d.id}`, 'DELETE', null, b.token)).status, 200, 'admin kicks plain');
    assert.equal((await api(`conversations/${room.id}/members/${a.id}`, 'DELETE', null, b.token)).status, 403, 'admin cannot kick owner');
    assert.equal((await api(`conversations/${room.id}/members/${c.id}`, 'DELETE', null, d.token)).status, 404, 'kicked member sees nothing');
    const room2 = await makeRoom(api, a, [c.id], 'F6 Room 2');
    assert.equal((await api(`conversations/${room2.id}/members/${c.id}`, 'DELETE', null, c.token)).status, 200, 'self delete leaves');
    assert.equal((await api(`conversations/${room2.id}/members/${a.id}`, 'DELETE', null, c.token)).status, 404, 'leaver sees nothing');
  } finally { db.raw.close(); }
});

test('F6: room photo lives in R2, renames announce themselves', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f6Isolate(db, bucket);
    const a = await registerLogin(api, 'f6-pa@luno-test.local');
    const b = await registerLogin(api, 'f6-pb@luno-test.local');
    const room = await makeRoom(api, a, [b.id]);
    assert.equal((await api(`conversations/${room.id}`, 'PATCH', { avatar: 'not-a-photo' }, a.token)).status, 400);
    assert.equal((await api(`conversations/${room.id}`, 'PATCH', { avatar: pngDataUrl(11) }, a.token)).status, 200);
    const after = await (await api(`conversations/${room.id}`, 'GET', null, a.token)).json();
    assert.equal(after.avatar_url, `/api/v1/conversations/${room.id}/avatar`);
    const stored = await bucket.get(`conv/${room.id}/avatar`);
    assert.deepEqual(Buffer.from(await stored.arrayBuffer()), Buffer.from([...PNG_MAGIC, 11]));
    const served = await api(`conversations/${room.id}/avatar`, 'GET', null, b.token);
    assert.equal(served.status, 200);
    assert.match(served.headers.get('content-type') || '', /^image\//);
    assert.equal((await api(`conversations/${room.id}`, 'PATCH', { title: 'New Name' }, a.token)).status, 200);
    const msgs = await messagesOf(api, room.id, a.token);
    assert.ok(msgs.some((m) => m.kind === 'system' && m.body.includes('New Name')), 'rename system message');
    assert.ok(msgs.some((m) => m.kind === 'system' && m.body.includes('사진')), 'photo system message');
    assert.equal((await api(`conversations/${room.id}`, 'PATCH', { avatar: '' }, a.token)).status, 200);
    assert.equal(await bucket.get(`conv/${room.id}/avatar`), null, 'clear deletes object');
  } finally { db.raw.close(); }
});

test('F6: 500-member cap, read counts, mentions, leaver isolation', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f6Isolate(db, bucket);
    const a = await registerLogin(api, 'f6-ma@luno-test.local');
    const b = await registerLogin(api, 'f6-mb@luno-test.local');
    const c = await registerLogin(api, 'f6-mc@luno-test.local');
    const room = await makeRoom(api, a, [b.id, c.id]);
    const sent = await (await api(`conversations/${room.id}/messages`, 'POST', { body: 'hi all', metadata: { mentions: ['all', 'ghost-id'] } }, a.token)).json();
    assert.deepEqual(sent.message.metadata.mentions, ['all'], 'unknown mention stripped, @all kept');
    await api(`conversations/${room.id}/read`, 'POST', { sequence: sent.message.sequence }, b.token);
    const mine = await messagesOf(api, room.id, a.token);
    assert.equal(mine.find((m) => m.id === sent.message.id).read_count, 1, 'one non-sender reader of 3');
    await api(`conversations/${room.id}/read`, 'POST', { sequence: sent.message.sequence }, c.token);
    const all = await messagesOf(api, room.id, a.token);
    assert.equal(all.find((m) => m.id === sent.message.id).read_count, 2, 'both others read');
    assert.equal((await api(`conversations/${room.id}`, 'DELETE', null, c.token)).status, 200);
    assert.equal((await api(`conversations/${room.id}/messages`, 'GET', null, c.token)).status, 404, 'leaver reads nothing');
    assert.equal((await api(`conversations/${room.id}/messages`, 'POST', { body: 'back' }, c.token)).status, 404, 'leaver posts nothing');
    const list = await (await api('conversations', 'GET', null, c.token)).json();
    assert.ok(!(list.conversations || []).some((r) => r.id === room.id), 'leaver lists nothing');
    // Fill the room to the cap straight in D1; the global gate rehydrates
    // members before the invite route runs, so the cap bites on this isolate.
    const d = await registerLogin(api, 'f6-md@luno-test.local');
    assert.equal((await api('friends', 'POST', { friend_id: d.id }, a.token)).status, 201);
    const at = new Date().toISOString();
    const mkUser = db.raw.prepare('INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    const ins = db.raw.prepare('INSERT INTO luno_conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)');
    for (let i = 0; i < 498; i++) {
      mkUser.run(`f6-filler-${i}`, `f6-filler-${i}@luno-test.local`, 'x', `filler${i}`, at, at);
      ins.run(room.id, `f6-filler-${i}`, 'member', at);
    }
    const capped = await api(`conversations/${room.id}/members`, 'POST', { member_ids: [d.id] }, a.token);
    assert.equal(capped.status, 400, 'room at cap rejects invites');
    assert.match((await capped.json()).error, /500/);
  } finally { db.raw.close(); }
});

test('F6: groups survive a cold isolate on another device', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f6Isolate(db, bucket);
    const a = await registerLogin(api, 'f6-da@luno-test.local');
    const b = await registerLogin(api, 'f6-db@luno-test.local');
    const room = await makeRoom(api, a, [b.id], 'Durable Group');
    await api(`conversations/${room.id}/members/${b.id}/role`, 'PATCH', { role: 'admin' }, a.token);
    await api(`conversations/${room.id}`, 'PATCH', { notice: 'meet at 7', avatar: pngDataUrl(12) }, a.token);
    const { api: cold } = await f6Isolate(db, bucket);
    const ta = (await (await cold('auth/login', 'POST', { email: 'f6-da@luno-test.local', password: PW })).json()).access_token;
    const tb = (await (await cold('auth/login', 'POST', { email: 'f6-db@luno-test.local', password: PW })).json()).access_token;
    const same = await (await cold(`conversations/${room.id}`, 'GET', null, ta)).json();
    assert.equal(same.title, 'Durable Group');
    assert.equal(same.notice, 'meet at 7');
    assert.equal(same.members.find((m) => m.id === b.id).role, 'admin');
    assert.equal((await cold(`conversations/${room.id}/avatar`, 'GET', null, tb)).status, 200, 'photo serves cold');
    const photo = await cold(`conversations/${room.id}/avatar`, 'GET', null, tb);
    assert.deepEqual(Buffer.from(await photo.arrayBuffer()), Buffer.from([...PNG_MAGIC, 12]));
  } finally { db.raw.close(); }
});
