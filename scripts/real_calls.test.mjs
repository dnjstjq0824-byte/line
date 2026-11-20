// Build 18 "real calls": a callee whose app was closed is woken by a
// data-only push, finds the ringing call (calls/incoming), replays the
// caller's offer and ICE it missed (calls/:id/signals), and can decline from
// the lock screen without a session (ring token). Ending a ring sends a
// call_end push so the full-screen ring disappears on every device.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { makeD1, makeBucket, F24_CONSENT } from './test_helpers.mjs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = JSON.stringify({
  type: 'service_account', project_id: 'luno-test-proj',
  client_email: 'fcm@luno-test-proj.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  token_uri: 'https://oauth2.googleapis.com/token',
});

let serial = 0;
function recorder() {
  const sends = [];
  const stub = async (url, opts) => {
    if (url.startsWith('https://oauth2.googleapis.com/')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'ya29.test', expires_in: 3600 }) };
    }
    sends.push(JSON.parse(opts.body).message);
    return { ok: true, status: 200, json: async () => ({}) };
  };
  return { sends, stub };
}
// Every request runs on a fresh isolate sharing one D1 (production shape).
function makeApi(db, extraEnv = {}) {
  return async (path, method = 'GET', body = null, token = null) => {
    const mod = await import(`./cf_worker.js?realcalls=${++serial}`);
    const env = { DB: db, DURABLE_CONVERSATIONS: 'true', MEDIA_BUCKET: makeBucket(), ...extraEnv };
    return mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  };
}
const PW = 'Str0ng!Passw0rd';
async function setup(api, tag) {
  const reg = async (who) => {
    const email = `rc-${who}-${tag}@luno-test.local`;
    const r = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: `${who}_${tag}`, handle: `rc_${who}_${tag}` });
    assert.equal(r.status, 201);
    const id = (await r.json()).id;
    const token = (await (await api('auth/login', 'POST', { email, password: PW })).json()).access_token;
    return { id, token };
  };
  const a = await reg('a');
  const b = await reg('b');
  const room = await (await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
  return { a, b, cid: room.id };
}

test('a cold-started callee finds the ring and replays the missed offer and ICE', async () => {
  const db = makeD1();
  try {
    const api = makeApi(db);
    const { a, b, cid } = await setup(api, 'cold');
    assert.deepEqual(await (await api('calls/incoming', 'GET', null, b.token)).json(), { call: null });
    const created = await api('calls', 'POST', { conversation_id: cid, kind: 'video' }, a.token);
    assert.equal(created.status, 201);
    const callId = (await created.json()).id;
    // The caller trickles while B's app is still closed.
    await api(`calls/${callId}/signal`, 'POST', { signal_type: 'offer', sdp: 'v=0 offer' }, a.token);
    await api(`calls/${callId}/signal`, 'POST', { signal_type: 'ice-candidate', candidate: '{"candidate":"c1"}' }, a.token);
    await api(`calls/${callId}/signal`, 'POST', { signal_type: 'ice-candidate', candidate: { candidate: 'c2' } }, a.token);

    const inc = await (await api('calls/incoming', 'GET', null, b.token)).json();
    assert.equal(inc.call.call_id, callId);
    assert.equal(inc.call.conversation_id, cid);
    assert.equal(inc.call.kind, 'video');
    assert.equal(inc.call.initiated_by, a.id);
    assert.equal(inc.call.caller_name, 'a_cold');
    assert.match(inc.call.ring_token, /^[0-9a-f]{64}$/);
    // The caller does not see its own call as incoming.
    assert.deepEqual(await (await api('calls/incoming', 'GET', null, a.token)).json(), { call: null });

    const sig = await (await api(`calls/${callId}/signals`, 'GET', null, b.token)).json();
    assert.deepEqual(sig.signals.map((x) => x.signal_type), ['offer', 'ice-candidate', 'ice-candidate']);
    assert.equal(sig.signals[0].sdp, 'v=0 offer');
    assert.equal(JSON.parse(sig.signals[2].candidate).candidate, 'c2');
    // B's own signals are not echoed back; `after` pages.
    await api(`calls/${callId}/state`, 'POST', { state: 'connected' }, b.token);
    await api(`calls/${callId}/signal`, 'POST', { signal_type: 'answer', sdp: 'v=0 answer' }, b.token);
    const again = await (await api(`calls/${callId}/signals?after=${sig.signals[1].id}`, 'GET', null, b.token)).json();
    assert.deepEqual(again.signals.map((x) => x.signal_type), ['ice-candidate']);
    const forA = await (await api(`calls/${callId}/signals`, 'GET', null, a.token)).json();
    assert.deepEqual(forA.signals.map((x) => x.signal_type), ['answer']);
    // Connected: no longer "incoming".
    assert.deepEqual(await (await api('calls/incoming', 'GET', null, b.token)).json(), { call: null });
    // Ending wipes the stored signals.
    await api(`calls/${callId}/state`, 'POST', { state: 'ended' }, a.token);
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM luno_call_signals WHERE call_id = ?').get(callId).n, 0);
  } finally { db.raw.close(); }
});

test('outsiders cannot read a call\'s signals', async () => {
  const db = makeD1();
  try {
    const api = makeApi(db);
    const { a, cid } = await setup(api, 'out');
    const callId = (await (await api('calls', 'POST', { conversation_id: cid, kind: 'voice' }, a.token)).json()).id;
    await api(`calls/${callId}/signal`, 'POST', { signal_type: 'offer', sdp: 'secret' }, a.token);
    const email = 'rc-c-out@luno-test.local';
    await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: 'c', handle: 'rc_c_out' });
    const c = (await (await api('auth/login', 'POST', { email, password: PW })).json()).access_token;
    assert.equal((await api(`calls/${callId}/signals`, 'GET', null, c)).status, 404);
    assert.deepEqual(await (await api('calls/incoming', 'GET', null, c)).json(), { call: null });
  } finally { db.raw.close(); }
});

test('lock-screen decline works with the ring token only, once', async () => {
  const db = makeD1();
  try {
    const api = makeApi(db);
    const { a, b, cid } = await setup(api, 'dec');
    const callId = (await (await api('calls', 'POST', { conversation_id: cid, kind: 'voice' }, a.token)).json()).id;
    const token = (await (await api('calls/incoming', 'GET', null, b.token)).json()).call.ring_token;
    assert.equal((await api(`calls/${callId}/ring-decline`, 'POST', { token: 'x'.repeat(64) })).status, 404);
    assert.equal((await api(`calls/${callId}/ring-decline`, 'POST', {})).status, 404);
    const ok = await api(`calls/${callId}/ring-decline`, 'POST', { token });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { status: 'ended', result: 'declined' });
    // The ledger shows a declined call, and the token is spent.
    const hist = await (await api('calls', 'GET', null, a.token)).json();
    assert.ok(hist.calls.some((r) => r.result === 'declined'));
    assert.equal((await api(`calls/${callId}/ring-decline`, 'POST', { token })).status, 404);
  } finally { db.raw.close(); }
});

test('ending or answering a ring pushes call_end; the ring itself is data-only', async () => {
  const db = makeD1();
  const rec = recorder();
  try {
    const api = makeApi(db, { PUSH_PROVIDER: 'fcm', FCM_SERVICE_ACCOUNT_JSON: SA, FCM_FETCH: rec.stub });
    const { a, b, cid } = await setup(api, 'end');
    await api('push-tokens', 'POST', { token: 'tok-a', platform: 'android', device_id: 'dev-a' }, a.token);
    await api('push-tokens', 'POST', { token: 'tok-b', platform: 'android', device_id: 'dev-b' }, b.token);

    const first = (await (await api('calls', 'POST', { conversation_id: cid, kind: 'voice' }, a.token)).json()).id;
    const ring = rec.sends.find((m) => m.data?.kind === 'call');
    assert.equal(ring.token, 'tok-b');
    assert.equal(ring.notification, undefined);
    rec.sends.length = 0;
    // Caller gives up: both devices get call_end (B's ring screen closes).
    await api(`calls/${first}/state`, 'POST', { state: 'ended' }, a.token);
    const ends = rec.sends.filter((m) => m.data?.kind === 'call_end');
    assert.deepEqual(ends.map((m) => m.token).sort(), ['tok-a', 'tok-b']);
    assert.equal(ends[0].data.call_id, first);
    assert.equal(ends[0].notification, undefined);
    assert.equal(ends[0].android.priority, 'high');

    rec.sends.length = 0;
    const second = (await (await api('calls', 'POST', { conversation_id: cid, kind: 'video' }, a.token)).json()).id;
    rec.sends.length = 0;
    // Answered: other devices stop ringing too.
    await api(`calls/${second}/state`, 'POST', { state: 'connected' }, b.token);
    assert.ok(rec.sends.some((m) => m.data?.kind === 'call_end' && m.data.call_id === second && m.token === 'tok-b'));
  } finally { db.raw.close(); }
});

test('a stale ring (caller app died) is not offered to a late cold start', async () => {
  const db = makeD1();
  try {
    const api = makeApi(db);
    const { a, b, cid } = await setup(api, 'stale');
    const callId = (await (await api('calls', 'POST', { conversation_id: cid, kind: 'voice' }, a.token)).json()).id;
    db.raw.prepare('UPDATE luno_call_sessions SET started_at = ? WHERE id = ?').run(new Date(Date.now() - 5 * 60 * 1000).toISOString(), callId);
    assert.deepEqual(await (await api('calls/incoming', 'GET', null, b.token)).json(), { call: null });
  } finally { db.raw.close(); }
});
