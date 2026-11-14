// Stage 10 (F5): profile + cover photos live in R2 (bytes), D1 keeps a
// serving URL; replace overwrites, clear deletes, legacy D1 data URLs
// still serve. Name/status/color/QR survive a cold isolate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket } from './test_helpers.mjs';

let f5Serial = 0;
async function f5Isolate(db, bucket, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f5=${++f5Serial}`);
  const env = { ...(db ? { DB: db } : {}), ...(bucket ? { MEDIA_BUCKET: bucket } : {}), ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api };
}

const PW = 'Str0ng!Passw0rd';
const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10];
const pngDataUrl = (...tail) => `data:image/png;base64,${Buffer.from([...PNG_MAGIC, ...tail]).toString('base64')}`;

async function register(api, email) {
  const res = await api('auth/register', 'POST', { email, password: PW, display_name: email.split('@')[0] });
  assert.equal(res.status, 201);
  return res.json();
}

async function login(api, email) {
  const res = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(res.status, 200);
  return res.json();
}

test('F5: avatar upload stores bytes in R2 and serves them back', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f5Isolate(db, bucket);
    const me = await register(api, 'f5-a@luno-test.local');
    const s = await login(api, 'f5-a@luno-test.local');
    const photo = pngDataUrl(1, 2, 3, 4);
    const patched = await api('me', 'PATCH', { avatar_url: photo }, s.access_token);
    assert.equal(patched.status, 200);
    const body = await patched.json();
    assert.equal(body.avatar_url, `/api/v1/users/${me.id}/avatar`);
    const stored = await bucket.get(`profile/${me.id}/avatar`);
    assert.ok(stored, 'R2 object exists');
    assert.deepEqual(Buffer.from(await stored.arrayBuffer()), Buffer.from([...PNG_MAGIC, 1, 2, 3, 4]));
    const row = db.raw.prepare('SELECT avatar_url FROM users WHERE id = ?').get(me.id);
    assert.equal(row.avatar_url, `/api/v1/users/${me.id}/avatar`);
    const served = await api(`users/${me.id}/avatar`, 'GET', null, s.access_token);
    assert.equal(served.status, 200);
    assert.match(served.headers.get('content-type') || '', /^image\//);
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), Buffer.from([...PNG_MAGIC, 1, 2, 3, 4]));
  } finally { db.raw.close(); }
});

test('F5: replace overwrites the single object, clear deletes it', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f5Isolate(db, bucket);
    const me = await register(api, 'f5-b@luno-test.local');
    const s = await login(api, 'f5-b@luno-test.local');
    assert.equal((await api('me', 'PATCH', { avatar_url: pngDataUrl(9) }, s.access_token)).status, 200);
    assert.equal((await api('me', 'PATCH', { avatar_url: pngDataUrl(8, 7) }, s.access_token)).status, 200);
    assert.equal(bucket.objects.size, 1, 'no orphan object left behind');
    const stored = await bucket.get(`profile/${me.id}/avatar`);
    assert.deepEqual(Buffer.from(await stored.arrayBuffer()), Buffer.from([...PNG_MAGIC, 8, 7]));
    assert.equal((await api('me', 'PATCH', { avatar_url: '' }, s.access_token)).status, 200);
    assert.equal(await bucket.get(`profile/${me.id}/avatar`), null);
    assert.equal((await api(`users/${me.id}/avatar`, 'GET', null, s.access_token)).status, 404);
    assert.equal(db.raw.prepare('SELECT avatar_url FROM users WHERE id = ?').get(me.id).avatar_url, '');
  } finally { db.raw.close(); }
});

test('F5: cover photo, limits, and legacy data URLs', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f5Isolate(db, bucket);
    const me = await register(api, 'f5-c@luno-test.local');
    const s = await login(api, 'f5-c@luno-test.local');
    assert.equal((await api('me', 'PATCH', { cover_url: pngDataUrl(5) }, s.access_token)).status, 200);
    const served = await api(`users/${me.id}/cover`, 'GET', null, s.access_token);
    assert.equal(served.status, 200);
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), Buffer.from([...PNG_MAGIC, 5]));
    const big = await api('me', 'PATCH', { avatar_url: `data:image/png;base64,${'A'.repeat(350001)}` }, s.access_token);
    assert.equal(big.status, 400);
    assert.equal((await big.json()).code, 'INVALID_AVATAR');
    const gif = await api('me', 'PATCH', { avatar_url: pngDataUrl(6).replace('image/png', 'image/gif') }, s.access_token);
    assert.equal(gif.status, 400);
    // Legacy row: photo bytes still inline in D1 keep serving.
    const legacy = pngDataUrl(7, 7, 7);
    db.raw.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(legacy, me.id);
    const { api: coldApi } = await f5Isolate(db, bucket);
    const coldLogin = await login(coldApi, 'f5-c@luno-test.local');
    const legacyServed = await coldApi(`users/${me.id}/avatar`, 'GET', null, coldLogin.access_token);
    assert.equal(legacyServed.status, 200);
    assert.deepEqual(Buffer.from(await legacyServed.arrayBuffer()), Buffer.from([...PNG_MAGIC, 7, 7, 7]));
  } finally { db.raw.close(); }
});

test('F5: profile survives a cold isolate on another device', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f5Isolate(db, bucket);
    const me = await register(api, 'f5-d@luno-test.local');
    const s = await login(api, 'f5-d@luno-test.local');
    assert.equal((await api('me', 'PATCH', {
      display_name: '새별', status_message: '회의 중', bio: 'hello',
      avatar_url: pngDataUrl(3), avatar_color: '#123abc',
    }, s.access_token)).status, 200);
    const qr = await (await api('me/qr', 'GET', null, s.access_token)).json();
    assert.match(qr.code, /^LUNO-FRIEND:/);
    const { api: coldApi } = await f5Isolate(db, bucket);
    const t = await login(coldApi, 'f5-d@luno-test.local');
    const coldMe = await (await coldApi('me', 'GET', null, t.access_token)).json();
    assert.equal(coldMe.display_name, '새별');
    assert.equal(coldMe.status_message, '회의 중');
    assert.equal(coldMe.bio, 'hello');
    assert.equal(coldMe.avatar_color, '#123abc');
    assert.equal(coldMe.avatar_url, `/api/v1/users/${me.id}/avatar`);
    const photo = await coldApi(`users/${me.id}/avatar`, 'GET', null, t.access_token);
    assert.equal(photo.status, 200);
    assert.deepEqual(Buffer.from(await photo.arrayBuffer()), Buffer.from([...PNG_MAGIC, 3]));
  } finally { db.raw.close(); }
});
