import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

// Mobile P1-14: PC/web login QR is a real scannable matrix. Payload format
// LUNO-LOGIN:<challenge_id>:<qr_token> mirrors POST auth/qr/challenge; the
// mobile scanner parses it and approves via POST auth/qr/approve.
const qr = await import('../apps/shared/login_qr.ts');
const viewSource = await readFile(new URL('../apps/user-web/src/views/AuthView.vue', import.meta.url), 'utf8');

test('login QR payload carries challenge and token', () => {
  assert.equal(qr.loginQrPayload('cid-1', 'qr-tok-2'), 'LUNO-LOGIN:cid-1:qr-tok-2');
  assert.equal(qr.loginQrPayload('  cid-1 ', ' qr-tok-2 '), 'LUNO-LOGIN:cid-1:qr-tok-2');
  assert.equal(qr.loginQrPayload('', 'qr-tok-2'), '');
  assert.equal(qr.loginQrPayload('cid-1', ''), '');
});

test('generated matrix carries real QR finder patterns', () => {
  const count = qr.loginQrModuleCount('cid-1', 'qr-tok-2');
  assert.ok(count >= 21 && count % 2 === 1, `odd module count >= 21, got ${count}`);
  const corners = [[0, 0], [0, count - 7], [count - 7, 0]];
  for (const [r0, c0] of corners) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        assert.equal(qr.loginQrIsDark('cid-1', 'qr-tok-2', r0 + r, c0 + c), edge || core, `finder ${r0},${c0} cell ${r},${c}`);
      }
    }
  }
});

test('QR svg is deterministic, well-formed, and distinct per challenge', () => {
  const a = qr.makeLoginQrSvg('cid-1', 'qr-tok-2');
  assert.ok(a.startsWith('<svg') && a.includes('</svg>'));
  assert.ok(a.length > 1000);
  assert.equal(a, qr.makeLoginQrSvg('cid-1', 'qr-tok-2'));
  assert.notEqual(a, qr.makeLoginQrSvg('cid-9', 'qr-tok-8'));
  assert.equal(qr.makeLoginQrSvg('', ''), '');
});

test('login view renders the real matrix with a live timer', () => {
  assert.ok(viewSource.includes('makeLoginQrSvg'));
  assert.ok(viewSource.includes('v-html="loginQrSvg"'));
  assert.ok(viewSource.includes('v-if="qrChallengeID" class="pc-qr-timer-pill"'));
  assert.ok(!viewSource.includes('v-if="false" class="pc-qr-timer-pill"'));
  assert.ok(viewSource.includes('qrManualLabel'));
});

test('challenge payload approves and polls to authenticated', async () => {
  const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const env = { ADMIN_INITIAL_PASSWORD: 'Worker#Admin1', DEMO_INITIAL_PASSWORD: 'Worker#Demo12' };
  const call = (path, token, method = 'GET', body) => worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
  const reg = await call('auth/register', null, 'POST', { email: 'qr-l@luno-test.local', password: 'Str0ng!Passw0rd', display_name: 'QRL' });
  assert.equal(reg.status, 201);
  const token = (await (await call('auth/login', null, 'POST', { email: 'qr-l@luno-test.local', password: 'Str0ng!Passw0rd' })).json()).access_token;
  const ch = await (await call('auth/qr/challenge', null, 'POST', {})).json();
  const payload = qr.loginQrPayload(ch.challenge_id, ch.qr_token);
  const [tag, cid, qtoken] = payload.split(':');
  assert.equal(tag, 'LUNO-LOGIN');
  const ap = await call('auth/qr/approve', token, 'POST', { challenge_id: cid, qr_token: qtoken });
  assert.equal(ap.status, 200);
  const polled = await (await call('auth/qr/poll', null, 'POST', { challenge_id: cid, qr_token: qtoken })).json();
  assert.equal(polled.status, 'authenticated');
  assert.ok(polled.access_token);
});
