// Stage 10 (F3): account deletion with a 30-day grace (recover on login,
// hard purge after expiry) and a personal data export carrying read, write
// and delete records.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeD1 } from './test_helpers.mjs';

let f3Serial = 0;
async function f3Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f3=${++f3Serial}`);
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
const GRACE_MS = 30 * 24 * 3600 * 1000;

async function register(api, email) {
  const res = await api('auth/register', 'POST', { email, password: PW, display_name: email.split('@')[0] });
  assert.equal(res.status, 201, `register ${email}`);
  return res.json();
}

async function login(api, email) {
  const res = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(res.status, 200, `login ${email}`);
  return res.json();
}

test('F3: delete validates password, reason and confirm phrase', async () => {
  const db = makeD1();
  try {
    const { api } = await f3Isolate(db);
    const email = 'f3-v@luno-test.local';
    const reg = await register(api, email);
    const s = await login(api, email);
    assert.equal((await api('me', 'DELETE', {}, s.access_token)).status, 400, 'password required');
    assert.equal((await api('me', 'DELETE', { password: 'nope' }, s.access_token)).status, 401, 'wrong password');
    assert.equal((await api('me', 'DELETE', { password: PW }, s.access_token)).status, 400, 'confirm phrase required');
    assert.equal((await api('me', 'DELETE', { password: PW, confirm_text: 'someone-else@x.test' }, s.access_token)).status, 400, 'confirm must equal the email');
    assert.equal((await api('me', 'DELETE', { password: PW, confirm_text: email, reason: 'bogus' }, s.access_token)).status, 400, 'reason from the fixed set');
    assert.equal((await api('me', 'GET', null, s.access_token)).status, 200, 'failed deletes leave everything alive');
    void reg;
  } finally { db.raw.close(); }
});

test('F3: delete schedules grace, login inside recovers', async () => {
  const db = makeD1();
  try {
    const { api } = await f3Isolate(db);
    const email = 'f3-g@luno-test.local';
    const reg = await register(api, email);
    const s1 = await login(api, email);
    const s2 = await login(api, email);
    const del = await api('me', 'DELETE', { password: PW, confirm_text: email, reason: 'privacy' }, s1.access_token);
    assert.equal(del.status, 200);
    const body = await del.json();
    assert.equal(body.status, 'deletion_scheduled');
    assert.ok(Date.parse(body.grace_until) - Date.now() > GRACE_MS - 60000, 'grace_until ~30 days out');
    assert.equal((await api('me', 'GET', null, s1.access_token)).status, 401, 'sessions revoked at request');
    assert.equal((await api('me', 'GET', null, s2.access_token)).status, 401);
    const row = db.raw.prepare('SELECT state, deleted_at, deletion_reason, display_name FROM users WHERE id = ?').get(reg.id);
    assert.equal(row.state, 'deleted');
    assert.ok(row.deleted_at, 'deleted_at stamped');
    assert.equal(row.deletion_reason, 'privacy');
    assert.notEqual(row.display_name, '탈퇴한 사용자', 'profile intact during grace');
    const back = await api('auth/login', 'POST', { email, password: PW });
    assert.equal(back.status, 200, 'login inside grace recovers');
    const bb = await back.json();
    assert.equal(bb.recovered, true);
    const row2 = db.raw.prepare('SELECT state, deleted_at FROM users WHERE id = ?').get(reg.id);
    assert.equal(row2.state, 'active');
    assert.ok(!row2.deleted_at, 'deleted_at cleared');
    assert.equal((await api('me', 'GET', null, bb.access_token)).status, 200);
  } finally { db.raw.close(); }
});

test('F3: expired grace purges everything on next login', async () => {
  const db = makeD1();
  try {
    const { api } = await f3Isolate(db, { DURABLE_CONVERSATIONS: 'true' });
    const email = 'f3-x@luno-test.local';
    const reg = await register(api, email);
    const f = await register(api, 'f3-xf@luno-test.local');
    const s = await login(api, email);
    await api('friends', 'POST', { friend_id: f.id }, s.access_token);
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Purge Room', member_ids: [f.id] }, s.access_token)).json();
    await api(`conversations/${room.id}/messages`, 'POST', { body: 'bye world' }, s.access_token);
    await api('me', 'DELETE', { password: PW, confirm_text: email }, s.access_token);
    const past = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString();
    db.raw.exec(`UPDATE users SET deleted_at = '${past}' WHERE id = '${reg.id}'`);
    assert.equal((await api('auth/login', 'POST', { email, password: PW })).status, 401, 'expired account gone');
    const row = db.raw.prepare('SELECT state, display_name, password_hash, deletion_reason FROM users WHERE id = ?').get(reg.id);
    assert.equal(row.state, 'deleted');
    assert.equal(row.display_name, '탈퇴한 사용자');
    assert.equal(row.password_hash, 'pbkdf2$deleted');
    assert.ok(!row.deletion_reason, 'reason purged');
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM luno_sessions WHERE user_id = ?').get(reg.id).n, 0, 'sessions purged');
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM friends WHERE user_id = ? OR friend_id = ?').get(reg.id, reg.id).n, 0, 'friendships purged');
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM luno_messages WHERE sender_id = ?').get(reg.id).n, 0, 'messages purged');
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM wallets WHERE user_id = ?').get(reg.id).n, 0, 'wallet purged');
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM luno_conversation_members WHERE user_id = ?').get(reg.id).n, 0, 'memberships purged');
  } finally { db.raw.close(); }
});

test('F3: export carries read, write and delete records', async () => {
  const db = makeD1();
  try {
    const { api } = await f3Isolate(db);
    const email = 'f3-e@luno-test.local';
    await register(api, email);
    const s = await login(api, email);
    const f = await register(api, 'f3-ef@luno-test.local');
    const sf = await login(api, 'f3-ef@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Export Room', member_ids: [f.id] }, s.access_token)).json();
    await api(`conversations/${room.id}/messages`, 'POST', { body: 'export me' }, s.access_token);
    const hist = await (await api(`conversations/${room.id}/messages`, 'GET', null, s.access_token)).json();
    await api(`conversations/${room.id}/read`, 'POST', { sequence: hist.messages[hist.messages.length - 1].sequence }, s.access_token);
    void sf;
    const exp = await (await api('me/export-data', 'GET', null, s.access_token)).json();
    assert.equal(exp.export_version, '1.1');
    assert.ok(Array.isArray(exp.read_cursors) && exp.read_cursors.length >= 1, 'read records');
    assert.ok((exp.messages || []).some((m) => m.body === 'export me'), 'write records');
    assert.ok(Array.isArray(exp.sessions), 'device records');
    assert.ok(Array.isArray(exp.audit_trail), 'delete/manage records');
    assert.equal(exp.deletion.state, 'active');
  } finally { db.raw.close(); }
});

test('F3: clients send reason and confirm, show recovery', async () => {
  const view = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
  const auth = await readFile(new URL('../apps/user-web/src/views/AuthView.vue', import.meta.url), 'utf8');
  const session = await readFile(new URL('../mobile/flutter_app/lib/state/session.dart', import.meta.url), 'utf8');
  assert.ok(view.includes('confirm_text') && view.includes('deletion_scheduled'), 'web confirm flow');
  assert.ok(auth.includes('recovered'), 'web recovery note');
  // F20: the app notice rides the ARB key, not a hardcoded string.
  assert.ok(session.includes('confirm_text') && session.includes('msgDeleteScheduled'), 'app confirm flow');
});
