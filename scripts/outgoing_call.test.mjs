import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

// Item 2: the outgoing call screen must appear even when the mic/camera is
// unavailable. startCall raises the ringing UI first and treats media as
// opportunistic (mediaFailed flag shown inside the call dialog); only a
// server session failure aborts back to the toast.
const wrtcSource = await readFile(new URL('../apps/user-web/src/composables/useWebRTC.ts', import.meta.url), 'utf8');
const utilsSource = await readFile(new URL('../apps/user-web/src/messenger-utils.ts', import.meta.url), 'utf8');
const modalSource = await readFile(new URL('../apps/user-web/src/components/CallModal.vue', import.meta.url), 'utf8');
const viewSource = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
const i18nSource = await readFile(new URL('../apps/user-web/src/luno-i18n.ts', import.meta.url), 'utf8');

test('startCall raises the ringing UI before media acquisition', () => {
  const body = wrtcSource.match(/async function startCall[\s\S]*?\n  }\n/)?.[0] || '';
  assert.ok(body.length > 0);
  const uiAt = body.indexOf("activeCall.value = { id: ''");
  const mediaAt = body.indexOf('startWebRTCCall(');
  assert.ok(uiAt !== -1 && mediaAt !== -1 && uiAt < mediaAt, 'ringing UI must precede media acquisition');
  assert.ok(body.includes('callMediaIssue'));
  assert.ok(body.includes('mvCallStartFailed'));
});

test('media failure no longer aborts the call session', () => {
  assert.ok(utilsSource.includes('mediaFailed'));
  assert.match(utilsSource, /getUserMedia[\s\S]{0,400}?mediaFailed = true/);
  assert.match(utilsSource, /return \{ id: res\.id, pc, stream, mediaFailed \}/);
});

test('call dialog shows the media notice inside the call screen', () => {
  assert.ok(modalSource.includes('callMediaIssue'));
  assert.match(modalSource, /v-if="callMediaIssue"[\s\S]{0,200}?callMediaFailed/);
  assert.ok(viewSource.includes(':call-media-issue="callMediaIssue"'));
});

test('hanging up an unanswered outgoing call logs outgoing, not missed', () => {
  assert.match(wrtcSource, /prevCall\.direction === 'incoming' && !wasConnected \? 'missed' : 'outgoing'/);
});

test('mvCallStartFailed is translated in all four locales', () => {
  const hits = i18nSource.match(/mvCallStartFailed/g) || [];
  assert.equal(hits.length, 4);
});

test('worker starts a call session without any SDP (signaling needs no media)', async () => {
  const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const env = { ADMIN_INITIAL_PASSWORD: 'Worker#Admin1', DEMO_INITIAL_PASSWORD: 'Worker#Demo12' };
  const call = (path, token, method = 'GET', body) => worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
  const register = async (email) => {
    const reg = await call('auth/register', null, 'POST', { email, password: 'Str0ng!Passw0rd', display_name: email, handle: email.split('@')[0] });
    assert.equal(reg.status, 201);
    const id = (await reg.json()).id;
    const token = (await (await call('auth/login', null, 'POST', { email, password: 'Str0ng!Passw0rd' })).json()).access_token;
    return { id, token };
  };
  const a = await register('oc-a@luno-test.local');
  const b = await register('oc-b@luno-test.local');
  const room = await (await call('conversations', a.token, 'POST', { kind: 'direct', member_ids: [b.id] })).json();
  const started = await call('calls', a.token, 'POST', { conversation_id: room.id, kind: 'voice' });
  assert.equal(started.status, 201);
  const session = await started.json();
  assert.ok(typeof session.id === 'string' && session.id.length > 0);
  assert.equal(session.state, 'ringing');
});
