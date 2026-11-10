// Worker GET /api/v1/store/stickers: memory catalog of original LUNO packs
// with per-user owned flags. (POST checkout stays 503 fail-closed; pinned by
// cf_wallet_failclosed.test.mjs. Shape differs from Go by design: worker packs
// carry stickers[]+owned, Go rows carry description+status. Clients parse both.)
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
  const reg = await api('auth/register', null, 'POST', {
    email, password: 'Str0ng!Passw0rd', display_name: handle, handle,
  });
  assert.equal(reg.status, 201);
  const login = await api('auth/login', null, 'POST', { email, password: 'Str0ng!Passw0rd' });
  assert.equal(login.status, 200);
  return (await login.json()).access_token;
}

test('S-01: catalog lists original packs with owned flags', async () => {
  const alice = await signup('store-user@luno-test.local', 'storeuser');
  const res = await api('store/stickers', alice);
  assert.equal(res.status, 200);
  const { packs } = await res.json();
  assert.equal(packs.length, 4);
  assert.equal(packs[0].id, 'basic');
  assert.equal(packs[0].price_minor, 0);
  for (const pk of packs) {
    for (const k of ['id', 'title', 'price_minor', 'stickers', 'owned', 'currency']) {
      assert.ok(k in pk, `pack missing ${k}`);
    }
    assert.equal(pk.currency, 'KRW');
    assert.equal(pk.owned, pk.id === 'basic');
    assert.ok(Array.isArray(pk.stickers) && pk.stickers.length > 0);
  }
});

test('S-02: catalog rejects anonymous callers', async () => {
  assert.equal((await api('store/stickers', null)).status, 401);
});
