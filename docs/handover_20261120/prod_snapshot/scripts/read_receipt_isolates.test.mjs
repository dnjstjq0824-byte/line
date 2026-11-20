// "읽음" vanished in production: decorateMessage counts the other members'
// read cursors, but a cold isolate only loaded the viewer's own cursor from
// D1. A peer who read on another isolate therefore showed as unread.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket, F24_CONSENT } from './test_helpers.mjs';

let serial = 0;
async function isolate(db) {
  const mod = await import(`./cf_worker.js?rri=${++serial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', MEDIA_BUCKET: makeBucket() };
  return (path, method = 'GET', body = null, token = null) => mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === null ? undefined : JSON.stringify(body),
  }), env);
}
const PW = 'Str0ng!Passw0rd';

test('a peer read on another isolate shows as read for the sender', async () => {
  const db = makeD1();
  try {
    const one = await isolate(db);
    const reg = async (email) => {
      const r = await one('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
      assert.equal(r.status, 201);
      const id = (await r.json()).id;
      const token = (await (await one('auth/login', 'POST', { email, password: PW })).json()).access_token;
      return { id, token };
    };
    const a = await reg('rr-a@luno-test.local');
    const b = await reg('rr-b@luno-test.local');
    const room = await (await one('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
    const sent = await one(`conversations/${room.id}/messages`, 'POST', { client_id: 'rr-1', kind: 'text', body: 'hello' }, a.token);
    assert.equal(sent.status, 201);

    const two = await isolate(db);
    const read = await two(`conversations/${room.id}/read`, 'POST', {}, b.token);
    assert.equal(read.status, 200, await read.clone().text());

    const three = await isolate(db);
    const list = await (await three(`conversations/${room.id}/messages`, 'GET', null, a.token)).json();
    const msg = list.messages.find((m) => m.body === 'hello');
    assert.equal(msg.read_count, 1);
  } finally { db.raw.close(); }
});
