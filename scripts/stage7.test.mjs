// Stage 7 (N2-L): 1:1 call signaling over the existing contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from './test_helpers.mjs';

const policy = await import('../apps/shared/call_policy.ts');

let stage7Serial = 0;
async function stage7Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?stage7=${++stage7Serial}`);
  const env = { ...(db ? { DB: db } : {}), ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api, env, mod };
}

async function registerLogin(api, email, handle, password = 'Str0ng!Passw0rd') {
  const reg = await api('auth/register', 'POST', { email, password, display_name: handle, handle });
  assert.equal(reg.status, 201, `register ${email}`);
  const id = (await reg.json()).id;
  const login = await api('auth/login', 'POST', { email, password });
  assert.equal(login.status, 200, `login ${email}`);
  return { id, token: (await login.json()).access_token };
}

async function directRoom(api, a, b) {
  const room = await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token);
  assert.equal(room.status, 201);
  return (await room.json()).id;
}

test('N2-L: invite, accept, hangup flow with a ledger entry', async () => {
  const db = makeD1();
  try {
    const { api } = await stage7Isolate(db);
    const a = await registerLogin(api, 'n2-a@luno-test.local', 'n2_a');
    const b = await registerLogin(api, 'n2-b@luno-test.local', 'n2_b');
    const cid = await directRoom(api, a, b);
    const invite = await api('calls', 'POST', { conversation_id: cid, kind: 'voice' }, a.token);
    assert.equal(invite.status, 201);
    const callId = (await invite.json()).id;
    // The caller cannot accept their own invite.
    assert.equal((await api(`calls/${callId}/state`, 'POST', { state: 'connected' }, a.token)).status, 403);
    // The callee accepts, then the caller hangs up.
    assert.equal((await api(`calls/${callId}/state`, 'POST', { state: 'connected' }, b.token)).status, 200);
    const end = await api(`calls/${callId}/state`, 'POST', { state: 'ended' }, a.token);
    assert.equal(end.status, 200);
    assert.equal((await end.json()).result, 'completed');
    const ledger = await (await api('calls', 'GET', null, a.token)).json();
    assert.ok(ledger.calls.some((c) => c.id === callId), 'ended call stays in the ledger');
  } finally { db.raw.close(); }
});

test('N2-L: decline and no-answer states resolve honestly', async () => {
  const db = makeD1();
  try {
    const { api } = await stage7Isolate(db);
    const a = await registerLogin(api, 'n2d-a@luno-test.local', 'n2d_a');
    const b = await registerLogin(api, 'n2d-b@luno-test.local', 'n2d_b');
    const cid = await directRoom(api, a, b);
    const inv1 = await (await api('calls', 'POST', { conversation_id: cid, kind: 'video' }, a.token)).json();
    const dec = await api(`calls/${inv1.id}/state`, 'POST', { state: 'declined' }, b.token);
    assert.equal(dec.status, 200);
    assert.equal((await dec.json()).result, 'declined');
    const inv2 = await (await api('calls', 'POST', { conversation_id: cid, kind: 'voice' }, a.token)).json();
    const miss = await api(`calls/${inv2.id}/state`, 'POST', { state: 'missed' }, b.token);
    assert.equal(miss.status, 200);
    assert.equal((await miss.json()).result, 'missed');
    const inv3 = await (await api('calls', 'POST', { conversation_id: cid, kind: 'voice' }, a.token)).json();
    const cancel = await api(`calls/${inv3.id}/state`, 'POST', { state: 'ended' }, a.token);
    assert.equal((await cancel.json()).result, 'canceled');
  } finally { db.raw.close(); }
});

test('N2-L: signal relay stays member-only', async () => {
  const db = makeD1();
  try {
    const { api } = await stage7Isolate(db);
    const a = await registerLogin(api, 'n2s-a@luno-test.local', 'n2s_a');
    const b = await registerLogin(api, 'n2s-b@luno-test.local', 'n2s_b');
    const o = await registerLogin(api, 'n2s-o@luno-test.local', 'n2s_o');
    const cid = await directRoom(api, a, b);
    const callId = (await (await api('calls', 'POST', { conversation_id: cid, kind: 'voice' }, a.token)).json()).id;
    assert.equal((await api(`calls/${callId}/signal`, 'POST', { signal_type: 'offer', sdp: 'v=0' }, a.token)).status, 200);
    assert.equal((await api(`calls/${callId}/signal`, 'POST', { signal_type: 'answer', sdp: 'v=0' }, b.token)).status, 200);
    assert.equal((await api(`calls/${callId}/signal`, 'POST', { signal_type: 'offer', sdp: 'v=0' }, o.token)).status, 404);
  } finally { db.raw.close(); }
});

test('N2-L: signal relay passes ICE candidates through', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  const relay = source.slice(source.indexOf("p.match(/^calls\\/([a-zA-Z0-9_-]+)\\/signal$/)"));
  assert.ok(relay.includes('candidate: body.candidate'), 'ICE candidates relay, not just SDP');
});

test('N2-L: ice-servers gains TURN only when the operator sets it', async () => {
  const db = makeD1();
  try {
    const { api } = await stage7Isolate(db);
    const a = await registerLogin(api, 'n2i-a@luno-test.local', 'n2i_a');
    const plain = await (await api('calls/ice-servers', 'GET', null, a.token)).json();
    assert.equal(plain.ice_servers.length, 3);
    assert.ok(plain.ice_servers.every((s) => String(s.urls).startsWith('stun:')));
  } finally { db.raw.close(); }
  const db2 = makeD1();
  try {
    const { api } = await stage7Isolate(db2, {
      TURN_URLS: 'turn:turn.luno.local:3478, turns:turn.luno.local:5349',
      TURN_USERNAME: 'luno',
      TURN_CREDENTIAL: 's3cret',
    });
    const b = await registerLogin(api, 'n2i-b@luno-test.local', 'n2i_b');
    const withTurn = await (await api('calls/ice-servers', 'GET', null, b.token)).json();
    assert.equal(withTurn.ice_servers.length, 5);
    const turns = withTurn.ice_servers.slice(3);
    assert.deepEqual(turns.map((s) => s.urls), ['turn:turn.luno.local:3478', 'turns:turn.luno.local:5349']);
    assert.ok(turns.every((s) => s.username === 'luno' && s.credential === 's3cret'));
  } finally { db2.raw.close(); }
});

test('N2-L: web takes ICE from the server and arms ring policy', async () => {
  const { readFile } = await import('node:fs/promises');
  const utils = await readFile(new URL('../apps/user-web/src/messenger-utils.ts', import.meta.url), 'utf8');
  const rtc = await readFile(new URL('../apps/user-web/src/composables/useWebRTC.ts', import.meta.url), 'utf8');
  const sock = await readFile(new URL('../apps/user-web/src/composables/useChatSocket.ts', import.meta.url), 'utf8');
  assert.ok(utils.includes('/api/v1/calls/ice-servers'), 'outgoing flow fetches ICE');
  assert.ok(rtc.includes('fetchIceServers(request, token.value)'), 'incoming flow fetches ICE');
  assert.ok(!rtc.includes("iceServers: [{ urls: 'stun:"), 'no hardcoded peer config remains');
  assert.ok(rtc.includes('decideIncomingRing') && rtc.includes("armNoAnswerTimer(webrtc.id, 'caller')"), 'caller policy wired');
  assert.ok(rtc.includes("armNoAnswerTimer(data.call_id, 'callee')"), 'callee policy wired');
  assert.ok(sock.includes('void handleIncomingRing(data)'), 'socket delegates ringing to policy');
});

test('N2-L: call screen fills the viewport with PiP and a 4-button bar', async () => {
  const { readFile } = await import('node:fs/promises');
  const modal = await readFile(new URL('../apps/user-web/src/components/CallModal.vue', import.meta.url), 'utf8');
  assert.ok(modal.includes('.call-remote-video') && modal.includes('object-fit: cover'), 'remote fills the viewport');
  assert.ok(modal.includes('width: 25%'), 'self is a 25% PiP');
  assert.ok(modal.includes("@click=\"emit('mute')\"") && !modal.includes('v-if="activeCall.state === \'connected\'"'), 'mute works while ringing');
  assert.ok(modal.includes("emit('camera-switch')") && modal.includes('mvCameraSwitch'), 'camera switch on the bar');
  assert.ok(modal.includes('btn-call-hangup') && modal.includes("emit('decline')") && modal.includes("emit('answer')"), 'hangup plus answer/decline');
  assert.ok(modal.includes('showMorePanel') && modal.includes('callVideoFilter') && modal.includes('liveCaptionsEnabled'), 'filters and captions behind more');
});

test('N2-L: incoming-ring policy (own echo, busy, no-answer)', () => {
  assert.equal(policy.CALL_NO_ANSWER_MS, 30000);
  assert.equal(policy.decideIncomingRing({ activeCallId: null, incomingCallId: 'c1', selfId: 'u1', initiatedBy: 'u2' }), 'show');
  assert.equal(policy.decideIncomingRing({ activeCallId: null, incomingCallId: 'c1', selfId: 'u1', initiatedBy: 'u1' }), 'ignore-own');
  assert.equal(policy.decideIncomingRing({ activeCallId: 'c1', incomingCallId: 'c1', selfId: 'u1', initiatedBy: 'u2' }), 'ignore-own');
  assert.equal(policy.decideIncomingRing({ activeCallId: 'c0', incomingCallId: 'c1', selfId: 'u1', initiatedBy: 'u2' }), 'busy-decline');
  assert.equal(policy.noAnswerState('caller'), 'ended');
  assert.equal(policy.noAnswerState('callee'), 'missed');
});
