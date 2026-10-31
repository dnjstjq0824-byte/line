import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

async function api(path, token, method = 'GET', body, extraHeaders = {}) {
  return worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      ...extraHeaders
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { ALLOW_LOCAL_DEMO: 'true' });
}

async function login(email, password) {
  const res = await api('auth/login', null, 'POST', { email, password });
  const data = await res.json();
  return { token: data.access_token, user_id: data.user_id };
}

test('P0-1 & P0-2: Verify official security channel and sample conversations resolve without 404', async () => {
  // Test with demo user
  const { token, user_id } = await login('user@line.local', 'LineUser#2026!');
  assert.ok(token, 'Login should succeed');

  // 1. GET /api/v1/conversations
  const convsRes = await api('conversations', token);
  assert.equal(convsRes.status, 200, 'GET /conversations should return 200');
  const { conversations } = await convsRes.json();
  assert.ok(Array.isArray(conversations), 'conversations should be an array');
  assert.ok(conversations.length > 0, 'conversations should have items');

  const secConv = conversations.find(c => c.official || c.title?.includes('보안'));
  assert.ok(secConv, 'Official security channel must be listed');

  const kConv = conversations.find(c => c.title?.includes('K'));
  assert.ok(kConv, 'K conversation must be listed');

  // 2. Query official security channel messages by resolved ID and by aliases
  for (const targetId of [secConv.id, 'oa-notice', 'chat-sec-01']) {
    const msgRes = await api(`conversations/${targetId}/messages?limit=50`, token);
    assert.equal(msgRes.status, 200, `Querying ${targetId} messages must return 200 OK`);
    const { messages } = await msgRes.json();
    assert.ok(Array.isArray(messages), `messages for ${targetId} should be an array`);
    assert.ok(messages.length > 0, `messages for ${targetId} should not be empty`);
    assert.ok(messages.some(m => m.kind === 'security_notice' && m.body === '로그인 성공'), 'Must contain login success security notice');
  }

  // 3. Query K conversation messages by resolved ID and by alias
  for (const targetId of [kConv.id, 'chat-k-01']) {
    const kMsgRes = await api(`conversations/${targetId}/messages?limit=50`, token);
    assert.equal(kMsgRes.status, 200, `Querying ${targetId} messages must return 200 OK`);
    const { messages } = await kMsgRes.json();
    assert.ok(Array.isArray(messages), `messages for ${targetId} should be an array`);
    assert.ok(messages.length >= 9, `messages for ${targetId} should contain initial call and text history`);
    assert.ok(messages.some(m => m.kind === 'call_status'), 'Must contain call status bubbles');
  }

  // 4. Post new message to conversation
  const postRes = await api(`conversations/${kConv.id}/messages`, token, 'POST', {
    client_id: `test-cid-${Date.now()}`,
    kind: 'text',
    body: '실시간 메시지 전송 테스트'
  });
  assert.equal(postRes.status, 201, 'Posting message should return 201 Created');
});

