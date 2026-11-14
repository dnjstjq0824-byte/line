// Stage 10 (F7): message actions — edit (edited_at), unsend (both sides
// go blank), delete-for-me (hidden only for the hider), reply, and forward
// to another room (both memberships checked, attachment bytes copied to the
// target room). All durable + synced to a second device.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket } from './test_helpers.mjs';

let f7Serial = 0;
async function f7Isolate(db, bucket, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f7=${++f7Serial}`);
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

async function makeRoom(api, owner, memberIds, title = 'F7 Room') {
  const res = await api('conversations', 'POST', { kind: 'group', title, member_ids: memberIds }, owner.token);
  assert.equal(res.status, 201);
  return res.json();
}

async function send(api, cid, token, body, extra = {}) {
  const res = await api(`conversations/${cid}/messages`, 'POST', { body, ...extra }, token);
  assert.equal(res.status, 201);
  return (await res.json()).message;
}

async function messagesOf(api, cid, token) {
  const res = await api(`conversations/${cid}/messages?limit=100`, 'GET', null, token);
  assert.equal(res.status, 200);
  return (await res.json()).messages;
}

test('F7: edit stamps edited_at for both sides', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f7Isolate(db, bucket);
    const a = await registerLogin(api, 'f7-ea@luno-test.local');
    const b = await registerLogin(api, 'f7-eb@luno-test.local');
    const room = await makeRoom(api, a, [b.id]);
    const m = await send(api, room.id, a.token, 'typo here');
    assert.equal((await api(`conversations/${room.id}/messages/${m.id}`, 'PATCH', { body: 'forged' }, b.token)).status, 403, 'non-sender cannot edit');
    const edited = await api(`conversations/${room.id}/messages/${m.id}`, 'PATCH', { body: 'fixed' }, a.token);
    assert.equal(edited.status, 200);
    assert.ok((await edited.json()).message.edited_at, 'edited_at stamped');
    const seen = (await messagesOf(api, room.id, b.token)).find((x) => x.id === m.id);
    assert.equal(seen.body, 'fixed');
    assert.ok(seen.edited_at, 'peer sees the edit stamp');
    assert.equal(db.raw.prepare('SELECT body FROM luno_messages WHERE id = ?').get(m.id).body, 'fixed');
  } finally { db.raw.close(); }
});

test('F7: unsend blanks both sides, sender only', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f7Isolate(db, bucket);
    const a = await registerLogin(api, 'f7-ua@luno-test.local');
    const b = await registerLogin(api, 'f7-ub@luno-test.local');
    const room = await makeRoom(api, a, [b.id]);
    const m = await send(api, room.id, a.token, 'oops');
    assert.equal((await api(`conversations/${room.id}/messages/${m.id}`, 'DELETE', null, b.token)).status, 403, 'non-sender cannot unsend');
    assert.equal((await api(`conversations/${room.id}/messages/${m.id}`, 'DELETE', null, a.token)).status, 200);
    for (const t of [a.token, b.token]) {
      const seen = (await messagesOf(api, room.id, t)).find((x) => x.id === m.id);
      assert.equal(seen.unsent, true);
      assert.equal(seen.body, '');
    }
    assert.equal(db.raw.prepare('SELECT unsent FROM luno_messages WHERE id = ?').get(m.id).unsent, 1);
  } finally { db.raw.close(); }
});

test('F7: delete-for-me hides one side, reply links the original', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f7Isolate(db, bucket);
    const a = await registerLogin(api, 'f7-ha@luno-test.local');
    const b = await registerLogin(api, 'f7-hb@luno-test.local');
    const room = await makeRoom(api, a, [b.id]);
    const m = await send(api, room.id, a.token, 'hide me');
    assert.equal((await api(`conversations/${room.id}/messages/nope/hide`, 'POST', {}, b.token)).status, 404, 'unknown message');
    assert.equal((await api(`conversations/${room.id}/messages/${m.id}/hide`, 'POST', {}, b.token)).status, 200);
    assert.ok(!(await messagesOf(api, room.id, b.token)).some((x) => x.id === m.id), 'hidden for hider');
    assert.ok((await messagesOf(api, room.id, a.token)).some((x) => x.id === m.id), 'kept for peer');
    const r = await send(api, room.id, b.token, 'answer', { reply_to: m.id });
    assert.equal(r.reply_to, m.id);
    const seen = (await messagesOf(api, room.id, a.token)).find((x) => x.id === r.id);
    assert.equal(seen.reply_preview.body, 'hide me');
    const bad = await api(`conversations/${room.id}/messages`, 'POST', { body: 'x', reply_to: 'nope' }, a.token);
    assert.equal(bad.status, 404, 'reply to unknown');
  } finally { db.raw.close(); }
});

test('F7: forward checks both memberships and copies attachments', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f7Isolate(db, bucket);
    const a = await registerLogin(api, 'f7-fa@luno-test.local');
    const b = await registerLogin(api, 'f7-fb@luno-test.local');
    const c = await registerLogin(api, 'f7-fc@luno-test.local');
    const src = await makeRoom(api, a, [b.id], 'Source');
    const dst = await makeRoom(api, a, [c.id], 'Target');
    const other = await makeRoom(api, b, [c.id], 'Stranger');
    const m = await send(api, src.id, a.token, 'pass it on');
    assert.equal((await api(`conversations/${src.id}/messages/${m.id}/forward`, 'POST', { to_conversation_id: other.id }, a.token)).status, 404, 'not a target member');
    assert.equal((await api(`conversations/${other.id}/messages/${m.id}/forward`, 'POST', { to_conversation_id: dst.id }, a.token)).status, 404, 'not a source member');
    const fwd = await api(`conversations/${src.id}/messages/${m.id}/forward`, 'POST', { to_conversation_id: dst.id }, a.token);
    assert.equal(fwd.status, 201);
    const copy = (await fwd.json()).message;
    assert.equal(copy.body, 'pass it on');
    assert.equal(copy.metadata.forwarded, true);
    assert.ok((await messagesOf(api, dst.id, c.token)).some((x) => x.id === copy.id), 'target member sees it');
    assert.ok((await messagesOf(api, src.id, b.token)).some((x) => x.id === m.id && x.body === 'pass it on'), 'source untouched');
    // Media forward: bytes are copied under the target room, not linked.
    const up = await api('attachments', 'POST', { conversation_id: src.id, content_base64: Buffer.from('img-bytes').toString('base64'), mime_type: 'image/png', original_name: 'p.png' }, a.token);
    assert.equal(up.status, 201);
    const img = await send(api, src.id, a.token, 'pic', { kind: 'image', metadata: { attachment_id: (await up.json()).id } });
    const fwdImg = await api(`conversations/${src.id}/messages/${img.id}/forward`, 'POST', { to_conversation_id: dst.id }, a.token);
    assert.equal(fwdImg.status, 201);
    const imgCopy = (await fwdImg.json()).message;
    assert.notEqual(imgCopy.metadata.attachment_id, img.metadata.attachment_id, 'fresh attachment row');
    const dl = await api(`attachments/${imgCopy.metadata.attachment_id}/content`, 'GET', null, c.token);
    assert.equal(dl.status, 200);
    assert.equal(await dl.text(), 'img-bytes');
    assert.equal((await api(`attachments/${imgCopy.metadata.attachment_id}/content`, 'GET', null, b.token)).status, 404, 'source-only member locked out');
  } finally { db.raw.close(); }
});

test('F7: a second device syncs edits, unsends and hides', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f7Isolate(db, bucket);
    const a = await registerLogin(api, 'f7-sa@luno-test.local');
    const b = await registerLogin(api, 'f7-sb@luno-test.local');
    const room = await makeRoom(api, a, [b.id]);
    const e = await send(api, room.id, a.token, 'first');
    const u = await send(api, room.id, a.token, 'second');
    const h = await send(api, room.id, b.token, 'third');
    await api(`conversations/${room.id}/messages/${e.id}`, 'PATCH', { body: 'first!' }, a.token);
    await api(`conversations/${room.id}/messages/${u.id}`, 'DELETE', null, a.token);
    await api(`conversations/${room.id}/messages/${h.id}/hide`, 'POST', {}, a.token);
    const { api: cold } = await f7Isolate(db, bucket);
    const ta = (await (await cold('auth/login', 'POST', { email: 'f7-sa@luno-test.local', password: PW })).json()).access_token;
    const tb = (await (await cold('auth/login', 'POST', { email: 'f7-sb@luno-test.local', password: PW })).json()).access_token;
    const mine = await messagesOf(cold, room.id, ta);
    assert.equal(mine.find((x) => x.id === e.id).body, 'first!');
    assert.ok(mine.find((x) => x.id === e.id).edited_at);
    assert.equal(mine.find((x) => x.id === u.id).unsent, true);
    assert.ok(!mine.some((x) => x.id === h.id), 'hide follows the account');
    assert.ok((await messagesOf(cold, room.id, tb)).some((x) => x.id === h.id), 'peer keeps it');
    const sync = await (await cold(`conversations/${room.id}/sync?since_sequence=0`, 'GET', null, ta)).json();
    assert.ok((sync.messages || sync.delta_messages || []).length >= 2, 'delta carries the states');
  } finally { db.raw.close(); }
});
