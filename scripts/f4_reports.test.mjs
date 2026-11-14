// Stage 10 (F4): reports persist to D1 with processing state, reporters
// can list their own history, web + app ship report screens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeD1 } from './test_helpers.mjs';

let f4Serial = 0;
async function f4Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f4=${++f4Serial}`);
  const env = { ...(db ? { DB: db } : {}), ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api };
}

const PW = 'Str0ng!Passw0rd';

async function register(api, email) {
  const res = await api('auth/register', 'POST', { email, password: PW, display_name: email.split('@')[0] });
  assert.equal(res.status, 201);
  return res.json();
}

async function login(api, email) {
  const res = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(res.status, 200);
  return res.json();
}

async function makeAdmin(db, email = 'f4-admin@luno-test.local') {
  const plain = await f4Isolate(db);
  const reg = await register(plain.api, email);
  const { api } = await f4Isolate(db, { ADMIN_USER_IDS: reg.id });
  const s = await login(api, email);
  return { api, token: s.access_token };
}

test('F4: reports persist and moderation flips state durably', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const a = await register(admin.api, 'f4-a@luno-test.local');
    const b = await register(admin.api, 'f4-b@luno-test.local');
    const sa = await login(admin.api, 'f4-a@luno-test.local');
    assert.equal((await admin.api('reports', 'POST', { subject_user_id: 'ghost', category: 'spam' }, sa.access_token)).status, 400, 'unknown subject');
    const rep = await admin.api('reports', 'POST', { subject_user_id: b.id, category: 'spam', details: 'ads daily' }, sa.access_token);
    assert.equal(rep.status, 201);
    const id = (await rep.json()).id;
    const row = db.raw.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    assert.equal(row.status, 'open');
    assert.equal(row.reason, 'spam');
    assert.equal(row.details, 'ads daily');
    const mod = await admin.api('admin/moderation/actions', 'POST', { subject_user_id: b.id, action: 'warn', reason: 'noted', report_id: id }, admin.token);
    assert.equal(mod.status, 200);
    assert.equal(db.raw.prepare('SELECT status FROM reports WHERE id = ?').get(id).status, 'resolved');
    const adminId = db.raw.prepare('SELECT id FROM users WHERE email = ?').get('f4-admin@luno-test.local').id;
    const cold = await f4Isolate(db, { ADMIN_USER_IDS: adminId });
    const list = await (await cold.api('admin/reports', 'GET', null, (await login(cold.api, 'f4-admin@luno-test.local')).access_token)).json();
    assert.ok((list.reports || []).some((r) => r.id === id && r.state === 'resolved'), 'admin history durable');
  } finally { db.raw.close(); }
});

test('F4: reporters list their own history', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const a = await register(admin.api, 'f4-c@luno-test.local');
    const b = await register(admin.api, 'f4-d@luno-test.local');
    const sa = await login(admin.api, 'f4-c@luno-test.local');
    const sb = await login(admin.api, 'f4-d@luno-test.local');
    await admin.api('reports', 'POST', { subject_user_id: b.id, category: 'abuse' }, sa.access_token);
    const mine = await (await admin.api('reports/mine', 'GET', null, sa.access_token)).json();
    assert.equal(mine.reports.length, 1);
    assert.equal(mine.reports[0].state, 'open');
    assert.equal(mine.reports[0].subject_user_id, b.id);
    const theirs = await (await admin.api('reports/mine', 'GET', null, sb.access_token)).json();
    assert.equal(theirs.reports.length, 0, 'no cross-user leak');
    const cold = await f4Isolate(db);
    const sc = await login(cold.api, 'f4-c@luno-test.local');
    assert.equal((await (await cold.api('reports/mine', 'GET', null, sc.access_token)).json()).reports.length, 1, 'history durable');
    void a;
  } finally { db.raw.close(); }
});

test('F4: web and app ship report screens', async () => {
  const view = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
  const modal = await readFile(new URL('../apps/user-web/src/components/SettingsModal.vue', import.meta.url), 'utf8');
  const session = await readFile(new URL('../mobile/flutter_app/lib/state/session.dart', import.meta.url), 'utf8');
  assert.ok(view.includes('/api/v1/reports') && view.includes('mvReportUser'), 'web report dialog posts');
  assert.ok(modal.includes('reports/mine') || view.includes('reports/mine'), 'web history lists mine');
  assert.ok(session.includes('/api/v1/reports') && session.includes('reports/mine'), 'app reports and lists');
});
