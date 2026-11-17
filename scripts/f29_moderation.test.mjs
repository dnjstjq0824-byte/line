// A6 (F29 server): reports accept the enlarged category set (spam, abuse,
// harassment, illegal filming, child exploitation, violence, other);
// admins instant-hide chat messages, feed posts and openchat posts (and
// unhide them); hiding an attachment deletes its bytes and blocklists its
// SHA-256 so the same file cannot be re-uploaded. Every measure is audited.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket, F24_CONSENT } from './test_helpers.mjs';

let f29Serial = 0;
async function f29Isolate(db, bucket, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f29=${++f29Serial}`);
  const env = { DB: db, MEDIA_BUCKET: bucket, DURABLE_CONVERSATIONS: 'true', ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api };
}

const PW = 'Str0ng!Passw0rd';

async function register(api, email) {
  const res = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
  assert.equal(res.status, 201);
  return res.json();
}

async function login(api, email) {
  const res = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(res.status, 200);
  return res.json();
}

async function makeAdmin(db, bucket, email = 'f29-admin@luno-test.local') {
  const plain = await f29Isolate(db, bucket);
  const reg = await register(plain.api, email);
  const { api } = await f29Isolate(db, bucket, { ADMIN_USER_IDS: reg.id });
  const s = await login(api, email);
  return { api, token: s.access_token, id: reg.id };
}

async function makeRoom(api, ownerToken, memberIds, title = 'F29 Room') {
  const res = await api('conversations', 'POST', { kind: 'group', title, member_ids: memberIds }, ownerToken);
  assert.equal(res.status, 201);
  return res.json();
}

test('F29: reports accept the enlarged category set and reject the rest', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const admin = await makeAdmin(db, bucket);
    const b = await register(admin.api, 'f29-subject@luno-test.local');
    const su = await login(admin.api, 'f29-reporter@luno-test.local').catch(async () => {
      await register(admin.api, 'f29-reporter@luno-test.local');
      return login(admin.api, 'f29-reporter@luno-test.local');
    });
    for (const category of ['spam', 'abuse', 'harassment', 'illegal_filming', 'child_exploitation', 'violence', 'other']) {
      const rep = await admin.api('reports', 'POST', { subject_user_id: b.id, category, details: `case ${category}` }, su.access_token);
      assert.equal(rep.status, 201, `category ${category} accepted`);
    }
    assert.equal((await admin.api('reports', 'POST', { subject_user_id: b.id, category: 'phishing' }, su.access_token)).status, 400, 'unknown category');
    assert.equal((await admin.api('reports', 'POST', { subject_user_id: b.id, category: 'xx' }, su.access_token)).status, 400, 'short category');
    const queue = await (await admin.api('admin/reports', 'GET', null, admin.token)).json();
    for (const category of ['illegal_filming', 'child_exploitation', 'violence']) {
      assert.ok((queue.reports || []).some((r) => r.category === category), `admin sees ${category}`);
    }
  } finally { db.raw.close(); }
});

test('F29: admin hides and unhides a chat message on both history paths', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const admin = await makeAdmin(db, bucket);
    const a = await register(admin.api, 'f29-ma@luno-test.local');
    const b = await register(admin.api, 'f29-mb@luno-test.local');
    const sa = await login(admin.api, 'f29-ma@luno-test.local');
    const sb = await login(admin.api, 'f29-mb@luno-test.local');
    const room = await makeRoom(admin.api, sa.access_token, [b.id]);
    const sent = await admin.api(`conversations/${room.id}/messages`, 'POST', { body: 'visible hello' }, sa.access_token);
    assert.equal(sent.status, 201);
    const mid = (await sent.json()).message.id;
    const seen = await (await admin.api(`conversations/${room.id}/messages?limit=100`, 'GET', null, sb.access_token)).json();
    assert.ok(seen.messages.some((x) => x.id === mid), 'peer sees it first');
    const syncBefore = await (await admin.api(`conversations/${room.id}/sync?since_sequence=0`, 'GET', null, sb.access_token)).json();
    assert.ok(syncBefore.delta_messages.some((x) => x.id === mid), 'sync carries it first');
    const searchBefore = await (await admin.api('search?q=visible%20hello', 'GET', null, sb.access_token)).json();
    assert.ok((searchBefore.messages || []).some((x) => x.id === mid), 'search finds it first');

    const hide = await admin.api('admin/moderation/hide', 'POST', { target_type: 'message', target_id: mid, reason: 'F29 probe' }, admin.token);
    assert.equal(hide.status, 200);
    const mem = await (await admin.api(`conversations/${room.id}/messages?limit=100`, 'GET', null, sb.access_token)).json();
    assert.ok(!mem.messages.some((x) => x.id === mid), 'memory window hides it');
    const deep = await (await admin.api(`conversations/${room.id}/messages?before_sequence=1000000&limit=50`, 'GET', null, sb.access_token)).json();
    assert.ok(!deep.messages.some((x) => x.id === mid), 'deep history hides it');
    const syncAfter = await (await admin.api(`conversations/${room.id}/sync?since_sequence=0`, 'GET', null, sb.access_token)).json();
    assert.ok(!syncAfter.delta_messages.some((x) => x.id === mid), 'sync hides it');
    const searchAfter = await (await admin.api('search?q=visible%20hello', 'GET', null, sb.access_token)).json();
    assert.ok(!(searchAfter.messages || []).some((x) => x.id === mid), 'search hides it');
    assert.ok(db.raw.prepare("SELECT * FROM luno_hidden_targets WHERE target_type = 'message' AND target_id = ?").get(mid), 'hide persisted');
    assert.ok(db.raw.prepare("SELECT * FROM luno_audit WHERE action = 'moderation.hide' AND target = ?").get(mid), 'hide audited');

    const cold = await f29Isolate(db, bucket, { ADMIN_USER_IDS: admin.id });
    const scb = await login(cold.api, 'f29-mb@luno-test.local');
    const coldList = await (await cold.api(`conversations/${room.id}/messages?limit=100`, 'GET', null, scb.access_token)).json();
    assert.ok(!coldList.messages.some((x) => x.id === mid), 'hide survives a cold isolate');

    const unhide = await admin.api('admin/moderation/unhide', 'POST', { target_type: 'message', target_id: mid }, admin.token);
    assert.equal(unhide.status, 200);
    const back = await (await admin.api(`conversations/${room.id}/messages?limit=100`, 'GET', null, sb.access_token)).json();
    assert.ok(back.messages.some((x) => x.id === mid), 'unhide restores it');
    assert.ok(db.raw.prepare("SELECT * FROM luno_audit WHERE action = 'moderation.unhide' AND target = ?").get(mid), 'unhide audited');
  } finally { db.raw.close(); }
});

test('F29: admin hides feed and openchat posts', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const admin = await makeAdmin(db, bucket);
    await register(admin.api, 'f29-fu@luno-test.local');
    const su = await login(admin.api, 'f29-fu@luno-test.local');
    const posted = await admin.api('timeline', 'POST', { body: 'feed hello' }, su.access_token);
    assert.equal(posted.status, 201);
    const fid = (await posted.json()).id;
    const feed = await (await admin.api('timeline', 'GET', null, su.access_token)).json();
    assert.ok(feed.posts.some((x) => x.id === fid), 'own feed shows it');
    assert.equal((await admin.api('admin/moderation/hide', 'POST', { target_type: 'feed_post', target_id: fid }, admin.token)).status, 200);
    const hidden = await (await admin.api('timeline', 'GET', null, su.access_token)).json();
    assert.ok(!hidden.posts.some((x) => x.id === fid), 'feed hides it');
    assert.equal((await admin.api('admin/moderation/unhide', 'POST', { target_type: 'feed_post', target_id: fid }, admin.token)).status, 200);
    const back = await (await admin.api('timeline', 'GET', null, su.access_token)).json();
    assert.ok(back.posts.some((x) => x.id === fid), 'feed restores it');

    const room = await (await admin.api('community/rooms', 'POST', { name: 'F29 open' }, su.access_token)).json();
    const cpost = await admin.api(`community/rooms/${room.id}/posts`, 'POST', { body: 'open hello' }, su.access_token);
    assert.equal(cpost.status, 201);
    const cid = (await cpost.json()).id;
    const listed = await (await admin.api(`community/rooms/${room.id}/posts`, 'GET', null, su.access_token)).json();
    assert.ok(listed.posts.some((x) => x.id === cid), 'room shows it');
    assert.equal((await admin.api('admin/moderation/hide', 'POST', { target_type: 'community_post', target_id: cid }, admin.token)).status, 200);
    const clHidden = await (await admin.api(`community/rooms/${room.id}/posts`, 'GET', null, su.access_token)).json();
    assert.ok(!clHidden.posts.some((x) => x.id === cid), 'room hides it');
    assert.equal((await admin.api('admin/moderation/unhide', 'POST', { target_type: 'community_post', target_id: cid }, admin.token)).status, 200);
    const clBack = await (await admin.api(`community/rooms/${room.id}/posts`, 'GET', null, su.access_token)).json();
    assert.ok(clBack.posts.some((x) => x.id === cid), 'room restores it');
  } finally { db.raw.close(); }
});

test('F29: hiding an attachment blocklists its bytes against re-upload', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const admin = await makeAdmin(db, bucket);
    const a = await register(admin.api, 'f29-aa@luno-test.local');
    const ab = await register(admin.api, 'f29-ab@luno-test.local');
    const sa = await login(admin.api, 'f29-aa@luno-test.local');
    const room = await makeRoom(admin.api, sa.access_token, [ab.id]);
    const bytes = Buffer.from('evil-bytes').toString('base64');
    const up = await admin.api('attachments', 'POST', { conversation_id: room.id, content_base64: bytes, mime_type: 'image/png', original_name: 'e.png' }, sa.access_token);
    assert.equal(up.status, 201);
    const attId = (await up.json()).id;

    assert.equal((await admin.api('admin/moderation/hide', 'POST', { target_type: 'attachment', target_id: attId, reason: 'F29 probe' }, admin.token)).status, 200);
    assert.equal((await admin.api(`attachments/${attId}`, 'GET', null, sa.access_token)).status, 404, 'bytes gone');
    assert.ok(db.raw.prepare('SELECT * FROM luno_blocked_hashes').get(), 'hash blocklisted');
    assert.ok(db.raw.prepare("SELECT * FROM luno_audit WHERE action = 'moderation.attach_block' AND target = ?").get(attId), 'block audited');

    const again = await admin.api('attachments', 'POST', { conversation_id: room.id, content_base64: bytes, mime_type: 'image/png', original_name: 'e2.png' }, sa.access_token);
    assert.equal(again.status, 403, 'same bytes rejected');
    assert.equal((await again.json()).code, 'ATTACHMENT_BLOCKED');
    const fresh = await admin.api('attachments', 'POST', { conversation_id: room.id, content_base64: Buffer.from('fresh-bytes').toString('base64'), mime_type: 'image/png', original_name: 'f.png' }, sa.access_token);
    assert.equal(fresh.status, 201, 'other bytes still upload');
    assert.equal((await admin.api('admin/moderation/unhide', 'POST', { target_type: 'attachment', target_id: attId }, admin.token)).status, 400, 'gone bytes cannot be unhidden');
  } finally { db.raw.close(); }
});

test('F29: hide validates auth and targets', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const admin = await makeAdmin(db, bucket);
    await register(admin.api, 'f29-hu@luno-test.local');
    const su = await login(admin.api, 'f29-hu@luno-test.local');
    assert.equal((await admin.api('admin/moderation/hide', 'POST', { target_type: 'message', target_id: 'm-ghost' }, su.access_token)).status, 403, 'users cannot hide');
    assert.equal((await admin.api('admin/moderation/unhide', 'POST', { target_type: 'message', target_id: 'm-ghost' }, su.access_token)).status, 403, 'users cannot unhide');
    assert.equal((await admin.api('admin/moderation/hide', 'POST', { target_type: 'message', target_id: 'm-ghost' }, admin.token)).status, 404, 'unknown message');
    assert.equal((await admin.api('admin/moderation/hide', 'POST', { target_type: 'feed_post', target_id: 'p-ghost' }, admin.token)).status, 404, 'unknown feed post');
    assert.equal((await admin.api('admin/moderation/hide', 'POST', { target_type: 'community_post', target_id: 'c-ghost' }, admin.token)).status, 404, 'unknown community post');
    assert.equal((await admin.api('admin/moderation/hide', 'POST', { target_type: 'attachment', target_id: 'a-ghost' }, admin.token)).status, 404, 'unknown attachment');
    assert.equal((await admin.api('admin/moderation/hide', 'POST', { target_type: 'nope', target_id: 'x' }, admin.token)).status, 400, 'unknown target type');
    assert.equal((await admin.api('admin/moderation/hide', 'POST', { target_type: 'message' }, admin.token)).status, 400, 'missing target id');
  } finally { db.raw.close(); }
});
