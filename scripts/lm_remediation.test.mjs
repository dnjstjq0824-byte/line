import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './cf_worker.js';

function req(path, method = 'GET', body = null, token = null, headers = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return new Request(`https://line-messenger.dnjstjqppk.workers.dev/api/v1/${path}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined
  });
}

async function api(path, method = 'GET', body = null, token = null) {
  return worker.fetch(req(path, method, body, token), {
    ALLOW_LOCAL_DEMO: 'true',
    ALLOW_EDGE_STANDALONE: 'true',
    ENABLE_DEMO_ACCOUNTS: 'true'
  });
}

test('LM-01: Rotated credentials, old passwords rejected with 401, fail-closed demo', async () => {
  // 1. Old credentials must fail
  const oldUser = await api('auth/login', 'POST', { email: 'user@line.local', password: 'LineUser#2026!' });
  assert.equal(oldUser.status, 401, 'Old user password must be rejected');

  const oldAdmin = await api('auth/login', 'POST', { email: 'admin@line.local', password: 'LineAdmin#2026!' });
  assert.equal(oldAdmin.status, 401, 'Old admin password must be rejected');

  // 2. Rotated credentials must succeed
  const newUser = await api('auth/login', 'POST', { email: 'user@line.local', password: 'LunoUser#Rotated$72mP' });
  assert.equal(newUser.status, 200, 'Rotated user password must succeed');
  const userJson = await newUser.json();
  assert.ok(userJson.access_token);

  // 3. Demo login endpoint
  const demoRes = await api('auth/demo', 'POST', { account: 'user' });
  assert.equal(demoRes.status, 200);
  const demoData = await demoRes.json();
  assert.ok(demoData.access_token);
  assert.equal(demoData.role, 'user');

  // Admin demo must be rejected
  const adminDemoRes = await api('auth/demo', 'POST', { account: 'admin' });
  assert.equal(adminDemoRes.status, 403, 'Admin demo must be forbidden');
});

test('LM-01 & A-02: Role check enforcement (normal user receives 403 on admin routes)', async () => {
  const userLogin = await api('auth/login', 'POST', { email: 'user@line.local', password: 'LunoUser#Rotated$72mP' });
  const { access_token: userToken } = await userLogin.json();

  const adminStats = await api('admin/stats', 'GET', null, userToken);
  assert.equal(adminStats.status, 403, 'Normal user must be forbidden from admin/stats');

  const adminFlags = await api('admin/feature-flags', 'GET', null, userToken);
  assert.equal(adminFlags.status, 403, 'Normal user must be forbidden from admin/feature-flags');
});

test('LM-02 & A-03: Version endpoint returns commit and build metadata', async () => {
  const res = await api('version', 'GET');
  assert.equal(res.status, 200);
  const ver = await res.json();
  assert.ok(ver.commit, 'Commit must be present');
  assert.ok(ver.build_time, 'Build time must be present');
  assert.equal(ver.brand, 'LUNO');
});

test('LM-03 & A-05: Official Accounts unique 3 items and conversation isolation', async () => {
  const userLogin = await api('auth/login', 'POST', { email: 'user@line.local', password: 'LunoUser#Rotated$72mP' });
  const { access_token: token, user_id: userId } = await userLogin.json();

  // Exactly 3 unique official accounts
  const oaRes = await api('official-accounts', 'GET', null, token);
  assert.equal(oaRes.status, 200);
  const { accounts } = await oaRes.json();
  assert.equal(accounts.length, 3, 'Must have exactly 3 unique official accounts');
  const ids = accounts.map(a => a.id);
  assert.deepEqual(ids.sort(), ['oa-deals', 'oa-notice', 'oa-weather'].sort());

  // Conversation isolation
  const convRes = await api('conversations', 'GET', null, token);
  assert.equal(convRes.status, 200);
  const { conversations } = await convRes.json();
  const keep = conversations.find(c => c.id === `conv-keep-${userId}`);
  assert.ok(keep, 'Keep memo must exist for user');

  // Verify another user cannot access user A keep memo
  const aliceLogin = await api('auth/login', 'POST', { email: 'alice@line-test.local', password: 'Alice#Rotated$48wT' });
  const { access_token: aliceToken } = await aliceLogin.json();
  const aliceConvs = await (await api('conversations', 'GET', null, aliceToken)).json();
  assert.ok(!aliceConvs.conversations.some(c => c.id === `conv-keep-${userId}`), 'Alice must not see User keep memo');
});

test('LM-04 & A-06 & A-07: Badge Invariant and read-all idempotency', async () => {
  const userLogin = await api('auth/login', 'POST', { email: 'user@line.local', password: 'LunoUser#Rotated$72mP' });
  const { access_token: token } = await userLogin.json();

  const convRes = await api('conversations', 'GET', null, token);
  const { conversations } = await convRes.json();

  // Dodo has badge_n, unread_count must be 0
  const dodo = conversations.find(c => c.id.includes('conv-dodo'));
  assert.ok(dodo);
  assert.equal(dodo.badge_n, true);
  assert.equal(dodo.unread_count, 0, 'Dodo with badge_n must not have numeric unread count');

  // read-all
  const readAll1 = await api('conversations/read-all', 'POST', null, token);
  assert.equal(readAll1.status, 200);

  const convResAfter = await api('conversations', 'GET', null, token);
  const { conversations: afterList } = await convResAfter.json();
  for (const c of afterList) {
    assert.equal(c.unread_count, 0, `Conversation ${c.title} must have unread 0 after read-all`);
  }

  // Idempotency: 2nd call must succeed cleanly
  const readAll2 = await api('conversations/read-all', 'POST', null, token);
  assert.equal(readAll2.status, 200);
});

test('LM-07 & A-10: Session revocation and password change', async () => {
  const userLogin = await api('auth/login', 'POST', { email: 'user@line.local', password: 'LunoUser#Rotated$72mP' });
  const { access_token: token } = await userLogin.json();

  // 1. Session revocation
  const revokeRes = await api('auth/sessions/revoke', 'POST', { session_token: token }, token);
  assert.equal(revokeRes.status, 200);

  // Subsequent call with revoked token must fail with 401
  const testRevoked = await api('me', 'GET', null, token);
  assert.equal(testRevoked.status, 401, 'Revoked token must be rejected with 401');

  // 2. Log in again with a fresh session
  const freshLogin = await api('auth/login', 'POST', { email: 'user@line.local', password: 'LunoUser#Rotated$72mP' });
  const { access_token: freshToken } = await freshLogin.json();

  // Change password
  const changeRes = await api('auth/change-password', 'POST', {
    current_password: 'LunoUser#Rotated$72mP',
    new_password: 'LunoUser#NewStrongPass$2026'
  }, freshToken);
  assert.equal(changeRes.status, 200);

  // Old password must fail
  const oldAttempt = await api('auth/login', 'POST', { email: 'user@line.local', password: 'LunoUser#Rotated$72mP' });
  assert.equal(oldAttempt.status, 401, 'Previous password must be rejected');

  // New password must succeed
  const newAttempt = await api('auth/login', 'POST', { email: 'user@line.local', password: 'LunoUser#NewStrongPass$2026' });
  assert.equal(newAttempt.status, 200, 'New password must succeed');

  // Reset back to standard rotated test password for other tests
  const { access_token: resetToken } = await newAttempt.json();
  await api('auth/change-password', 'POST', {
    current_password: 'LunoUser#NewStrongPass$2026',
    new_password: 'LunoUser#Rotated$72mP'
  }, resetToken);
});

test('LM-08 & A-11: 13 MESSAGE_KINDS round-trip verification', async () => {
  const userLogin = await api('auth/login', 'POST', { email: 'user@line.local', password: 'LunoUser#Rotated$72mP' });
  const { access_token: token, user_id: userId } = await userLogin.json();

  const convRes = await api('conversations', 'GET', null, token);
  const { conversations } = await convRes.json();
  const testConv = conversations.find(c => c.kind === 'direct');
  assert.ok(testConv, 'Direct conversation must exist');

  const kinds = [
    { kind: 'text', body: '테스트 텍스트 메시지' },
    { kind: 'sticker', body: 'stk-luno-01', metadata: { sticker_id: 'stk-luno-01' } },
    { kind: 'image', body: 'https://images.unsplash.com/photo-1542751371?w=400' },
    { kind: 'video', body: 'https://sample-videos.com/video123.mp4' },
    { kind: 'voice', body: 'voice_recording_01.webm', metadata: { duration: 15 } },
    { kind: 'file', body: 'document.pdf', metadata: { filename: 'document.pdf', size: 1024 } },
    { kind: 'location', body: '서울역', metadata: { lat: 37.5547, lng: 126.9706, name: '서울역' } },
    { kind: 'contact', body: '도도형님', metadata: { name: '도도형님', phone: '+82 10-1234-5678' } },
    { kind: 'pay', body: '10000', metadata: { amount: 10000, memo: '커피값' } },
    { kind: 'transfer', body: '5000', metadata: { amount: 5000, memo: '정산' } },
    { kind: 'ciphertext', body: 'enc:AES-GCM:dGVzdF9jaXBoZXJ0ZXh0', metadata: { iv: 'YWJj' } },
    { kind: 'call_status', body: '음성통화 01:23', metadata: { duration: '1:23', status: 'completed' } },
    { kind: 'security_notice', body: '로그인 성공', metadata: { ip: '127.0.0.1', device: 'Web PC' } }
  ];

  for (const item of kinds) {
    const sendRes = await api(`conversations/${testConv.id}/messages`, 'POST', {
      kind: item.kind,
      body: item.body,
      metadata: item.metadata,
      client_id: `client-${Date.now()}-${item.kind}`
    }, token);
    assert.equal(sendRes.status, 201, `Sending message kind '${item.kind}' should return 201`);
    const sent = await sendRes.json();
    assert.equal(sent.kind, item.kind, `Message kind should be ${item.kind}`);
  }
});

