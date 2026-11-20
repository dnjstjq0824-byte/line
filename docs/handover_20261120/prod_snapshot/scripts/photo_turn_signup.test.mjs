// Field bugs from the build-13 APK (2026-11-19):
// - profile/cover/room photos never refreshed: the URL never changed and the
//   app's NetworkImage / web <img> sent no bearer token (401). Uploads now
//   return a versioned URL that loads without a token while it is current.
// - a user signed up as ...@gamil.com and could not log in with gmail.com:
//   well-known domain typos are refused at sign-up with a suggestion.
// - calls across LTE/Wi-Fi need TURN: TURN_SECRET mints coturn REST
//   credentials per user.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { makeD1, makeBucket, F24_CONSENT } from './test_helpers.mjs';

let serial = 0;
async function isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?pts=${++serial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', MEDIA_BUCKET: makeBucket(), ...extraEnv };
  const raw = (url, init) => mod.default.fetch(new Request(url, init), env);
  const api = (path, method = 'GET', body = null, token = null) => raw(`https://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === null ? undefined : JSON.stringify(body),
  });
  return { api, raw };
}
const PW = 'Str0ng!Passw0rd';
async function registerLogin(api, email) {
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
  assert.equal(reg.status, 201, await reg.clone().text());
  const s = await (await api('auth/login', 'POST', { email, password: PW })).json();
  return { ...(await reg.json()), token: s.access_token };
}
const png = (n) => 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n, n, n]).toString('base64');

test('profile photo URL changes on every upload and loads without a token', async () => {
  const db = makeD1();
  try {
    const { api, raw } = await isolate(db);
    const a = await registerLogin(api, 'ph-a@luno-test.local');
    const first = (await (await api('me', 'PATCH', { avatar_url: png(1) }, a.token)).json()).avatar_url;
    assert.match(first, /^\/api\/v1\/users\/[\w-]+\/avatar\?v=[0-9a-f]{24}$/);
    const img = await raw(`https://localhost${first}`);
    assert.equal(img.status, 200);
    assert.equal((await img.arrayBuffer()).byteLength, 11);
    assert.match(img.headers.get('Cache-Control'), /immutable/);
    const second = (await (await api('me', 'PATCH', { avatar_url: png(2) }, a.token)).json()).avatar_url;
    assert.notEqual(second, first);
    assert.equal((await raw(`https://localhost${second}`)).status, 200);
    assert.equal((await raw(`https://localhost${first}`)).status, 404, 'an old version stops serving');
    assert.equal((await raw(`https://localhost${second.replace(/v=.*/, 'v=' + '0'.repeat(24))}`)).status, 404);
    assert.equal((await raw(`https://localhost${second.split('?')[0]}`)).status, 401, 'bare path still needs a token');
    const cover = (await (await api('me', 'PATCH', { cover_url: png(3) }, a.token)).json()).cover_url;
    assert.match(cover, /\/cover\?v=/);
    assert.equal((await raw(`https://localhost${cover}`)).status, 200);
  } finally { db.raw.close(); }
});

test('group room photo URL is versioned and loads without a token', async () => {
  const db = makeD1();
  try {
    const { api, raw } = await isolate(db);
    const a = await registerLogin(api, 'rp-a@luno-test.local');
    const b = await registerLogin(api, 'rp-b@luno-test.local');
    const c = await registerLogin(api, 'rp-c@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'g', member_ids: [b.id, c.id] }, a.token)).json();
    const res = await api(`conversations/${room.id}`, 'PATCH', { avatar: png(4) }, a.token);
    assert.equal(res.status, 200, await res.clone().text());
    const detail = await (await api(`conversations/${room.id}`, 'GET', null, a.token)).json();
    const url = detail.avatar_url || (detail.conversation && detail.conversation.avatar_url);
    assert.match(url, /^\/api\/v1\/conversations\/[\w-]+\/avatar\?v=[0-9a-f]{24}$/);
    assert.equal((await raw(`https://localhost${url}`)).status, 200);
  } finally { db.raw.close(); }
});

test('sign-up refuses well-known email domain typos with a suggestion', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const res = await api('auth/register', 'POST', { ...F24_CONSENT, email: 'someone@gamil.com', password: PW, display_name: 's' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'EMAIL_DOMAIN_TYPO');
    assert.equal(body.suggestion, 'someone@gmail.com');
    assert.match(body.error, /gmail\.com/);
    const naver = await (await api('auth/register', 'POST', { ...F24_CONSENT, email: 'x@NAVER.CO', password: PW, display_name: 'x' })).json();
    assert.equal(naver.suggestion, 'x@naver.com');
    const ok = await api('auth/register', 'POST', { ...F24_CONSENT, email: 'someone@gmail.com', password: PW, display_name: 's' });
    assert.equal(ok.status, 201);
  } finally { db.raw.close(); }
});

test('TURN_SECRET mints coturn REST credentials per user', async () => {
  const db = makeD1();
  try {
    const secret = 'a'.repeat(32);
    const { api } = await isolate(db, { TURN_URLS: 'turn:1.2.3.4:3478?transport=udp,turn:1.2.3.4:3478?transport=tcp', TURN_SECRET: secret });
    const a = await registerLogin(api, 'turn-a@luno-test.local');
    const out = await (await api('calls/ice-servers', 'GET', null, a.token)).json();
    const turn = out.ice_servers.filter((s) => String(s.urls).startsWith('turn:'));
    assert.equal(turn.length, 2);
    const [exp, uid] = turn[0].username.split(':');
    assert.equal(uid, a.id);
    const ttl = Number(exp) - Math.floor(Date.now() / 1000);
    assert.ok(ttl > 11 * 3600 && ttl <= 12 * 3600);
    assert.equal(turn[0].credential, createHmac('sha1', secret).update(turn[0].username).digest('base64'));
    assert.ok(!JSON.stringify(out).includes(secret));
  } finally { db.raw.close(); }
});
