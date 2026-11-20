// Google Cloud Translation adapter (TRANSLATE_PROVIDER=google). Key-gated
// (GOOGLE_TRANSLATE_API_KEY), fail-closed without it, upstream failures map
// to 502, results are cached. The key never surfaces in responses. Tests
// inject a stub fetch via env.GOOGLE_TRANSLATE_FETCH; no external API is
// contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, F24_CONSENT } from './test_helpers.mjs';

let gtSerial = 0;
async function gtIsolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?gtr=${++gtSerial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api };
}

const PW = 'Str0ng!Passw0rd';
const KEY = 'AIza-test-key-should-never-leak';

async function registerLogin(api, email) {
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
  assert.equal(reg.status, 201);
  const s = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(s.status, 200);
  return (await s.json()).access_token;
}

test('google translate without a key fails closed', async () => {
  const db = makeD1();
  try {
    const { api } = await gtIsolate(db, { TRANSLATE_PROVIDER: 'google' });
    const t = await registerLogin(api, 'gt-nokey@luno-test.local');
    const res = await api('translate', 'POST', { text: '안녕하세요', target_lang: 'en' }, t);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, 'TRANSLATE_NOT_CONFIGURED');
    const langs = await (await api('translate/languages', 'GET', null, t)).json();
    assert.equal(langs.configured, false);
  } finally { db.raw.close(); }
});

test('google translate happy path sends key header and caches the result', async () => {
  const db = makeD1();
  const calls = [];
  const stub = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({ data: { translations: [{ translatedText: 'Hello', detectedSourceLanguage: 'ko' }] } }) };
  };
  try {
    const { api } = await gtIsolate(db, { TRANSLATE_PROVIDER: 'google', GOOGLE_TRANSLATE_API_KEY: KEY, GOOGLE_TRANSLATE_FETCH: stub });
    const t = await registerLogin(api, 'gt-ok@luno-test.local');
    const langs = await (await api('translate/languages', 'GET', null, t)).json();
    assert.equal(langs.configured, true);
    assert.equal(langs.engine, 'google');

    const res = await api('translate', 'POST', { text: '안녕하세요', target_lang: 'en' }, t);
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.equal(out.translated, 'Hello');
    assert.equal(out.source_lang, 'ko');
    assert.equal(out.engine, 'google');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://translation.googleapis.com/language/translate/v2');
    assert.equal(calls[0].opts.headers['X-Goog-Api-Key'], KEY);
    const sent = JSON.parse(calls[0].opts.body);
    assert.deepEqual(sent, { q: '안녕하세요', target: 'en', format: 'text' });

    // Explicit source language is forwarded.
    await api('translate', 'POST', { text: '감사합니다', target_lang: 'ja', source_lang: 'ko' }, t);
    assert.equal(JSON.parse(calls[1].opts.body).source, 'ko');

    // Same text + target is served from the cache without another upstream call.
    const again = await (await api('translate', 'POST', { text: '안녕하세요', target_lang: 'en' }, t)).json();
    assert.equal(again.translated, 'Hello');
    assert.equal(calls.length, 2);
  } finally { db.raw.close(); }
});

test('google translate upstream failure maps to 502 without leaking the key', async () => {
  const db = makeD1();
  const stub = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: `bad key ${KEY}` } }) });
  try {
    const { api } = await gtIsolate(db, { TRANSLATE_PROVIDER: 'google', GOOGLE_TRANSLATE_API_KEY: KEY, GOOGLE_TRANSLATE_FETCH: stub });
    const t = await registerLogin(api, 'gt-fail@luno-test.local');
    const res = await api('translate', 'POST', { text: '안녕', target_lang: 'en' }, t);
    assert.equal(res.status, 502);
    const raw = await res.text();
    assert.equal(JSON.parse(raw).code, 'TRANSLATE_UPSTREAM_ERROR');
    assert.ok(!raw.includes(KEY));
  } finally { db.raw.close(); }
});
