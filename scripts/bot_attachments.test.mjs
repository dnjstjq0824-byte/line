// S7 (blueprint 9-5), server side: bot tokens may upload screenshots through
// POST attachments when the room is in token scope with the post op.
// Images only, 5MB cap. Real sqlite isolates plus a fake R2 bucket.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket, F24_CONSENT } from './test_helpers.mjs';

const PW = 'Str0ng!Passw0rd';
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
let serial = 0;
async function isolate(db, bucket) {
  const mod = await import(`./cf_worker.js?batt=${++serial}`);
  const env = { DB: db, MEDIA_BUCKET: bucket, DURABLE_CONVERSATIONS: 'true', LLM_ENABLED: 'true' };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api };
}
async function world() {
  const db = makeD1();
  const bucket = makeBucket();
  const first = await isolate(db, bucket);
  const reg = await first.api('auth/register', 'POST', { ...F24_CONSENT, email: 'batt-admin@luno-test.local', password: PW, display_name: 'admin' });
  const adminId = (await reg.json()).id;
  const mod = await import(`./cf_worker.js?batt=${++serial}`);
  const env = { DB: db, MEDIA_BUCKET: bucket, DURABLE_CONVERSATIONS: 'true', LLM_ENABLED: 'true', ADMIN_USER_IDS: adminId };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  const login = async (email) => (await (await api('auth/login', 'POST', { email, password: PW })).json()).access_token;
  const adminToken = await login('batt-admin@luno-test.local');
  const oreg = await api('auth/register', 'POST', { ...F24_CONSENT, email: 'batt-owner@luno-test.local', password: PW, display_name: 'owner' });
  const ownerId = (await oreg.json()).id;
  const owner = await login('batt-owner@luno-test.local');
  const breg = await api('auth/register', 'POST', { ...F24_CONSENT, email: 'batt-stand@luno-test.local', password: PW, display_name: 'stand' });
  const standId = (await breg.json()).id;
  const bot = await (await api('admin/bots', 'POST', { display_name: 'PC', handle: 'pc_shot' }, adminToken)).json();
  const mkRoom = async (members) => (await (await api('conversations', 'POST', { kind: 'group', title: 'R', member_ids: members }, owner)).json());
  const room1 = await mkRoom([bot.id]);
  const room2 = await mkRoom([bot.id]);
  const room3 = await mkRoom([standId]);
  const mint = async (rooms, ops) => (await (await api(`admin/bots/${bot.id}/tokens`, 'POST', { rooms, ops, ttl_sec: 3600 }, adminToken)).json()).token;
  const tok = await mint([room1.id], ['read', 'post', 'propose']);
  const tokRead = await mint([room1.id], ['read']);
  const tokRoom3 = await mint([room3.id], ['read', 'post']);
  return { db, bucket, api, adminToken, owner, ownerId, bot, room1, room2, room3, tok, tokRead, tokRoom3 };
}
const upload = (api, token, conversation_id, content_base64, mime_type = 'image/png') =>
  api('attachments', 'POST', { conversation_id, content_base64, mime_type, original_name: 'shot.png' }, token);

test('bot uploads an image to a scoped room; the owner reads it back', async () => {
  const w = await world();
  try {
    const res = await upload(w.api, w.tok, w.room1.id, PNG_1PX);
    assert.equal(res.status, 201);
    const { id } = await res.json();
    assert.ok(id);
    const got = await w.api(`attachments/${id}/content`, 'GET', null, w.owner);
    assert.equal(got.status, 200);
    assert.equal(Buffer.from(await got.arrayBuffer()).toString('base64'), PNG_1PX);
  } finally { w.db.raw.close(); }
});

test('bot without the post op is refused', async () => {
  const w = await world();
  try {
    assert.equal((await upload(w.api, w.tokRead, w.room1.id, PNG_1PX)).status, 403);
  } finally { w.db.raw.close(); }
});

test('scope, not membership, gates bot uploads', async () => {
  const w = await world();
  try {
    assert.equal((await upload(w.api, w.tok, w.room2.id, PNG_1PX)).status, 403, 'member but out of scope');
    const res = await upload(w.api, w.tokRoom3, w.room3.id, PNG_1PX);
    assert.equal(res.status, 201, 'in scope though not a member');
  } finally { w.db.raw.close(); }
});

test('bots may only upload images', async () => {
  const w = await world();
  try {
    const pdf = Buffer.from('%PDF-1.4 fake').toString('base64');
    assert.equal((await upload(w.api, w.tok, w.room1.id, pdf, 'application/pdf')).status, 415);
  } finally { w.db.raw.close(); }
});

test('bot uploads cap at 5MB', async () => {
  const w = await world();
  try {
    const over = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
    assert.equal((await upload(w.api, w.tok, w.room1.id, over)).status, 413);
    const edge = Buffer.alloc(5 * 1024 * 1024).toString('base64');
    assert.equal((await upload(w.api, w.tok, w.room1.id, edge)).status, 201);
  } finally { w.db.raw.close(); }
});

test('users keep the 10MB allowance', async () => {
  const w = await world();
  try {
    const six = Buffer.alloc(6 * 1024 * 1024).toString('base64');
    assert.equal((await upload(w.api, w.owner, w.room1.id, six, 'application/pdf')).status, 201);
  } finally { w.db.raw.close(); }
});

test('bot posts an image message referencing its upload', async () => {
  const w = await world();
  try {
    const up = await upload(w.api, w.tok, w.room1.id, PNG_1PX);
    assert.equal(up.status, 201);
    const { id } = await up.json();
    const res = await w.api(`conversations/${w.room1.id}/messages`, 'POST',
      { kind: 'image', body: '/ · phone', metadata: { attachment_id: id } }, w.tok);
    assert.equal(res.status, 201);
    const sent = await res.json();
    assert.equal(sent.metadata.attachment_id, id);
    assert.equal(sent.metadata.mime_type, 'image/png');
  } finally { w.db.raw.close(); }
});
