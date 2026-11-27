// Regression test: all authenticated message/attachment send paths in user-web
// must route through session.api() so expired 15-minute access tokens auto-refresh
// via the HttpOnly refresh cookie instead of failing with raw "unauthorized" (401),
// and refresh cookies honour X-Forwarded-Host through the lunotalk.com relay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeD1, F24_CONSENT } from './test_helpers.mjs';

test('user-web message and attachment senders use auto-refreshing api(), never raw request()', async () => {
  const files = [
    '../apps/user-web/src/views/MessengerView.vue',
    '../apps/user-web/src/composables/useAttachments.ts',
    '../apps/user-web/src/composables/useMessageSenders.ts',
    '../apps/user-web/src/composables/useChatSocket.ts',
  ];
  for (const rel of files) {
    const src = await readFile(new URL(rel, import.meta.url), 'utf8');
    assert.ok(
      !/request<[^>]*>\(\s*`\/api\/v1\/(?:conversations\/[^`]+\/messages|attachments)/.test(src) &&
      !/request\(\s*`\/api\/v1\/(?:conversations\/[^`]+\/messages|attachments)/.test(src),
      `${rel} must use api() for message/attachment calls so 401 refreshes automatically`,
    );
  }
});

test('refreshCookie sets Domain=.lunotalk.com when proxied via X-Forwarded-Host', async () => {
  const db = makeD1();
  try {
    const mod = await import(`./cf_worker.js?refreshdom=${Date.now()}`);
    const env = { DB: db, STANDALONE_HOSTS: 'luno-messenger.dnjstjqppk.workers.dev' };
    const headers = {
      'Content-Type': 'application/json',
      'X-Forwarded-Host': 'api.lunotalk.com',
      'X-Forwarded-Proto': 'https',
    };
    const reg = await mod.default.fetch(new Request('https://luno-messenger.dnjstjqppk.workers.dev/api/v1/auth/register', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...F24_CONSENT, email: 'refresh-proxy@luno-test.local', password: 'Str0ng!Passw0rd', display_name: 'Proxy User' }),
    }), env);
    assert.equal(reg.status, 201);
    const login = await mod.default.fetch(new Request('https://luno-messenger.dnjstjqppk.workers.dev/api/v1/auth/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: 'refresh-proxy@luno-test.local', password: 'Str0ng!Passw0rd' }),
    }), env);
    assert.equal(login.status, 200);
    const setCookie = login.headers.get('set-cookie') || '';
    assert.match(setCookie, /Domain=\.lunotalk\.com/);
    assert.match(setCookie, /Secure/);
  } finally {
    db.raw.close();
  }
});

// Prod regression (2026-11-27): relay users kept a host-only luno_refresh
// cookie from before Domain=.lunotalk.com. Browsers send it first, the worker
// read only it, hit reuse detection and revoked the live session, so every
// reload after login landed on /login.
test('refresh picks the live cookie when a stale host-only twin is sent first, and purges the twin', async () => {
  const db = makeD1();
  try {
    const mod = await import(`./cf_worker.js?refreshtwin=${Date.now()}`);
    const env = { DB: db, STANDALONE_HOSTS: 'luno-messenger.dnjstjqppk.workers.dev' };
    const base = { 'Content-Type': 'application/json', 'X-Forwarded-Host': 'api.lunotalk.com', 'X-Forwarded-Proto': 'https' };
    const call = (path, body, extra = {}) => mod.default.fetch(new Request(`https://luno-messenger.dnjstjqppk.workers.dev/api/v1/${path}`, {
      method: 'POST', headers: { ...base, ...extra }, body: JSON.stringify(body),
    }), env);
    const tokenOf = (res) => (res.headers.getSetCookie()[0] || '').split(';')[0].slice('luno_refresh='.length);
    const email = 'refresh-twin@luno-test.local';
    assert.equal((await call('auth/register', { ...F24_CONSENT, email, password: 'Str0ng!Passw0rd', display_name: 'Twin' })).status, 201);
    const login = await call('auth/login', { email, password: 'Str0ng!Passw0rd' });
    assert.equal(login.status, 200);
    const stale = tokenOf(login);
    // First refresh rotates: `stale` is now revoked, `live` is current.
    const r1 = await call('auth/refresh', {}, { Cookie: `luno_refresh=${stale}` });
    assert.equal(r1.status, 200);
    const live = tokenOf(r1);
    const cookies = r1.headers.getSetCookie();
    assert.equal(cookies.length, 2, 'Domain cookie plus host-only purge');
    assert.match(cookies[0], /Domain=\.lunotalk\.com/);
    assert.ok(!/Domain=/.test(cookies[1]) && /Max-Age=0/.test(cookies[1]), 'host-only twin expires');
    // Browser sends the stale host-only cookie first, then the live one.
    const r2 = await call('auth/refresh', {}, { Cookie: `luno_refresh=${stale}; luno_refresh=${live}` });
    assert.equal(r2.status, 200, 'live cookie wins; session survives the reload');
    const r3 = await call('auth/refresh', {}, { Cookie: `luno_refresh=${stale}; luno_refresh=${tokenOf(r2)}` });
    assert.equal(r3.status, 200, 'and keeps surviving');
    // Reuse detection still fires when only a rotated token is presented.
    const r4 = await call('auth/refresh', {}, { Cookie: `luno_refresh=${stale}` });
    assert.equal(r4.status, 401);
    const r5 = await call('auth/refresh', {}, { Cookie: `luno_refresh=${tokenOf(r3)}` });
    assert.equal(r5.status, 401, 'theft signal still revokes the session chain');
  } finally {
    db.raw.close();
  }
});
