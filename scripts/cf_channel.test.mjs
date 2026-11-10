import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

async function api(path, token, method = 'GET', body) {
  return worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), {});
}

async function signup(email, handle) {
  const res = await api('auth/register', null, 'POST', {
    email, password: 'Str0ng!Passw0rd', display_name: handle, handle,
  });
  assert.equal(res.status, 201);
  const login = await api('auth/login', null, 'POST', { email, password: 'Str0ng!Passw0rd' });
  assert.equal(login.status, 200);
  return (await login.json()).access_token;
}

test('smart-channel slot is empty without curated notices', async () => {
  const alice = await signup('slot-user@luno-test.local', 'slotuser');
  const res = await api('channel/slot', alice);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { slot: null });
});

test('smart-channel slot rejects anonymous callers', async () => {
  const res = await api('channel/slot', null);
  assert.equal(res.status, 401);
});
