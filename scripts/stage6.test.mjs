// Stage 6 (T1): translation prep — provider interface, fake in demo only,
// guards (413/429s), and a D1 cache. No external engine calls, ever.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from './test_helpers.mjs';

let stage6Serial = 0;
async function stage6Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?stage6=${++stage6Serial}`);
  const env = { ...(db ? { DB: db } : {}), ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api, env, mod };
}

async function registerLogin(api, email, handle, password = 'Str0ng!Passw0rd') {
  const reg = await api('auth/register', 'POST', { email, password, display_name: handle, handle });
  assert.equal(reg.status, 201, `register ${email}`);
  const id = (await reg.json()).id;
  const login = await api('auth/login', 'POST', { email, password });
  assert.equal(login.status, 200, `login ${email}`);
  return { id, token: (await login.json()).access_token };
}

test('T1: unconfigured engine fails closed with an explicit shape', async () => {
  const db = makeD1();
  try {
    const { api } = await stage6Isolate(db);
    const a = await registerLogin(api, 't1-a@luno-test.local', 't1_a');
    const r = await api('translate', 'POST', { text: 'hi', target_lang: 'ko' }, a.token);
    assert.equal(r.status, 503);
    assert.equal((await r.json()).code, 'TRANSLATE_NOT_CONFIGURED');
    const langs = await (await api('translate/languages', 'GET', null, a.token)).json();
    assert.equal(langs.configured, false);
    assert.deepEqual(langs.languages, []);
  } finally { db.raw.close(); }
});

test('T1: fake provider answers the contract only in demo mode', async () => {
  const db = makeD1();
  try {
    const { api } = await stage6Isolate(db, { TRANSLATE_PROVIDER: 'fake' });
    const a = await registerLogin(api, 't1f-a@luno-test.local', 't1f_a');
    const gated = await api('translate', 'POST', { text: 'hi', target_lang: 'ko' }, a.token);
    assert.equal(gated.status, 503, 'fake stays off outside demo mode');
  } finally { db.raw.close(); }
  const db2 = makeD1();
  try {
    const { api } = await stage6Isolate(db2, { TRANSLATE_PROVIDER: 'fake', DEMO_MODE: 'true' });
    const b = await registerLogin(api, 't1f-b@luno-test.local', 't1f_b');
    const r = await api('translate', 'POST', { text: 'hi', target_lang: 'ko', source_lang: 'en' }, b.token);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { translated: '[ko] hi', source_lang: 'en', target_lang: 'ko', engine: 'fake' });
    const langs = await (await api('translate/languages', 'GET', null, b.token)).json();
    assert.equal(langs.configured, true);
    assert.deepEqual(langs.languages, ['ko', 'en', 'ja', 'th']);
  } finally { db2.raw.close(); }
});

test('T1: over-long text is 413 before any provider work', async () => {
  const db = makeD1();
  try {
    const { api, mod } = await stage6Isolate(db, { TRANSLATE_PROVIDER: 'fake', DEMO_MODE: 'true' });
    const a = await registerLogin(api, 't1l-a@luno-test.local', 't1l_a');
    const r = await api('translate', 'POST', { text: 'x'.repeat(5001), target_lang: 'ko' }, a.token);
    assert.equal(r.status, 413);
    assert.equal((await r.json()).code, 'TEXT_TOO_LONG');
    assert.equal(mod.translateProviderCalls.length, 0);
    const edge = await api('translate', 'POST', { text: 'x'.repeat(5000), target_lang: 'ko' }, a.token);
    assert.equal(edge.status, 200, 'exactly 5000 chars passes');
  } finally { db.raw.close(); }
});

test('T1: per-minute and daily caps answer 429', async () => {
  const db = makeD1();
  try {
    const { api } = await stage6Isolate(db, { TRANSLATE_PROVIDER: 'fake', DEMO_MODE: 'true' });
    const a = await registerLogin(api, 't1r-a@luno-test.local', 't1r_a');
    for (let i = 0; i < 60; i++) {
      const r = await api('translate', 'POST', { text: `rate-${i}`, target_lang: 'ko' }, a.token);
      assert.equal(r.status, 200, `request ${i + 1} passes`);
    }
    assert.equal((await api('translate', 'POST', { text: 'rate-60', target_lang: 'ko' }, a.token)).status, 429);
  } finally { db.raw.close(); }
  const db2 = makeD1();
  try {
    const { api } = await stage6Isolate(db2, { TRANSLATE_PROVIDER: 'fake', DEMO_MODE: 'true' });
    const b = await registerLogin(api, 't1r-b@luno-test.local', 't1r_b');
    for (let i = 0; i < 10; i++) {
      const r = await api('translate', 'POST', { text: `${i}:` + 'y'.repeat(4998), target_lang: 'ko' }, b.token);
      assert.equal(r.status, 200, `chunk ${i + 1} passes`);
    }
    const over = await api('translate', 'POST', { text: 'one more char', target_lang: 'ko' }, b.token);
    assert.equal(over.status, 429);
    assert.equal((await over.json()).code, 'QUOTA_EXCEEDED');
  } finally { db2.raw.close(); }
});

test('T1: cache hits never reach the provider', async () => {
  const db = makeD1();
  try {
    const { api, mod } = await stage6Isolate(db, { TRANSLATE_PROVIDER: 'fake', DEMO_MODE: 'true' });
    const a = await registerLogin(api, 't1c-a@luno-test.local', 't1c_a');
    const first = await (await api('translate', 'POST', { text: 'cache me', target_lang: 'ko' }, a.token)).json();
    const second = await (await api('translate', 'POST', { text: 'cache me', target_lang: 'ko' }, a.token)).json();
    assert.deepEqual(second, first);
    assert.equal(mod.translateProviderCalls.length, 1, 'second identical request served from cache');
    await api('translate', 'POST', { text: 'cache me', target_lang: 'ja' }, a.token);
    assert.equal(mod.translateProviderCalls.length, 2, 'a different target is a different cache entry');
  } finally { db.raw.close(); }
});

test('T1: guard defaults live in one exported place', async () => {
  const mod = await import(`./cf_worker.js?t1const=${++stage6Serial}`);
  assert.equal(mod.TRANSLATE_MAX_CHARS, 5000);
  assert.equal(mod.TRANSLATE_PER_MINUTE, 60);
  assert.equal(mod.TRANSLATE_CHARS_PER_DAY, 50000);
});

test('T1: web translates through the server endpoint, never local', async () => {
  const { readFile } = await import('node:fs/promises');
  const view = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
  const pane = await readFile(new URL('../apps/user-web/src/components/MessagePane.vue', import.meta.url), 'utf8');
  const settings = await readFile(new URL('../apps/user-web/src/components/SettingsModal.vue', import.meta.url), 'utf8');
  const i18n = await readFile(new URL('../apps/user-web/src/luno-i18n.ts', import.meta.url), 'utf8');
  assert.ok(!i18n.includes('translateMessageText'), 'local phrasebook engine removed');
  assert.ok(view.includes("'/api/v1/translate'") && view.includes("'/api/v1/translate/languages'"), 'view uses the server contract');
  assert.ok(pane.includes('v-for="lang in translateLanguages"'), 'pane picker renders the server list');
  assert.ok(pane.includes(':disabled="!translateConfigured"'), 'pane translate controls disable while unconfigured');
  assert.ok(settings.includes("SUPPORTED_LOCALES.filter((l) => translateLanguages.includes(l.code))"), 'settings grid follows the server list');
  assert.equal((i18n.match(/mvTranslatePending/g) || []).length, 4, 'preparing notice in all four locales');
});
