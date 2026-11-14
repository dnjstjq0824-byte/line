// Stage 10 (F9): attachments download for room members only (strangers
// get 404, the anti-enumeration posture pinned by the r2 suite — the card's
// "403" is answered 404 like every other hidden resource); unsend and
// account purge delete the R2 bytes with the metadata rows; every message
// kind (text/image/video/file/voice/location/contact) sends and reads back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket } from './test_helpers.mjs';

let f9Serial = 0;
async function f9Isolate(db, bucket, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f9=${++f9Serial}`);
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

async function makeRoom(api, owner, memberIds, title = 'F9 Room') {
  const res = await api('conversations', 'POST', { kind: 'group', title, member_ids: memberIds }, owner.token);
  assert.equal(res.status, 201);
  return res.json();
}

async function upload(api, cid, token, name = 'p.png', mime = 'image/png', bytes = 'img-bytes') {
  const up = await api('attachments', 'POST', { conversation_id: cid, content_base64: Buffer.from(bytes).toString('base64'), mime_type: mime, original_name: name }, token);
  assert.equal(up.status, 201);
  return (await up.json()).id;
}

test('F9: members download, strangers get 404', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f9Isolate(db, bucket);
    const a = await registerLogin(api, 'f9-da@luno-test.local');
    const b = await registerLogin(api, 'f9-db@luno-test.local');
    const c = await registerLogin(api, 'f9-dc@luno-test.local');
    const room = await makeRoom(api, a, [b.id]);
    const id = await upload(api, room.id, a.token);
    for (const p of [`attachments/${id}`, `attachments/${id}/content`]) {
      const ok = await api(p, 'GET', null, b.token);
      assert.equal(ok.status, 200, `member ${p}`);
      assert.equal(await ok.text(), 'img-bytes');
      assert.equal((await api(p, 'GET', null, c.token)).status, 404, `stranger ${p}`);
    }
    assert.equal((await api('attachments', 'POST', { conversation_id: room.id, content_base64: 'eA==', mime_type: 'text/plain', original_name: 'x' }, c.token)).status, 404, 'stranger upload');
  } finally { db.raw.close(); }
});

test('F9: unsend deletes the R2 bytes with the metadata', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f9Isolate(db, bucket);
    const a = await registerLogin(api, 'f9-ua@luno-test.local');
    const b = await registerLogin(api, 'f9-ub@luno-test.local');
    const room = await makeRoom(api, a, [b.id]);
    const id = await upload(api, room.id, a.token);
    const key = db.raw.prepare('SELECT object_key FROM attachments WHERE id = ?').get(id).object_key;
    const sent = await api(`conversations/${room.id}/messages`, 'POST', { kind: 'image', body: 'pic', metadata: { attachment_id: id } }, a.token);
    assert.equal(sent.status, 201);
    const mid = (await sent.json()).message.id;
    assert.ok(await bucket.get(key), 'bytes stored');
    assert.equal((await api(`conversations/${room.id}/messages/${mid}`, 'DELETE', null, a.token)).status, 200);
    assert.equal(await bucket.get(key), null, 'R2 object gone');
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM attachments WHERE id = ?').get(id).n, 0, 'metadata row gone');
    assert.equal((await api(`attachments/${id}/content`, 'GET', null, b.token)).status, 404, 'peer download gone');
  } finally { db.raw.close(); }
});

test('F9: account purge deletes the uploader R2 objects', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f9Isolate(db, bucket);
    const email = 'f9-xa@luno-test.local';
    const a = await registerLogin(api, email);
    const b = await registerLogin(api, 'f9-xb@luno-test.local');
    const room = await makeRoom(api, a, [b.id]);
    const id = await upload(api, room.id, a.token);
    const key = db.raw.prepare('SELECT object_key FROM attachments WHERE id = ?').get(id).object_key;
    await api(`conversations/${room.id}/messages`, 'POST', { kind: 'image', body: 'pic', metadata: { attachment_id: id } }, a.token);
    await api('me', 'DELETE', { password: PW, confirm_text: email }, a.token);
    const past = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString();
    db.raw.exec(`UPDATE users SET deleted_at = '${past}' WHERE id = '${a.id}'`);
    assert.equal((await api('auth/login', 'POST', { email, password: PW })).status, 401);
    assert.equal(await bucket.get(key), null, 'uploader bytes purged');
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM attachments WHERE uploader_id = ?').get(a.id).n, 0, 'uploader rows purged');
  } finally { db.raw.close(); }
});

test('F9: every message kind sends and reads back', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f9Isolate(db, bucket);
    const a = await registerLogin(api, 'f9-ka@luno-test.local');
    const b = await registerLogin(api, 'f9-kb@luno-test.local');
    const room = await makeRoom(api, a, [b.id]);
    const img = await upload(api, room.id, a.token, 'v.mp4', 'video/mp4', 'vid-bytes');
    const snd = await upload(api, room.id, a.token, 'v.m4a', 'audio/mp4', 'voice-bytes');
    const doc = await upload(api, room.id, a.token, 'd.pdf', 'application/pdf', 'doc-bytes');
    const posts = [
      ['text', { body: 'hello' }],
      ['image', { body: 'pic', metadata: { attachment_id: await upload(api, room.id, a.token) } }],
      ['video', { body: 'clip', metadata: { attachment_id: img } }],
      ['file', { body: 'doc', metadata: { attachment_id: doc } }],
      ['voice', { body: 'note', metadata: { attachment_id: snd, duration: 7 } }],
      ['location', { body: '', metadata: { lat: 37.5, lng: 127.0, label: 'here' } }],
      ['contact', { body: '', metadata: { user_id: b.id } }],
    ];
    for (const [kind, payload] of posts) {
      const res = await api(`conversations/${room.id}/messages`, 'POST', { kind, ...payload }, a.token);
      assert.equal(res.status, 201, `send ${kind}`);
    }
    const list = await (await api(`conversations/${room.id}/messages?limit=50`, 'GET', null, b.token)).json();
    for (const [kind] of posts) assert.ok(list.messages.some((m) => m.kind === kind), `read ${kind}`);
    const loc = list.messages.find((m) => m.kind === 'location');
    assert.equal(loc.metadata.lat, 37.5);
    const con = list.messages.find((m) => m.kind === 'contact');
    assert.equal(con.metadata.user_id, b.id);
    const v = list.messages.find((m) => m.kind === 'voice');
    assert.equal(v.metadata.duration, 7);
  } finally { db.raw.close(); }
});
