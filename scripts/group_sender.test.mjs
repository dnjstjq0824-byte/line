import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

// Item 6: group rooms must show who said what. The server ships sender_name
// on every message; the clients resolve it with a members-list fallback and
// render it in the sender header and avatar instead of the room title.
const helperSource = await readFile(new URL('../apps/shared/sender_name.ts', import.meta.url), 'utf8');
const { senderDisplayName } = await import(`data:text/javascript;base64,${Buffer.from(helperSource).toString('base64')}`);
const paneSource = await readFile(new URL('../apps/user-web/src/components/MessagePane.vue', import.meta.url), 'utf8');

test('senderDisplayName prefers the server name, then the members list', () => {
  const members = [{ id: 'u1', display_name: 'Alice' }, { id: 'u2', display_name: 'Bob' }];
  assert.equal(senderDisplayName({ sender_id: 'u1', sender_name: 'Alice R.' }, members), 'Alice R.');
  assert.equal(senderDisplayName({ sender_id: 'u2' }, members), 'Bob');
  assert.equal(senderDisplayName({ sender_id: 'u2', sender_name: '' }, members), 'Bob');
});

test('senderDisplayName stays silent on unknown senders and bad input', () => {
  assert.equal(senderDisplayName({ sender_id: 'ghost' }, [{ id: 'u1', display_name: 'Alice' }]), '');
  assert.equal(senderDisplayName({ sender_id: 'u1' }, null), '');
  assert.equal(senderDisplayName({}, []), '');
  assert.equal(senderDisplayName(null, []), '');
});

test('room header and avatar resolve the sender, not the room title', () => {
  assert.match(paneSource, /function headerName\(msg: Message\): string \{[\s\S]{0,300}?selectedChat\.kind === 'group'/);
  assert.ok(paneSource.includes('senderDisplayName(msg, props.selectedChat.members'));
  const uses = paneSource.match(/headerName\(msg\)/g) || [];
  assert.ok(uses.length >= 4, `expected header+avatar in both panes, got ${uses.length}`);
  assert.ok(!/pc-sender-header">\s*\{\{ selectedChat\.title/.test(paneSource));
});

test('worker decorates group messages with the sender display name', async () => {
  const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const env = { ADMIN_INITIAL_PASSWORD: 'Worker#Admin1', DEMO_INITIAL_PASSWORD: 'Worker#Demo12' };
  const call = (path, token, method = 'GET', body) => worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
  const register = async (email, display_name) => {
    const reg = await call('auth/register', null, 'POST', { email, password: 'Str0ng!Passw0rd', display_name, handle: email.split('@')[0] });
    assert.equal(reg.status, 201);
    const id = (await reg.json()).id;
    const token = (await (await call('auth/login', null, 'POST', { email, password: 'Str0ng!Passw0rd' })).json()).access_token;
    return { id, token };
  };
  const a = await register('gs-a@luno-test.local', 'Group Alice');
  const b = await register('gs-b@luno-test.local', 'Group Bob');
  const room = await (await call('conversations', a.token, 'POST', { kind: 'group', title: 'Room Name', member_ids: [b.id] })).json();
  assert.equal((await call(`conversations/${room.id}/messages`, a.token, 'POST', { client_id: 'gs-1', body: 'hi all' })).status, 201);
  const history = await (await call(`conversations/${room.id}/messages`, b.token)).json();
  const text = history.messages.find((m) => m.kind === 'text');
  assert.equal(text.sender_name, 'Group Alice');
  for (const m of history.messages) assert.equal(typeof m.sender_name, 'string');
});
