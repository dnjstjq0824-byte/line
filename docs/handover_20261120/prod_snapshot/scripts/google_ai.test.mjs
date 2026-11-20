// GCP AI engines (not LLMs): Speech-to-Text v2, Text-to-Speech, Vision
// SafeSearch upload screening and Vision OCR. All share GOOGLE_AI_API_KEY and
// fail closed without it. Upstream calls go through env.GOOGLE_AI_FETCH.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket, F24_CONSENT } from './test_helpers.mjs';

let serial = 0;
async function isolate(db, bucket, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?gai=${++serial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', MEDIA_BUCKET: bucket, ...extraEnv };
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
  const s = await (await api('auth/login', 'POST', { email, password: PW })).json();
  return { ...(await reg.json()), token: s.access_token };
}
function stubFetch(calls, responder) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), key: init.headers['X-Goog-Api-Key'], body });
    const { status = 200, json } = responder(String(url), body);
    return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
  };
}
const GOOGLE = { GOOGLE_AI_API_KEY: 'test-key', GOOGLE_CLOUD_PROJECT: 'proj-1' };
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]).toString('base64');

test('google STT v2: m4a voice notes go to the recognizer with the mapped language', async () => {
  const db = makeD1();
  try {
    const calls = [];
    const fetchStub = stubFetch(calls, () => ({ json: { results: [{ alternatives: [{ transcript: '안녕하세요' }] }, { alternatives: [{ transcript: '반갑습니다' }] }] } }));
    const { api } = await isolate(db, makeBucket(), { ...GOOGLE, STT_PROVIDER: 'google', GOOGLE_AI_FETCH: fetchStub });
    const a = await registerLogin(api, 'gstt@luno-test.local');
    const res = await api('ai/stt', 'POST', { audio_base64: 'AAAA', mime_type: 'audio/mp4', lang: 'ko' }, a.token);
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.equal(out.text, '안녕하세요 반갑습니다');
    assert.equal(out.engine, 'google');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /speech\.googleapis\.com\/v2\/projects\/proj-1\/locations\/global\/recognizers\/_:recognize$/);
    assert.equal(calls[0].key, 'test-key');
    assert.deepEqual(calls[0].body.config.languageCodes, ['ko-KR']);
    assert.ok(calls[0].body.config.autoDecodingConfig);
    assert.equal(calls[0].body.content, 'AAAA');
  } finally { db.raw.close(); }
});

test('google STT needs both key and project; upstream errors map to 502', async () => {
  const db = makeD1();
  try {
    const noProject = await isolate(db, makeBucket(), { GOOGLE_AI_API_KEY: 'k', STT_PROVIDER: 'google' });
    const a = await registerLogin(noProject.api, 'gstt2@luno-test.local');
    const r1 = await noProject.api('ai/stt', 'POST', { audio_base64: 'AAAA', mime_type: 'audio/webm' }, a.token);
    assert.equal(r1.status, 503);
    assert.equal((await r1.json()).code, 'STT_NOT_CONFIGURED');
    const failing = await isolate(db, makeBucket(), { ...GOOGLE, STT_PROVIDER: 'google', GOOGLE_AI_FETCH: stubFetch([], () => ({ status: 403, json: { error: {} } })) });
    const r2 = await failing.api('ai/stt', 'POST', { audio_base64: 'AAAA', mime_type: 'audio/webm' }, a.token);
    assert.equal(r2.status, 502);
    assert.equal((await r2.json()).code, 'STT_UPSTREAM_ERROR');
  } finally { db.raw.close(); }
});

test('vision SafeSearch blocks adult/violent photos before storage; safe and outage pass', async () => {
  const db = makeD1();
  try {
    let verdict = { adult: 'VERY_UNLIKELY', violence: 'UNLIKELY', racy: 'POSSIBLE' };
    let down = false;
    const calls = [];
    const fetchStub = stubFetch(calls, () => down ? { status: 503, json: {} } : { json: { responses: [{ safeSearchAnnotation: verdict }] } });
    const { api } = await isolate(db, makeBucket(), { ...GOOGLE, VISION_PROVIDER: 'google', GOOGLE_AI_FETCH: fetchStub });
    const a = await registerLogin(api, 'gv-a@luno-test.local');
    const b = await registerLogin(api, 'gv-b@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
    const up = (name) => api('attachments', 'POST', { conversation_id: room.id, content_base64: PNG_B64, mime_type: 'image/png', original_name: name }, a.token);
    const ok = await up('a.png');
    assert.equal(ok.status, 201, await ok.clone().text());
    assert.equal(calls[0].body.requests[0].features[0].type, 'SAFE_SEARCH_DETECTION');
    verdict = { adult: 'LIKELY', violence: 'UNLIKELY' };
    const blocked = await up('b.png');
    assert.equal(blocked.status, 422);
    const body = await blocked.json();
    assert.equal(body.code, 'IMAGE_UNSAFE');
    assert.deepEqual(body.reasons, ['adult']);
    down = true;
    assert.equal((await up('c.png')).status, 201);
    const before = calls.length;
    const pdf = await api('attachments', 'POST', { conversation_id: room.id, content_base64: Buffer.from('%PDF-1.4 test').toString('base64'), mime_type: 'application/pdf', original_name: 'a.pdf' }, a.token);
    assert.equal(pdf.status, 201, await pdf.clone().text());
    assert.equal(calls.length, before, 'non-images are not sent to Vision');
  } finally { db.raw.close(); }
});

test('vision OCR reads a member photo and translates it; strangers get 404', async () => {
  const db = makeD1();
  try {
    const fetchStub = async (url) => {
      const u = String(url);
      const json = u.includes('vision') ? { responses: [{ safeSearchAnnotation: {}, fullTextAnnotation: { text: 'Hello menu\n' } }] }
        : { data: { translations: [{ translatedText: '안녕 메뉴', detectedSourceLanguage: 'en' }] } };
      return new Response(JSON.stringify(json), { status: 200 });
    };
    const { api } = await isolate(db, makeBucket(), { ...GOOGLE, VISION_PROVIDER: 'google', TRANSLATE_PROVIDER: 'google', GOOGLE_TRANSLATE_API_KEY: 't', GOOGLE_TRANSLATE_FETCH: fetchStub, GOOGLE_AI_FETCH: fetchStub });
    const a = await registerLogin(api, 'go-a@luno-test.local');
    const b = await registerLogin(api, 'go-b@luno-test.local');
    const c = await registerLogin(api, 'go-c@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
    const att = await (await api('attachments', 'POST', { conversation_id: room.id, content_base64: PNG_B64, mime_type: 'image/png', original_name: 'm.png' }, a.token)).json();
    const res = await api('ai/ocr', 'POST', { attachment_id: att.id, target_lang: 'ko' }, b.token);
    assert.equal(res.status, 200, await res.clone().text());
    const out = await res.json();
    assert.equal(out.text, 'Hello menu');
    assert.equal(out.translated, '안녕 메뉴');
    assert.equal(out.target_lang, 'ko');
    assert.equal((await api('ai/ocr', 'POST', { attachment_id: att.id }, c.token)).status, 404);
  } finally { db.raw.close(); }
});

test('without the key: OCR fails closed', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db, makeBucket(), { VISION_PROVIDER: 'google' });
    const a = await registerLogin(api, 'gn@luno-test.local');
    const res = await api('ai/ocr', 'POST', { attachment_id: 'x' }, a.token);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, 'OCR_NOT_CONFIGURED');
  } finally { db.raw.close(); }
});
