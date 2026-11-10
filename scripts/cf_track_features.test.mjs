import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_INITIAL_PASSWORD = 'Track4#Admin1';
process.env.STANDALONE_HOSTS = '127.0.0.1,localhost,luno-messenger.dnjstjqppk.workers.dev';

const { default: worker } = await import('./cf_worker.js');

function req(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  headers.set('User-Agent', 'Mozilla/5.0 LunoTest/1.0');
  if (opts.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return new Request('https://luno-messenger.dnjstjqppk.workers.dev' + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
}

async function api(path, token, method = 'GET', body = null) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return worker.fetch(req(path, { method, headers, body }), process.env);
}

test('Track 4: Official Account Rich Menu & Chatbot CRM engine', async () => {
  // 1. Register + login user
  const regRes = await api('/api/v1/auth/register', null, 'POST', {
    email: 'track4-user@luno-test.local', password: 'Str0ng!Passw0rd',
    display_name: 'track4user', handle: 'track4user',
  });
  assert.equal(regRes.status, 201);
  const loginRes = await api('/api/v1/auth/login', null, 'POST', {
    email: 'track4-user@luno-test.local', password: 'Str0ng!Passw0rd',
  });
  assert.equal(loginRes.status, 200);
  const { access_token: token, user_id: userId } = await loginRes.json();

  // 2. Fetch conversations and find oa-notice conversation
  const convRes = await api('/api/v1/conversations', token);
  assert.equal(convRes.status, 200);
  const { conversations } = await convRes.json();
  const noticeConv = conversations.find(c => c.id.includes('oa-notice'));
  assert.ok(noticeConv, 'Should find oa-notice conversation');

  // 3. Fetch rich menu for oa-notice conversation
  const menuRes = await api(`/api/v1/conversations/${noticeConv.id}/rich-menu`, token);
  assert.equal(menuRes.status, 200);
  const menuData = await menuRes.json();
  assert.ok(menuData.rich_menu, 'Should return rich_menu object');
  assert.equal(menuData.rich_menu.account_id, 'oa-notice');
  assert.ok(menuData.rich_menu.tiles.length >= 6, 'Should have at least 6 tiles');

  // 4. Send message matching bot rule keyword '공지'
  const sendRes = await api(`/api/v1/conversations/${noticeConv.id}/messages`, token, 'POST', {
    kind: 'text',
    body: '공지사항 알려줘'
  });
  assert.equal(sendRes.status, 201);

  // 5. Check that bot auto-replied
  const msgListRes = await api(`/api/v1/conversations/${noticeConv.id}/messages`, token);
  assert.equal(msgListRes.status, 200);
  const { messages: msgs } = await msgListRes.json();
  const botMsgs = msgs.filter(m => m.sender_id === 'oa-notice');
  assert.ok(botMsgs.length > 0, 'Bot should have auto-replied');
  const latestReply = botMsgs[botMsgs.length - 1];
  assert.ok(latestReply.body.includes('[LUNO 공지]'), 'Bot reply should match configured keyword rule');

  // 6. Test Partner Bot Rules CRUD
  const adminLogin = await api('/api/v1/auth/login', null, 'POST', { email: 'admin@luno.local', password: 'Track4#Admin1' });
  const adminToken = (await adminLogin.json()).access_token;
  assert.equal((await api('/api/v1/partner/accounts/oa-notice/bot-rules', token)).status, 403);
  const rulesListRes = await api('/api/v1/partner/accounts/oa-notice/bot-rules', adminToken);
  assert.equal(rulesListRes.status, 200);
  const { rules } = await rulesListRes.json();
  assert.ok(rules.length >= 5, 'Should return default seeded rules');

  // Add new custom bot rule
  const addRuleRes = await api('/api/v1/partner/accounts/oa-notice/bot-rules', adminToken, 'POST', {
    keyword: '배송조회',
    reply: '배송 현황: 주문번호를 입력하시면 실시간 배송 조회가 가능합니다.'
  });
  assert.equal(addRuleRes.status, 201);
  const addData = await addRuleRes.json();
  assert.equal(addData.rule.reply, '배송 현황: 주문번호를 입력하시면 실시간 배송 조회가 가능합니다.');

  // Test custom rule auto-reply
  await api(`/api/v1/conversations/${noticeConv.id}/messages`, token, 'POST', {
    kind: 'text',
    body: '배송조회 어떻게 하나요?'
  });
  const msgsAfterCustom = await (await api(`/api/v1/conversations/${noticeConv.id}/messages`, token)).json();
  const customReplies = msgsAfterCustom.messages.filter(m => m.sender_id === 'oa-notice' && m.body.includes('배송 현황'));
  assert.ok(customReplies.length > 0, 'Custom bot rule should trigger reply');

  // 7. Test CallKit payload in calls
  // Find a friend conversation with peer-k
  const friendConv = conversations.find(c => c.id.includes('conv-k'));
  assert.ok(friendConv);
  const callRes = await api('/api/v1/calls', token, 'POST', {
    conversation_id: friendConv.id,
    kind: 'voice'
  });
  assert.equal(callRes.status, 201);
  const callData = await callRes.json();
  assert.ok(callData.callkit, 'Should return callkit configuration');
  assert.equal(callData.callkit.hasVideo, false);
});
