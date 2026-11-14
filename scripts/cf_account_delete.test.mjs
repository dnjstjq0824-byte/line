// Worker DELETE /api/v1/me parity with Go deleteAccount.
// Password confirmation, soft-delete (state='deleted'), every session revoked,
// login afterwards fails, shared demo accounts are protected. The D1 emulator
// starts WITHOUT the state column, proving the handler migrates legacy DBs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const BASE = 'https://localhost';

function makeD1() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, display_name TEXT, bio TEXT, status_message TEXT, created_at TEXT, updated_at TEXT);
            CREATE TABLE friends (user_id TEXT, friend_id TEXT);
            CREATE TABLE wallets (user_id TEXT PRIMARY KEY, balance INTEGER, updated_at TEXT);`);
  return {
    raw,
    prepare(sql) {
      let params = [];
      const st = {
        bind(...p) { params = p; return st; },
        async run() { const r = raw.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
        async all() { return { results: raw.prepare(sql).all(...params).map((r) => ({ ...r })) }; },
        async first() { const r = raw.prepare(sql).get(...params); return r ? { ...r } : null; },
      };
      return st;
    },
  };
}

const db = makeD1();
const env = { ALLOW_LOCAL_DEMO: 'true', ALLOW_EDGE_STANDALONE: 'true', ENABLE_DEMO_ACCOUNTS: 'true', DB: db };
let isoCounter = 100;
async function isolate(extraEnv = {}, database = db) {
  const mod = await import(`./cf_worker.js?iso=${++isoCounter}`);
  const e = { ...env, DB: database, ...extraEnv };
  return (path, method = 'GET', body = null, token = null) => mod.default.fetch(new Request(`${BASE}/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === null ? undefined : JSON.stringify(body),
  }), e);
}

test('D-01: DELETE /me requires the password and kills the account on every surface', async () => {
  const api = await isolate();
  const email = `delme-${Date.now()}@local.test`;
  const password = 'DelMeStrong#2026!';
  const reg = await api('auth/register', 'POST', { email, password, display_name: 'DelMe' });
  assert.equal(reg.status, 201);
  const login = await api('auth/login', 'POST', { email, password });
  assert.equal(login.status, 200);
  const { access_token: t1 } = await login.json();
  const login2 = await api('auth/login', 'POST', { email, password });
  const { access_token: t2 } = await login2.json();

  assert.equal((await api('me', 'DELETE', {}, t1)).status, 400, 'missing password is 400');
  assert.equal((await api('me', 'DELETE', { password: 'Wrong#2026!' }, t1)).status, 401, 'wrong password is 401');
  assert.equal((await api('me', 'GET', null, t1)).status, 200, 'failed deletes leave the token alive');

  const del = await api('me', 'DELETE', { password, confirm_text: email, reason: 'privacy' }, t1);
  assert.equal(del.status, 200);
  assert.equal((await del.json()).status, 'deletion_scheduled');

  assert.equal((await api('me', 'GET', null, t1)).status, 401, 'deleter token is dead');
  assert.equal((await api('me', 'GET', null, t2)).status, 401, 'second session is dead too');
  // F3: login inside the 30-day grace recovers the account.
  const back = await api('auth/login', 'POST', { email, password });
  assert.equal(back.status, 200, 'grace login recovers');
  assert.equal((await back.json()).recovered, true);

  const row = db.raw.prepare('SELECT state FROM users WHERE email = ?').get(email);
  assert.equal(row.state, 'active', 'D1 row restored after grace login');
});

test('D-02: shared demo accounts cannot self-delete', async () => {
  const api = await isolate({ DEMO_INITIAL_PASSWORD: 'D2#Demo2026!' });
  const login = await api('auth/login', 'POST', { email: 'user@luno.local', password: 'D2#Demo2026!' });
  assert.equal(login.status, 200);
  const { access_token } = await login.json();
  const wrong = await api('me', 'DELETE', { password: 'Wrong#2026!' }, access_token);
  assert.equal(wrong.status, 401);
  const del = await api('me', 'DELETE', { password: 'D2#Demo2026!' }, access_token);
  assert.equal(del.status, 403);
  assert.equal((await del.json()).code, 'DEMO_PROTECTED');
});

test('D-03: deletion survives a redeploy (fresh isolate, same D1)', async () => {
  const api = await isolate();
  const email = `delme2-${Date.now()}@local.test`;
  const password = 'DelMeStrong#2026!';
  assert.equal((await api('auth/register', 'POST', { email, password, display_name: 'DelMe2' })).status, 201);
  const { access_token } = await (await api('auth/login', 'POST', { email, password })).json();
  assert.equal((await api('me', 'DELETE', { password, confirm_text: email }, access_token)).status, 200);
  const redeployed = await isolate();
  // F3: grace survives redeploy (row durable), then expiry purges.
  assert.equal((await redeployed('auth/login', 'POST', { email, password })).status, 200, 'grace login recovers after redeploy');
  db.raw.exec(`UPDATE users SET state = 'deleted', deleted_at = '2020-01-01T00:00:00.000Z' WHERE email = '${email}'`);
  const cold = await isolate();
  assert.equal((await cold('auth/login', 'POST', { email, password })).status, 401, 'expired grace purges');
  const row = db.raw.prepare('SELECT display_name FROM users WHERE email = ?').get(email);
  assert.equal(row.display_name, '탈퇴한 사용자', 'expiry anonymizes');
});

test('D-04: password checks work on a fresh isolate (iteration count persisted)', async () => {
  const api = await isolate();
  const email = `delme3-${Date.now()}@local.test`;
  const password = 'DelMeStrong#2026!';
  assert.equal((await api('auth/register', 'POST', { email, password, display_name: 'DelMe3' })).status, 201);
  const row = db.raw.prepare('SELECT password_hash FROM users WHERE email = ?').get(email);
  assert.match(row.password_hash, /^pbkdf2\$\d+\$.+\$.+$/, 'register persists 4-segment digest with iterations');
  const cold = await isolate();
  const login = await cold('auth/login', 'POST', { email, password });
  assert.equal(login.status, 200, 'login works on a cold isolate');
  const { access_token } = await login.json();
  assert.equal((await cold('me', 'DELETE', { password, confirm_text: email }, access_token)).status, 200, 'delete works on a cold isolate');
  assert.equal((await cold('auth/login', 'POST', { email, password })).status, 200, 'grace login recovers on a cold isolate');
});

test('D-05: legacy 3-segment rows (1000 iterations) still verify without upgrade (S4)', async () => {
  const { subtle } = await import('node:crypto');
  const salt = 'ab'.repeat(16);
  const key = await subtle.importKey('raw', new TextEncoder().encode('Legacy#2026!'), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(Buffer.from(salt, 'hex')), iterations: 1000 }, key, 256);
  const hash = Buffer.from(bits).toString('hex');
  const email = `legacy-${Date.now()}@local.test`;
  db.raw.prepare('INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), email, `pbkdf2$${salt}$${hash}`, 'Legacy');
  const cold = await isolate();
  const login = await cold('auth/login', 'POST', { email, password: 'Legacy#2026!' });
  assert.equal(login.status, 200, 'legacy 3-segment login works');
  const row = db.raw.prepare('SELECT password_hash FROM users WHERE email = ?').get(email);
  assert.equal(row.password_hash, `pbkdf2$${salt}$${hash}`, 'legacy row never rewritten on login (S4: upgrade path removed)');
});

test('B3: suspending accounts by SQL blocks login until reactivated', async () => {
  const local = makeD1();
  const api = await isolate({}, local);
  const email = `suspend-${Date.now()}@local.test`;
  const password = 'Suspend#2026!';
  assert.equal((await api('auth/register', 'POST', { email, password, display_name: 'Susp' })).status, 201);
  local.raw.prepare('INSERT INTO users (id, email, handle, password_hash, display_name) VALUES (?, ?, ?, ?, ?)').run('b3-plain', 'b3-plain@local.test', 'b3_plain', 'LegacyPlain#1', 'Plain');
  const mine = local.raw.prepare('SELECT id FROM users WHERE email = ?').get(email);
  // Inspection query from the stage report: only the plaintext row matches.
  const found = local.raw.prepare("SELECT id FROM users WHERE password_hash NOT LIKE 'pbkdf2$%'").all();
  assert.deepEqual(found.map((r) => r.id), ['b3-plain']);
  // Operator suspend SQL, verified against local D1.
  local.raw.prepare('UPDATE users SET state = ? WHERE id IN (?, ?)').run('suspended', mine.id, 'b3-plain');
  const cold = await isolate({}, local);
  assert.equal((await cold('auth/login', 'POST', { email, password })).status, 401, 'suspended login rejected');
  assert.equal((await cold('auth/login', 'POST', { email: 'b3-plain@local.test', password: 'LegacyPlain#1' })).status, 401, 'suspended plaintext login rejected');
  const left = local.raw.prepare("SELECT COUNT(*) AS n FROM users WHERE password_hash NOT LIKE 'pbkdf2$%' AND (state IS NULL OR state <> 'suspended')").get();
  assert.equal(Number(left.n), 0, 'no unsuspended plaintext rows remain');
  // Revert path.
  local.raw.prepare('UPDATE users SET state = ? WHERE id IN (?)').run('active', mine.id);
  const back = await isolate({}, local);
  assert.equal((await back('auth/login', 'POST', { email, password })).status, 200, 'reactivated login works');
});
