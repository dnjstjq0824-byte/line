import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { makeBucket, makeD1 } from './test_helpers.mjs';

const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const nativeResponse = globalThis.Response;
const nativeWebSocketPair = Object.getOwnPropertyDescriptor(globalThis, 'WebSocketPair');
after(() => {
  globalThis.Response = nativeResponse;
  if (nativeWebSocketPair) Object.defineProperty(globalThis, 'WebSocketPair', nativeWebSocketPair);
  else delete globalThis.WebSocketPair;
});
globalThis.Response = class extends nativeResponse {
  constructor(body, init) {
    super(body, init?.status === 101 ? { status: 200 } : init);
    if (init?.status === 101) Object.defineProperty(this, 'status', { value: 101 });
  }
};
const sockets = [];
globalThis.WebSocketPair = class {
  constructor() {
    const server = { events: [], accept() {}, addEventListener() {}, send(data) { this.events.push(JSON.parse(data)); } };
    sockets.push(server);
    this[0] = {};
    this[1] = server;
  }
};
async function api(path, token, method = 'GET', body, extraHeaders = {}, extraEnv = null) {
  return worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { ADMIN_INITIAL_PASSWORD: 'Worker#Admin1', DEMO_INITIAL_PASSWORD: 'Worker#Demo12', ...(extraEnv || {}) });
}

test('public hosts cannot enable demo credentials or synthetic payment success', async () => {
  for (const env of [{}, { ALLOW_LOCAL_DEMO: 'true' }]) {
    assert.equal((await worker.fetch(new Request('https://example.test/api/v1/auth/login', {method:'POST'}), env)).status,503);
  }
  assert.equal((await api('store/orders', null, 'POST', {})).status,503);
});
async function login(email, password) {
  return (await (await api('auth/login', null, 'POST', { email, password })).json()).access_token;
}
async function signup(email, handle) {
  const reg = await api('auth/register', null, 'POST', {
    email, password: 'Str0ng!Passw0rd', display_name: handle, handle,
  });
  assert.equal(reg.status, 201, `register ${email}`);
  const id = (await reg.json()).id;
  const token = await login(email, 'Str0ng!Passw0rd');
  assert.ok(token, `login ${email}`);
  return { id, token };
}

test('private chat access and one-use realtime tickets', async () => {
  const a = await signup('priv-alice@luno-test.local', 'privalice');
  const b = await signup('priv-bob@luno-test.local', 'privbob');
  const o = await signup('priv-outsider@luno-test.local', 'privoutsider');
  const alice = a.token, bob = b.token, outsider = o.token;
  const convRoom = await api('conversations', alice, 'POST', { kind: 'group', title: 'private drill room', member_ids: [b.id] });
  assert.equal(convRoom.status, 201);
  const cid = (await convRoom.json()).id;
  assert.equal((await api('ws-ticket', null, 'POST')).status, 401);
  assert.equal((await api('ws', null, 'GET', undefined, { Upgrade: 'websocket' })).status, 401);
  for (const token of [alice, bob, outsider]) {
    const { ticket } = await (await api('ws-ticket', token, 'POST')).json();
    assert.equal((await api(`ws?ticket=${ticket}`, null, 'GET', undefined, { Upgrade: 'websocket' })).status, 101);
    assert.equal((await api(`ws?ticket=${ticket}`, null, 'GET', undefined, { Upgrade: 'websocket' })).status, 401);
  }
  const now = Date.now;
  const issuedAt = now();
  try {
    Date.now = () => issuedAt;
    const { ticket, expires_in } = await (await api('ws-ticket', alice, 'POST')).json();
    assert.equal(expires_in, 60);
    Date.now = () => issuedAt + 60000;
    assert.equal((await api(`ws?ticket=${ticket}`, null, 'GET', undefined, { Upgrade: 'websocket' })).status, 401);
  } finally { Date.now = now; }
  for (const path of ['messages', 'sync', 'pins', 'albums']) {
    assert.equal((await api(`conversations/${cid}/${path}`, outsider)).status, 404);
  }
  assert.equal((await api(`conversations/${cid}/messages`, outsider, 'POST', { body: 'intrusion' })).status, 404);
  const sent = await api(`conversations/${cid}/messages`, alice, 'POST', { body: 'private' });
  assert.equal(sent.status, 201);
  const { message } = await sent.json();
  assert.equal(sockets[0].events.at(-1).message.body, 'private');
  assert.equal(sockets[1].events.at(-1).message.body, 'private');
  assert.equal(sockets[2].events.length, 0);
  for (const method of ['PATCH', 'DELETE']) {
    assert.equal((await api(`conversations/${cid}/messages/${message.id}`, bob, method, { body: 'tamper' })).status, 403);
  }
  assert.equal((await api(`conversations/${cid}/messages/${message.id}`, alice, 'PATCH', { body: 'edited' })).status, 200);
  assert.equal((await api('calls', outsider, 'POST', { conversation_id: cid })).status, 404);
  const call = await (await api('calls', alice, 'POST', { conversation_id: cid })).json();
  assert.equal((await api(`calls/${call.id}/state`, outsider, 'POST', { state: 'ended' })).status, 404);
  await api(`calls/${call.id}/signal`, bob, 'POST', { signal_type: 'offer', sdp: 'private-sdp' });
  assert.equal(sockets[0].events.at(-1).sdp, 'private-sdp');
  assert.equal(sockets[2].events.length, 0);
  const poll = await (await api(`conversations/${cid}/polls`, alice, 'POST', { question: 'Lunch?', options: ['A', 'B'] })).json();
  assert.equal((await api(`polls/${poll.id}/vote`, outsider, 'POST', { option_id: 'opt-0' })).status, 404);
  for (const socket of sockets.slice(0, 2)) {
    assert.deepEqual(socket.events.at(-1), { type: 'poll.updated', conversation_id: cid, poll_id: poll.id });
  }
  assert.equal(sockets[2].events.length, 0);
  const vote = async (token, option_id) => {
    const response = await api(`polls/${poll.id}/vote`, token, 'POST', { option_id });
    assert.equal(response.status, 200);
    return (await response.json()).poll;
  };
  await vote(alice, 'opt-0');
  let updated = await vote(bob, 'opt-1');
  assert.deepEqual(updated.options.map(o => o.votes), [1, 1]);
  assert.deepEqual(updated.options.map(o => o.voted), [false, true]);
  updated = await vote(alice, 'opt-1');
  assert.deepEqual(updated.options.map(o => o.votes), [0, 2]);
  updated = await vote(alice, 'opt-1');
  assert.deepEqual(updated.options.map(o => o.votes), [0, 1]);
  const listed = await (await api(`conversations/${cid}/polls`, bob)).json();
  assert.deepEqual(listed.polls.find(p => p.id === poll.id).options.map(o => o.voted), [false, true]);
  assert.equal((await api(`polls/${poll.id}/close`, bob, 'POST')).status, 403);
  assert.equal((await api(`polls/${poll.id}/close`, outsider, 'POST')).status, 404);
  assert.equal((await api(`polls/${poll.id}/close`, alice, 'POST')).status, 200);
  assert.equal((await api(`polls/${poll.id}/vote`, bob, 'POST', { option_id: 'opt-0' })).status, 400);
  assert.equal(sockets[2].events.length, 0);

  // Security audit: Non-member access to sub-resources must return 404
  assert.equal((await api(`conversations/${cid}/pins`, outsider)).status, 404);
  assert.equal((await api(`conversations/${cid}/media`, outsider)).status, 404);
  assert.equal((await api(`conversations/${cid}/search?q=test`, outsider)).status, 404);
  assert.equal((await api(`conversations/${cid}/notes`, outsider)).status, 404);
  assert.equal((await api(`conversations/${cid}/events`, outsider)).status, 404);
  assert.equal((await api(`conversations/${cid}/albums`, outsider)).status, 404);

  // Relay notes: creation by member, listing by member
  const notePost = await api(`conversations/${cid}/notes`, alice, 'POST', { title: 'Team Meeting Notes', body: 'Sprint goals discussion' });
  assert.equal(notePost.status, 201);
  const noteObj = await notePost.json();
  assert.equal(noteObj.title, 'Team Meeting Notes');
  const bobNotes = await (await api(`conversations/${cid}/notes`, bob)).json();
  assert.ok(bobNotes.notes.some(n => n.id === noteObj.id));

  // Schedule events & RSVP: creation and member RSVP
  const eventPost = await api(`conversations/${cid}/events`, alice, 'POST', {
    title: 'Product Launch Party',
    starts_at: new Date(Date.now() + 86400000).toISOString(),
    location: 'Gangnam Office'
  });
  assert.equal(eventPost.status, 201);
  const eventObj = await eventPost.json();
  assert.equal((await api(`conversations/${cid}/events/${eventObj.id}/rsvp`, outsider, 'POST', { status: 'going' })).status, 404);
  const bobRsvp = await api(`conversations/${cid}/events/${eventObj.id}/rsvp`, bob, 'POST', { status: 'going' });
  assert.equal(bobRsvp.status, 200);

  // Keep Vault test: save, list, delete
  const secondTicket = await (await api('ws-ticket', alice, 'POST')).json();
  assert.equal((await api(`ws?ticket=${secondTicket.ticket}`, null, 'GET', undefined, { Upgrade: 'websocket' })).status, 101);
  const secondAliceSocket = sockets.at(-1);
  const bobEventCount = sockets[1].events.length;
  const outsiderEventCount = sockets[2].events.length;
  const saveRes = await api('saved-messages', alice, 'POST', { body: 'Important keep note', kind: 'text' });
  assert.equal(saveRes.status, 201);
  const savedItem = await saveRes.json();
  assert.equal(savedItem.body, 'Important keep note');
  assert.deepEqual(sockets[0].events.at(-1), { type: 'saved-messages.updated' });
  assert.deepEqual(secondAliceSocket.events, [{ type: 'saved-messages.updated' }]);
  assert.equal(sockets[1].events.length, bobEventCount);
  assert.equal(sockets[2].events.length, outsiderEventCount);
  assert.ok(!(await (await api('saved-messages', bob)).json()).saved_messages.some(item => item.id === savedItem.id));
  await api(`saved-messages/${savedItem.id}`, bob, 'DELETE');
  assert.equal(secondAliceSocket.events.length, 1);

  const listRes = await api('saved-messages', alice, 'GET');
  assert.equal(listRes.status, 200);
  const { saved_messages } = await listRes.json();
  assert.ok(saved_messages.some(item => item.id === savedItem.id));

  const delRes = await api(`saved-messages/${savedItem.id}`, alice, 'DELETE');
  assert.equal(delRes.status, 200);
  assert.equal(secondAliceSocket.events.length, 2);
  assert.deepEqual(secondAliceSocket.events.at(-1), { type: 'saved-messages.updated' });
  assert.ok(!(await (await api('saved-messages', alice)).json()).saved_messages.some(item => item.id === savedItem.id));
  assert.equal(sockets[1].events.length, bobEventCount + 1);
  assert.equal(sockets[2].events.length, outsiderEventCount);

  // OpenChat Community test: create room, post, like
  const roomRes = await api('community/rooms', alice, 'POST', { name: 'Developers Lounge', description: 'Tech talk' });
  assert.equal(roomRes.status, 201);
  const room = await roomRes.json();

  const postRes = await api(`community/rooms/${room.id}/posts`, bob, 'POST', { body: 'Hello community' });
  assert.equal(postRes.status, 201);
  const post = await postRes.json();

  const likeRes = await api(`community/rooms/${room.id}/posts/${post.id}/like`, alice, 'POST');
  assert.equal(likeRes.status, 200);
  const { likes } = await likeRes.json();
  assert.equal(likes, 1);

  // Admin Moderation test
  const adminToken = await login('admin@luno.local', 'Worker#Admin1');
  const modRes = await api('admin/moderation/actions', adminToken, 'POST', {
    subject_user_id: a.id,
    action: 'warn',
    reason: 'Spam warning'
  });
  assert.equal(modRes.status, 200);
});

// The API surface is gated on the hostname: loopback and explicitly named
// STANDALONE_HOSTS pass; every other host gets 503 before any routing runs,
// so no credential or demo path is reachable from a public host.
test('the standalone demo backend is gated on the hostname, whatever the env vars say', async () => {
  const hit = (host, env, path = 'auth/login') => worker.fetch(new Request(`https://${host}/api/v1/${path}`, {
    method: 'POST', body: JSON.stringify({ email: 'user@luno.local', password: 'LunoUser#2026!' }),
  }), env);

  const publicHost = 'luno.example';
  // No env var, in any combination, may open a public host.
  for (const env of [
    {},
    { ALLOW_LOCAL_DEMO: 'true' },
    { ALLOW_EDGE_STANDALONE: 'true' },
    { ALLOW_LOCAL_DEMO: 'true', ALLOW_EDGE_STANDALONE: 'true' },
    { ALLOW_LOCAL_DEMO: 'true', ALLOW_EDGE_STANDALONE: 'true', ENABLE_DEMO_ACCOUNTS: 'true' },
    { ALLOW_LOCAL_DEMO: 'true', STANDALONE_HOSTS: 'some.other.host' },
  ]) {
    const why = `env ${JSON.stringify(env)} must not open ${publicHost}`;
    assert.equal((await hit(publicHost, env)).status, 503, why);
    // the gate fires before routing, so even the removed demo route is 503 here
    const demo = await hit(publicHost, env, 'auth/demo');
    assert.equal(demo.status, 503, `${why} (auth/demo)`);
    assert.equal((await demo.json().catch(() => ({}))).access_token, undefined, 'no token on a public host');
  }

  // Cloudflare hostnames are public production surfaces too.
  for (const host of ['luno-messenger.dnjstjqppk.workers.dev', 'luno.pages.dev']) {
    const env = { ALLOW_LOCAL_DEMO: 'true', ENABLE_DEMO_ACCOUNTS: 'true' };
    assert.equal((await hit(host, env)).status, 503);
    assert.equal((await hit(host, env, 'auth/demo')).status, 503);
    // a named host passes the gate; the revoked password then yields 401, not 503
    assert.equal((await hit(host, { ...env, STANDALONE_HOSTS: host })).status, 401);
    // ...and the removed passwordless demo route mints nothing past the gate
    assert.equal((await hit(host, { ...env, STANDALONE_HOSTS: host }, 'auth/demo')).status, 401);
  }
  // loopback passes the gate with no env at all; bad credentials yield 401
  assert.equal((await hit('localhost', {})).status, 401);
  assert.equal((await hit('localhost', {}, 'auth/demo')).status, 401);
  // a custom host is reachable only by being named explicitly
  assert.equal((await hit('staging.luno.example', { STANDALONE_HOSTS: 'staging.luno.example' })).status, 401);
  assert.equal((await hit('staging.luno.example', {})).status, 503);
});

test('standalone host allowlist matches exact names; loopback needs no env', async () => {
  const hit = (host, env) => worker.fetch(new Request(`https://${host}/api/v1/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: 'user@luno.local', password: 'LunoUser#2026!' }),
  }), env);
  // gate passes (bad credentials -> 401, not 503) only on exact allowlisted names
  const env = { STANDALONE_HOSTS: ' other.example, STAGING.LUNO.EXAMPLE , ' };
  assert.equal((await hit('staging.luno.example', env)).status, 401);
  for (const host of ['staging.luno.example.evil.test', 'evil-staging.luno.example', 'child.staging.luno.example']) {
    assert.equal((await hit(host, env)).status, 503, host);
  }
  for (const entry of ['*', '*.luno.example', 'https://staging.luno.example', 'staging.luno.example:443']) {
    assert.equal((await hit('staging.luno.example', { ...env, STANDALONE_HOSTS: entry })).status, 503, entry);
  }
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal((await hit(host, {})).status, 401, host);
    assert.equal((await hit(host, { ALLOW_LOCAL_DEMO: 'true' })).status, 401, host);
  }
});

test('translate fails closed without an engine and e2ee flag stays off', async () => {
  assert.equal((await api('translate', null, 'POST', { text: 'hello' })).status, 401);
  const alice = await signup('tr-alice@luno-test.local', 'tralice');
  const res = await api('translate', alice.token, 'POST', { text: 'hello', target_lang: 'ko' });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'TRANSLATE_NOT_CONFIGURED');
  const admin = await login('admin@luno.local', 'Worker#Admin1');
  const flags = (await (await api('admin/feature-flags', admin)).json()).feature_flags;
  assert.equal(flags.find(f => f.key === 'e2ee_letter_sealing').enabled, false);
});

test('attachments serve identical bytes at the content alias', async () => {
  const env = { DB: makeD1(), DURABLE_CONVERSATIONS: 'true', MEDIA_BUCKET: makeBucket() };
  const register = async (email, handle) => {
    const reg = await api('auth/register', null, 'POST', { email, password: 'Str0ng!Passw0rd', display_name: handle, handle }, {}, env);
    assert.equal(reg.status, 201, `register ${email}`);
    const id = (await reg.json()).id;
    const token = (await (await api('auth/login', null, 'POST', { email, password: 'Str0ng!Passw0rd' }, {}, env)).json()).access_token;
    assert.ok(token, `login ${email}`);
    return { id, token };
  };
  const alice = await register('att-alice@luno-test.local', 'attallice');
  const peer = await register('att-peer@luno-test.local', 'attpeer');
  const convRoom = await api('conversations', alice.token, 'POST', { title: 'attachment room', member_ids: [peer.id] }, {}, env);
  assert.equal(convRoom.status, 201);
  const cid = (await convRoom.json()).id;
  const b64 = Buffer.from('hello-bytes').toString('base64');
  const up = await api('attachments', alice.token, 'POST', { conversation_id: cid, content_base64: b64, mime_type: 'text/plain', original_name: 'hi.txt' }, {}, env);
  assert.equal(up.status, 201);
  const { id } = await up.json();
  for (const path of [`attachments/${id}`, `attachments/${id}/content`]) {
    const res = await api(path, alice.token, 'GET', undefined, {}, env);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'hello-bytes');
  }
});

test('friends expose birthday_today and PATCH /me validates MM-DD', async () => {
  const demo = await signup('bday-user@luno-test.local', 'bdayuser');
  const friend = await signup('bday-friend@luno-test.local', 'bdayfriend');
  const today = new Date().toISOString().slice(5, 10);
  assert.equal((await api('me', friend.token, 'PATCH', { birthday: today })).status, 200);
  assert.equal((await api('friends', demo.token, 'POST', { friend_id: friend.id })).status, 201);
  const friends = await (await api('friends', demo.token, 'GET')).json();
  const row = friends.friends.find(f => f.id === friend.id);
  assert.ok(row, 'added friend must be listed');
  assert.equal(row.birthday_today, true);
  assert.equal((await api('me', demo.token, 'PATCH', { birthday: '13-99' })).status, 400);
  const patched = await (await api('me', demo.token, 'PATCH', { birthday: today })).json();
  assert.equal(patched.birthday, today);
});
