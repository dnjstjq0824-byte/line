// Stage 9 (LLM track L-01..L-11, L-15, L-17): bot accounts and bot
// plumbing, verified with real sqlite isolates. Fake LLM only — no real
// model is ever called. One section per card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeD1 } from './test_helpers.mjs';

let llmSerial = 0;
async function llmIsolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?llm=${++llmSerial}`);
  const env = { ...(db ? { DB: db } : {}), ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api, outbox: mod.recoveryMailOutbox, env };
}

async function register(api, email, password = 'Str0ng!Passw0rd', extra = {}) {
  const res = await api('auth/register', 'POST', { email, password, display_name: email.split('@')[0], ...extra });
  assert.equal(res.status, 201, `register ${email}: ${res.status}`);
  return res.json();
}

async function registerAndLogin(api, email, password = 'Str0ng!Passw0rd') {
  const reg = await register(api, email, password);
  const login = await api('auth/login', 'POST', { email, password });
  assert.equal(login.status, 200, `login ${email}`);
  const body = await login.json();
  return { id: reg.id, token: body.access_token };
}

async function makeAdmin(db, email = 'llm-admin@luno-test.local') {
  const plain = await llmIsolate(db);
  const reg = await register(plain.api, email);
  const { api } = await llmIsolate(db, { ADMIN_USER_IDS: reg.id });
  const login = await api('auth/login', 'POST', { email, password: 'Str0ng!Passw0rd' });
  assert.equal(login.status, 200, 'admin login');
  const body = await login.json();
  assert.equal(body.role, 'admin');
  return { api, token: body.access_token, id: reg.id };
}

// ---------- L-01: bot accounts ----------

test('L-01: users.kind defaults to user for new and legacy rows', async () => {
  const db = makeD1();
  try {
    const { api } = await llmIsolate(db);
    const reg = await register(api, 'l01-kind@luno-test.local');
    const row = db.raw.prepare('SELECT kind FROM users WHERE id = ?').get(reg.id);
    assert.equal(row.kind, 'user');
    const me = await registerAndLogin(api, 'l01-kindme@luno-test.local');
    const profile = await (await api('me', 'GET', null, me.token)).json();
    assert.equal(profile.kind, 'user');
  } finally { db.raw.close(); }
  // Legacy table without the column (makeD1's old shape) gains it with a
  // user backfill on boot.
  const old = makeD1();
  try {
    old.raw.exec(`INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
      VALUES ('legacy-1', 'legacy@luno-test.local', 'pbkdf2$100000$salt$hash', 'Legacy', '2026-01-01', '2026-01-01')`);
    const legacy = await llmIsolate(old);
    await register(legacy.api, 'l01-new@luno-test.local');
    const row = old.raw.prepare('SELECT kind FROM users WHERE id = ?').get('legacy-1');
    assert.equal(row.kind, 'user');
  } finally { old.raw.close(); }
});

test('L-01: public signup cannot create a bot', async () => {
  const db = makeD1();
  try {
    const { api } = await llmIsolate(db);
    const reg = await register(api, 'l01-nosignup@luno-test.local', 'Str0ng!Passw0rd', { kind: 'bot' });
    const row = db.raw.prepare('SELECT kind FROM users WHERE id = ?').get(reg.id);
    assert.equal(row.kind, 'user');
  } finally { db.raw.close(); }
});

test('L-01: only admins can issue bots, with handle rules', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const user = await registerAndLogin(admin.api, 'l01-user@luno-test.local');
    assert.equal((await admin.api('admin/bots', 'POST', { display_name: 'Nope' })).status, 401, 'no token');
    assert.equal((await admin.api('admin/bots', 'POST', { display_name: 'Nope' }, user.token)).status, 403, 'user forbidden');
    assert.equal((await admin.api('admin/bots', 'POST', { display_name: 'Bad Handle', handle: 'NOPE!' }, admin.token)).status, 400, 'handle rule');
    assert.equal((await admin.api('admin/bots', 'POST', { display_name: 'Reserved', handle: 'admin' }, admin.token)).status, 409, 'reserved handle');
    const res = await admin.api('admin/bots', 'POST', { display_name: 'Helper Bot', handle: 'helper_bot' }, admin.token);
    assert.equal(res.status, 201);
    const bot = await res.json();
    assert.equal(bot.kind, 'bot');
    assert.equal(bot.handle, 'helper_bot');
    const row = db.raw.prepare('SELECT kind, password_hash FROM users WHERE id = ?').get(bot.id);
    assert.equal(row.kind, 'bot');
    assert.equal(row.password_hash, '', 'bots carry no password material');
    const dup = await admin.api('admin/bots', 'POST', { display_name: 'Dup', handle: 'helper_bot' }, admin.token);
    assert.equal(dup.status, 409, 'duplicate handle');
    const auto = await admin.api('admin/bots', 'POST', { display_name: 'Auto Bot' }, admin.token);
    assert.equal(auto.status, 201, 'handle auto-allocated');
    assert.match((await auto.json()).handle, /^[a-z0-9_.]{3,20}$/);
  } finally { db.raw.close(); }
});

test('L-01: bots cannot log in with a password', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const bot = await (await admin.api('admin/bots', 'POST', { display_name: 'Login Bot', handle: 'login_bot' }, admin.token)).json();
    const res = await admin.api('auth/login', 'POST', { email: `${bot.handle}@bots.invalid`, password: 'whatever-password' });
    assert.equal(res.status, 401);
    const byHandle = await admin.api('auth/login', 'POST', { email: 'login_bot', password: 'whatever-password' });
    assert.equal(byHandle.status, 401);
  } finally { db.raw.close(); }
});

test('L-01: bot recovery answers quietly and creates nothing', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const { api, outbox } = await llmIsolate(db, { RECOVERY_MAIL_PROVIDER: 'mock', ADMIN_USER_IDS: admin.id });
    const login = await api('auth/login', 'POST', { email: 'llm-admin@luno-test.local', password: 'Str0ng!Passw0rd' });
    const adminToken = (await login.json()).access_token;
    const bot = await (await api('admin/bots', 'POST', { display_name: 'Recover Bot', handle: 'recover_bot' }, adminToken)).json();
    const botEmail = `${bot.handle}@bots.invalid`;
    const res = await api('auth/recover', 'POST', { email: botEmail });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.status, 'recovery_token_sent_if_account_exists');
    assert.equal(body.recovery_code, undefined);
    assert.equal([...outbox].filter((m) => m.email === botEmail).length, 0, 'no mail to bots');
    const count = db.raw.prepare('SELECT COUNT(*) AS n FROM luno_recovery_challenges').get();
    assert.equal(count.n, 0, 'no challenge row for bots');
  } finally { db.raw.close(); }
});

test('L-01: friends and messages carry the sender kind', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const a = await registerAndLogin(admin.api, 'l01-a@luno-test.local');
    const b = await registerAndLogin(admin.api, 'l01-b@luno-test.local');
    const bot = await (await admin.api('admin/bots', 'POST', { display_name: 'Kind Bot', handle: 'kind_bot' }, admin.token)).json();
    const added = await admin.api('friends', 'POST', { handle: 'kind_bot' }, a.token);
    assert.equal(added.status, 201);
    const friends = await (await admin.api('friends', 'GET', null, a.token)).json();
    const entry = (friends.friends || []).find((f) => f.id === bot.id);
    assert.ok(entry, 'bot listed as friend');
    assert.equal(entry.kind, 'bot');
    const room = await (await admin.api('conversations', 'POST', { kind: 'group', title: 'Kind Room', member_ids: [b.id] }, a.token)).json();
    assert.equal((await admin.api(`conversations/${room.id}/messages`, 'POST', { client_id: 'k-1', body: 'hi' }, a.token)).status, 201);
    const history = await (await admin.api(`conversations/${room.id}/messages`, 'GET', null, b.token)).json();
    for (const m of history.messages) assert.equal(m.sender_kind, 'user');
  } finally { db.raw.close(); }
});

test('L-01: web profile and bubbles badge bots', async () => {
  const panel = await readFile(new URL('../apps/user-web/src/components/FriendPanel.vue', import.meta.url), 'utf8');
  const pane = await readFile(new URL('../apps/user-web/src/components/MessagePane.vue', import.meta.url), 'utf8');
  const shell = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
  const css = await readFile(new URL('../apps/user-web/src/App.vue', import.meta.url), 'utf8');
  assert.ok(css.includes('.badge-bot'), 'bot badge style exists');
  assert.ok(panel.includes("kind === 'bot'") && panel.includes('badge-bot'), 'friend rows badge bots');
  assert.ok(pane.includes('sender_kind') && pane.includes('badge-bot'), 'bubbles badge bot senders');
  assert.ok(shell.includes('badge-bot'), 'profile preview badges bots');
});
