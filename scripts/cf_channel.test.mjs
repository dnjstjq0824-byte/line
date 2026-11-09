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
  }), { ALLOW_LOCAL_DEMO: 'true' });
}

async function login(email, password) {
  return (await (await api('auth/login', null, 'POST', { email, password })).json()).access_token;
}

test('smart-channel slot serves the active notice to members', async () => {
  const alice = await login('alice@luno-test.local', 'Alice#Rotated$48wT');
  const res = await api('channel/slot', alice);
  assert.equal(res.status, 200);
  const { slot } = await res.json();
  assert.ok(slot && typeof slot === 'object');
  assert.equal(typeof slot.id, 'string');
  assert.ok(slot.id.length > 0);
  assert.equal(typeof slot.title, 'string');
  assert.ok(slot.title.length > 0);
  assert.equal(typeof slot.body, 'string');
  assert.ok(slot.body.length > 0);
});

test('smart-channel slot rejects anonymous callers', async () => {
  const res = await api('channel/slot', null);
  assert.equal(res.status, 401);
});
