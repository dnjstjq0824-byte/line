// P1-4 Web Push: RFC 8291 encryption vector, VAPID auth, subscription
// CRUD, notify() fanout (decrypted end-to-end in-test), expiry cleanup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subtle } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { makeD1, makeBucket, F24_CONSENT } from './test_helpers.mjs';

// Fixed test-only VAPID keypair (never production keys).
const VAPID_PUBLIC = 'BJq33dPV-M6BZEuOXlXvzeZmKjQVhVBIbhErgmtit85yYAHzV-wlJxZl-Y7KCdWzqmUaVGr2V7WjkKk0IdP9inw';
const VAPID_PRIVATE = 'eMXFaqzdWCpjdEyrM9AkpIsxY3enQfUIRZ388SDHKu8';
const VAPID_ENV = {
  VAPID_PUBLIC_KEY: VAPID_PUBLIC,
  VAPID_PRIVATE_KEY: VAPID_PRIVATE,
  VAPID_SUBJECT: 'mailto:push-test@luno-test.local',
};

const b64uEncode = (bytes) => Buffer.from(bytes).toString('base64url');
const b64uDecode = (s) => new Uint8Array(Buffer.from(String(s), 'base64url'));

// RFC 8291 section 5 example (exact inputs + expected 145-byte body).
const RFC = {
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  uaPriv: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPub: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  asPriv: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPub: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  text: 'When I grow up, I want to be a watermelon',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

let wpSerial = 0;
async function isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?webpush=${++wpSerial}`);
  const env = { DB: db, MEDIA_BUCKET: makeBucket(), DURABLE_CONVERSATIONS: 'true', ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api, env, mod };
}

function stubFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

// Independent RFC 8188/8291 decrypt (test-side oracle): parses the header,
// re-derives CEK/nonce with the RECEIVER private key, AES-GCM decrypts.
async function rfcDecrypt(bodyBytes, uaPrivRaw, uaPubRaw, authRaw) {
  const salt = bodyBytes.slice(0, 16);
  const rs = new DataView(bodyBytes.buffer, bodyBytes.byteOffset + 16, 4).getUint32(0);
  const idlen = bodyBytes[20];
  const asPub = bodyBytes.slice(21, 21 + idlen);
  const ct = bodyBytes.slice(21 + idlen);
  assert.equal(idlen, 65, 'keyid is the raw server pubkey');
  const jwk = (pub, d) => {
    const o = { kty: 'EC', crv: 'P-256', x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)) };
    if (d) o.d = b64uEncode(d);
    return o;
  };
  const priv = await subtle.importKey('jwk', jwk(uaPubRaw, uaPrivRaw), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const peer = await subtle.importKey('jwk', jwk(asPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: peer }, priv, 256));
  const hkdf = async (saltB, ikm, info, len) => {
    const k = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: saltB, info }, k, len * 8));
  };
  const enc = new TextEncoder();
  const cat = (...ps) => {
    const out = new Uint8Array(ps.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of ps) { out.set(p, at); at += p.length; }
    return out;
  };
  const keyInfo = cat(enc.encode('WebPush: info'), new Uint8Array([0]), uaPubRaw, asPub);
  const ikm = await hkdf(authRaw, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, cat(enc.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdf(salt, ikm, cat(enc.encode('Content-Encoding: nonce'), new Uint8Array([0])), 12);
  const cekKey = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const pt = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, cekKey, ct));
  // Record: data || 0x02 || zero padding.
  let end = pt.length;
  while (end > 0 && pt[end - 1] === 0x00) end--;
  assert.equal(pt[end - 1], 0x02, 'padding delimiter');
  return { text: new TextDecoder().decode(pt.slice(0, end - 1)), rs };
}

test('P1-4: encryption reproduces the RFC 8291 section 5 vector', async () => {
  const { webpushEncrypt } = await import('./cf_worker.js?webpush-vec');
  const expected = b64uDecode(RFC.body);
  // The RFC prints "Content-Length: 145" but the example body decodes to
  // 144 bytes and decrypts cleanly — the header is an erratum; the bytes
  // (rs 4096, no extra padding) are the oracle.
  assert.equal(expected.length, 144, 'vector body is 144 bytes');
  const salt = expected.slice(0, 16);
  const rs = new DataView(expected.buffer, expected.byteOffset + 16, 4).getUint32(0);
  assert.equal(rs, 4096, 'vector record size');
  const got = await webpushEncrypt(b64uDecode(RFC.uaPub), b64uDecode(RFC.auth), new TextEncoder().encode(RFC.text), {
    salt, rs, padLen: 0,
    asPublicRaw: b64uDecode(RFC.asPub),
    asPrivateRaw: b64uDecode(RFC.asPriv),
  });
  assert.deepEqual(Buffer.from(got).toString('base64url'), RFC.body, 'byte-identical ciphertext');
});

test('P1-4: fresh encryptions decrypt with the receiver key (round-trip)', async () => {
  const { webpushEncrypt } = await import('./cf_worker.js?webpush-rt');
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pubJ = await subtle.exportKey('jwk', pair.publicKey);
  const privJ = await subtle.exportKey('jwk', pair.privateKey);
  const uaPub = new Uint8Array([0x04, ...b64uDecode(pubJ.x), ...b64uDecode(pubJ.y)]);
  const uaPriv = b64uDecode(privJ.d);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const body = await webpushEncrypt(uaPub, auth, new TextEncoder().encode('ping-전송-테스트'));
  const dec = await rfcDecrypt(new Uint8Array(body), uaPriv, uaPub, auth);
  assert.equal(dec.text, 'ping-전송-테스트');
});

test('P1-4: subscriptions validate, reassign, and cap at ten', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db, VAPID_ENV);
    const PW = 'Str0ng!Passw0rd';
    const reg = async (email) => {
      const r = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
      assert.equal(r.status, 201);
      const s = await api('auth/login', 'POST', { email, password: PW });
      return { ...(await r.json()), token: (await s.json()).access_token };
    };
    const a = await reg('wp-a@luno-test.local');
    const b = await reg('wp-b@luno-test.local');
    const keys = { p256dh: RFC.uaPub, auth: RFC.auth };
    assert.equal((await api('push/vapid-key', 'GET', null, a.token)).status, 200);
    assert.deepEqual(await (await api('push/vapid-key', 'GET', null, a.token)).json(), { public_key: VAPID_PUBLIC });
    // Validation failures.
    assert.equal((await api('push/subscriptions', 'POST', { endpoint: 'http://x.test/p', keys }, a.token)).status, 400, 'https only');
    assert.equal((await api('push/subscriptions', 'POST', { endpoint: 'https://x.test/p', keys: { p256dh: 'short', auth: RFC.auth } }, a.token)).status, 400, 'bad p256dh');
    assert.equal((await api('push/subscriptions', 'POST', { endpoint: 'https://x.test/p', keys: { p256dh: RFC.uaPub, auth: 'short' } }, a.token)).status, 400, 'bad auth');
    // Happy path + reassign across accounts.
    assert.equal((await api('push/subscriptions', 'POST', { endpoint: 'https://push.test/ep1', keys }, a.token)).status, 201);
    assert.equal((await api('push/subscriptions', 'POST', { endpoint: 'https://push.test/ep1', keys }, b.token)).status, 201);
    const owner = db.raw.prepare('SELECT user_id FROM luno_webpush_subs WHERE endpoint = ?').get('https://push.test/ep1');
    assert.equal(owner.user_id, b.id, 'endpoint reassigned to the new account');
    // Cap: 11 subs keep the 10 newest.
    for (let i = 0; i < 11; i++) {
      assert.equal((await api('push/subscriptions', 'POST', { endpoint: `https://push.test/cap-${i}`, keys }, a.token)).status, 201);
    }
    const n = db.raw.prepare('SELECT COUNT(*) n FROM luno_webpush_subs WHERE user_id = ?').get(a.id).n;
    assert.equal(n, 10, 'capped at ten');
    assert.equal((await api('push/subscriptions', 'DELETE', { endpoint: 'https://push.test/cap-10' }, a.token)).status, 200);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_webpush_subs WHERE user_id = ?').get(a.id).n, 9);
  } finally { db.raw.close(); }
});

test('P1-4: message notify encrypts to the subscriber (decrypted in-test)', async () => {
  const db = makeD1();
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pubJ = await subtle.exportKey('jwk', pair.publicKey);
  const privJ = await subtle.exportKey('jwk', pair.privateKey);
  const uaPub = new Uint8Array([0x04, ...b64uDecode(pubJ.x), ...b64uDecode(pubJ.y)]);
  const uaPriv = b64uDecode(privJ.d);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const keys = { p256dh: b64uEncode(uaPub), auth: b64uEncode(auth) };
  const calls = [];
  const restore = stubFetch(async (url, init) => {
    const raw = await new Response(init.body).arrayBuffer();
    calls.push({ url: String(url), headers: init.headers, body: new Uint8Array(raw) });
    return new Response('{}', { status: 201 });
  });
  try {
    // No WEBPUSH_FETCH override: the worker uses the stubbed global fetch.
    const { api } = await isolate(db, VAPID_ENV);
    const PW = 'Str0ng!Passw0rd';
    const reg = async (email) => {
      const r = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
      const s = await api('auth/login', 'POST', { email, password: PW });
      return { ...(await r.json()), token: (await s.json()).access_token };
    };
    const a = await reg('wp-m1@luno-test.local');
    const b = await reg('wp-m2@luno-test.local');
    assert.equal((await api('push/subscriptions', 'POST', { endpoint: 'https://push.test/sub-b', keys }, b.token)).status, 201);
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'WP', member_ids: [b.id] }, a.token)).json();
    const sent = await api(`conversations/${room.id}/messages`, 'POST', { kind: 'text', body: 'hello webpush', client_id: 'wp-1' }, a.token);
    assert.equal(sent.status, 201);
    assert.equal(calls.length, 1, 'one push to the subscriber');
    const c = calls[0];
    assert.equal(c.url, 'https://push.test/sub-b');
    assert.equal(c.headers['Content-Encoding'], 'aes128gcm');
    assert.equal(c.headers.TTL, '86400');
    assert.equal(c.headers.Urgency, 'normal');
    assert.ok(/^vapid t=[^,]+, k=/.test(c.headers.Authorization), 'vapid auth header');
    // VAPID JWT verifies against the test public key.
    const jwt = c.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
    assert.equal(jwt[2], VAPID_PUBLIC, 'k carries the server pubkey');
    const [h, pl, s] = jwt[1].split('.');
    const claims = JSON.parse(Buffer.from(pl, 'base64url').toString('utf8'));
    assert.equal(claims.aud, 'https://push.test');
    assert.equal(claims.sub, 'mailto:push-test@luno-test.local');
    assert.ok(claims.exp > Date.now() / 1000, 'expiry in the future');
    const vk = await subtle.importKey('jwk', {
      kty: 'EC', crv: 'P-256',
      x: b64uEncode(b64uDecode(VAPID_PUBLIC).slice(1, 33)), y: b64uEncode(b64uDecode(VAPID_PUBLIC).slice(33, 65)),
    }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    assert.equal(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vk, b64uDecode(s), new TextEncoder().encode(`${h}.${pl}`)), true, 'jwt signature valid');
    // Payload decrypts to the message preview + deep link.
    const dec = await rfcDecrypt(c.body, uaPriv, uaPub, auth);
    const payload = JSON.parse(dec.text);
    assert.equal(payload.body, 'hello webpush');
    assert.equal(payload.url, `/chats/${room.id}`);
    assert.equal(payload.tag, `chat-${room.id}`);
    assert.ok((payload.title || '').length > 0, 'title set');
  } finally { restore(); db.raw.close(); }
});

async function freshReceiver() {
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pubJ = await subtle.exportKey('jwk', pair.publicKey);
  const privJ = await subtle.exportKey('jwk', pair.privateKey);
  const uaPub = new Uint8Array([0x04, ...b64uDecode(pubJ.x), ...b64uDecode(pubJ.y)]);
  return { uaPub, uaPriv: b64uDecode(privJ.d), auth: crypto.getRandomValues(new Uint8Array(16)) };
}

test('P1-4: sealed chats push "new message" only (never plaintext)', async () => {
  const db = makeD1();
  const { uaPub, uaPriv, auth } = await freshReceiver();
  const keys = { p256dh: b64uEncode(uaPub), auth: b64uEncode(auth) };
  const calls = [];
  const restore = stubFetch(async (url, init) => {
    calls.push(new Uint8Array(await new Response(init.body).arrayBuffer()));
    return new Response('{}', { status: 201 });
  });
  try {
    const { api } = await isolate(db, VAPID_ENV);
    const PW = 'Str0ng!Passw0rd';
    const reg = async (email) => {
      const r = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
      const s = await api('auth/login', 'POST', { email, password: PW });
      return { ...(await r.json()), token: (await s.json()).access_token };
    };
    const a = await reg('wp-s1@luno-test.local');
    const b = await reg('wp-s2@luno-test.local');
    await api('push/subscriptions', 'POST', { endpoint: 'https://push.test/sealed', keys }, b.token);
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Sealed', member_ids: [b.id] }, a.token)).json();
    const sent = await api(`conversations/${room.id}/messages`, 'POST', { kind: 'ciphertext', body: 'SECRET-PLAINTEXT-MUST-NOT-LEAK', client_id: 'wp-s' }, a.token);
    assert.equal(sent.status, 201);
    assert.equal(calls.length, 1);
    const payload = JSON.parse((await rfcDecrypt(calls[0], uaPriv, uaPub, auth)).text);
    assert.equal(payload.body, '새 메시지');
    assert.ok(!JSON.stringify(payload).includes('SECRET-PLAINTEXT'), 'no leak');
  } finally { restore(); db.raw.close(); }
});

test('P1-4: 410 endpoints are deleted; web rides alongside the log leg', async () => {
  const db = makeD1();
  const { uaPub, auth } = await freshReceiver();
  const keys = { p256dh: b64uEncode(uaPub), auth: b64uEncode(auth) };
  const urls = [];
  const restore = stubFetch(async (url) => {
    urls.push(String(url));
    return new Response('{}', { status: String(url).includes('gone') ? 410 : 201 });
  });
  try {
    const { api } = await isolate(db, { ...VAPID_ENV, PUSH_PROVIDER: 'log' });
    const PW = 'Str0ng!Passw0rd';
    const reg = async (email) => {
      const r = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
      const s = await api('auth/login', 'POST', { email, password: PW });
      return { ...(await r.json()), token: (await s.json()).access_token };
    };
    const a = await reg('wp-g1@luno-test.local');
    const b = await reg('wp-g2@luno-test.local');
    await api('push/subscriptions', 'POST', { endpoint: 'https://push.test/gone', keys }, b.token);
    await api('push/subscriptions', 'POST', { endpoint: 'https://push.test/live', keys }, b.token);
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Gone', member_ids: [b.id] }, a.token)).json();
    await api(`conversations/${room.id}/messages`, 'POST', { kind: 'text', body: 'hi', client_id: 'wp-g' }, a.token);
    assert.deepEqual(urls.sort(), ['https://push.test/gone', 'https://push.test/live'].sort(), 'both endpoints attempted');
    const left = db.raw.prepare('SELECT endpoint FROM luno_webpush_subs WHERE user_id = ?').all(b.id);
    assert.deepEqual(left.map((r) => r.endpoint), ['https://push.test/live'], '410 row reaped');
    const logged = db.raw.prepare("SELECT COUNT(*) n FROM luno_push_outbox WHERE user_id = ?").get(b.id).n;
    assert.equal(logged, 1, 'log leg still fired alongside');
  } finally { restore(); db.raw.close(); }
});

test('P1-4: unconfigured VAPID is a strict no-op', async () => {
  const db = makeD1();
  let fetched = 0;
  const restore = stubFetch(async () => { fetched++; return new Response('{}', { status: 201 }); });
  try {
    const { api } = await isolate(db, {});
    const PW = 'Str0ng!Passw0rd';
    const r = await api('auth/register', 'POST', { ...F24_CONSENT, email: 'wp-n@luno-test.local', password: PW, display_name: 'n' });
    const s = await api('auth/login', 'POST', { email: 'wp-n@luno-test.local', password: PW });
    const tok = (await s.json()).access_token;
    assert.equal((await api('push/vapid-key', 'GET', null, tok)).status, 503, 'no key served');
    const { uaPub, auth } = await freshReceiver();
    // Storing still works (keys may arrive later); sends stay silent.
    assert.equal((await api('push/subscriptions', 'POST', {
      endpoint: 'https://push.test/nokey', keys: { p256dh: b64uEncode(uaPub), auth: b64uEncode(auth) },
    }, tok)).status, 201);
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'NoKey', member_ids: [] }, tok)).json();
    await api(`conversations/${room.id}/messages`, 'POST', { kind: 'text', body: 'hi', client_id: 'wp-n' }, tok);
    assert.equal(fetched, 0, 'no push attempted');
  } finally { restore(); db.raw.close(); }
});

test('P1-4: calls ring high-priority; hangup dismisses by tag', async () => {
  const db = makeD1();
  const { uaPub, uaPriv, auth } = await freshReceiver();
  const keys = { p256dh: b64uEncode(uaPub), auth: b64uEncode(auth) };
  const calls = [];
  const restore = stubFetch(async (url, init) => {
    calls.push({ headers: init.headers, body: new Uint8Array(await new Response(init.body).arrayBuffer()) });
    return new Response('{}', { status: 201 });
  });
  try {
    const { api } = await isolate(db, VAPID_ENV);
    const PW = 'Str0ng!Passw0rd';
    const reg = async (email) => {
      const r = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
      const s = await api('auth/login', 'POST', { email, password: PW });
      return { ...(await r.json()), token: (await s.json()).access_token };
    };
    const a = await reg('wp-c1@luno-test.local');
    const b = await reg('wp-c2@luno-test.local');
    await api('friends', 'POST', { friend_id: b.id }, a.token);
    await api('push/subscriptions', 'POST', { endpoint: 'https://push.test/ring', keys }, b.token);
    const room = await (await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
    const call = await (await api('calls', 'POST', { conversation_id: room.id, kind: 'voice' }, a.token)).json();
    assert.equal(calls.length, 1, 'ring pushed');
    assert.equal(calls[0].headers.TTL, '45', 'ring TTL matches FCM');
    assert.equal(calls[0].headers.Urgency, 'high');
    const ring = JSON.parse((await rfcDecrypt(calls[0].body, uaPriv, uaPub, auth)).text);
    assert.equal(ring.tag, `call-${call.id}`);
    assert.equal(ring.url, `/chats/${room.id}`);
    // Callee hangs up (decline/end) -> call_end dismisses the ring tag.
    const end = await api(`calls/${call.id}/state`, 'POST', { state: 'declined' }, b.token);
    assert.equal(end.status, 200);
    assert.equal(calls.length, 2, 'dismiss pushed');
    assert.equal(calls[1].headers.TTL, '60');
    const bye = JSON.parse((await rfcDecrypt(calls[1].body, uaPriv, uaPub, auth)).text);
    assert.deepEqual(bye, { dismiss: `call-${call.id}` });
  } finally { restore(); db.raw.close(); }
});

test('P1-4: service worker renders pushes and deep-links taps', async () => {
  const sw = await readFile(new URL('../apps/user-web/public/sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("addEventListener('push'"), 'push handler');
  assert.ok(sw.includes('showNotification'), 'renders a notification');
  assert.ok(sw.includes('data.dismiss'), 'call_end dismissal');
  assert.ok(sw.includes('getNotifications({ tag:'), 'closes by tag');
  assert.ok(sw.includes("addEventListener('notificationclick'"), 'tap handler');
  assert.ok(sw.includes('openWindow'), 'opens the conversation');
  assert.ok(sw.includes('u.origin === self.location.origin'), 'same-origin navigation guard');
  // F18 stamping markers intact.
  assert.ok(sw.includes('__LUNO_BUILD_ID__') && sw.includes('__LUNO_PRECACHE_JSON__'), 'stamp markers kept');
});

test('P1-4: web subscribes after the settings grant, syncs on mount, clears on logout', async () => {
  const notify = await readFile(new URL('../apps/user-web/src/web_notify.ts', import.meta.url), 'utf8');
  assert.ok(notify.includes('pushManager.subscribe'), 'subscribes via PushManager');
  assert.ok(notify.includes('/api/v1/push/vapid-key'), 'fetches the server key');
  assert.ok(notify.includes("'/api/v1/push/subscriptions', 'POST'"), 'registers the subscription');
  assert.ok(notify.includes("'/api/v1/push/subscriptions', 'DELETE'"), 'unregisters on logout');
  assert.ok(notify.includes('Notification.permission !== \'granted\''), 'grant gate kept');
  const settings = await readFile(new URL('../apps/user-web/src/components/SettingsModal.vue', import.meta.url), 'utf8');
  assert.ok(settings.includes('void syncWebPushSubscription()'), 'settings grant subscribes');
  const view = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
  assert.ok(view.includes('void syncWebPushSubscription()'), 'authenticated mount re-syncs');
  const auth = await readFile(new URL('../apps/user-web/src/composables/useAuth.ts', import.meta.url), 'utf8');
  assert.ok(auth.includes('await clearWebPushSubscription()'), 'logout clears the subscription');
});
