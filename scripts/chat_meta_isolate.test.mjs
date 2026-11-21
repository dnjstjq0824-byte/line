// 6-8: chat list flags (pin/mute/hide) survive isolates. They lived in a
// module-level Map, so a flag set on one isolate vanished on the next —
// including mutes, which also broke cross-isolate push suppression
// (roomMuted read a legacy table that is never written). Every step here
// runs on a fresh isolate sharing one D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, F24_CONSENT } from './test_helpers.mjs';

let serial = 0;
async function isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?chatmeta=${++serial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', PUSH_PROVIDER: 'log', ...extraEnv };
  return (path, method = 'GET', body = null, token = null) => mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === null ? undefined : JSON.stringify(body),
  }), env);
}
const PW = 'Str0ng!Passw0rd';

async function setup(db, tag) {
  const one = await isolate(db);
  const reg = async (email) => {
    const r = await one('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
    assert.equal(r.status, 201);
    const id = (await r.json()).id;
    const token = (await (await one('auth/login', 'POST', { email, password: PW })).json()).access_token;
    return { id, token };
  };
  const a = await reg(`cm-a-${tag}@luno-test.local`);
  const b = await reg(`cm-b-${tag}@luno-test.local`);
  const room = await (await one('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
  return { a, b, room };
}

test('pin/mute/hide set on one isolate show on another', async () => {
  const db = makeD1();
  try {
    const { a, b, room } = await setup(db, 'flags');
    const one = await isolate(db);
    const patched = await one(`conversations/${room.id}/meta`, 'PATCH', { pinned: true, muted: true }, b.token);
    assert.equal(patched.status, 200);
    // Fresh isolate: the list carries the flags from D1.
    const two = await isolate(db);
    const list = await (await two('conversations', 'GET', null, b.token)).json();
    const row = list.conversations.find((c) => c.id === room.id);
    assert.ok(row, 'room listed');
    assert.equal(row.pinned, true, 'pin survives');
    assert.equal(row.muted, true, 'mute survives');
    // Hide on isolate 2, confirm the filter on isolate 3.
    assert.equal((await two(`conversations/${room.id}/meta`, 'PATCH', { hidden: true }, b.token)).status, 200);
    const three = await isolate(db);
    const relist = await (await three('conversations', 'GET', null, b.token)).json();
    assert.ok(!relist.conversations.some((c) => c.id === room.id), 'hidden filtered on cold isolate');
    const withHidden = await (await three('conversations?include_hidden=1', 'GET', null, b.token)).json();
    assert.ok(withHidden.conversations.some((c) => c.id === room.id && c.hidden === true), 'hidden visible with flag');
    // A sees nothing of B's flags.
    const alist = await (await three('conversations', 'GET', null, a.token)).json();
    const arow = alist.conversations.find((c) => c.id === room.id);
    assert.equal(arow.pinned, false, 'flags are per-user');
    assert.equal(arow.muted, false, 'flags are per-user');
  } finally { db.raw.close(); }
});

test('mute set on one isolate suppresses push evaluated on another', async () => {
  const db = makeD1();
  try {
    const { a, b, room } = await setup(db, 'mute');
    assert.equal((await (await isolate(db))(`conversations/${room.id}/meta`, 'PATCH', { muted: true }, b.token)).status, 200);
    // Send from a cold isolate: B stays silent via the D1 mute read.
    const two = await isolate(db);
    assert.equal((await two(`conversations/${room.id}/messages`, 'POST', { body: 'muted?' }, a.token)).status, 201);
    assert.deepEqual(db.raw.prepare('SELECT user_id FROM luno_push_outbox').all(), [], 'muted room gets nothing');
    // Unmute from another cold isolate: the next message notifies.
    assert.equal((await (await isolate(db))(`conversations/${room.id}/meta`, 'PATCH', { muted: false }, b.token)).status, 200);
    assert.equal((await (await isolate(db))(`conversations/${room.id}/messages`, 'POST', { body: 'loud?' }, a.token)).status, 201);
    assert.deepEqual(db.raw.prepare('SELECT user_id FROM luno_push_outbox').all().map((r) => r.user_id), [b.id]);
  } finally { db.raw.close(); }
});
