import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { makeD1 } from './test_helpers.mjs';

// Item 12 (profile): cover photo roundtrips like avatars, and the ID-search
// toggle persists in D1 so it (and the friend-search gate honoring it)
// survives cross-isolate reads.
const workerSource = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');

async function memoryApi() {
  const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);
  const env = { ADMIN_INITIAL_PASSWORD: 'Worker#Admin1', DEMO_INITIAL_PASSWORD: 'Worker#Demo12' };
  return (path, token, method = 'GET', body) => worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
}

let profSerial = 0;
async function d1Api(db) {
  const { default: worker } = await import(`./cf_worker.js?profile=${++profSerial}`);
  const env = { ADMIN_INITIAL_PASSWORD: 'Worker#Admin1', DEMO_INITIAL_PASSWORD: 'Worker#Demo12', DB: db };
  return (path, token, method = 'GET', body) => worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
}

async function register(api, email, handle) {
  const reg = await api('auth/register', null, 'POST', { email, password: 'Str0ng!Passw0rd', display_name: handle, handle });
  assert.equal(reg.status, 201);
  return (await reg.json()).id;
}

async function login(api, email, password = 'Str0ng!Passw0rd') {
  const res = await api('auth/login', null, 'POST', { email, password });
  assert.equal(res.status, 200);
  return (await res.json()).access_token;
}

// 1x1 PNG data URL (valid magic bytes, tiny).
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('cover photo roundtrips and is visible to friends', async () => {
  const api = await memoryApi();
  const aid = await register(api, 'pf-a@luno-test.local', 'pf_a');
  await register(api, 'pf-b@luno-test.local', 'pf_b');
  const atoken = await login(api, 'pf-a@luno-test.local');
  const btoken = await login(api, 'pf-b@luno-test.local');
  assert.equal((await api('me', atoken, 'PATCH', { cover_url: PIXEL })).status, 200);
  assert.equal((await (await api('me', atoken)).json()).cover_url, PIXEL);
  const bid = (await (await api('me', btoken)).json()).id;
  assert.equal((await api('friends', atoken, 'POST', { friend_id: bid })).status, 201);
  const seen = (await (await api('friends', btoken)).json()).friends.find((f) => f.id === aid);
  assert.equal(seen.cover_url, PIXEL);
  assert.equal((await api('me', atoken, 'PATCH', { cover_url: '' })).status, 200);
  assert.equal((await (await api('me', atoken)).json()).cover_url, '');
});

test('cover photo validates like avatars', async () => {
  const api = await memoryApi();
  await register(api, 'pf-v@luno-test.local', 'pf_v');
  const token = await login(api, 'pf-v@luno-test.local');
  assert.equal((await api('me', token, 'PATCH', { cover_url: 'not-a-data-url' })).status, 400);
  assert.equal((await api('me', token, 'PATCH', { cover_url: 'data:image/png;base64,!!!!' })).status, 400);
  const big = 'data:image/png;base64,' + 'A'.repeat(300000);
  assert.equal((await api('me', token, 'PATCH', { cover_url: big })).status, 400);
});

test('ID-search toggle persists across isolates', async () => {
  const db = makeD1();
  try {
    const first = await d1Api(db);
    await register(first, 'pf-p@luno-test.local', 'pf_p');
    const token = await login(first, 'pf-p@luno-test.local');
    assert.equal((await (await first('me/settings', token)).json()).searchable_by_id, true);
    const patched = await first('me/settings', token, 'PATCH', { searchable_by_id: false });
    assert.equal(patched.status, 200);
    assert.equal((await patched.json()).searchable_by_id, false);
    const second = await d1Api(db);
    assert.equal((await (await second('me/settings', token)).json()).searchable_by_id, false);
  } finally { db.raw.close(); }
});

test('friend search honors the persisted ID toggle cross-isolate', async () => {
  const db = makeD1();
  try {
    const first = await d1Api(db);
    await register(first, 'pf-s1@luno-test.local', 'pf_s1');
    // Display name deliberately excludes the handle so only the ID gate can match.
    const reg2 = await first('auth/register', null, 'POST', { email: 'pf-s2@luno-test.local', password: 'Str0ng!Passw0rd', display_name: 'Second User', handle: 'pf_s2' });
    assert.equal(reg2.status, 201);
    const t1 = await login(first, 'pf-s1@luno-test.local');
    const t2 = await login(first, 'pf-s2@luno-test.local');
    const foundOn = async (api, token) => (await (await api('users?q=pf_s2', token)).json()).users.some((u) => u.handle === 'pf_s2');
    assert.equal(await foundOn(first, t1), true);
    assert.equal((await first('me/settings', t2, 'PATCH', { searchable_by_id: false })).status, 200);
    const second = await d1Api(db);
    assert.equal(await foundOn(second, t1), false);
    assert.equal((await second('me/settings', t2, 'PATCH', { searchable_by_id: true })).status, 200);
    const third = await d1Api(db);
    assert.equal(await foundOn(third, t1), true);
  } finally { db.raw.close(); }
});
