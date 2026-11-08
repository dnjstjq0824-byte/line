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
  return data.access_token;
}

test('LUNO Phase 1: Push Tokens & Offline Delta Sync', async () => {
  const token = await login('user@luno.local', 'LunoUser#2026!');
  assert.ok(token, 'User token should exist');

  // 1. Register push token
  const regRes = await api('push-tokens', token, 'POST', {
    token: 'fcm_mock_token_luno_12345',
    platform: 'android',
    device_id: 'dev_test_android_01'
  });
  assert.equal(regRes.status, 201);
  const regData = await regRes.json();
  assert.equal(regData.status, 'registered');

  // 2. Test push delivery
  const pushTestRes = await api('push-tokens/test', token, 'POST');
  assert.equal(pushTestRes.status, 503);
  const pushData = await pushTestRes.json();
  assert.equal(pushData.code, 'PUSH_NOT_CONFIGURED');
  assert.equal(pushData.dispatched, undefined);

  // 3. Delta Sync
  const chatsRes = await api('conversations', token);
  const chatsData = await chatsRes.json();
  const cid = chatsData.conversations?.[0]?.id;
  if (cid) {
    const syncRes = await api(`conversations/${cid}/sync?since_sequence=0`, token);
    assert.equal(syncRes.status, 200);
    const syncData = await syncRes.json();
    assert.equal(syncData.conversation_id, cid);
    assert.ok(Array.isArray(syncData.delta_messages));
  }
});

test('key-bundle storage and group signaling metadata (no cryptographic or media proof)', async () => {
  const token = await login('user@luno.local', 'LunoUser#2026!');
  const meRes = await api('me', token);
  const me = await meRes.json();

  // 1. Register device E2EE prekey bundle
  const keyReg = await api('devices/device_web_01/keys', token, 'PUT', {
    identity_key: 'ed25519_pub_identity_abc123',
    signed_prekey: 'curve25519_signed_prekey_xyz',
    prekey_sig: 'sig_bundle_valid',
    one_time_prekeys: ['otk_1', 'otk_2', 'otk_3']
  });
  assert.equal(keyReg.status, 200);

  // 2. Fetch user E2EE public keys for X3DH agreement
  const userKeysRes = await api(`users/${me.id}/keys`, token);
  assert.equal(userKeysRes.status, 200);
  const userKeys = await userKeysRes.json();
  assert.equal(userKeys.identity_key, 'ed25519_pub_identity_abc123');

  // 3. ICE Servers for STUN/TURN
  const iceRes = await api('calls/ice-servers', token);
  assert.equal(iceRes.status, 200);
  const iceData = await iceRes.json();
  assert.ok(Array.isArray(iceData.ice_servers));

  // 4. Group calling SFU join & leave
  const joinRes = await api('calls/group/join', token, 'POST', { room_id: 'group_room_101' });
  assert.equal(joinRes.status, 201);
  const leaveRes = await api('calls/group/leave', token, 'POST', { room_id: 'group_room_101' });
  assert.equal(leaveRes.status, 200);
});

test('speech transcription fails closed without a configured provider', async () => {
  const token = await login('user@luno.local', 'LunoUser#2026!');
  const sttRes = await api('ai/stt', token, 'POST', {
    mock_text: '오늘 회의 준비 완료되었습니다.',
    duration: 4.5
  });
  assert.equal(sttRes.status, 503);
  const sttData = await sttRes.json();
  assert.equal(sttData.code, 'STT_NOT_CONFIGURED');
  assert.equal(sttData.transcript, undefined);
});

test('LUNO Phase 4: B2B Official Accounts & Webhooks', async () => {
  const token = await login('admin@luno.local', 'LunoAdmin#2026!');

  // 1. Rich Menu
  const menuRes = await api('partner/accounts/oa_luno_official/rich-menus', token);
  assert.equal(menuRes.status, 200);
  const menuData = await menuRes.json();
  assert.ok(menuData.rich_menu?.areas?.length >= 5);

  // 2. Developer Webhook Test
  const webhookTest = await api('developer/apps/app_101/webhooks/test', token, 'POST');
  assert.equal(webhookTest.status, 503);
  const whData = await webhookTest.json();
  assert.equal(whData.code, 'WEBHOOK_DELIVERY_NOT_CONFIGURED');
  assert.equal(whData.delivered, undefined);
});

test('LUNO Phase 5: Payments, Settlements & Commerce', async () => {
  const token = await login('user@luno.local', 'LunoUser#2026!');

  // 1. Checkout session
  const checkoutRes = await api('checkout', token, 'POST', { amount: 15000, currency: 'KRW' });
  assert.equal(checkoutRes.status, 503);
  const checkoutData = await checkoutRes.json();
  assert.equal(checkoutData.code, 'PAYMENTS_NOT_CONFIGURED');
  assert.equal(checkoutData.status, undefined);

  // 2. Creator settlements
  const settRes = await api('creator/settlements', token);
  assert.equal(settRes.status, 503);
  const settData = await settRes.json();
  assert.equal(settData.code, 'SETTLEMENTS_NOT_CONFIGURED');
  assert.equal(settData.balance, undefined);
});

test('LUNO Phase 6: Compliance & GDPR Data Portability', async () => {
  const token = await login('user@luno.local', 'LunoUser#2026!');

  // 1. Export Data Archive
  const exportRes = await api('me/export-data', token);
  assert.equal(exportRes.status, 200);
  const exportData = await exportRes.json();
  assert.equal(exportData.export_version, '1.0');
  assert.ok(exportData.user?.id);
  assert.ok(Array.isArray(exportData.friends));
});

