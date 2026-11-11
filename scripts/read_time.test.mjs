import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { makeD1 } from './test_helpers.mjs';

// Item 9: read state sticks, and row times never masquerade as "future".
// The 'N' badge derives from the persisted read cursor (a read room never
// shows N on any isolate), and list rows render day-aware times (a 23:20
// message from yesterday must not read as "today 11:20 PM").
const timeSource = await readFile(new URL('../apps/shared/list_time.ts', import.meta.url), 'utf8');
const { listRowTime } = await import(`data:text/javascript;base64,${Buffer.from(timeSource).toString('base64')}`);
const viewSource = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
const appCssSource = await readFile(new URL('../apps/user-web/src/App.vue', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
const i18nSource = await readFile(new URL('../apps/user-web/src/luno-i18n.ts', import.meta.url), 'utf8');

const OPTS = { tag: 'ko-KR', yesterday: '어제', nowMs: Date.now() };

// Inputs derive from the local calendar so the suite passes in any zone
// (CI runs UTC; fixed +09:00 fixtures broke there while green in KST).
const _pad = (n) => String(n).padStart(2, '0');
const _isoLocal = (d) =>
  `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}T${_pad(d.getHours())}:${_pad(d.getMinutes())}:00`;

test('list rows show clock time today, dates otherwise', () => {
  const now = new Date();
  const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0);
  const yestNoon = new Date(todayNoon.getTime() - 86400000);
  const oldDate = new Date(todayNoon.getTime() - 65 * 86400000);
  const lastYear = new Date(now.getFullYear() - 1, 0, 15, 12, 0);
  assert.match(listRowTime(_isoLocal(todayNoon), OPTS), /오후 \d{2}:\d{2}/);
  assert.equal(listRowTime(_isoLocal(yestNoon), OPTS), '어제');
  const oldOut = listRowTime(_isoLocal(oldDate), OPTS);
  if (oldDate.getFullYear() === now.getFullYear()) {
    assert.match(oldOut, new RegExp(`${oldDate.getMonth() + 1}.*${oldDate.getDate()}`));
    assert.doesNotMatch(oldOut, new RegExp(`${now.getFullYear()}`));
  } else {
    assert.match(
      oldOut,
      new RegExp(`${oldDate.getFullYear()}.*${oldDate.getMonth() + 1}.*${oldDate.getDate()}`),
    );
  }
  assert.match(
    listRowTime(_isoLocal(lastYear), OPTS),
    new RegExp(`${now.getFullYear() - 1}.*1.*15`),
  );
  assert.equal(listRowTime('', OPTS), '');
  assert.equal(listRowTime('not-a-date', OPTS), '');
});

test('chat list binds the day-aware row formatter', () => {
  assert.match(viewSource, /function formatListTime\(iso: string\)[\s\S]{0,400}?listRowTime/);
  assert.ok(viewSource.includes(':format-time="formatListTime"'));
});

test('mvYesterday is translated in all four locales', () => {
  const hits = i18nSource.match(/mvYesterday/g) || [];
  assert.equal(hits.length, 4);
});

test('N badge derives from unread: read-all clears it for good', async () => {
  const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);
  const env = { ADMIN_INITIAL_PASSWORD: 'Worker#Admin1', DEMO_INITIAL_PASSWORD: 'Worker#Demo12' };
  const call = (path, token, method = 'GET', body) => worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
  const reg = await call('auth/register', null, 'POST', { email: 'rn-u@luno-test.local', password: 'Str0ng!Passw0rd', display_name: 'RN', handle: 'rn_user' });
  assert.equal(reg.status, 201);
  const token = (await (await call('auth/login', null, 'POST', { email: 'rn-u@luno-test.local', password: 'Str0ng!Passw0rd' })).json()).access_token;
  const dodo = async () => (await (await call('conversations', token)).json()).conversations.find((c) => c.id.startsWith('conv-dodo-'));
  const fresh = await dodo();
  assert.equal(fresh.badge_n, true);
  assert.equal(fresh.unread_count, 1);
  assert.equal((await call('conversations/read-all', token, 'POST', {})).status, 200);
  const cleared = await dodo();
  assert.equal(cleared.badge_n, false);
  assert.equal(cleared.unread_count, 0);
});

let readSerial = 0;
test('cleared N stays cleared on a fresh isolate (D1 cursors)', async () => {
  const db = makeD1();
  try {
    const apiFor = async () => {
      const { default: worker } = await import(`./cf_worker.js?readtime=${++readSerial}`);
      const env = { ADMIN_INITIAL_PASSWORD: 'Worker#Admin1', DEMO_INITIAL_PASSWORD: 'Worker#Demo12', DB: db };
      return (path, token, method = 'GET', body) => worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }), env);
    };
    const first = await apiFor();
    assert.equal((await first('auth/register', null, 'POST', { email: 'rn-d1@luno-test.local', password: 'Str0ng!Passw0rd', display_name: 'RN', handle: 'rn_d1' })).status, 201);
    const token = (await (await first('auth/login', null, 'POST', { email: 'rn-d1@luno-test.local', password: 'Str0ng!Passw0rd' })).json()).access_token;
    const dodoOn = async (api) => (await (await api('conversations', token)).json()).conversations.find((c) => c.id.startsWith('conv-dodo-'));
    assert.equal((await dodoOn(first)).badge_n, true);
    assert.equal((await first('conversations/read-all', token, 'POST', {})).status, 200);
    const second = await apiFor();
    const relisted = await dodoOn(second);
    assert.equal(relisted.unread_count, 0);
    assert.equal(relisted.badge_n, false);
  } finally { db.raw.close(); }
});

test('seed call durations use zero-padded MM:SS like computed ones', () => {
  for (const padded of ["duration: '09:24'", "duration: '01:35'", "duration: '00:29'"]) {
    assert.ok(workerSource.includes(padded), padded);
  }
});

test('call pills never wrap their labels to two lines', () => {
  assert.match(appCssSource, /\.btn-subaction-pill \{[^}]*white-space: nowrap/);
});
