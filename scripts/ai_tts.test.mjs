// A14: text-to-speech mirrors the F14 provider pattern — a provider
// interface, a DEMO-only fake, and fail-closed 503s otherwise.
// No external API is connected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket, F24_CONSENT } from './test_helpers.mjs';

let ttsSerial = 0;
async function ttsIsolate(db, bucket, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?tts=${++ttsSerial}`);
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
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
  assert.equal(reg.status, 201);
  const s = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(s.status, 200);
  const sess = await s.json();
  return { ...(await reg.json()), ...sess, token: sess.access_token };
}

test('A14: unconfigured TTS fails closed with guidance', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await ttsIsolate(db, bucket);
    const a = await registerLogin(api, 'tts-a@luno-test.local');
    const res = await api('ai/tts', 'POST', { text: 'hello' }, a.token);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.code, 'TTS_NOT_CONFIGURED');
    assert.equal(body.audio_base64, undefined);
    const voices = await (await api('ai/tts/voices', 'GET', null, a.token)).json();
    assert.equal(voices.configured, false);
    assert.deepEqual(voices.voices, []);
  } finally { db.raw.close(); }
});

test('A14: fake provider contract under DEMO_MODE only', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const demo = await ttsIsolate(db, bucket, { DEMO_MODE: 'true', TTS_PROVIDER: 'fake' });
    const a = await registerLogin(demo.api, 'tts-b@luno-test.local');
    const voices = await (await demo.api('ai/tts/voices', 'GET', null, a.token)).json();
    assert.equal(voices.configured, true);
    assert.ok(voices.voices.includes('luno'));
    const res = await demo.api('ai/tts', 'POST', { text: 'hello', lang: 'en' }, a.token);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.engine, 'fake');
    assert.equal(body.mime_type, 'audio/wav');
    assert.ok(typeof body.audio_base64 === 'string' && body.audio_base64.length > 0, 'fake audio');
    // Same provider name without DEMO_MODE stays closed.
    const prod = await ttsIsolate(db, bucket, { TTS_PROVIDER: 'fake' });
    const ta = (await (await prod.api('auth/login', 'POST', { email: 'tts-b@luno-test.local', password: PW })).json()).access_token;
    assert.equal((await prod.api('ai/tts', 'POST', { text: 'hello' }, ta)).status, 503);
  } finally { db.raw.close(); }
});

test('A14: TTS input validation', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await ttsIsolate(db, bucket, { DEMO_MODE: 'true', TTS_PROVIDER: 'fake' });
    const a = await registerLogin(api, 'tts-c@luno-test.local');
    assert.equal((await api('ai/tts', 'POST', {}, a.token)).status, 400, 'text required');
    assert.equal((await api('ai/tts', 'POST', { text: '   ' }, a.token)).status, 400, 'blank rejected');
    assert.equal((await api('ai/tts', 'POST', { text: 'x'.repeat(2001) }, a.token)).status, 413, 'char cap');
  } finally { db.raw.close(); }
});
