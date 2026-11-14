// Stage 10 (F14): speech-to-text mirrors the T1 provider pattern — a
// provider interface, a DEMO-only fake, and fail-closed 503s otherwise.
// No external API is connected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket } from './test_helpers.mjs';

let f14Serial = 0;
async function f14Isolate(db, bucket, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f14=${++f14Serial}`);
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

test('F14: unconfigured STT fails closed with guidance', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f14Isolate(db, bucket);
    const a = await registerLogin(api, 'f14-a@luno-test.local');
    const res = await api('ai/stt', 'POST', { audio_base64: 'AAAA', mime_type: 'audio/mp4' }, a.token);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.code, 'STT_NOT_CONFIGURED');
    assert.equal(body.transcript, undefined);
    assert.equal(body.text, undefined);
    const langs = await (await api('ai/stt/languages', 'GET', null, a.token)).json();
    assert.equal(langs.configured, false);
    assert.deepEqual(langs.languages, []);
  } finally { db.raw.close(); }
});

test('F14: fake provider contract under DEMO_MODE only', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const demo = await f14Isolate(db, bucket, { DEMO_MODE: 'true', STT_PROVIDER: 'fake' });
    const a = await registerLogin(demo.api, 'f14-b@luno-test.local');
    const langs = await (await demo.api('ai/stt/languages', 'GET', null, a.token)).json();
    assert.equal(langs.configured, true);
    assert.ok(langs.languages.includes('ko'));
    const res = await demo.api('ai/stt', 'POST', { audio_base64: 'QUJD', mime_type: 'audio/mp4', lang: 'ko' }, a.token);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.engine, 'fake');
    assert.equal(body.lang, 'ko');
    assert.ok(typeof body.text === 'string' && body.text.length > 0, 'fake transcript');
    // Same provider name without DEMO_MODE stays closed.
    const prod = await f14Isolate(db, bucket, { STT_PROVIDER: 'fake' });
    const ta = (await (await prod.api('auth/login', 'POST', { email: 'f14-b@luno-test.local', password: PW })).json()).access_token;
    assert.equal((await prod.api('ai/stt', 'POST', { audio_base64: 'QUJD', mime_type: 'audio/mp4' }, ta)).status, 503);
  } finally { db.raw.close(); }
});

test('F14: STT input validation', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f14Isolate(db, bucket, { DEMO_MODE: 'true', STT_PROVIDER: 'fake' });
    const a = await registerLogin(api, 'f14-c@luno-test.local');
    assert.equal((await api('ai/stt', 'POST', {}, a.token)).status, 400, 'audio required');
    assert.equal((await api('ai/stt', 'POST', { audio_base64: '!!!', mime_type: 'audio/mp4' }, a.token)).status, 400, 'base64 shape');
    assert.equal((await api('ai/stt', 'POST', { audio_base64: 'QUJD', mime_type: 'image/png' }, a.token)).status, 400, 'audio only');
    assert.equal((await api('ai/stt', 'POST', { audio_base64: 'A'.repeat(14_000_001), mime_type: 'audio/mp4' }, a.token)).status, 413, 'size cap');
  } finally { db.raw.close(); }
});
