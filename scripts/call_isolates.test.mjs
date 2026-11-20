// Field report (build 15): B pressed accept and nothing happened; A hung up
// and B kept ringing. The call existed only in the creating isolate's
// memory, so accept / hang-up / SDP signals that landed on another isolate
// got 404. Every step here runs on a fresh isolate sharing one D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket, F24_CONSENT } from './test_helpers.mjs';

let serial = 0;
async function isolate(db) {
  const mod = await import(`./cf_worker.js?calliso=${++serial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', MEDIA_BUCKET: makeBucket() };
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
  const a = await reg(`ci-a-${tag}@luno-test.local`);
  const b = await reg(`ci-b-${tag}@luno-test.local`);
  const room = await (await one('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
  const created = await one('calls', 'POST', { conversation_id: room.id, kind: 'voice' }, a.token);
  assert.equal(created.status, 201);
  const call = await created.json();
  return { a, b, room, call };
}

test('accept, signal and hang-up all work on other isolates', async () => {
  const db = makeD1();
  try {
    const { a, b, call } = await setup(db, 'ok');
    const offer = await (await isolate(db))(`calls/${call.id}/signal`, 'POST', { signal_type: 'offer', sdp: 'v=0' }, a.token);
    assert.equal(offer.status, 200, await offer.clone().text());
    const accept = await (await isolate(db))(`calls/${call.id}/state`, 'POST', { state: 'connected' }, b.token);
    assert.equal(accept.status, 200, await accept.clone().text());
    const answer = await (await isolate(db))(`calls/${call.id}/signal`, 'POST', { signal_type: 'answer', sdp: 'v=0' }, b.token);
    assert.equal(answer.status, 200);
    const ice = await (await isolate(db))(`calls/${call.id}/signal`, 'POST', { signal_type: 'ice-candidate', candidate: '{}' }, a.token);
    assert.equal(ice.status, 200);
    const end = await (await isolate(db))(`calls/${call.id}/state`, 'POST', { state: 'ended' }, a.token);
    assert.equal(end.status, 200, await end.clone().text());
    assert.equal((await end.json()).result, 'completed', 'the connect from another isolate counts');
  } finally { db.raw.close(); }
});

test('caller hanging up on another isolate cancels the ringing call', async () => {
  const db = makeD1();
  try {
    const { a, b, call } = await setup(db, 'cancel');
    const end = await (await isolate(db))(`calls/${call.id}/state`, 'POST', { state: 'ended' }, a.token);
    assert.equal(end.status, 200, await end.clone().text());
    assert.equal((await end.json()).result, 'canceled');
    // The callee's late accept must not resurrect it.
    const late = await (await isolate(db))(`calls/${call.id}/state`, 'POST', { state: 'connected' }, b.token);
    assert.equal(late.status, 200);
    assert.equal((await late.json()).status, 'ended');
  } finally { db.raw.close(); }
});

test('strangers still cannot touch the call', async () => {
  const db = makeD1();
  try {
    const { call } = await setup(db, 'auth');
    const one = await isolate(db);
    await one('auth/register', 'POST', { ...F24_CONSENT, email: 'ci-x@luno-test.local', password: PW, display_name: 'x' });
    const x = (await (await one('auth/login', 'POST', { email: 'ci-x@luno-test.local', password: PW })).json()).access_token;
    const r = await (await isolate(db))(`calls/${call.id}/state`, 'POST', { state: 'ended' }, x);
    assert.equal(r.status, 404);
  } finally { db.raw.close(); }
});
