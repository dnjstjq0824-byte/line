// Stage 10 (F0): existing-feature end-to-end journeys against real sqlite
// isolates, including fresh-isolate persistence. One journey per feature.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeD1 , F24_CONSENT } from './test_helpers.mjs';

let f0Serial = 0;
async function f0Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f0=${++f0Serial}`);
  const env = { ...(db ? { DB: db } : {}), ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null, headers = {}) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api };
}

async function register(api, email, password = 'Str0ng!Passw0rd', extra = {}) {
  const res = await api('auth/register', 'POST', { ...F24_CONSENT, email, password, display_name: email.split('@')[0], ...extra });
  assert.equal(res.status, 201, `register ${email}: ${res.status}`);
  return res.json();
}

async function login(api, email, password = 'Str0ng!Passw0rd') {
  const res = await api('auth/login', 'POST', { email, password });
  assert.equal(res.status, 200, `login ${email}: ${res.status}`);
  return res.json();
}

test('F0: login, me, logout and lockout', async () => {
  const db = makeD1();
  try {
    const { api } = await f0Isolate(db);
    await register(api, 'f0-auth@luno-test.local');
    const s = await login(api, 'f0-auth@luno-test.local');
    assert.equal((await api('me', 'GET', null, s.access_token)).status, 200);
    assert.equal((await api('auth/logout', 'POST', null, s.access_token)).status, 200);
    assert.equal((await api('me', 'GET', null, s.access_token)).status, 401, 'logout kills the token');
    for (let i = 0; i < 5; i++) {
      assert.equal((await api('auth/login', 'POST', { email: 'f0-auth@luno-test.local', password: 'wrong-pass' })).status, 401);
    }
    const locked = await api('auth/login', 'POST', { email: 'f0-auth@luno-test.local', password: 'Str0ng!Passw0rd' });
    assert.equal(locked.status, 429, 'five failures lock the account');
    assert.equal((await locked.json()).code, 'LOGIN_LOCKED');
  } finally { db.raw.close(); }
});

test('F0: refresh rotation survives a new isolate', async () => {
  const db = makeD1();
  try {
    const first = await f0Isolate(db);
    await register(first.api, 'f0-refresh@luno-test.local');
    const s = await login(first.api, 'f0-refresh@luno-test.local');
    const r1 = await (await first.api('auth/refresh', 'POST', { refresh_token: s.refresh_token })).json();
    assert.ok(r1.access_token && r1.refresh_token, 'rotation mints a new pair');
    const second = await f0Isolate(db);
    const r2 = await second.api('auth/refresh', 'POST', { refresh_token: r1.refresh_token });
    assert.equal(r2.status, 200, 'latest refresh works on a cold isolate');
    const pair = await r2.json();
    assert.equal((await second.api('me', 'GET', null, pair.access_token)).status, 200);
    const other = await login(second.api, 'f0-refresh@luno-test.local');
    const ro = await (await second.api('auth/refresh', 'POST', { refresh_token: other.refresh_token })).json();
    assert.equal((await second.api('auth/refresh', 'POST', { refresh_token: other.refresh_token })).status, 401, 'rotated refresh burns');
    void ro;
  } finally { db.raw.close(); }
});

test('F0: one password path, sessions revoked, durable across isolates', async () => {
  const db = makeD1();
  try {
    const { api } = await f0Isolate(db);
    await register(api, 'f0-pw@luno-test.local');
    const s1 = await login(api, 'f0-pw@luno-test.local');
    const s2 = await login(api, 'f0-pw@luno-test.local');
    assert.equal((await api('me/password', 'POST', { old_password: 'x', new_password: 'y' }, s1.access_token)).status, 404, 'duplicate path removed');
    const bad = await api('auth/change-password', 'POST', { current_password: 'nope', new_password: 'New!Passw0rd12' }, s1.access_token);
    assert.equal(bad.status, 401, 'wrong current password rejected');
    const ok = await api('auth/change-password', 'POST', { current_password: 'Str0ng!Passw0rd', new_password: 'New!Passw0rd12' }, s1.access_token);
    assert.equal(ok.status, 200);
    assert.equal((await api('auth/login', 'POST', { email: 'f0-pw@luno-test.local', password: 'Str0ng!Passw0rd' })).status, 401, 'old password dead');
    assert.equal((await api('me', 'GET', null, s1.access_token)).status, 200, 'changer stays signed in');
    assert.equal((await api('me', 'GET', null, s2.access_token)).status, 401, 'other sessions revoked');
    const cold = await f0Isolate(db);
    assert.equal((await cold.api('auth/login', 'POST', { email: 'f0-pw@luno-test.local', password: 'New!Passw0rd12' })).status, 200, 'new password durable');
  } finally { db.raw.close(); }
});

test('F0: device list and remote revoke persist', async () => {
  const db = makeD1();
  try {
    const { api } = await f0Isolate(db);
    await register(api, 'f0-dev@luno-test.local');
    const s1 = await login(api, 'f0-dev@luno-test.local');
    const s2 = await login(api, 'f0-dev@luno-test.local');
    const list = await (await api('devices', 'GET', null, s1.access_token)).json();
    assert.equal(list.devices.length, 2);
    const other = list.devices.find((d) => !d.current);
    assert.equal((await api(`devices/${other.device_id}`, 'DELETE', null, s1.access_token)).status, 200);
    assert.equal((await api('me', 'GET', null, s2.access_token)).status, 401, 'revoked device token dead');
    const cold = await f0Isolate(db);
    const s3 = await login(cold.api, 'f0-dev@luno-test.local');
    const list2 = await (await cold.api('devices', 'GET', null, s3.access_token)).json();
    assert.ok(!list2.devices.some((d) => d.device_id === other.device_id), 'revocation durable');
  } finally { db.raw.close(); }
});

test('F0: friend add, hide, block and nickname persist', async () => {
  const db = makeD1();
  try {
    const { api } = await f0Isolate(db);
    await register(api, 'f0-fa@luno-test.local', 'Str0ng!Passw0rd', { handle: 'f0frienda' });
    const rb = await register(api, 'f0-fb@luno-test.local', 'Str0ng!Passw0rd', { handle: 'f0friendb' });
    const sa = await login(api, 'f0-fa@luno-test.local');
    assert.equal((await api('friends', 'POST', { handle: 'f0friendb' }, sa.access_token)).status, 201);
    const friends = (await (await api('friends', 'GET', null, sa.access_token)).json()).friends;
    assert.equal(friends.length, 1);
    const fid = friends[0].id;
    assert.equal(fid, rb.id);
    const patch = await api(`friends/${fid}`, 'PATCH', { hidden: true, blocked: true, nickname: 'Bestie', favorite: true }, sa.access_token);
    assert.equal(patch.status, 200);
    const cold = await f0Isolate(db);
    const sa2 = await login(cold.api, 'f0-fa@luno-test.local');
    const entry = (await (await cold.api('friends', 'GET', null, sa2.access_token)).json()).friends[0];
    assert.equal(entry.is_hidden, true, 'hidden durable');
    assert.equal(entry.is_blocked, true, 'blocked durable');
    assert.equal(entry.nickname, 'Bestie', 'nickname durable');
    assert.equal(entry.is_favorite, true, 'favorite durable');
  } finally { db.raw.close(); }
});

test('F0: unread, mentions and read cursors persist', async () => {
  const db = makeD1();
  try {
    const { api } = await f0Isolate(db, { DURABLE_CONVERSATIONS: 'true' });
    const a = await registerAndLoginFull(api, 'f0-ra@luno-test.local');
    const b = await registerAndLoginFull(api, 'f0-rb@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Read Room', member_ids: [b.id] }, a.token)).json();
    await api(`conversations/${room.id}/messages`, 'POST', { body: 'hey you', metadata: { mentions: [b.id] } }, a.token);
    const listB = await (await api('conversations', 'GET', null, b.token)).json();
    const row = listB.conversations.find((c) => c.id === room.id);
    assert.equal(row.unread_count, 1);
    assert.equal(row.mentioned, true);
    const hist = await (await api(`conversations/${room.id}/messages`, 'GET', null, b.token)).json();
    const last = hist.messages[hist.messages.length - 1];
    await api(`conversations/${room.id}/read`, 'POST', { sequence: last.sequence }, b.token);
    const cursor = db.raw.prepare('SELECT sequence FROM luno_read_cursors WHERE conversation_id = ? AND user_id = ?').get(room.id, b.id);
    assert.ok(cursor && Number(cursor.sequence) >= last.sequence, 'cursor persisted');
    const cold = await f0Isolate(db, { DURABLE_CONVERSATIONS: 'true' });
    const sb = await login(cold.api, 'f0-rb@luno-test.local');
    await cold.api(`conversations/${room.id}/messages`, 'GET', null, sb.access_token);
    const row2 = (await (await cold.api('conversations', 'GET', null, sb.access_token)).json()).conversations.find((c) => c.id === room.id);
    assert.equal(row2.unread_count, 0, 'read state durable');
  } finally { db.raw.close(); }
});

async function registerAndLoginFull(api, email, password = 'Str0ng!Passw0rd') {
  const reg = await register(api, email, password);
  const s = await login(api, email, password);
  return { id: reg.id, token: s.access_token };
}

test('F0: user, room and global search hit', async () => {
  const db = makeD1();
  try {
    const { api } = await f0Isolate(db);
    const a = await registerAndLoginFull(api, 'f0-searcher@luno-test.local');
    await register(api, 'f0-zelda@luno-test.local', 'Str0ng!Passw0rd', { handle: 'zeldasearch' });
    const b = await registerAndLoginFull(api, 'f0-searchbuddy@luno-test.local');
    const room2 = await (await api('conversations', 'POST', { kind: 'group', title: 'Pineapple Club', member_ids: [b.id] }, a.token)).json();
    await api(`conversations/${room2.id}/messages`, 'POST', { body: 'the pineapple password is tangy' }, a.token);
    const users = await (await api('users?q=zelda', 'GET', null, a.token)).json();
    assert.ok((users.users || []).some((u) => u.handle === 'zeldasearch'), 'user search hits');
    const inRoom = await (await api(`conversations/${room2.id}/search?q=pineapple`, 'GET', null, a.token)).json();
    assert.ok((inRoom.messages || []).length >= 1, 'room search hits');
    const global = await (await api('search?q=pineapple', 'GET', null, a.token)).json();
    assert.ok((global.messages || []).length >= 1, 'global search hits messages');
    assert.ok((global.chats || []).some((c) => c.id === room2.id), 'global search hits the room');
  } finally { db.raw.close(); }
});

test('F0: typing pings members and strangers 404', async () => {
  const db = makeD1();
  try {
    const { api } = await f0Isolate(db);
    const a = await registerAndLoginFull(api, 'f0-ta@luno-test.local');
    const b = await registerAndLoginFull(api, 'f0-tb@luno-test.local');
    const c = await registerAndLoginFull(api, 'f0-tc@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Type Room', member_ids: [b.id] }, a.token)).json();
    assert.equal((await api(`conversations/${room.id}/typing`, 'POST', {}, a.token)).status, 200);
    assert.equal((await api(`conversations/${room.id}/typing`, 'POST', {}, c.token)).status, 404);
  } finally { db.raw.close(); }
});

test('F0: clients call the single password path', async () => {
  const view = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
  const session = await readFile(new URL('../mobile/flutter_app/lib/state/session.dart', import.meta.url), 'utf8');
  const worker = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  assert.ok(!worker.includes("p === 'me/password'"), 'duplicate worker path removed');
  assert.ok(view.includes('/api/v1/auth/change-password') && !view.includes('/api/v1/auth/password'), 'web uses the single path');
  assert.ok(!view.includes('me/password'), 'web never calls the removed path');
  assert.ok(session.includes('/api/v1/auth/change-password'), 'app uses the single path');
});
