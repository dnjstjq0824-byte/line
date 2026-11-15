// Stage 10 (F15): group calls — members join a room call (max 8 live),
// late joiners see current participants, signaling relays only between
// participants, and leaving notifies the rest. Strangers get nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeD1, makeBucket } from './test_helpers.mjs';

let f15Serial = 0;
async function f15Isolate(db, bucket, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f15=${++f15Serial}`);
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

test('F15: three members join, see each other, and leave', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f15Isolate(db, bucket);
    const a = await registerLogin(api, 'f15-a@luno-test.local');
    const b = await registerLogin(api, 'f15-b@luno-test.local');
    const c = await registerLogin(api, 'f15-c@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Call', member_ids: [b.id, c.id] }, a.token)).json();
    const j1 = await api('calls/group/join', 'POST', { room_id: room.id }, a.token);
    assert.equal(j1.status, 201);
    assert.equal((await j1.json()).participants.length, 1);
    await api('calls/group/join', 'POST', { room_id: room.id }, b.token);
    const j3 = await api('calls/group/join', 'POST', { room_id: room.id }, c.token);
    assert.equal(j3.status, 201);
    const parts = (await j3.json()).participants;
    assert.equal(parts.length, 3, 'late joiner sees everyone');
    assert.deepEqual(parts.map((p) => p.id).sort(), [a.id, b.id, c.id].sort());
    const sig = await api('calls/group/signal', 'POST', { room_id: room.id, target_user_id: b.id, signal: { t: 'offer' } }, a.token);
    assert.equal(sig.status, 200);
    assert.equal((await api('calls/group/leave', 'POST', { room_id: room.id }, b.token)).status, 200);
    const j4 = await api('calls/group/join', 'POST', { room_id: room.id }, b.token);
    assert.equal((await j4.json()).participants.length, 3, 'rejoin works');
  } finally { db.raw.close(); }
});

test('F15: strangers locked out, room caps at eight', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f15Isolate(db, bucket);
    const members = [];
    for (let i = 0; i < 9; i++) members.push(await registerLogin(api, `f15-m${i}@luno-test.local`));
    const outsider = await registerLogin(api, 'f15-out@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Big', member_ids: members.slice(1).map((m) => m.id) }, members[0].token)).json();
    assert.equal((await api('calls/group/join', 'POST', { room_id: room.id }, outsider.token)).status, 404, 'non-member joins nothing');
    for (let i = 0; i < 8; i++) {
      assert.equal((await api('calls/group/join', 'POST', { room_id: room.id }, members[i].token)).status, 201, `seat ${i + 1}`);
    }
    assert.equal((await api('calls/group/join', 'POST', { room_id: room.id }, members[8].token)).status, 409, 'ninth seat refused');
    assert.equal((await api('calls/group/signal', 'POST', { room_id: room.id, target_user_id: members[0].id, signal: {} }, outsider.token)).status, 403, 'outsider relays nothing');
    assert.equal((await api('calls/group/signal', 'POST', { room_id: room.id, target_user_id: members[8].id, signal: {} }, members[0].token)).status, 403, 'non-participant target refused');
  } finally { db.raw.close(); }
});

test('F15: join lists carry tile fields (name, color) for every seat', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f15Isolate(db, bucket);
    const a = await registerLogin(api, 'f15-t1@luno-test.local');
    const b = await registerLogin(api, 'f15-t2@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Tiles', member_ids: [b.id] }, a.token)).json();
    await api('calls/group/join', 'POST', { room_id: room.id }, a.token);
    const j2 = await api('calls/group/join', 'POST', { room_id: room.id }, b.token);
    assert.equal(j2.status, 201);
    const parts = (await j2.json()).participants;
    assert.equal(parts.length, 2);
    for (const p of parts) {
      assert.ok(typeof p.id === 'string' && p.id.length > 0, 'tile id');
      assert.ok(typeof p.display_name === 'string' && p.display_name.length > 0, 'tile name');
      assert.match(p.avatar_color || '', /^#[0-9a-fA-F]{6}$/, 'tile color');
    }
    assert.deepEqual(parts.map((p) => p.id).sort(), [a.id, b.id].sort());
  } finally { db.raw.close(); }
});

test('F15: a dropped socket vacates every group seat (no ghosts)', async () => {
  // The WS close path needs a live socket pair, which the fetch harness
  // cannot drive; pin the cleanup block in source instead.
  const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  const closeBlock = source.match(/addEventListener\('close', \(\) => \{[\s\S]*?for \(const \[rid, peers\] of groupCallRooms\)[\s\S]*?\}\);/)?.[0] || '';
  assert.ok(closeBlock.length > 0, 'close handler walks groupCallRooms');
  assert.ok(closeBlock.includes('peers.delete(grant.userId)'), 'seat vacated');
  assert.ok(closeBlock.includes("type: 'call.group.user_left'"), 'rest are notified');
});

test('F15: web mesh joins, relays per peer, and leaves through the group endpoints', async () => {
  const mesh = await readFile(new URL('../apps/user-web/src/composables/useGroupCall.ts', import.meta.url), 'utf8');
  assert.ok(mesh.includes("'/api/v1/calls/group/join'"), 'join endpoint');
  assert.ok(mesh.includes("'/api/v1/calls/group/signal'"), 'per-peer relay');
  assert.ok(mesh.includes("'/api/v1/calls/group/leave'"), 'leave endpoint');
  assert.ok(mesh.includes('new RTCPeerConnection'), 'one PC per peer');
  assert.match(mesh, /status === 409[\s\S]{0,200}?mvGroupCallFull/, 'full room notice');
  const modal = await readFile(new URL('../apps/user-web/src/components/GroupCallModal.vue', import.meta.url), 'utf8');
  assert.ok(modal.includes('group-tile-grid'), 'tile grid');
  assert.ok(modal.includes('mvGroupCallWaiting'), 'waiting state');
  assert.ok(modal.includes('btn-call-hangup'), 'hangup control');
  const view = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
  assert.match(view, /kind === 'group'[\s\S]{0,200}?startGroupCall/, 'group rooms route to the mesh');
  assert.ok(view.includes('<GroupCallModal'), 'modal mounted');
  assert.ok(view.includes('handleGroupSignal'), 'WS mesh events wired');
});

test('F15: group call strings exist in all four locales', async () => {
  const i18n = await readFile(new URL('../apps/user-web/src/luno-i18n.ts', import.meta.url), 'utf8');
  for (const key of ['mvGroupCall:', 'mvGroupCallWaiting:', 'mvGroupCallFull:', 'mvGroupCallFailed:', 'mvGroupCallSeats:']) {
    const hits = i18n.split(key).length - 1;
    assert.equal(hits, 4, `${key} in ko/en/th/ja`);
  }
  assert.ok(i18n.includes('{n}명 참가 중'), 'ko seat count keeps the placeholder');
});
