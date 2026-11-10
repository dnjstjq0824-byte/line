import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

// Item 8: "my QR" is a real scannable matrix, not a scan icon. The payload
// mirrors GET me/qr (LUNO-FRIEND:<handle>); the finder-pattern test below
// proves the matrix is structurally a QR code.
const qr = await import('../apps/shared/friend_qr.ts');
const viewSource = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');

test('friend QR payload mirrors the server code format', () => {
  assert.equal(qr.friendQrPayload('alice_kim'), 'LUNO-FRIEND:alice_kim');
  assert.equal(qr.friendQrPayload('  bob  '), 'LUNO-FRIEND:bob');
  assert.equal(qr.friendQrPayload(''), 'LUNO-FRIEND:luno_user');
});

test('generated matrix carries real QR finder patterns', () => {
  const count = qr.friendQrModuleCount('alice_kim');
  assert.ok(count >= 21 && count % 2 === 1, `odd module count >= 21, got ${count}`);
  const corners = [[0, 0], [0, count - 7], [count - 7, 0]];
  for (const [r0, c0] of corners) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        assert.equal(qr.friendQrIsDark('alice_kim', r0 + r, c0 + c), edge || core, `finder ${r0},${c0} cell ${r},${c}`);
      }
    }
  }
});

test('QR svg is deterministic, well-formed, and distinct per handle', () => {
  const a = qr.makeFriendQrSvg('alice_kim');
  assert.ok(a.startsWith('<svg') && a.includes('</svg>'));
  assert.ok(a.length > 1000);
  assert.equal(a, qr.makeFriendQrSvg('alice_kim'));
  assert.notEqual(a, qr.makeFriendQrSvg('bob_lee'));
});

test('QR modal renders the real matrix instead of the scan icon', () => {
  assert.ok(viewSource.includes('makeFriendQrSvg'));
  assert.ok(viewSource.includes('v-html="myQrSvg"'));
  assert.ok(!viewSource.includes('name="scan" :size="96"'));
});

test('worker me/qr returns the code format the client mirrors', async () => {
  const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const env = { ADMIN_INITIAL_PASSWORD: 'Worker#Admin1', DEMO_INITIAL_PASSWORD: 'Worker#Demo12' };
  const call = (path, token, method = 'GET', body) => worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
  const reg = await call('auth/register', null, 'POST', { email: 'qr-u@luno-test.local', password: 'Str0ng!Passw0rd', display_name: 'QR', handle: 'qr_user' });
  assert.equal(reg.status, 201);
  const token = (await (await call('auth/login', null, 'POST', { email: 'qr-u@luno-test.local', password: 'Str0ng!Passw0rd' })).json()).access_token;
  const mine = await (await call('me/qr', token)).json();
  assert.equal(mine.code, 'LUNO-FRIEND:qr_user');
});
