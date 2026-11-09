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

test('video messages link attachments without duration', async () => {
  const alice = await login('alice@luno-test.local', 'Alice#Rotated$48wT');
  const cid = '00000000-0000-0000-0000-000000000010';
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
