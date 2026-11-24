// Audit P0-5: group-call seats live in per-room Durable Objects.
// The fake GROUP_CALLS namespace below drives the REAL GroupCallRoom class
// (node:sqlite-backed), shared across worker imports — so a join on one
// isolate and a signal on another prove the production topology.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeD1, makeBucket, F24_CONSENT } from './test_helpers.mjs';

let doProtoMod = null;
async function roomClass() {
  doProtoMod ??= await import('./cf_worker.js?p05-do-proto');
  return doProtoMod.GroupCallRoom;
}

function sqlFor(raw) {
  return {
    exec: (q, ...p) => {
      const st = raw.prepare(q);
      if (/^\s*select/i.test(q)) return { toArray: () => st.all(...p).map((r) => ({ ...r })) };
      st.run(...p);
      return { toArray: () => [] };
    },
  };
}

// Shared-DO-layer fake: rooms persist across isolates in one test.
function makeGroupCalls() {
  const rooms = new Map();
  const raws = [];
  return {
    idFromName: (name) => ({ __room: String(name) }),
    get: (id) => ({
      fetch: async (input, init = {}) => {
        const Cls = await roomClass();
        if (!rooms.has(id.__room)) {
          const raw = new DatabaseSync(':memory:');
          raws.push(raw);
          rooms.set(id.__room, new Cls({ storage: { sql: sqlFor(raw) } }, {}));
        }
        return rooms.get(id.__room).fetch(new Request(input, init));
      },
    }),
    close: () => { for (const raw of raws) raw.close(); },
  };
}

let p05Serial = 0;
async function isolate(db, groupCalls, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?p05-${++p05Serial}`);
  const env = { DB: db, MEDIA_BUCKET: makeBucket(), DURABLE_CONVERSATIONS: 'true', GROUP_CALLS: groupCalls, ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api, env, mod };
}

const PW = 'Str0ng!Passw0rd';
async function registerLogin(api, email) {
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
  assert.equal(reg.status, 201, `register ${email}`);
  const s = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(s.status, 200, `login ${email}`);
  const sess = await s.json();
  return { ...(await reg.json()), ...sess, token: sess.access_token };
}

test('P0-5: join on isolate A, join + signal on isolate B (shared room)', async () => {
  const db = makeD1();
  const calls = makeGroupCalls();
  try {
    const a = await isolate(db, calls);
    const u1 = await registerLogin(a.api, 'p05-a@luno-test.local');
    const u2 = await registerLogin(a.api, 'p05-b@luno-test.local');
    const room = await (await a.api('conversations', 'POST', { kind: 'group', title: 'DO', member_ids: [u2.id] }, u1.token)).json();
    assert.equal((await a.api('calls/group/join', 'POST', { room_id: room.id }, u1.token)).status, 201);

    // A different isolate, same D1 + same DO layer: the room is shared.
    const b = await isolate(db, calls);
    const j2 = await b.api('calls/group/join', 'POST', { room_id: room.id }, u2.token);
    assert.equal(j2.status, 201);
    const parts = (await j2.json()).participants;
    assert.deepEqual(parts.map((p) => p.id).sort(), [u1.id, u2.id].sort(), 'B sees the cross-isolate seat');
    for (const p of parts) {
      assert.ok(p.display_name && p.display_name.length > 0, 'hydrated tile name');
      assert.match(p.avatar_color || '', /^#[0-9a-fA-F]{6}$/, 'hydrated tile color');
    }
    // Signal from a third isolate relays between the two seats.
    const c = await isolate(db, calls);
    assert.equal(
      (await c.api('calls/group/signal', 'POST', { room_id: room.id, target_user_id: u2.id, signal: { t: 'offer' } }, u1.token)).status,
      200, 'cross-isolate relay'
    );
    // Directory tracks both seats for the ghost sweep.
    const seats = db.raw.prepare('SELECT user_id, room_id FROM luno_group_call_seats').all();
    assert.deepEqual(seats.map((s) => s.user_id).sort(), [u1.id, u2.id].sort());
    assert.ok(seats.every((s) => s.room_id === room.id));
  } finally { db.raw.close(); calls.close(); }
});

test('P0-5: cap, rejoin, stranger lockout, and leave hold across isolates', async () => {
  const db = makeD1();
  const calls = makeGroupCalls();
  try {
    const a = await isolate(db, calls);
    const members = [];
    for (let i = 0; i < 9; i++) members.push(await registerLogin(a.api, `p05-m${i}@luno-test.local`));
    const out = await registerLogin(a.api, 'p05-out@luno-test.local');
    const room = await (await a.api('conversations', 'POST', { kind: 'group', title: 'Cap', member_ids: members.slice(1).map((m) => m.id) }, members[0].token)).json();
    const b = await isolate(db, calls);
    for (let i = 0; i < 4; i++) {
      assert.equal((await a.api('calls/group/join', 'POST', { room_id: room.id }, members[i].token)).status, 201);
    }
    for (let i = 4; i < 8; i++) {
      assert.equal((await b.api('calls/group/join', 'POST', { room_id: room.id }, members[i].token)).status, 201);
    }
    assert.equal((await b.api('calls/group/join', 'POST', { room_id: room.id }, members[8].token)).status, 409, 'ninth seat refused');
    assert.equal((await a.api('calls/group/join', 'POST', { room_id: room.id }, members[0].token)).status, 201, 'rejoin idempotent');
    assert.equal((await b.api('calls/group/signal', 'POST', { room_id: room.id, target_user_id: members[0].id, signal: {} }, out.token)).status, 403, 'outsider relays nothing');
    assert.equal((await a.api('calls/group/signal', 'POST', { room_id: 'no-such-room', target_user_id: members[0].id, signal: {} }, members[0].token)).status, 404, 'unknown room');
    assert.equal((await b.api('calls/group/leave', 'POST', { room_id: room.id }, members[0].token)).status, 200);
    assert.equal(
      db.raw.prepare('SELECT COUNT(*) n FROM luno_group_call_seats WHERE user_id = ?').get(members[0].id).n, 0,
      'leave untracks the directory row'
    );
    assert.equal((await a.api('calls/group/join', 'POST', { room_id: room.id }, members[8].token)).status, 201, 'freed slot taken cross-isolate');
  } finally { db.raw.close(); calls.close(); }
});

test('P0-5: socket-close sweep vacates every seat via the directory', async () => {
  const db = makeD1();
  const calls = makeGroupCalls();
  try {
    const a = await isolate(db, calls);
    const u1 = await registerLogin(a.api, 'p05-s1@luno-test.local');
    const u2 = await registerLogin(a.api, 'p05-s2@luno-test.local');
    const room = await (await a.api('conversations', 'POST', { kind: 'group', title: 'Sweep', member_ids: [u2.id] }, u1.token)).json();
    await a.api('calls/group/join', 'POST', { room_id: room.id }, u1.token);
    await a.api('calls/group/join', 'POST', { room_id: room.id }, u2.token);
    // The close handler calls this with its own env; drive it directly.
    const out = await a.mod.groupCallSeatSweep(a.env, u1.id);
    assert.equal(out.swept, true);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_group_call_seats WHERE user_id = ?').get(u1.id).n, 0, 'directory cleared');
    const b = await isolate(db, calls);
    const j = await b.api('calls/group/join', 'POST', { room_id: room.id }, u2.token);
    assert.deepEqual((await j.json()).participants.map((p) => p.id), [u2.id], 'ghost seat gone on every isolate');
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_group_call_seats WHERE user_id = ?').get(u2.id).n, 1, 'other seat untouched');
  } finally { db.raw.close(); calls.close(); }
});

test('P0-5: a dead room backend fails closed (503), leave stays quiet', async () => {
  const db = makeD1();
  try {
    const dead = {
      idFromName: (name) => ({ __room: String(name) }),
      get: () => ({ fetch: async () => { throw new Error('do down'); } }),
    };
    const { api } = await isolate(db, dead);
    const u1 = await registerLogin(api, 'p05-d1@luno-test.local');
    const u2 = await registerLogin(api, 'p05-d2@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Dead', member_ids: [u2.id] }, u1.token)).json();
    const j = await api('calls/group/join', 'POST', { room_id: room.id }, u1.token);
    assert.equal(j.status, 503);
    assert.equal((await j.json()).code, 'GROUP_CALL_UNAVAILABLE');
    assert.equal((await api('calls/group/signal', 'POST', { room_id: room.id, target_user_id: u2.id, signal: {} }, u1.token)).status, 503);
    assert.equal((await api('calls/group/leave', 'POST', { room_id: room.id }, u1.token)).status, 200, 'leave never errors');
  } finally { db.raw.close(); }
});

test('P0-5: without the binding the legacy isolate-local path stands', async () => {
  const db = makeD1();
  try {
    const mod = await import(`./cf_worker.js?p05-legacy-${Date.now()}`);
    const env = { DB: db, MEDIA_BUCKET: makeBucket(), DURABLE_CONVERSATIONS: 'true' };
    const api = (path, method = 'GET', body = null, token = null) =>
      mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === null ? undefined : JSON.stringify(body),
      }), env);
    const u1 = await registerLogin(api, 'p05-l1@luno-test.local');
    const u2 = await registerLogin(api, 'p05-l2@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Legacy', member_ids: [u2.id] }, u1.token)).json();
    assert.equal((await api('calls/group/join', 'POST', { room_id: room.id }, u1.token)).status, 201);
    const j2 = await api('calls/group/join', 'POST', { room_id: room.id }, u2.token);
    assert.equal((await j2.json()).participants.length, 2);
    assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='luno_group_call_seats'").get().n, 1, 'schema exists');
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_group_call_seats').get().n, 0, 'legacy path writes no directory rows');
  } finally { db.raw.close(); }
});

test('P0-5: official rooms still refuse group calls on the DO path', async () => {
  const db = makeD1();
  const calls = makeGroupCalls();
  try {
    const { api } = await isolate(db, calls, { DEMO_MODE: 'true' });
    const u1 = await registerLogin(api, 'p05-o1@luno-test.local');
    const convos = await (await api('conversations', 'GET', null, u1.token)).json();
    const notice = convos.conversations.find((c) => c.id.includes('oa-notice'));
    assert.ok(notice && notice.official, 'notice room flagged official');
    assert.equal((await api('calls/group/join', 'POST', { room_id: notice.id }, u1.token)).status, 400);
  } finally { db.raw.close(); calls.close(); }
});

test('P0-5: GroupCallRoom survives eviction via SQLite (new instance, same file)', async () => {
  const Cls = await roomClass();
  const dir = mkdtempSync(joinPath(tmpdir(), 'p05-do-'));
  const raws = [];
  try {
    const file = joinPath(dir, 'room.sqlite');
    const mk = () => {
      const raw = new DatabaseSync(file);
      raws.push(raw);
      return new Cls({ storage: { sql: sqlFor(raw) } }, {});
    };
    const post = (inst, path, body) => inst.fetch(new Request(`https://group-call.internal${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
    assert.equal((await post(mk(), '/signal-check', { from_user_id: 'a', target_user_id: 'b' })).status, 404, 'never-started room');
    const r1 = mk();
    assert.equal((await post(r1, '/join', { user_id: 'a', max: 2 })).status, 201);
    assert.equal((await post(r1, '/join', { user_id: 'b', max: 2 })).status, 201);
    assert.equal((await post(r1, '/join', { user_id: 'c', max: 2 })).status, 409, 'cap enforced');
    assert.equal((await post(r1, '/join', { user_id: 'a', max: 2 })).status, 201, 'rejoin idempotent');
    // Evict: drop the instance, reload from the same file.
    const r2 = mk();
    assert.deepEqual(((await (await post(r2, '/leave', { user_id: 'nobody' })).json()).participants).sort(), ['a', 'b'], 'seats reloaded');
    assert.equal((await post(r2, '/signal-check', { from_user_id: 'a', target_user_id: 'b' })).status, 200);
    assert.equal((await post(r2, '/signal-check', { from_user_id: 'a', target_user_id: 'zzz' })).status, 403);
    const left = await (await post(r2, '/leave', { user_id: 'a' })).json();
    assert.equal(left.left, true);
    assert.deepEqual(left.participants, ['b']);
    const r3 = mk();
    assert.equal((await post(r3, '/signal-check', { from_user_id: 'a', target_user_id: 'b' })).status, 403, 'left seat refused');
  } finally { for (const raw of raws) raw.close(); rmSync(dir, { recursive: true, force: true }); }
});
