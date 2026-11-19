// A13: whisper STT engine adapter — OpenAI-compatible /audio/transcriptions.
// Key-gated (WHISPER_API_KEY), fail-closed without it, upstream failures map
// to 502. Audio bytes and the key never surface in responses. Tests inject a
// stub fetch via env.WHISPER_FETCH; no external API is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket, F24_CONSENT } from './test_helpers.mjs';

let sttwSerial = 0;
async function sttwIsolate(db, bucket, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?sttw=${++sttwSerial}`);
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

test('A13: whisper without a key or base url fails closed', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await sttwIsolate(db, bucket, { STT_PROVIDER: 'whisper' });
    const a = await registerLogin(api, 'sttw-a@luno-test.local');
    const res = await api('ai/stt', 'POST', { audio_base64: 'AAAA', mime_type: 'audio/mp4' }, a.token);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, 'STT_NOT_CONFIGURED');
    const langs = await (await api('ai/stt/languages', 'GET', null, a.token)).json();
    assert.equal(langs.configured, false);
    assert.deepEqual(langs.languages, []);
    // Key alone is not enough: no vendor URL is built in (L-15).
    const keyed = await sttwIsolate(db, bucket, { STT_PROVIDER: 'whisper', WHISPER_API_KEY: 'sk-test-key' });
    const ta = (await (await keyed.api('auth/login', 'POST', { email: 'sttw-a@luno-test.local', password: PW })).json()).access_token;
    assert.equal((await keyed.api('ai/stt', 'POST', { audio_base64: 'AAAA', mime_type: 'audio/mp4' }, ta)).status, 503);
  } finally { db.raw.close(); }
});

test('A13: whisper happy path posts multipart with auth', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  const seen = {};
  const stub = async (url, opts) => {
    seen.url = url;
    seen.opts = opts;
    return { ok: true, json: async () => ({ text: 'whisper transcript' }) };
  };
  try {
    const { api } = await sttwIsolate(db, bucket, { STT_PROVIDER: 'whisper', WHISPER_API_KEY: 'sk-test-key', WHISPER_BASE_URL: 'https://whisper.test/v1', WHISPER_FETCH: stub });
    const a = await registerLogin(api, 'sttw-b@luno-test.local');
    const audio = Buffer.from('fake-audio-bytes').toString('base64');
    const res = await api('ai/stt', 'POST', { audio_base64: audio, mime_type: 'audio/mp4', lang: 'ko' }, a.token);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { text: 'whisper transcript', lang: 'ko', engine: 'whisper' });
    assert.equal(seen.url, 'https://whisper.test/v1/audio/transcriptions');
    assert.equal(seen.opts.method, 'POST');
    assert.equal(seen.opts.headers.Authorization, 'Bearer sk-test-key');
    assert.ok(seen.opts.body instanceof FormData);
    assert.equal(seen.opts.body.get('model'), 'whisper-1');
    assert.equal(seen.opts.body.get('language'), 'ko');
    const file = seen.opts.body.get('file');
    assert.ok(file instanceof Blob);
    assert.equal(file.size, Buffer.byteLength('fake-audio-bytes'));
    assert.ok(file.name.endsWith('.m4a'));
  } finally { db.raw.close(); }
});

test('A13: whisper upstream failure maps to 502 without leaking the key', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  const failing = async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom sk-test-key' }) });
  try {
    const { api } = await sttwIsolate(db, bucket, { STT_PROVIDER: 'whisper', WHISPER_API_KEY: 'sk-test-key', WHISPER_BASE_URL: 'https://whisper.test/v1', WHISPER_FETCH: failing });
    const a = await registerLogin(api, 'sttw-c@luno-test.local');
    const audio = Buffer.from('fake-audio-bytes').toString('base64');
    const res = await api('ai/stt', 'POST', { audio_base64: audio, mime_type: 'audio/webm' }, a.token);
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.code, 'STT_UPSTREAM_ERROR');
    assert.equal(body.text, undefined);
    assert.ok(!JSON.stringify(body).includes('sk-test-key'), 'key must not leak');
    assert.ok(!JSON.stringify(body).includes(audio), 'audio must not leak');
  } finally { db.raw.close(); }
});

test('A13: whisper honors base url, model, and auto language', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  const seen = {};
  const stub = async (url, opts) => {
    seen.url = url;
    seen.opts = opts;
    return { ok: true, json: async () => ({ text: 'self-hosted transcript' }) };
  };
  try {
    const { api } = await sttwIsolate(db, bucket, {
      STT_PROVIDER: 'whisper', WHISPER_API_KEY: 'sk-test-key', WHISPER_FETCH: stub,
      WHISPER_BASE_URL: 'http://whisper.local:9000/v1/', WHISPER_MODEL: 'large-v3',
    });
    const a = await registerLogin(api, 'sttw-d@luno-test.local');
    const res = await api('ai/stt', 'POST', { audio_base64: 'QUJD', mime_type: 'audio/wav' }, a.token);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { text: 'self-hosted transcript', lang: 'auto', engine: 'whisper' });
    assert.equal(seen.url, 'http://whisper.local:9000/v1/audio/transcriptions');
    assert.equal(seen.opts.body.get('model'), 'large-v3');
    assert.equal(seen.opts.body.get('language'), null, 'auto must not send a language hint');
    assert.ok(seen.opts.body.get('file').name.endsWith('.wav'));
  } finally { db.raw.close(); }
});
