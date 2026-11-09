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

test('voice messages clamp duration and link attachments', async () => {
  const alice = await login('alice@luno-test.local', 'Alice#Rotated$48wT');
  const cid = '00000000-0000-0000-0000-000000000010';
  const up = await api('attachments', alice, 'POST', {
    conversation_id: cid,
    original_name: 'voice-note.m4a',
    mime_type: 'audio/mp4',
    content_base64: Buffer.from('fake-audio-bytes').toString('base64'),
  });
  assert.equal(up.status, 201);
  const { id: attId } = await up.json();
  const sent = await api(`conversations/${cid}/messages`, alice, 'POST', {
    kind: 'voice',
    metadata: { attachment_id: attId, duration: 42 },
  });
  assert.equal(sent.status, 201);
  const { message } = await sent.json();
  assert.equal(message.metadata.duration, 42);
  assert.equal(message.metadata.attachment_id, attId);
  const clamped = await api(`conversations/${cid}/messages`, alice, 'POST', {
    kind: 'voice',
    metadata: { attachment_id: attId, duration: 999 },
  });
  assert.equal(clamped.status, 201);
  assert.equal((await clamped.json()).message.metadata.duration, 0);
  const dangling = await api(`conversations/${cid}/messages`, alice, 'POST', {
    kind: 'voice',
    metadata: { attachment_id: 'nope', duration: 5 },
  });
  assert.equal(dangling.status, 201);
  assert.equal((await dangling.json()).message.metadata.attachment_id, 'nope');
  assert.equal((await api(`conversations/${cid}/messages`, alice, 'POST', {
    kind: 'image',
    metadata: {},
  })).status, 404);
});
