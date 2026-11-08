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
  // Test A-01: Old exposed password must be rejected with 401
  const oldLogin = await api('auth/login', null, 'POST', { email: 'user@luno.local', password: 'LineUser#2026!' });
  assert.equal(oldLogin.status, 401, 'Old password must be rejected with 401');

  // Test with current password
  const { token, user_id } = await login('user@luno.local', 'LunoUser#2026!');
  assert.ok(token, 'Login should succeed');

  // Test A-03: Version endpoint check
  const verRes = await api('version');
  assert.equal(verRes.status, 200, 'GET /version should return 200');
  const verData = await verRes.json();
  assert.ok(verData.commit, 'Commit hash must be present');

  // Test A-05: Official Accounts unique 3 accounts (no duplicates)
  const oaRes = await api('official-accounts', token);
  assert.equal(oaRes.status, 200);
  const { accounts: oas } = await oaRes.json();
  assert.equal(oas.length, 3, 'Must have exactly 3 unique official accounts');

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

  // 5. Verify Keep Memo self-chat resolves and works
  const keepMsgRes = await api('conversations/keep-memo/messages?limit=50', token);
  assert.equal(keepMsgRes.status, 200, 'Keep memo conversation must return 200 OK');
  const keepData = await keepMsgRes.json();
  assert.ok(keepData.messages.length >= 2, 'Keep memo should have initial memo messages');

  // 6. Verify LUNO custom sticker, location, contact, and call_status messages work
  for (const payload of [
    { client_id: `st-${Date.now()}`, kind: 'sticker', body: 'lumi-hi', metadata: { sticker_id: 'lumi-hi', character: 'Lumi', label: '안녕!' } },
    { client_id: `loc-${Date.now()}`, kind: 'location', body: '강남역', metadata: { lat: 37.5006, lng: 127.0364, label: '강남역' } },
    { client_id: `cnt-${Date.now()}`, kind: 'contact', body: 'K 🙏', metadata: { user_id: 'peer-k', handle: 'k_pray', display_name: 'K 🙏' } },
    { client_id: `call-${Date.now()}`, kind: 'call_status', body: '음성통화', metadata: { duration: '01:12', status: 'completed', call_type: 'voice' } }
  ]) {
    const r = await api(`conversations/${kConv.id}/messages`, token, 'POST', payload);
    assert.equal(r.status, 201, `Posting ${payload.kind} message must return 201 Created`);
  }

  // 7. Verify conversation pin/mute and read-all and friend favorite
  const metaRes = await api(`conversations/${kConv.id}/meta`, token, 'PATCH', { pinned: true, muted: true });
  assert.equal(metaRes.status, 200, 'Pinning and muting conversation should return 200');
  const readAllRes = await api('conversations/read-all', token, 'POST', {});
  assert.equal(readAllRes.status, 200, 'Marking all conversations read should return 200');
  const favRes = await api('friends/peer-adhd', token, 'PATCH', { favorite: true });
  assert.equal(favRes.status, 200, 'Favoriting friend should return 200');
});

