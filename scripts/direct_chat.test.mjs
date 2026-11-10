import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

// Item 1: profile / new-chat 'start chat' must open a real 1:1 room.
// The client reuses the listed direct room when one exists (mirroring the
// worker's findDirect dedupe) and fails honestly when a fresh room is not
// in the reloaded list (pre-durable cross-isolate miss) instead of showing
// an empty canvas. Prod persistence needs DURABLE_CONVERSATIONS + the
// 20261105_durable_conversations.sql D1 migration (see wrangler pin below).
const helperSource = await readFile(new URL('../apps/shared/direct_chat.ts', import.meta.url), 'utf8');
const { findDirectChatId } = await import(`data:text/javascript;base64,${Buffer.from(helperSource).toString('base64')}`);
const viewSource = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
const i18nSource = await readFile(new URL('../apps/user-web/src/luno-i18n.ts', import.meta.url), 'utf8');
const wranglerSource = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

test('findDirectChatId reuses the 1:1 room for the same pair', () => {
  const chats = [
    { id: 'g1', kind: 'group', members: [{ id: 'me' }, { id: 'peer' }] },
    { id: 'dm-other', kind: 'direct', members: [{ id: 'me' }, { id: 'stranger' }] },
    { id: 'dm-peer', kind: 'direct', members: [{ id: 'peer' }, { id: 'me' }] },
  ];
  assert.equal(findDirectChatId(chats, 'me', 'peer'), 'dm-peer');
});

test('findDirectChatId returns null when no direct room matches', () => {
  assert.equal(findDirectChatId([], 'me', 'peer'), null);
  assert.equal(findDirectChatId(null, 'me', 'peer'), null);
  assert.equal(findDirectChatId(undefined, 'me', 'peer'), null);
  assert.equal(findDirectChatId([{ id: 'g1', kind: 'group', members: [{ id: 'me' }, { id: 'peer' }] }], 'me', 'peer'), null);
  assert.equal(findDirectChatId([{ id: 'dm', kind: 'direct' }], 'me', 'peer'), null);
  assert.equal(findDirectChatId([{ id: 'dm', kind: 'direct', members: [{ id: 'me' }] }], 'me', 'peer'), null);
  assert.equal(findDirectChatId([{ id: 'dm', kind: 'direct', members: 'me,peer' }], 'me', 'peer'), null);
  assert.equal(findDirectChatId([{ id: 'dm', kind: 'direct', members: [{ id: 'me' }, { id: 'peer' }] }], '', 'peer'), null);
});

test('startDirectChat reuses the existing room and fails honestly when the new room is unreachable', () => {
  assert.match(viewSource, /function startDirectChat[\s\S]{0,2500}?findDirectChatId/);
  assert.ok(viewSource.includes('mvDirectOpenFailed'));
});

test('mvDirectOpenFailed is translated in all four locales', () => {
  const hits = i18nSource.match(/mvDirectOpenFailed/g) || [];
  assert.equal(hits.length, 4);
});

test('worker POST direct returns a top-level id the client can select immediately', async () => {
  const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const env = { ADMIN_INITIAL_PASSWORD: 'Worker#Admin1', DEMO_INITIAL_PASSWORD: 'Worker#Demo12' };
  const call = (path, token, method = 'GET', body) => worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
  const register = async (email) => {
    const reg = await call('auth/register', null, 'POST', { email, password: 'Str0ng!Passw0rd', display_name: email, handle: email.split('@')[0] });
    assert.equal(reg.status, 201);
    const id = (await reg.json()).id;
    const token = (await (await call('auth/login', null, 'POST', { email, password: 'Str0ng!Passw0rd' })).json()).access_token;
    assert.ok(token);
    return { id, token };
  };
  const a = await register('dc-a@luno-test.local');
  const b = await register('dc-b@luno-test.local');
  const created = await call('conversations', a.token, 'POST', { kind: 'direct', member_ids: [b.id] });
  assert.equal(created.status, 201);
  const room = await created.json();
  assert.ok(typeof room.id === 'string' && room.id.length > 0);
});

test('durable conversations flag stays off until the prod D1 migration lands', () => {
  assert.ok(
    !/"DURABLE_CONVERSATIONS"\s*:\s*"true"/.test(wranglerSource),
    'flip to "true" only after applying scripts/migrations/20261105_durable_conversations.sql to prod D1',
  );
});
