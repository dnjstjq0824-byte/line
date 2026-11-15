// Web logout: the client asks the server to end the session that owns its
// access token (POST auth/logout). It must not depend on a device id held in
// memory — after a page reload that id is gone, and logout then always
// showed the "could not confirm" warning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeD1, F24_CONSENT } from './test_helpers.mjs';

test('web logout calls auth/logout and needs no device id', async () => {
  const source = await readFile(new URL('../apps/user-web/src/composables/useAuth.ts', import.meta.url), 'utf8');
  const body = /async function logout\(\) \{[\s\S]*?\n  \}/.exec(source)[0];
  assert.match(body, /api\('\/api\/v1\/auth\/logout', 'POST'/);
  assert.ok(!body.includes('currentDeviceId'), 'logout no longer depends on the in-memory device id');
  assert.match(body, /logout_unconfirmed/, 'a real failure still warns');
  assert.match(body, /clearLocalSession\(\)/, 'the local session is always cleared');
});

test('auth/logout ends the session on every isolate and clears the refresh cookie', async () => {
  const db = makeD1();
  try {
    let n = 0;
    const isolate = async () => {
      const mod = await import(`./cf_worker.js?weblogout=${++n}`);
      return (path, method = 'GET', body = null, token = null) => mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
        method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === null ? undefined : JSON.stringify(body),
      }), { DB: db, DURABLE_CONVERSATIONS: 'true' });
    };
    const api = await isolate();
    const email = 'web-logout@luno-test.local';
    const password = 'Str0ng!Passw0rd';
    assert.equal((await api('auth/register', 'POST', { ...F24_CONSENT, email, password, display_name: 'Logout' })).status, 201);
    const login = await (await api('auth/login', 'POST', { email, password })).json();
    assert.equal((await api('me', 'GET', null, login.access_token)).status, 200);
    // A different isolate (as after a reload or a new edge location) logs out.
    const other = await isolate();
    const out = await other('auth/logout', 'POST', {}, login.access_token);
    assert.equal(out.status, 200);
    assert.ok((out.headers.get('set-cookie') || '').includes('Max-Age=0'), 'refresh cookie cleared');
    assert.equal((await other('me', 'GET', null, login.access_token)).status, 401, 'token dead on the isolate that logged out');
    const third = await isolate();
    assert.equal((await third('me', 'GET', null, login.access_token)).status, 401, 'token dead everywhere');
  } finally { db.raw.close(); }
});
