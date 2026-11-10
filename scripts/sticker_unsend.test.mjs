import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

// Item 3: sticker unsend must visibly remove the sticker. The worker already
// clears body+metadata kind-agnostically; the web client must mirror that
// locally (it kept metadata, so the art re-rendered) and the renderers must
// honor msg.unsent instead of showing blank bubbles.
const viewSource = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
const paneSource = await readFile(new URL('../apps/user-web/src/components/MessagePane.vue', import.meta.url), 'utf8');
const listSource = await readFile(new URL('../apps/user-web/src/components/ChatList.vue', import.meta.url), 'utf8');

test('unsend mirrors the server locally: flag set, body and metadata cleared', () => {
  const body = viewSource.match(/async function unsendMessage[\s\S]*?\n}\n/)?.[0] || '';
  assert.ok(body.length > 0);
  assert.ok(body.includes('target.unsent = true'));
  assert.ok(body.includes("target.body = ''"));
  assert.ok(body.includes('target.metadata = undefined'));
});

test('room renders the unsent marker before any kind-specific branch', () => {
  const markerAt = paneSource.indexOf('v-if="msg.unsent"');
  const stickerAt = paneSource.indexOf("msg.kind === 'sticker' && getStickerSvg");
  assert.ok(markerAt !== -1 && stickerAt !== -1 && markerAt < stickerAt);
  assert.match(paneSource, /v-if="msg\.unsent"[\s\S]{0,120}?mvMsgUnsent/);
  assert.ok(paneSource.includes("'is-sticker': msg.kind === 'sticker' && !msg.unsent"));
});

test('edit and unsend actions hide on unsent messages', () => {
  assert.ok(paneSource.includes('v-if="msg.sender_id === currentUser?.id && !msg.unsent"'));
  assert.match(viewSource, /msg\.sender_id === currentUser\.value\.id && !msg\.unsent/);
});

test('chat list preview shows the unsent marker for recalled last messages', () => {
  assert.match(listSource, /last_message\?\.unsent \? t\('mvMsgUnsent'\)/);
});

test('worker sticker unsend clears art payload and persists the recall', async () => {
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
    return { id, token };
  };
  const a = await register('su-a@luno-test.local');
  const b = await register('su-b@luno-test.local');
  const room = await (await call('conversations', a.token, 'POST', { kind: 'direct', member_ids: [b.id] })).json();
  const sent = await call(`conversations/${room.id}/messages`, a.token, 'POST', {
    client_id: 'sticker-1', kind: 'sticker', body: 'lumi_hello', metadata: { sticker_id: 'lumi_hello' },
  });
  assert.equal(sent.status, 201);
  const mid = (await sent.json()).message.id;
  const recalled = await call(`conversations/${room.id}/messages/${mid}`, a.token, 'DELETE');
  assert.equal(recalled.status, 200);
  assert.equal((await call(`conversations/${room.id}/messages/${mid}`, a.token, 'DELETE')).status, 200);
  const history = await (await call(`conversations/${room.id}/messages`, b.token)).json();
  const row = history.messages.find((m) => m.id === mid);
  assert.equal(row.unsent, true);
  assert.equal(row.body, '');
  assert.ok(!row.metadata || row.metadata.sticker_id === undefined);
});
