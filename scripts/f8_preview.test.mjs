// Stage 10 (F8): link previews — the server fetches OG title/description/
// image for https URLs and caches in D1. Plain http, credentials, local
// and private hosts are rejected without fetching; bodies cap at 512KB,
// fetches at 3s. Users can switch previews off in settings. A message
// carrying a bad URL still sends fine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket , F24_CONSENT } from './test_helpers.mjs';

let f8Serial = 0;
async function f8Isolate(db, bucket, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f8=${++f8Serial}`);
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
const OG_HTML = `<!doctype html><html><head><title>Fallback Title</title>
<meta property="og:title" content="OG Title">
<meta property="og:description" content="OG Description here.">
<meta property="og:image" content="https://cdn.example.test/p.png">
</head><body>hi</body></html>`;

async function registerLogin(api, email) {
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
  assert.equal(reg.status, 201);
  const s = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(s.status, 200);
  const sess = await s.json();
  return { ...(await reg.json()), ...sess, token: sess.access_token };
}

function stubFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

test('F8: OG pages parse and cache in D1', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f8Isolate(db, bucket);
    const a = await registerLogin(api, 'f8-pa@luno-test.local');
    let calls = 0;
    const restore = stubFetch(async () => { calls++; return new Response(OG_HTML, { headers: { 'content-type': 'text/html' } }); });
    try {
      const first = await api(`link-preview?url=${encodeURIComponent('https://example.test/a')}`, 'GET', null, a.token);
      assert.equal(first.status, 200);
      const pv = await first.json();
      assert.equal(pv.title, 'OG Title');
      assert.equal(pv.description, 'OG Description here.');
      assert.equal(pv.image_url, 'https://cdn.example.test/p.png');
      assert.equal(pv.cached, false);
      const row = db.raw.prepare('SELECT * FROM luno_link_previews WHERE url = ?').get('https://example.test/a');
      assert.equal(row.title, 'OG Title');
      const second = await api(`link-preview?url=${encodeURIComponent('https://example.test/a')}`, 'GET', null, a.token);
      assert.equal((await second.json()).cached, true);
      assert.equal(calls, 1, 'second hit served from D1');
    } finally { restore(); }
  } finally { db.raw.close(); }
});

test('F8: dangerous and oversized targets never fetch', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f8Isolate(db, bucket);
    const a = await registerLogin(api, 'f8-ba@luno-test.local');
    let calls = 0;
    const restore = stubFetch(async () => { calls++; return new Response('x'); });
    try {
      for (const bad of [
        'http://example.test/a',
        'https://localhost/a',
        'https://127.0.0.1/a',
        'https://10.1.2.3/a',
        'https://192.168.0.1/a',
        'https://169.254.169.254/latest',
        'https://user:pass@example.test/a',
        'https://intranet.local/a',
        'not-a-url',
      ]) {
        const res = await api(`link-preview?url=${encodeURIComponent(bad)}`, 'GET', null, a.token);
        assert.equal(res.status, 400, bad);
      }
      assert.equal(calls, 0, 'blocked before fetch');
      // A redirect hop into a private host is rejected too.
      const restore2 = stubFetch(async (url) => {
        calls++;
        if (String(url.url || url).includes('start')) return new Response('', { status: 302, headers: { location: 'https://10.9.9.9/x' } });
        return new Response('should-not-fetch');
      });
      try {
        const res = await api(`link-preview?url=${encodeURIComponent('https://example.test/start')}`, 'GET', null, a.token);
        assert.equal(res.status, 400, 'redirect to private host');
      } finally { restore2(); }
    } finally { restore(); }
  } finally { db.raw.close(); }
});

test('F8: oversize bodies and slow hosts degrade gracefully', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f8Isolate(db, bucket);
    const a = await registerLogin(api, 'f8-sa@luno-test.local');
    const big = 'z'.repeat(600 * 1024);
    let restore = stubFetch(async () => new Response(big));
    try {
      const res = await api(`link-preview?url=${encodeURIComponent('https://example.test/big')}`, 'GET', null, a.token);
      assert.equal(res.status, 200);
      assert.equal((await res.json()).unavailable, true);
    } finally { restore(); }
    restore = stubFetch(async (_url, init) => new Promise((_res, rej) => {
      const t = setTimeout(() => rej(new Error('boom')), 10000);
      init?.signal?.addEventListener('abort', () => { clearTimeout(t); const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
    }));
    try {
      const t0 = Date.now();
      const res = await api(`link-preview?url=${encodeURIComponent('https://example.test/slow')}`, 'GET', null, a.token);
      assert.equal(res.status, 200);
      assert.equal((await res.json()).unavailable, true);
      assert.ok(Date.now() - t0 < 8000, 'aborted near the 3s budget');
    } finally { restore(); }
  } finally { db.raw.close(); }
});

test('F8: previews switch off per account, bad URLs still send', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f8Isolate(db, bucket);
    const a = await registerLogin(api, 'f8-ta@luno-test.local');
    const b = await registerLogin(api, 'f8-tb@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Links', member_ids: [b.id] }, a.token)).json();
    const sent = await api(`conversations/${room.id}/messages`, 'POST', { body: 'see http://evil.test/x and https://10.0.0.1/y' }, a.token);
    assert.equal(sent.status, 201, 'send never depends on previews');
    const prefs = await api('me/settings', 'PATCH', { link_previews: false }, a.token);
    assert.equal(prefs.status, 200);
    assert.equal((await prefs.json()).link_previews, false);
    const { api: cold } = await f8Isolate(db, bucket);
    const ta = (await (await cold('auth/login', 'POST', { email: 'f8-ta@luno-test.local', password: PW })).json()).access_token;
    assert.equal((await (await cold('me/settings', 'GET', null, ta)).json()).link_previews, false, 'toggle durable');
  } finally { db.raw.close(); }
});
