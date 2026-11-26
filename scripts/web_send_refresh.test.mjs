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
