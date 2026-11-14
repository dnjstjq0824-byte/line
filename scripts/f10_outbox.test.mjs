// Stage 10 (F10): client_id dedup survives cold isolates and races — a
// retry with the same client message id returns the original (duplicate:
// true) instead of storing twice. Zero loss, zero duplicates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket } from './test_helpers.mjs';

let f10Serial = 0;
async function f10Isolate(db, bucket, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f10=${++f10Serial}`);
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

test('F10: retry with the same client_id returns the original', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f10Isolate(db, bucket);
    const a = await registerLogin(api, 'f10-a@luno-test.local');
    const b = await registerLogin(api, 'f10-b@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Q', member_ids: [b.id] }, a.token)).json();
    const first = await api(`conversations/${room.id}/messages`, 'POST', { client_id: 'c-1', body: 'hello' }, a.token);
    assert.equal(first.status, 201);
    const id = (await first.json()).message.id;
    const retry = await api(`conversations/${room.id}/messages`, 'POST', { client_id: 'c-1', body: 'hello' }, a.token);
    assert.equal(retry.status, 200);
    const rj = await retry.json();
    assert.equal(rj.duplicate, true);
    assert.equal(rj.message.id, id);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_messages WHERE conversation_id = ?').get(room.id).n, 2, 'system + one user message');
  } finally { db.raw.close(); }
});

test('F10: retries dedup past the 500-message memory window', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f10Isolate(db, bucket);
    const a = await registerLogin(api, 'f10-c@luno-test.local');
    const b = await registerLogin(api, 'f10-d@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Q', member_ids: [b.id] }, a.token)).json();
    const first = await api(`conversations/${room.id}/messages`, 'POST', { client_id: 'c-9', body: 'hi' }, a.token);
    const id = (await first.json()).message.id;
    // Bury c-9 below the hydrate window with 501 filler rows, straight in D1.
    const at = new Date().toISOString();
    const ins = db.raw.prepare('INSERT INTO luno_messages (id, conversation_id, sender_id, client_id, sequence, kind, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (let i = 0; i < 501; i++) ins.run(`f10-fill-${i}`, room.id, a.id, `fill-${i}`, 10 + i, 'text', `f${i}`, at);
    const { api: cold } = await f10Isolate(db, bucket);
    const ta = (await (await cold('auth/login', 'POST', { email: 'f10-c@luno-test.local', password: PW })).json()).access_token;
    const retry = await cold(`conversations/${room.id}/messages`, 'POST', { client_id: 'c-9', body: 'hi' }, ta);
    assert.equal(retry.status, 200, 'deep retry deduped');
    const rj = await retry.json();
    assert.equal(rj.duplicate, true);
    assert.equal(rj.message.id, id);
    assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM luno_messages WHERE conversation_id = ? AND client_id = 'c-9'").get(room.id).n, 1);
  } finally { db.raw.close(); }
});

test('F10: a unique index backs the dedup against races', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f10Isolate(db, bucket);
    await registerLogin(api, 'f10-g@luno-test.local');
    const idx = db.raw.prepare("SELECT sql FROM sqlite_master WHERE name = 'idx_luno_messages_client'").get();
    assert.ok(idx && idx.sql.includes('conversation_id') && idx.sql.includes('sender_id') && idx.sql.includes('client_id'), 'client dedup index present');
  } finally { db.raw.close(); }
});

test('F10: concurrent same client_id stores exactly one row', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f10Isolate(db, bucket);
    const a = await registerLogin(api, 'f10-e@luno-test.local');
    const b = await registerLogin(api, 'f10-f@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Q', member_ids: [b.id] }, a.token)).json();
    const [r1, r2] = await Promise.all([
      api(`conversations/${room.id}/messages`, 'POST', { client_id: 'c-race', body: 'x' }, a.token),
      api(`conversations/${room.id}/messages`, 'POST', { client_id: 'c-race', body: 'x' }, a.token),
    ]);
    const j1 = await r1.json();
    const j2 = await r2.json();
    assert.deepEqual([r1.status, r2.status].sort(), [200, 201]);
    assert.equal([j1.duplicate, j2.duplicate].filter(Boolean).length, 1, 'exactly one duplicate flag');
    assert.equal(j1.message.id, j2.message.id, 'same message id');
    assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM luno_messages WHERE conversation_id = ? AND kind = 'text'").get(room.id).n, 1);
  } finally { db.raw.close(); }
});
