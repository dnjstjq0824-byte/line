// Stage 3 (U1/U2/A1): real data for real users; demo fakes stay in test envs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { makeD1 } from './test_helpers.mjs';

const workerSource = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');

let stage3Serial = 0;
async function stage3Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?stage3=${++stage3Serial}`);
  const env = { ...(db ? { DB: db } : {}), ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api, env };
}

async function registerLogin(api, email, password = 'Str0ng!Passw0rd') {
  const reg = await api('auth/register', 'POST', { email, password, display_name: email.split('@')[0] });
  assert.equal(reg.status, 201, `register ${email}`);
  const id = (await reg.json()).id;
  const login = await api('auth/login', 'POST', { email, password });
  assert.equal(login.status, 200, `login ${email}`);
  return { id, token: (await login.json()).access_token };
}

// ---------- U1: demo data confined to test envs ----------

test('U1: real accounts start with zero friends and only the Keep room', async () => {
  const db = makeD1();
  try {
    const { api } = await stage3Isolate(db);
    const me = await registerLogin(api, 'u1-real@luno-test.local');
    const friends = await (await api('friends', 'GET', null, me.token)).json();
    assert.deepEqual(friends.friends, [], 'zero friends');
    const convos = await (await api('conversations', 'GET', null, me.token)).json();
    assert.equal(convos.conversations.length, 1, 'only the Keep room');
    assert.equal(convos.conversations[0].id, `conv-keep-${me.id}`);
    const rooms = await (await api('community/rooms', 'GET', null, me.token)).json();
    assert.ok(!(rooms.rooms || []).some((r) => r.id === 'room-1'), 'no seeded openchat room');
  } finally { db.raw.close(); }
});

test('U1: DEMO_MODE restores the full demo world', async () => {
  const db = makeD1();
  try {
    const { api } = await stage3Isolate(db, { DEMO_MODE: 'true' });
    const me = await registerLogin(api, 'u1-demo@luno-test.local');
    const friends = await (await api('friends', 'GET', null, me.token)).json();
    assert.equal(friends.friends.length, 18, '18 demo friends');
    const convos = await (await api('conversations', 'GET', null, me.token)).json();
    const ids = convos.conversations.map((c) => c.id);
    assert.ok(ids.includes(`conv-keep-${me.id}`), 'Keep present');
    assert.ok(ids.includes(`conv-oa-notice-${me.id}`), 'notice present');
    assert.ok(ids.includes(`conv-k-${me.id}`), 'demo chat present');
    const rooms = await (await api('community/rooms', 'GET', null, me.token)).json();
    assert.ok((rooms.rooms || []).some((r) => r.id === 'room-1'), 'seeded openchat room present');
  } finally { db.raw.close(); }
});

test('U1: DEMO_USER_IDS enables demo per user id, not email', async () => {
  const db = makeD1();
  try {
    const plain = await stage3Isolate(db);
    const regA = await plain.api('auth/register', 'POST', { email: 'u1-pick@luno-test.local', password: 'Str0ng!Passw0rd', display_name: 'pick' });
    const idA = (await regA.json()).id;
    await plain.api('auth/register', 'POST', { email: 'u1-other@luno-test.local', password: 'Str0ng!Passw0rd', display_name: 'other' });
    const { api } = await stage3Isolate(db, { DEMO_USER_IDS: ` ${idA} ,` });
    const loginA = await (await api('auth/login', 'POST', { email: 'u1-pick@luno-test.local', password: 'Str0ng!Passw0rd' })).json();
    const friendsA = await (await api('friends', 'GET', null, loginA.access_token)).json();
    assert.equal(friendsA.friends.length, 18, 'listed id gets demo friends');
    const loginB = await (await api('auth/login', 'POST', { email: 'u1-other@luno-test.local', password: 'Str0ng!Passw0rd' })).json();
    const friendsB = await (await api('friends', 'GET', null, loginB.access_token)).json();
    assert.deepEqual(friendsB.friends, [], 'unlisted id stays clean');
    // Email addresses in the list grant nothing (ids only).
    const { api: api2 } = await stage3Isolate(db, { DEMO_USER_IDS: 'u1-other@luno-test.local' });
    const loginB2 = await (await api2('auth/login', 'POST', { email: 'u1-other@luno-test.local', password: 'Str0ng!Passw0rd' })).json();
    const friendsB2 = await (await api2('friends', 'GET', null, loginB2.access_token)).json();
    assert.deepEqual(friendsB2.friends, [], 'email in the list grants nothing');
  } finally { db.raw.close(); }
});

test('U1: demo injection never writes demo rows to D1', async () => {
  const db = makeD1();
  try {
    const { api } = await stage3Isolate(db, { DEMO_MODE: 'true' });
    const me = await registerLogin(api, 'u1-d1@luno-test.local');
    await api('conversations', 'GET', null, me.token);
    await api('friends', 'GET', null, me.token);
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM friends').get().n, 0, 'no demo friendships in D1');
    const msgs = db.raw.prepare('SELECT DISTINCT conversation_id AS c FROM luno_messages').all().map((r) => r.c);
    for (const c of msgs) assert.ok(c === `conv-oa-notice-${me.id}`, `only real login alerts persist, found ${c}`);
  } finally { db.raw.close(); }
});

test('U1: every demo-injection call sits behind isDemoUser', () => {
  assert.ok(!workerSource.includes('ensureDefaultConversationsForUser'), 'old ungated name is gone');
  let calls = 0;
  for (const line of workerSource.split('\n')) {
    if (!line.includes('ensureDemoConversationsForUser(')) continue;
    if (line.startsWith('function ')) continue;
    calls++;
    assert.ok(line.includes('isDemoUser('), `demo injection must be guarded: ${line.trim()}`);
  }
  assert.equal(calls, 5, 'all five injection sites found');
});

test('U1: demo flags stay out of the deployed defaults', () => {
  const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.ok(!wrangler.includes('DEMO_MODE'), 'no DEMO_MODE default');
  assert.ok(!wrangler.includes('DEMO_USER_IDS'), 'no DEMO_USER_IDS default');
});
