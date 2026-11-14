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

// ---------- L-17: kill switch + allowlist (built before L-02: routing depends on it) ----------

test('L-17: switch off denies everything by default', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const off = await (await admin.api('admin/llm/allowlist', 'GET', null, admin.token)).json();
    assert.equal(off.enabled, false, 'default off');
    assert.deepEqual(off.rooms, []);
    assert.deepEqual(off.users, []);
    const { api } = await llmIsolate(db, { LLM_ENABLED: 'true', ADMIN_USER_IDS: admin.id });
    const login = await api('auth/login', 'POST', { email: 'llm-admin@luno-test.local', password: 'Str0ng!Passw0rd' });
    const on = await (await api('admin/llm/allowlist', 'GET', null, (await login.json()).access_token)).json();
    assert.equal(on.enabled, true, 'explicit opt-in');
  } finally { db.raw.close(); }
});

test('L-17: allowlist CRUD is admin-only and validated', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const user = await registerAndLogin(admin.api, 'l17-user@luno-test.local');
    assert.equal((await admin.api('admin/llm/allowlist', 'GET')).status, 401, 'no token');
    assert.equal((await admin.api('admin/llm/allowlist', 'GET', null, user.token)).status, 403, 'user forbidden');
    assert.equal((await admin.api('admin/llm/allowlist', 'POST', { kind: 'room', ref_id: 'r1' }, user.token)).status, 403);
    assert.equal((await admin.api('admin/llm/allowlist', 'POST', { kind: 'planet', ref_id: 'r1' }, admin.token)).status, 400, 'bad kind');
    assert.equal((await admin.api('admin/llm/allowlist', 'POST', { kind: 'room', ref_id: '' }, admin.token)).status, 400, 'empty ref');
    assert.equal((await admin.api('admin/llm/allowlist', 'POST', { kind: 'room', ref_id: 'room-1' }, admin.token)).status, 201);
    assert.equal((await admin.api('admin/llm/allowlist', 'POST', { kind: 'user', ref_id: user.id }, admin.token)).status, 201);
    assert.equal((await admin.api('admin/llm/allowlist', 'POST', { kind: 'room', ref_id: 'room-1' }, admin.token)).status, 200, 'idempotent re-add');
    const list = await (await admin.api('admin/llm/allowlist', 'GET', null, admin.token)).json();
    assert.deepEqual(list.rooms, ['room-1']);
    assert.deepEqual(list.users, [user.id]);
    assert.equal((await admin.api('admin/llm/allowlist', 'DELETE', { kind: 'room', ref_id: 'room-1' }, admin.token)).status, 200);
    const after = await (await admin.api('admin/llm/allowlist', 'GET', null, admin.token)).json();
    assert.deepEqual(after.rooms, []);
  } finally { db.raw.close(); }
});

// ---------- L-06: scope tokens (built before L-02: routing and queue depend on it) ----------

async function mintBotToken(api, adminToken, botId, extra = {}) {
  const res = await api(`admin/bots/${botId}/tokens`, 'POST', { rooms: [], ops: ['read'], ...extra }, adminToken);
  assert.equal(res.status, 201, `mint: ${res.status}`);
  return res.json();
}

test('L-06: mint validates bot, rooms, ops and ttl', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const user = await registerAndLogin(admin.api, 'l06-user@luno-test.local');
    const bot = await (await admin.api('admin/bots', 'POST', { display_name: 'Mint Bot', handle: 'mint_bot' }, admin.token)).json();
    assert.equal((await admin.api(`admin/bots/${bot.id}/tokens`, 'POST', { rooms: ['r'], ops: ['read'] })).status, 401, 'no token');
    assert.equal((await admin.api(`admin/bots/${bot.id}/tokens`, 'POST', { rooms: ['r'], ops: ['read'] }, user.token)).status, 403, 'user forbidden');
    assert.equal((await admin.api('admin/bots/no-such-bot/tokens', 'POST', { rooms: ['r'], ops: ['read'] }, admin.token)).status, 404, 'unknown bot');
    assert.equal((await admin.api(`admin/bots/${user.id}/tokens`, 'POST', { rooms: ['r'], ops: ['read'] }, admin.token)).status, 400, 'humans take no bot tokens');
    assert.equal((await admin.api(`admin/bots/${bot.id}/tokens`, 'POST', { rooms: [], ops: ['read'] }, admin.token)).status, 400, 'rooms required');
    assert.equal((await admin.api(`admin/bots/${bot.id}/tokens`, 'POST', { rooms: ['r'], ops: [] }, admin.token)).status, 400, 'ops required');
    assert.equal((await admin.api(`admin/bots/${bot.id}/tokens`, 'POST', { rooms: ['r'], ops: ['admin'] }, admin.token)).status, 400, 'unknown op');
    assert.equal((await admin.api(`admin/bots/${bot.id}/tokens`, 'POST', { rooms: ['r'], ops: ['read'], ttl_sec: 10 }, admin.token)).status, 400, 'ttl too small');
    assert.equal((await admin.api(`admin/bots/${bot.id}/tokens`, 'POST', { rooms: ['r'], ops: ['read'], ttl_sec: 99999999 }, admin.token)).status, 400, 'ttl too big');
    const minted = await mintBotToken(admin.api, admin.token, bot.id, { rooms: ['room-1'], ops: ['read', 'post'] });
    assert.match(minted.token, /^cf-bot-/);
    assert.ok(minted.expires_at > Date.now(), 'future expiry');
    assert.ok(!('token_hash' in minted), 'no hash in response');
  } finally { db.raw.close(); }
});

test('L-06: scope gates rooms and ops independently', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const a = await registerAndLogin(admin.api, 'l06-a@luno-test.local');
    const bot = await (await admin.api('admin/bots', 'POST', { display_name: 'Scope Bot', handle: 'scope_bot' }, admin.token)).json();
    const roomA = await (await admin.api('conversations', 'POST', { kind: 'group', title: 'A', member_ids: [bot.id] }, a.token)).json();
    const roomB = await (await admin.api('conversations', 'POST', { kind: 'group', title: 'B', member_ids: [bot.id] }, a.token)).json();
    const b = await registerAndLogin(admin.api, 'l06-b@luno-test.local');
    const roomC = await (await admin.api('conversations', 'POST', { kind: 'group', title: 'C', member_ids: [b.id] }, a.token)).json();
    await admin.api(`conversations/${roomA.id}/messages`, 'POST', { body: 'hello' }, a.token);
    const readTok = (await mintBotToken(admin.api, admin.token, bot.id, { rooms: [roomA.id, roomC.id], ops: ['read'] })).token;
    const postTok = (await mintBotToken(admin.api, admin.token, bot.id, { rooms: [roomA.id], ops: ['post'] })).token;
    assert.equal((await admin.api(`conversations/${roomA.id}/messages`, 'GET', null, readTok)).status, 200, 'read in scope');
    assert.equal((await admin.api(`conversations/${roomB.id}/messages`, 'GET', null, readTok)).status, 403, 'read out of scope');
    assert.equal((await admin.api(`conversations/${roomC.id}/messages`, 'GET', null, readTok)).status, 404, 'membership still applies to scoped rooms');
    assert.equal((await admin.api(`conversations/${roomA.id}/messages`, 'POST', { body: 'x' }, readTok)).status, 403, 'post without op');
    assert.equal((await admin.api(`conversations/${roomA.id}/messages`, 'POST', { body: 'bot here' }, postTok)).status, 201, 'post in scope');
    assert.equal((await admin.api(`conversations/${roomA.id}/messages`, 'GET', null, postTok)).status, 403, 'read without op');
    assert.equal((await admin.api(`conversations/${roomB.id}/messages`, 'POST', { body: 'x' }, postTok)).status, 403, 'post out of scope');
    assert.equal((await admin.api('conversations', 'GET', null, readTok)).status, 403, 'no room listing for bots');
    assert.equal((await admin.api('me', 'GET', null, readTok)).status, 403, 'no profile for bots');
  } finally { db.raw.close(); }
});

test('L-06: revoke and expiry take effect immediately', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const a = await registerAndLogin(admin.api, 'l06-c@luno-test.local');
    const bot = await (await admin.api('admin/bots', 'POST', { display_name: 'Short Bot', handle: 'short_bot' }, admin.token)).json();
    const room = await (await admin.api('conversations', 'POST', { kind: 'group', title: 'C', member_ids: [bot.id] }, a.token)).json();
    const t1 = await mintBotToken(admin.api, admin.token, bot.id, { rooms: [room.id], ops: ['read', 'post'] });
    assert.equal((await admin.api(`conversations/${room.id}/messages`, 'GET', null, t1.token)).status, 200);
    assert.equal((await admin.api(`admin/bots/${bot.id}/tokens/${t1.id}`, 'DELETE', null, admin.token)).status, 200);
    assert.equal((await admin.api(`conversations/${room.id}/messages`, 'GET', null, t1.token)).status, 401, 'revoked immediately');
    const t2 = await mintBotToken(admin.api, admin.token, bot.id, { rooms: [room.id], ops: ['read'] });
    db.raw.exec(`UPDATE luno_bot_tokens SET expires_at = 1 WHERE id = '${t2.id}'`);
    assert.equal((await admin.api(`conversations/${room.id}/messages`, 'GET', null, t2.token)).status, 401, 'expired rejected');
  } finally { db.raw.close(); }
});

test('L-06: bot tokens stop at non-message APIs', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    await registerAndLogin(admin.api, 'l06-d@luno-test.local');
    const bot = await (await admin.api('admin/bots', 'POST', { display_name: 'Narrow Bot', handle: 'narrow_bot' }, admin.token)).json();
    const tok = (await mintBotToken(admin.api, admin.token, bot.id, { rooms: ['room-x'], ops: ['read', 'post', 'propose'] })).token;
    assert.equal((await admin.api('translate', 'POST', { text: 'hi', target_lang: 'en' }, tok)).status, 403);
    assert.equal((await admin.api('admin/stats', 'GET', null, tok)).status, 403);
  } finally { db.raw.close(); }
});

// ---------- L-07: job queue (built before L-02: routing enqueues into it) ----------

async function seedJob(db, botId, roomId, extra = {}) {
  const id = `job-${Math.random().toString(36).slice(2, 10)}`;
  db.raw.exec(`INSERT INTO luno_bot_jobs (id, bot_id, room_id, kind, payload_json, status, attempts, max_attempts, locked_by, lock_expires_at, created_at, updated_at)
    VALUES ('${id}', '${botId}', '${roomId}', '${extra.kind || 'mention'}', '{}', '${extra.status || 'queued'}', ${extra.attempts || 0}, 5, ${extra.locked_by ? `'${extra.locked_by}'` : 'NULL'}, ${extra.lock_expires_at || 0}, datetime('now'), datetime('now'))`);
  return id;
}

test('L-07: claim assigns queued jobs oldest-first, one runner each', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const bot = await (await admin.api('admin/bots', 'POST', { display_name: 'Job Bot', handle: 'job_bot' }, admin.token)).json();
    const t1 = (await mintBotToken(admin.api, admin.token, bot.id, { rooms: ['room-1'], ops: ['read'] })).token;
    const t2 = (await mintBotToken(admin.api, admin.token, bot.id, { rooms: ['room-1'], ops: ['read'] })).token;
    const j1 = await seedJob(db, bot.id, 'room-1');
    const j2 = await seedJob(db, bot.id, 'room-1');
    const c1 = await (await admin.api('bot/jobs/claim', 'POST', {}, t1)).json();
    assert.equal(c1.job.id, j1, 'oldest first');
    assert.equal(c1.job.attempts, 1);
    const c2 = await (await admin.api('bot/jobs/claim', 'POST', {}, t2)).json();
    assert.equal(c2.job.id, j2, 'second runner gets the next job');
    const c3 = await (await admin.api('bot/jobs/claim', 'POST', {}, t1)).json();
    assert.equal(c3.job, null, 'nothing left to claim');
    const row = db.raw.prepare('SELECT status, attempts FROM luno_bot_jobs WHERE id = ?').get(j1);
    assert.equal(row.status, 'running');
    assert.equal(row.attempts, 1);
  } finally { db.raw.close(); }
});

test('L-07: expired locks are reclaimed, exhausted jobs fail out', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const bot = await (await admin.api('admin/bots', 'POST', { display_name: 'Lock Bot', handle: 'lock_bot' }, admin.token)).json();
    const t1 = (await mintBotToken(admin.api, admin.token, bot.id, { rooms: ['room-1'], ops: ['read'] })).token;
    const t2 = (await mintBotToken(admin.api, admin.token, bot.id, { rooms: ['room-1'], ops: ['read'] })).token;
    const j1 = await seedJob(db, bot.id, 'room-1');
    await admin.api('bot/jobs/claim', 'POST', {}, t1);
    db.raw.exec(`UPDATE luno_bot_jobs SET lock_expires_at = 1 WHERE id = '${j1}'`);
    const re = await (await admin.api('bot/jobs/claim', 'POST', {}, t2)).json();
    assert.equal(re.job.id, j1, 'expired lock reclaimed by another runner');
    assert.equal(re.job.attempts, 2);
    const jx = await seedJob(db, bot.id, 'room-1', { status: 'running', attempts: 5, locked_by: 'dead', lock_expires_at: 1 });
    const none = await (await admin.api('bot/jobs/claim', 'POST', {}, t1)).json();
    assert.equal(none.job, null);
    const xrow = db.raw.prepare('SELECT status FROM luno_bot_jobs WHERE id = ?').get(jx);
    assert.equal(xrow.status, 'failed', 'exhausted jobs fail out');
  } finally { db.raw.close(); }
});

test('L-07: only the lock holder completes, done and failed are terminal', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const bot = await (await admin.api('admin/bots', 'POST', { display_name: 'Done Bot', handle: 'done_bot' }, admin.token)).json();
    const t1 = (await mintBotToken(admin.api, admin.token, bot.id, { rooms: ['room-1'], ops: ['read'] })).token;
    const t2 = (await mintBotToken(admin.api, admin.token, bot.id, { rooms: ['room-1'], ops: ['read'] })).token;
    const j1 = await seedJob(db, bot.id, 'room-1');
    const j2 = await seedJob(db, bot.id, 'room-1');
    await admin.api('bot/jobs/claim', 'POST', {}, t1);
    assert.equal((await admin.api(`bot/jobs/${j1}/complete`, 'POST', { status: 'done' }, t2)).status, 409, 'non-holder cannot complete');
    assert.equal((await admin.api(`bot/jobs/${j1}/complete`, 'POST', { status: 'done' }, t1)).status, 200);
    assert.equal((await admin.api(`bot/jobs/${j1}/complete`, 'POST', { status: 'done' }, t1)).status, 409, 'no double complete');
    await admin.api('bot/jobs/claim', 'POST', {}, t1);
    assert.equal((await admin.api(`bot/jobs/${j2}/complete`, 'POST', { status: 'failed', error: 'boom' }, t1)).status, 200);
    const row = db.raw.prepare('SELECT status FROM luno_bot_jobs WHERE id = ?').get(j2);
    assert.equal(row.status, 'failed');
    const c = await (await admin.api('bot/jobs/claim', 'POST', {}, t2)).json();
    assert.equal(c.job, null, 'terminal jobs never reclaimed');
  } finally { db.raw.close(); }
});

test('L-07: claim respects token rooms and bot-only access', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const user = await registerAndLogin(admin.api, 'l07-user@luno-test.local');
    const bot = await (await admin.api('admin/bots', 'POST', { display_name: 'Scope Job Bot', handle: 'scopejob_bot' }, admin.token)).json();
    await seedJob(db, bot.id, 'room-9');
    const tok = (await mintBotToken(admin.api, admin.token, bot.id, { rooms: ['room-1'], ops: ['read'] })).token;
    const c = await (await admin.api('bot/jobs/claim', 'POST', {}, tok)).json();
    assert.equal(c.job, null, 'out-of-scope rooms invisible');
    assert.equal((await admin.api('bot/jobs/claim', 'POST', {}, user.token)).status, 403, 'humans cannot claim bot jobs');
  } finally { db.raw.close(); }
});

// ---------- L-02: mention -> bot routing ----------

async function allowRoomUser(api, adminToken, roomId, userId) {
  await api('admin/llm/allowlist', 'POST', { kind: 'room', ref_id: roomId }, adminToken);
  await api('admin/llm/allowlist', 'POST', { kind: 'user', ref_id: userId }, adminToken);
}

function jobCount(db, botId) {
  return db.raw.prepare('SELECT COUNT(*) AS n FROM luno_bot_jobs WHERE bot_id = ?').get(botId).n;
}

test('L-02: bot mention creates exactly one claimable job', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const { api } = await llmIsolate(db, { LLM_ENABLED: 'true', ADMIN_USER_IDS: admin.id });
    const login = async (email) => (await (await api('auth/login', 'POST', { email, password: 'Str0ng!Passw0rd' })).json()).access_token;
    const adminTok = await login('llm-admin@luno-test.local');
    const a = await registerAndLogin(api, 'l02-a@luno-test.local');
    const bot = await (await api('admin/bots', 'POST', { display_name: 'Mention Bot', handle: 'mention_bot' }, adminTok)).json();
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Mention Room', member_ids: [bot.id] }, a.token)).json();
    await allowRoomUser(api, adminTok, room.id, a.id);
    const post = await api(`conversations/${room.id}/messages`, 'POST', { body: 'hey @bot', metadata: { mentions: [bot.id] } }, a.token);
    assert.equal(post.status, 201);
    assert.equal(jobCount(db, bot.id), 1, 'one mention, one job');
    const tok = (await mintBotToken(api, adminTok, bot.id, { rooms: [room.id], ops: ['read'] })).token;
    const claimed = await (await api('bot/jobs/claim', 'POST', {}, tok)).json();
    assert.equal(claimed.job.kind, 'mention');
    assert.equal(claimed.job.room_id, room.id);
    assert.equal(claimed.job.payload.author_id, a.id);
    assert.ok(claimed.job.payload.message_id, 'payload carries the message');
  } finally { db.raw.close(); }
});

test('L-02: retries and repeated ids never duplicate jobs', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const { api } = await llmIsolate(db, { LLM_ENABLED: 'true', ADMIN_USER_IDS: admin.id });
    const adminTok = (await (await api('auth/login', 'POST', { email: 'llm-admin@luno-test.local', password: 'Str0ng!Passw0rd' })).json()).access_token;
    const a = await registerAndLogin(api, 'l02-b@luno-test.local');
    const bot = await (await api('admin/bots', 'POST', { display_name: 'Dup Bot', handle: 'dup_bot' }, adminTok)).json();
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Dup Room', member_ids: [bot.id] }, a.token)).json();
    await allowRoomUser(api, adminTok, room.id, a.id);
    const body = { body: 'ping', client_id: 'dup-1', metadata: { mentions: [bot.id, bot.id] } };
    assert.equal((await api(`conversations/${room.id}/messages`, 'POST', body, a.token)).status, 201);
    assert.equal((await api(`conversations/${room.id}/messages`, 'POST', body, a.token)).status, 200, 'client retry deduped');
    assert.equal(jobCount(db, bot.id), 1, 'still one job');
  } finally { db.raw.close(); }
});

test('L-02: non-member bots, unlisted rooms/authors and humans route nothing', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const { api } = await llmIsolate(db, { LLM_ENABLED: 'true', ADMIN_USER_IDS: admin.id });
    const adminTok = (await (await api('auth/login', 'POST', { email: 'llm-admin@luno-test.local', password: 'Str0ng!Passw0rd' })).json()).access_token;
    const a = await registerAndLogin(api, 'l02-c@luno-test.local');
    const b = await registerAndLogin(api, 'l02-d@luno-test.local');
    const bot = await (await api('admin/bots', 'POST', { display_name: 'Out Bot', handle: 'out_bot' }, adminTok)).json();
    // Non-member: mention stripped at post, nothing enqueued.
    const solo = await (await api('conversations', 'POST', { kind: 'group', title: 'Solo', member_ids: [b.id] }, a.token)).json();
    await allowRoomUser(api, adminTok, solo.id, a.id);
    const m1 = await (await api(`conversations/${solo.id}/messages`, 'POST', { body: 'yo', metadata: { mentions: [bot.id] } }, a.token)).json();
    assert.deepEqual(m1.message.metadata?.mentions || m1.metadata?.mentions || [], [], 'non-member mention stripped');
    assert.equal(jobCount(db, bot.id), 0);
    // Member but unlisted room, then unlisted author.
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'Gated', member_ids: [bot.id, b.id] }, a.token)).json();
    await api('admin/llm/allowlist', 'POST', { kind: 'user', ref_id: a.id }, adminTok);
    await api(`conversations/${room.id}/messages`, 'POST', { body: 'ping', metadata: { mentions: [bot.id] } }, a.token);
    assert.equal(jobCount(db, bot.id), 0, 'unlisted room ignored');
    await api('admin/llm/allowlist', 'POST', { kind: 'room', ref_id: room.id }, adminTok);
    await api('admin/llm/allowlist', 'DELETE', { kind: 'user', ref_id: a.id }, adminTok);
    await api(`conversations/${room.id}/messages`, 'POST', { body: 'ping', metadata: { mentions: [bot.id] } }, a.token);
    assert.equal(jobCount(db, bot.id), 0, 'unlisted author ignored');
    // Human mentions and @all never page bots.
    await api('admin/llm/allowlist', 'POST', { kind: 'user', ref_id: a.id }, adminTok);
    await api(`conversations/${room.id}/messages`, 'POST', { body: 'hi human', metadata: { mentions: [b.id] } }, a.token);
    await api(`conversations/${room.id}/messages`, 'POST', { body: 'hi all', metadata: { mentions: ['all'] } }, a.token);
    assert.equal(jobCount(db, bot.id), 0, 'humans and @all route nothing');
  } finally { db.raw.close(); }
});

test('L-02: switch off routes nothing', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const a = await registerAndLogin(admin.api, 'l02-e@luno-test.local');
    const bot = await (await admin.api('admin/bots', 'POST', { display_name: 'Off Bot', handle: 'off_bot' }, admin.token)).json();
    const room = await (await admin.api('conversations', 'POST', { kind: 'group', title: 'Off', member_ids: [bot.id] }, a.token)).json();
    await allowRoomUser(admin.api, admin.token, room.id, a.id);
    await admin.api(`conversations/${room.id}/messages`, 'POST', { body: 'ping', metadata: { mentions: [bot.id] } }, a.token);
    assert.equal(jobCount(db, bot.id), 0, 'LLM_ENABLED unset routes nothing');
  } finally { db.raw.close(); }
});

// ---------- L-03: proposal / decision / report kinds (bots with propose op only) ----------

test('L-03: humans cannot send bot-only kinds', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const a = await registerAndLogin(admin.api, 'l03-a@luno-test.local');
    const b = await registerAndLogin(admin.api, 'l03-b@luno-test.local');
    const room = await (await admin.api('conversations', 'POST', { kind: 'group', title: 'Kinds', member_ids: [b.id] }, a.token)).json();
    const roomId = room.id;
    for (const kind of ['proposal', 'decision', 'report']) {
      const res = await admin.api(`conversations/${roomId}/messages`, 'POST', { kind, body: 'x' }, a.token);
      assert.equal(res.status, 403, `human ${kind} forbidden`);
    }
  } finally { db.raw.close(); }
});

test('L-03: propose op posts the three kinds, lesser scopes cannot', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const a = await registerAndLogin(admin.api, 'l03-c@luno-test.local');
    const bot = await (await admin.api('admin/bots', 'POST', { display_name: 'Kind Bot', handle: 'kindbot_bot' }, admin.token)).json();
    const room = await (await admin.api('conversations', 'POST', { kind: 'group', title: 'Bot Kinds', member_ids: [bot.id] }, a.token)).json();
    const readTok = (await mintBotToken(admin.api, admin.token, bot.id, { rooms: [room.id], ops: ['read'] })).token;
    const postTok = (await mintBotToken(admin.api, admin.token, bot.id, { rooms: [room.id], ops: ['post'] })).token;
    const propTok = (await mintBotToken(admin.api, admin.token, bot.id, { rooms: [room.id], ops: ['propose'] })).token;
    assert.equal((await admin.api(`conversations/${room.id}/messages`, 'POST', { kind: 'proposal', body: 'p' }, readTok)).status, 403);
    assert.equal((await admin.api(`conversations/${room.id}/messages`, 'POST', { kind: 'proposal', body: 'p' }, postTok)).status, 403, 'post op is not propose');
    assert.equal((await admin.api(`conversations/${room.id}/messages`, 'POST', { kind: 'proposal', body: '' }, propTok)).status, 400, 'body required');
    for (const kind of ['proposal', 'decision', 'report']) {
      const res = await admin.api(`conversations/${room.id}/messages`, 'POST', { kind, body: `${kind} body` }, propTok);
      assert.equal(res.status, 201, `bot ${kind} posts`);
    }
    const history = await (await admin.api(`conversations/${room.id}/messages`, 'GET', null, a.token)).json();
    const kinds = history.messages.map((m) => m.kind).sort();
    assert.ok(kinds.includes('proposal') && kinds.includes('decision') && kinds.includes('report'), `kinds persisted: ${kinds}`);
  } finally { db.raw.close(); }
});

test('L-03: web renders the three kinds with labels', async () => {
  const pane = await readFile(new URL('../apps/user-web/src/components/MessagePane.vue', import.meta.url), 'utf8');
  const i18n = await readFile(new URL('../apps/user-web/src/luno-i18n.ts', import.meta.url), 'utf8');
  for (const kind of ['proposal', 'decision', 'report']) {
    assert.ok(pane.includes(`'${kind}'`), `pane handles ${kind}`);
  }
  for (const key of ['msgKindProposal', 'msgKindDecision', 'msgKindReport']) {
    const hits = i18n.split(`${key}:`).length - 1;
    assert.equal(hits, 4, `${key} in all 4 locales`);
  }
});

// ---------- L-04: append-only decision record ----------

test('L-04: decisions table has the exact append-only shape', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const cols = db.raw.prepare('PRAGMA table_info(luno_decisions)').all().map((r) => r.name);
    assert.deepEqual(cols, ['id', 'room_id', 'proposal_message_id', 'decided_by', 'decision', 'created_at']);
  } finally { db.raw.close(); }
});

test('L-04: no update or delete path touches decisions', async () => {
  const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  assert.ok(!/UPDATE\s+luno_decisions/i.test(source), 'no UPDATE on luno_decisions');
  assert.ok(!/DELETE\s+FROM\s+luno_decisions/i.test(source), 'no DELETE on luno_decisions');
});

// ---------- L-05: approval box ----------

test('L-05: one approval writes one decision and posts one message', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const owner = await registerAndLogin(admin.api, 'l05-owner@luno-test.local');
    const bot = await (await admin.api('admin/bots', 'POST', { display_name: 'Propose Bot', handle: 'propose_bot' }, admin.token)).json();
    const room = await (await admin.api('conversations', 'POST', { kind: 'group', title: 'Approve Room', member_ids: [bot.id] }, owner.token)).json();
    const propTok = (await mintBotToken(admin.api, admin.token, bot.id, { rooms: [room.id], ops: ['propose'] })).token;
    const prop = await (await admin.api(`conversations/${room.id}/messages`, 'POST', { kind: 'proposal', body: 'Ship it?' }, propTok)).json();
    const propId = prop.message.id;
    const dec = await admin.api(`conversations/${room.id}/messages/${propId}/decide`, 'POST', { decision: 'approved' }, owner.token);
    assert.equal(dec.status, 201);
    const body = await dec.json();
    assert.ok(body.id, 'decision id returned');
    assert.ok(body.message_id, 'decision message id returned');
    const rows = db.raw.prepare('SELECT * FROM luno_decisions WHERE proposal_message_id = ?').all(propId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].decision, 'approved');
    assert.equal(rows[0].decided_by, owner.id);
    const history = await (await admin.api(`conversations/${room.id}/messages`, 'GET', null, owner.token)).json();
    const posted = history.messages.find((m) => m.id === body.message_id);
    assert.ok(posted, 'decision message in room');
    assert.equal(posted.kind, 'decision');
    const again = await admin.api(`conversations/${room.id}/messages/${propId}/decide`, 'POST', { decision: 'rejected' }, owner.token);
    assert.equal(again.status, 409, 'no double decision');
  } finally { db.raw.close(); }
});

test('L-05: only privileged members decide; proposals only', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const owner = await registerAndLogin(admin.api, 'l05-o2@luno-test.local');
    const plain = await registerAndLogin(admin.api, 'l05-plain@luno-test.local');
    const bot = await (await admin.api('admin/bots', 'POST', { display_name: 'Gate Bot', handle: 'gate_bot' }, admin.token)).json();
    const room = await (await admin.api('conversations', 'POST', { kind: 'group', title: 'Gate Room', member_ids: [bot.id, plain.id] }, owner.token)).json();
    const propTok = (await mintBotToken(admin.api, admin.token, bot.id, { rooms: [room.id], ops: ['propose'] })).token;
    const prop = await (await admin.api(`conversations/${room.id}/messages`, 'POST', { kind: 'proposal', body: 'Gate?' }, propTok)).json();
    assert.equal((await admin.api(`conversations/${room.id}/messages/${prop.message.id}/decide`, 'POST', { decision: 'approved' }, plain.token)).status, 403, 'plain member forbidden');
    const text = await (await admin.api(`conversations/${room.id}/messages`, 'POST', { body: 'just chat' }, owner.token)).json();
    assert.equal((await admin.api(`conversations/${room.id}/messages/${text.message.id}/decide`, 'POST', { decision: 'approved' }, owner.token)).status, 400, 'text is not decidable');
    assert.equal((await admin.api(`conversations/${room.id}/messages/no-such-msg/decide`, 'POST', { decision: 'approved' }, owner.token)).status, 404, 'unknown message');
    assert.equal((await admin.api(`conversations/${room.id}/messages/${prop.message.id}/decide`, 'POST', { decision: 'maybe' }, owner.token)).status, 400, 'bad decision value');
  } finally { db.raw.close(); }
});

test('L-05: proposals list shows pending with decision state', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const owner = await registerAndLogin(admin.api, 'l05-o3@luno-test.local');
    const bot = await (await admin.api('admin/bots', 'POST', { display_name: 'List Bot', handle: 'list_bot' }, admin.token)).json();
    const room = await (await admin.api('conversations', 'POST', { kind: 'group', title: 'List Room', member_ids: [bot.id] }, owner.token)).json();
    const propTok = (await mintBotToken(admin.api, admin.token, bot.id, { rooms: [room.id], ops: ['propose'] })).token;
    const p1 = await (await admin.api(`conversations/${room.id}/messages`, 'POST', { kind: 'proposal', body: 'First' }, propTok)).json();
    await (await admin.api(`conversations/${room.id}/messages`, 'POST', { kind: 'proposal', body: 'Second' }, propTok)).json();
    await admin.api(`conversations/${room.id}/messages/${p1.message.id}/decide`, 'POST', { decision: 'rejected' }, owner.token);
    const list = await (await admin.api(`conversations/${room.id}/proposals`, 'GET', null, owner.token)).json();
    assert.equal(list.proposals.length, 2);
    const states = Object.fromEntries(list.proposals.map((p) => [p.body, p.state]));
    assert.deepEqual(states, { First: 'rejected', Second: 'pending' });
    assert.equal(list.proposals[0].body, 'Second', 'pending first');
  } finally { db.raw.close(); }
});

test('L-05: web approval box is wired from bubbles to modal', async () => {
  const pane = await readFile(new URL('../apps/user-web/src/components/MessagePane.vue', import.meta.url), 'utf8');
  const box = await readFile(new URL('../apps/user-web/src/components/ApprovalBox.vue', import.meta.url), 'utf8');
  const shell = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
  assert.ok(pane.includes('bubble-decide-row') && pane.includes("emit('decide'"), 'bubble buttons emit decide');
  assert.ok(pane.includes("emit('approvals')"), 'menu opens the approval box');
  assert.ok(box.includes("emit('decide'") && box.includes('approval-row'), 'modal lists and decides');
  assert.ok(shell.includes('<ApprovalBox') && shell.includes('@decide="decideProposal"'), 'view wires the modal');
  assert.ok(shell.includes('proposal-states="proposalStates"') || shell.includes(':proposal-states'), 'view feeds decision states');
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
