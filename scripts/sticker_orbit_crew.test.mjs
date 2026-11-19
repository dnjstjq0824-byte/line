import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { F24_CONSENT } from './test_helpers.mjs';

// Android build 13 sends its free "Orbit Crew" chips as kind=sticker with body
// "<emoji> [<Character>]" and no metadata; the worker rejected every tap with
// 400 "올바르지 않은 스티커입니다". The accepted bodies must match the app list.
const dart = await readFile(new URL('../mobile/flutter_app/lib/legacy_tokens.dart', import.meta.url), 'utf8');
const crew = [...dart.matchAll(/\{'id': '([a-z_]+)', 'emoji': '([^']+)', 'character': '([A-Za-z]+)'\}/g)]
  .map(m => ({ id: m[1], body: `${m[2]} [${m[3]}]` }));

test('orbit crew stickers from the app are accepted, others still rejected', async () => {
  assert.equal(crew.length, 6);
  const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const env = { ADMIN_INITIAL_PASSWORD: 'Worker#Admin1', DEMO_INITIAL_PASSWORD: 'Worker#Demo12' };
  const call = (path, token, method = 'GET', body) => worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
  const register = async (email) => {
    const reg = await call('auth/register', null, 'POST', { ...F24_CONSENT, email, password: 'Str0ng!Passw0rd', display_name: email, handle: email.split('@')[0].replace(/[^a-z0-9_.]/g, '_') });
    assert.equal(reg.status, 201);
    const id = (await reg.json()).id;
    const token = (await (await call('auth/login', null, 'POST', { email, password: 'Str0ng!Passw0rd' })).json()).access_token;
    return { id, token };
  };
  const a = await register('oc-a@luno-test.local');
  const b = await register('oc-b@luno-test.local');
  const room = await (await call('conversations', a.token, 'POST', { kind: 'direct', member_ids: [b.id] })).json();
  for (const [i, s] of crew.entries()) {
    const res = await call(`conversations/${room.id}/messages`, a.token, 'POST', { client_id: `oc-${i}`, kind: 'sticker', body: s.body });
    assert.equal(res.status, 201, `${s.id}: ${await res.clone().text()}`);
    const msg = (await res.json()).message;
    assert.equal(msg.body, s.body);
    assert.equal(msg.metadata.crew_id, s.id);
  }
  const bad = await call(`conversations/${room.id}/messages`, a.token, 'POST', { client_id: 'oc-bad', kind: 'sticker', body: '🛸 [Nobody]' });
  assert.equal(bad.status, 400);
});
