// FCM push provider (PUSH_PROVIDER=fcm). Key-gated (FCM_SERVICE_ACCOUNT_JSON),
// fail-closed without it, OAuth via a locally signed RS256 JWT, one message per
// android/ios token, unregistered tokens deleted, preview pref honoured. Tests
// inject a stub fetch via env.FCM_FETCH; no external API is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createPublicKey, verify } from 'node:crypto';
import { makeD1, F24_CONSENT } from './test_helpers.mjs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const SA = JSON.stringify({
  type: 'service_account',
  project_id: 'luno-test-proj',
  client_email: 'fcm@luno-test-proj.iam.gserviceaccount.com',
  private_key: PEM,
  token_uri: 'https://oauth2.googleapis.com/token',
});
const SEND_URL = 'https://fcm.googleapis.com/v1/projects/luno-test-proj/messages:send';

let fcmSerial = 0;
async function fcmIsolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?fcm=${++fcmSerial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api };
}
async function registerLogin(api, email, handle) {
  const password = 'Str0ng!Passw0rd';
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password, display_name: handle, handle });
  assert.equal(reg.status, 201);
  const id = (await reg.json()).id;
  const login = await api('auth/login', 'POST', { email, password });
  return { id, token: (await login.json()).access_token };
}
async function directRoom(api, a, b) {
  const room = await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token);
  assert.equal(room.status, 201);
  return (await room.json()).id;
}
function recorder(sendStatus = 200, sendBody = {}) {
  const calls = [];
  const stub = async (url, opts) => {
    calls.push({ url, opts });
    if (url.startsWith('https://oauth2.googleapis.com/')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'ya29.test', expires_in: 3600 }) };
    }
    return { ok: sendStatus === 200, status: sendStatus, json: async () => sendBody };
  };
  return { calls, stub, sends: () => calls.filter((c) => c.url === SEND_URL) };
}

test('fcm without a service account stays inactive', async () => {
  const db = makeD1();
  const rec = recorder();
  try {
    const { api } = await fcmIsolate(db, { PUSH_PROVIDER: 'fcm', FCM_FETCH: rec.stub });
    const a = await registerLogin(api, 'fcm0-a@luno-test.local', 'fcm0_a');
    const b = await registerLogin(api, 'fcm0-b@luno-test.local', 'fcm0_b');
    await api('push-tokens', 'POST', { token: 'tok-b', platform: 'android', device_id: 'dev-b' }, b.token);
    const cid = await directRoom(api, a, b);
    assert.equal((await api(`conversations/${cid}/messages`, 'POST', { body: 'hi' }, a.token)).status, 201);
    assert.equal(rec.calls.length, 0);
    const t = await api('push-tokens/test', 'POST', {}, b.token);
    assert.equal(t.status, 503);
    assert.equal((await t.json()).code, 'PUSH_NOT_CONFIGURED');
  } finally { db.raw.close(); }
});

test('fcm sends a signed-token push to the peer android device only', async () => {
  const db = makeD1();
  const rec = recorder();
  try {
    const { api } = await fcmIsolate(db, { PUSH_PROVIDER: 'fcm', FCM_SERVICE_ACCOUNT_JSON: SA, FCM_FETCH: rec.stub });
    const a = await registerLogin(api, 'fcm1-a@luno-test.local', 'fcm1_a');
    const b = await registerLogin(api, 'fcm1-b@luno-test.local', 'fcm1_b');
    await api('push-tokens', 'POST', { token: 'tok-a', platform: 'android', device_id: 'dev-a' }, a.token);
    await api('push-tokens', 'POST', { token: 'tok-b', platform: 'android', device_id: 'dev-b' }, b.token);
    await api('push-tokens', 'POST', { token: 'tok-b-web', platform: 'web', device_id: 'web-b' }, b.token);
    const cid = await directRoom(api, a, b);
    assert.equal((await api(`conversations/${cid}/messages`, 'POST', { body: 'hello push' }, a.token)).status, 201);

    // OAuth: a JWT-bearer grant whose RS256 signature verifies with our key.
    const oauth = rec.calls.find((c) => c.url === 'https://oauth2.googleapis.com/token');
    assert.ok(oauth, 'oauth token requested');
    const form = new URLSearchParams(oauth.opts.body);
    assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [h, c, s] = form.get('assertion').split('.');
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    assert.equal(claims.iss, 'fcm@luno-test-proj.iam.gserviceaccount.com');
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
    assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), createPublicKey(privateKey), Buffer.from(s, 'base64url')));

    // Exactly one send: the peer's android token (sender and web excluded).
    const sends = rec.sends();
    assert.equal(sends.length, 1);
    assert.equal(sends[0].opts.headers.Authorization, 'Bearer ya29.test');
    const msg = JSON.parse(sends[0].opts.body).message;
    assert.equal(msg.token, 'tok-b');
    assert.equal(msg.notification.title, 'fcm1_a');
    assert.equal(msg.notification.body, 'hello push');
    assert.deepEqual(msg.data, { kind: 'message', conversation_id: cid });
    assert.equal(msg.android.notification.channel_id, 'luno_messages');
    assert.equal(msg.android.notification.tag, `luno-room-${cid}`);

    // Calls go to the call channel; the cached OAuth token is reused.
    assert.equal((await api('calls', 'POST', { conversation_id: cid, kind: 'voice' }, a.token)).status, 201);
    const call = JSON.parse(rec.sends()[1].opts.body).message;
    assert.equal(call.android.notification.channel_id, 'luno_calls');
    assert.equal(rec.calls.filter((x) => x.url.startsWith('https://oauth2')).length, 1);
  } finally { db.raw.close(); }
});

test('fcm hides the text when preview is off and self-test reaches the caller', async () => {
  const db = makeD1();
  const rec = recorder();
  try {
    const { api } = await fcmIsolate(db, { PUSH_PROVIDER: 'fcm', FCM_SERVICE_ACCOUNT_JSON: SA, FCM_FETCH: rec.stub });
    const a = await registerLogin(api, 'fcm2-a@luno-test.local', 'fcm2_a');
    const b = await registerLogin(api, 'fcm2-b@luno-test.local', 'fcm2_b');
    await api('push-tokens', 'POST', { token: 'tok-b', platform: 'android', device_id: 'dev-b' }, b.token);
    assert.equal((await api('me/settings', 'PATCH', { notification_preview: false }, b.token)).status, 200);
    const cid = await directRoom(api, a, b);
    await api(`conversations/${cid}/messages`, 'POST', { body: 'secret text' }, a.token);
    assert.equal(JSON.parse(rec.sends()[0].opts.body).message.notification.body, '새 알림');

    const t = await api('push-tokens/test', 'POST', {}, b.token);
    assert.equal(t.status, 200);
    assert.equal((await t.json()).notified, 1);
    assert.equal(JSON.parse(rec.sends()[1].opts.body).message.token, 'tok-b');
  } finally { db.raw.close(); }
});

test('push-tokens DELETE with a device_id clears only that device', async () => {
  const db = makeD1();
  try {
    const { api } = await fcmIsolate(db);
    const b = await registerLogin(api, 'fcmd-b@luno-test.local', 'fcmd_b');
    await api('push-tokens', 'POST', { token: 't1', platform: 'android', device_id: 'phone' }, b.token);
    await api('push-tokens', 'POST', { token: 't2', platform: 'android', device_id: 'tablet' }, b.token);
    await api('push-tokens', 'POST', { token: 't3', platform: 'android', device_id: 'watch' }, b.token);
    assert.equal((await api('push-tokens', 'DELETE', { device_id: 'phone' }, b.token)).status, 200);
    let left = db.raw.prepare('SELECT device_id FROM push_tokens WHERE user_id = ? ORDER BY device_id').all(b.id).map((r) => r.device_id);
    assert.deepEqual(left, ['tablet', 'watch']);
    // The app sends it as a query parameter (its DELETE carries no body).
    assert.equal((await api('push-tokens?device_id=watch', 'DELETE', null, b.token)).status, 200);
    left = db.raw.prepare('SELECT device_id FROM push_tokens WHERE user_id = ?').all(b.id).map((r) => r.device_id);
    assert.deepEqual(left, ['tablet']);
    assert.equal((await api('push-tokens', 'DELETE', null, b.token)).status, 200);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM push_tokens WHERE user_id = ?').get(b.id).n, 0);
  } finally { db.raw.close(); }
});

test('fcm deletes unregistered tokens but keeps them on other errors', async () => {
  const db = makeD1();
  try {
    const gone = recorder(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } });
    const { api } = await fcmIsolate(db, { PUSH_PROVIDER: 'fcm', FCM_SERVICE_ACCOUNT_JSON: SA, FCM_FETCH: gone.stub });
    const a = await registerLogin(api, 'fcm3-a@luno-test.local', 'fcm3_a');
    const b = await registerLogin(api, 'fcm3-b@luno-test.local', 'fcm3_b');
    await api('push-tokens', 'POST', { token: 'tok-b', platform: 'android', device_id: 'dev-b' }, b.token);
    const cid = await directRoom(api, a, b);
    assert.equal((await api(`conversations/${cid}/messages`, 'POST', { body: 'x' }, a.token)).status, 201);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM push_tokens WHERE user_id = ?').get(b.id).n, 0);

    const bad = recorder(400, { error: { status: 'INVALID_ARGUMENT', details: [{ errorCode: 'INVALID_ARGUMENT' }] } });
    const iso2 = await fcmIsolate(db, { PUSH_PROVIDER: 'fcm', FCM_SERVICE_ACCOUNT_JSON: SA, FCM_FETCH: bad.stub });
    const b2 = (await (await iso2.api('auth/login', 'POST', { email: 'fcm3-b@luno-test.local', password: 'Str0ng!Passw0rd' })).json()).access_token;
    const a2 = (await (await iso2.api('auth/login', 'POST', { email: 'fcm3-a@luno-test.local', password: 'Str0ng!Passw0rd' })).json()).access_token;
    await iso2.api('push-tokens', 'POST', { token: 'tok-b2', platform: 'android', device_id: 'dev-b' }, b2);
    assert.equal((await iso2.api(`conversations/${cid}/messages`, 'POST', { body: 'y' }, a2)).status, 201);
    assert.equal(bad.sends().length, 1);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM push_tokens WHERE user_id = ?').get(b.id).n, 1, 'kept on INVALID_ARGUMENT');
  } finally { db.raw.close(); }
});
