// Stage 10 (F12): official accounts + news live in D1 and are managed by
// admins. Follows survive restarts (recreating the notice room when it is
// gone); oa-notice stays a code-defined system account while D1 takes no
// seed rows (U1: nothing pre-inserted on a fresh database).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket } from './test_helpers.mjs';

let f12Serial = 0;
async function f12Isolate(db, bucket, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f12=${++f12Serial}`);
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

async function makeAdmin(db, bucket, email = 'f12-admin@luno-test.local') {
  const plain = await f12Isolate(db, bucket);
  const reg = await registerLogin(plain.api, email);
  const { api } = await f12Isolate(db, bucket, { ADMIN_USER_IDS: reg.id });
  const s = await registerLogin(api, email).catch(() => null);
  void s;
  const login = await api('auth/login', 'POST', { email, password: PW });
  return { api, token: (await login.json()).access_token };
}

test('F12: admins manage official accounts, strangers cannot', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const admin = await makeAdmin(db, bucket);
    const u = await registerLogin(admin.api, 'f12-ua@luno-test.local');
    assert.equal((await admin.api('admin/official-accounts', 'POST', { name: 'X' }, u.token)).status, 403);
    const created = await admin.api('admin/official-accounts', 'POST', { name: 'Shop', handle: 'shop', description: 'deals', color: '#123456' }, admin.token);
    assert.equal(created.status, 201);
    const oa = await created.json();
    const listed = await (await admin.api('official-accounts', 'GET', null, u.token)).json();
    assert.ok(listed.accounts.some((a) => a.id === oa.id && a.followed === false), 'new account listed');
    assert.ok(listed.accounts.some((a) => a.id === 'oa-notice'), 'system account kept');
    const patched = await admin.api(`admin/official-accounts/${oa.id}`, 'PATCH', { name: 'Shop KR' }, admin.token);
    assert.equal(patched.status, 200);
    assert.equal(db.raw.prepare('SELECT name FROM luno_official_accounts WHERE id = ?').get(oa.id).name, 'Shop KR');
    assert.equal((await admin.api(`admin/official-accounts/${oa.id}`, 'DELETE', null, admin.token)).status, 200);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_official_accounts WHERE id = ?').get(oa.id).n, 0);
    assert.equal((await admin.api(`admin/official-accounts/${oa.id}`, 'DELETE', null, admin.token)).status, 404);
  } finally { db.raw.close(); }
});

test('F12: follows survive a restart and rebuild the room', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const admin = await makeAdmin(db, bucket);
    const u = await registerLogin(admin.api, 'f12-ub@luno-test.local');
    const created = await admin.api('admin/official-accounts', 'POST', { name: 'Bank', handle: 'bank' }, admin.token);
    const oa = await created.json();
    const fol = await admin.api(`official-accounts/${oa.id}/follow`, 'POST', {}, u.token);
    assert.equal(fol.status, 201);
    const cid = (await fol.json()).conversation_id;
    assert.ok(cid);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_official_follows WHERE user_id = ? AND account_id = ?').get(u.id, oa.id).n, 1);
    const { api: cold } = await f12Isolate(db, bucket, { ADMIN_USER_IDS: db.raw.prepare('SELECT id FROM users WHERE email = ?').get('f12-admin@luno-test.local').id });
    const tu = (await (await cold('auth/login', 'POST', { email: 'f12-ub@luno-test.local', password: PW })).json()).access_token;
    const listed = await (await cold('official-accounts', 'GET', null, tu)).json();
    assert.ok(listed.accounts.some((a) => a.id === oa.id && a.followed === true), 'follow durable');
    const again = await cold(`official-accounts/${oa.id}/follow`, 'POST', {}, tu);
    assert.equal(again.status, 200, 'already following after restart');
    assert.ok((await again.json()).conversation_id, 'room rebuilt');
    assert.equal((await cold(`official-accounts/${oa.id}/follow`, 'DELETE', null, tu)).status, 200);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_official_follows WHERE user_id = ?').get(u.id).n, 0, 'unfollow clears the row');
  } finally { db.raw.close(); }
});

test('F12: admin news replaces the sample feed, delete restores it', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const admin = await makeAdmin(db, bucket);
    const u = await registerLogin(admin.api, 'f12-uc@luno-test.local');
    const before = await (await admin.api('news', 'GET', null, u.token)).json();
    assert.equal(before.sample, true, 'empty db serves labeled sample');
    assert.equal((await admin.api('admin/news', 'POST', { title: 'x' }, u.token)).status, 403);
    const created = await admin.api('admin/news', 'POST', { title: 'Real headline', press: 'LUNO', category: 'IT', summary: 'sum', content: 'body' }, admin.token);
    assert.equal(created.status, 201);
    const live = await (await admin.api('news', 'GET', null, u.token)).json();
    assert.equal(live.sample, false);
    assert.ok((live.hero || []).some((a) => a.title === 'Real headline'), 'admin article served');
    const nid = (await created.json()).id;
    assert.equal((await admin.api(`admin/news/${nid}`, 'DELETE', null, admin.token)).status, 200);
    assert.equal((await (await admin.api('news', 'GET', null, u.token)).json()).sample, true, 'sample back when empty');
  } finally { db.raw.close(); }
});

test('F12: fresh databases take no seed rows (U1)', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const admin = await makeAdmin(db, bucket);
    const u = await registerLogin(admin.api, 'f12-ud@luno-test.local');
    await admin.api('official-accounts', 'GET', null, u.token);
    await admin.api('news', 'GET', null, u.token);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_official_accounts').get().n, 0, 'no account seeds');
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_news').get().n, 0, 'no news seeds');
    const listed = await (await admin.api('official-accounts', 'GET', null, u.token)).json();
    assert.ok(listed.accounts.some((a) => a.id === 'oa-notice'), 'code-defined notice account still served');
  } finally { db.raw.close(); }
});
