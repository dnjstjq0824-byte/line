// B4/A-20: attachments store bytes in R2 with metadata-only D1 rows.
// Base64 intake stays (client compat) but no new b64 is written to D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBucket, makeD1 } from './test_helpers.mjs';

const BASE = 'https://localhost';

let isoCounter = 9100;
async function isolate(extraEnv = {}) {
  const db = makeD1();
  const bucket = makeBucket();
  const mod = await import(`./cf_worker.js?r2=${++isoCounter}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', MEDIA_BUCKET: bucket, ...extraEnv };
  if (extraEnv.MEDIA_BUCKET === null) delete env.MEDIA_BUCKET;
  if (extraEnv.DB === null) delete env.DB;
  const api = (path, method = 'GET', body = null, token = null, headers = {}) => mod.default.fetch(new Request(`${BASE}/api/v1/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === null ? undefined : JSON.stringify(body)
  }), env);
  return { api, db, bucket };
}
async function signup(api, email, handle) {
  const reg = await api('auth/register', 'POST', { email, password: 'R2#Testpass9', display_name: handle, handle });
  assert.equal(reg.status, 201, `register ${email}`);
  const login = await api('auth/login', 'POST', { email, password: 'R2#Testpass9' });
  assert.equal(login.status, 200, `login ${email}`);
  return { id: (await reg.json()).id, ...(await login.json()) };
}
async function directRoom(api, token, peerId) {
  const room = await api('conversations', 'POST', { title: 'dm', member_ids: [peerId] }, token);
  assert.equal(room.status, 201);
  return (await room.json()).id;
}

test('B4: upload stores bytes in R2 and metadata-only rows in D1', async () => {
  const { api, db, bucket } = await isolate();
  const a = await signup(api, 'r2-a@local.test', 'r2a');
  const b = await signup(api, 'r2-b@local.test', 'r2b');
  const cid = await directRoom(api, a.access_token, b.id);
  const b64 = Buffer.from('r2-bytes-here').toString('base64');
  const up = await api('attachments', 'POST', { conversation_id: cid, content_base64: b64, mime_type: 'text/plain', original_name: 'note.txt' }, a.access_token);
  assert.equal(up.status, 201);
  const { id } = await up.json();
  const row = db.raw.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  assert.ok(row, 'metadata row exists');
  assert.equal(row.conversation_id, cid);
  assert.equal(row.mime_type, 'text/plain');
  assert.equal(row.size_bytes, 13);
  assert.match(row.sha256, /^[0-9a-f]{64}$/);
  assert.ok(row.object_key.length > 0);
  assert.equal(row.uploader_id, a.id);
  assert.equal(row.name, 'note.txt');
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_attachments').get().n, 0, 'no legacy b64 write');
  assert.equal(bucket.objects.size, 1, 'one R2 object');
  for (const path of [`attachments/${id}`, `attachments/${id}/content`]) {
    const res = await api(path, 'GET', null, b.access_token);
    assert.equal(res.status, 200);
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), 'r2-bytes-here');
  }
});

test('B4: uploads reject bad MIME, oversize bodies, and missing storage', async () => {
  const { api } = await isolate();
  const a = await signup(api, 'r2c-a@local.test', 'r2ca');
  const b = await signup(api, 'r2c-b@local.test', 'r2cb');
  const cid = await directRoom(api, a.access_token, b.id);
  const good = Buffer.from('x').toString('base64');
  const badMime = await api('attachments', 'POST', { conversation_id: cid, content_base64: good, mime_type: 'application/x-sh', original_name: 'evil.sh' }, a.access_token);
  assert.equal(badMime.status, 415);
  assert.equal((await badMime.json()).code, 'MIME_NOT_ALLOWED');
  const big = await api('attachments', 'POST', { conversation_id: cid, content_base64: 'A'.repeat(14_000_001), mime_type: 'text/plain', original_name: 'big.txt' }, a.access_token);
  assert.equal(big.status, 413);
  const outsider = await signup(api, 'r2c-c@local.test', 'r2cc');
  assert.equal((await api('attachments', 'POST', { conversation_id: cid, content_base64: good, mime_type: 'text/plain', original_name: 'x.txt' }, outsider.access_token)).status, 404);

  const noBucket = await isolate({ MEDIA_BUCKET: null });
  const n1 = await signup(noBucket.api, 'r2n-a@local.test', 'r2na');
  const n2 = await signup(noBucket.api, 'r2n-b@local.test', 'r2nb');
  const ncid = await directRoom(noBucket.api, n1.access_token, n2.id);
  const missing = await noBucket.api('attachments', 'POST', { conversation_id: ncid, content_base64: good, mime_type: 'text/plain', original_name: 'x.txt' }, n1.access_token);
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).code, 'MEDIA_UNAVAILABLE');
});

test('B4: legacy D1 base64 rows stay readable after the cutover', async () => {
  const { api, db } = await isolate();
  const a = await signup(api, 'r2l-a@local.test', 'r2la');
  const b = await signup(api, 'r2l-b@local.test', 'r2lb');
  const cid = await directRoom(api, a.access_token, b.id);
  db.raw.prepare('INSERT INTO luno_attachments (id, conversation_id, owner_id, name, mime, size, b64, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('legacy-1', cid, a.id, 'old.txt', 'text/plain', 7, Buffer.from('old-one').toString('base64'), new Date().toISOString());
  const res = await api('attachments/legacy-1', 'GET', null, b.access_token);
  assert.equal(res.status, 200);
  assert.equal(Buffer.from(await res.arrayBuffer()).toString(), 'old-one');
  assert.equal((await api('attachments/does-not-exist', 'GET', null, a.access_token)).status, 404);
});
