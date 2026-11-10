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

test('video messages link attachments without duration', async () => {
  const alice = await signup('video-user@luno-test.local', 'videouser');
  const bob = await signup('video-peer@luno-test.local', 'videopeer');
  const bobId = (await (await api('me', bob, 'GET')).json()).id;
  const room = await api('conversations', alice, 'POST', { title: 'video drill room', member_ids: [bobId] });
  assert.equal(room.status, 201);
  const cid = (await room.json()).id;
  const up = await api('attachments', alice, 'POST', {
    conversation_id: cid,
    original_name: 'clip.mp4',
    mime_type: 'video/mp4',
    content_base64: Buffer.from('fake-video-bytes').toString('base64'),
  });
  assert.equal(up.status, 201);
  const { id: attId } = await up.json();
  const sent = await api(`conversations/${cid}/messages`, alice, 'POST', {
    kind: 'video',
    metadata: { attachment_id: attId },
  });
  assert.equal(sent.status, 201);
  const { message } = await sent.json();
  assert.equal(message.metadata.attachment_id, attId);
  assert.equal(message.metadata.mime_type, 'video/mp4');
  assert.ok(!('duration' in message.metadata));
  const dangling = await api(`conversations/${cid}/messages`, alice, 'POST', {
    kind: 'video',
    metadata: { attachment_id: 'nope' },
  });
  assert.equal(dangling.status, 404);
});
