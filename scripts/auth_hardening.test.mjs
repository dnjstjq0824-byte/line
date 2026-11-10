// B1 auth hardening: PBKDF2-310k, 15-min access, refresh rotation + reuse
// detection, login lockout, per-minute rate limits, account wipe via batch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const BASE = 'https://localhost';

function makeD1() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, display_name TEXT, bio TEXT, status_message TEXT, created_at TEXT, updated_at TEXT);
            CREATE TABLE friends (user_id TEXT, friend_id TEXT);
            CREATE TABLE wallets (user_id TEXT PRIMARY KEY, balance INTEGER, updated_at TEXT);`);
  const mkStmt = (sql) => {
    let params = [];
    const st = {
      bind(...p) { params = p; return st; },
      async run() { const r = raw.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
      async all() { return { results: raw.prepare(sql).all(...params).map(r => ({ ...r })) }; },
      async first() { const r = raw.prepare(sql).get(...params); return r ? { ...r } : null; },
      _sql: sql, _params: () => params,
    };
    return st;
  };
  return {
    raw,
    batched: 0,
    prepare: mkStmt,
    async batch(stmts) {
      raw.exec('BEGIN');
      try {
        const out = [];
        for (const st of stmts) {
          const r = raw.prepare(st._sql).run(...st._params());
          out.push({ success: true, meta: { changes: Number(r.changes) } });
        }
        raw.exec('COMMIT');
        this.batched += stmts.length;
        return out;
      } catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
}

let isoCounter = 5000;
async function isolate(database) {
  const db = database || makeD1();
  const mod = await import(`./cf_worker.js?b1=${++isoCounter}`);
  const env = { DB: db };
  const api = (path, method = 'GET', body = null, token = null, headers = {}) => mod.default.fetch(new Request(`${BASE}/api/v1/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === null ? undefined : JSON.stringify(body)
  }), env);
  return { api, db };
}
async function signup(api, email, handle, password = 'Hard3n#Passw0rd') {
  const reg = await api('auth/register', 'POST', { email, password, display_name: handle, handle });
  assert.equal(reg.status, 201, `register ${email}`);
  const login = await api('auth/login', 'POST', { email, password });
  assert.equal(login.status, 200, `login ${email}`);
  return { id: (await reg.json()).id, ...(await login.json()) };
}

test('B1: register hashes at PBKDF2-310k; 100k rows migrate on login', async () => {
  const { api, db } = await isolate();
  const u = await signup(api, 'b1-pbkdf2@local.test', 'b1pbkdf2');
  assert.equal(u.expires_in, 900, 'access tokens live 15 minutes');
  assert.ok(u.refresh_token?.startsWith('cf-refresh-'), 'login issues a real refresh token');
  const row = db.raw.prepare('SELECT password_hash FROM users WHERE email = ?').get('b1-pbkdf2@local.test');
  assert.match(row.password_hash, /^pbkdf2\$310000\$.+\$.+$/, 'register stores 310k digest');
  // A pre-change 100k row verifies, then upgrades to 310k.
  const { subtle } = await import('node:crypto');
  const salt = 'cd'.repeat(16);
  const key = await subtle.importKey('raw', new TextEncoder().encode('Old100k#Pass'), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(Buffer.from(salt, 'hex')), iterations: 100000 }, key, 256);
  const hash = Buffer.from(bits).toString('hex');
  db.raw.prepare('INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)').run('b1-old100k', 'b1-old100k@local.test', `pbkdf2$100000$${salt}$${hash}`, 'Old');
  const cold = await isolate(db);
  const login = await cold.api('auth/login', 'POST', { email: 'b1-old100k@local.test', password: 'Old100k#Pass' });
  assert.equal(login.status, 200, '100k digest still verifies');
  const migrated = db.raw.prepare('SELECT password_hash FROM users WHERE email = ?').get('b1-old100k@local.test');
  assert.match(migrated.password_hash, /^pbkdf2\$310000\$.+\$.+$/, '100k row rehashed to 310k on login');
});

test('B1: refresh rotates single-use; reuse kills the grant; expiry enforced', async () => {
  const { api, db } = await isolate();
  const u = await signup(api, 'b1-refresh@local.test', 'b1refresh');
  const r1 = await api('auth/refresh', 'POST', { refresh_token: u.refresh_token });
  assert.equal(r1.status, 200, 'first refresh succeeds');
  const pair = await r1.json();
  assert.ok(pair.access_token && pair.access_token !== u.access_token, 'new access token minted');
  assert.ok(pair.refresh_token && pair.refresh_token !== u.refresh_token, 'new refresh token minted');
  assert.equal(pair.device_id, u.device_id, 'rotation stays on the same session');
  assert.equal((await api('me', 'GET', null, pair.access_token)).status, 200, 'rotated access works');
  assert.equal((await api('me', 'GET', null, u.access_token)).status, 401, 'pre-rotation access is dead');
  // Reuse of the burned token: theft response, whole grant dies.
  const reuse = await api('auth/refresh', 'POST', { refresh_token: u.refresh_token });
  assert.equal(reuse.status, 401, 'rotated token is single-use');
  assert.equal((await api('me', 'GET', null, pair.access_token)).status, 401, 'reuse kills the live session too');
  assert.equal((await api('auth/refresh', 'POST', { refresh_token: pair.refresh_token })).status, 401, 'reuse kills sibling refresh');
  const left = db.raw.prepare('SELECT COUNT(*) n FROM refresh_tokens WHERE user_id = ? AND revoked = 0').get(u.user_id);
  assert.equal(Number(left.n), 0, 'no live refresh tokens remain');
  // Forged and expired tokens fail closed.
  assert.equal((await api('auth/refresh', 'POST', { refresh_token: 'cf-refresh-forged' })).status, 401);
  const u2 = await signup(api, 'b1-refresh2@local.test', 'b1refresh2');
  const { createHash } = await import('node:crypto');
  const h = createHash('sha256').update(u2.refresh_token).digest('hex');
  db.raw.prepare('UPDATE refresh_tokens SET expires_at = ? WHERE token_hash = ?').run(Date.now() - 1000, h);
  assert.equal((await api('auth/refresh', 'POST', { refresh_token: u2.refresh_token })).status, 401, 'expired refresh rejected');
});

test('B1: access tokens die after 15 minutes (D1 clock)', async () => {
  const { api, db } = await isolate();
  const u = await signup(api, 'b1-ttl@local.test', 'b1ttl');
  assert.equal((await api('me', 'GET', null, u.access_token)).status, 200);
  db.raw.prepare("UPDATE luno_sessions SET created_at = datetime('now', '-16 minutes') WHERE session_id = ?").run(u.device_id);
  const cold = await isolate(db);
  assert.equal((await cold.api('me', 'GET', null, u.access_token)).status, 401, '16-minute-old access is rejected');
});

test('B1: 5 login failures lock the account for 15 minutes; success resets', async () => {
  const { api } = await isolate();
  const email = 'b1-lock@local.test';
  await signup(api, email, 'b1lock', 'LockM3#Out1');
  for (let i = 0; i < 5; i++) {
    assert.equal((await api('auth/login', 'POST', { email, password: 'wrong' })).status, 401, `fail ${i + 1}`);
  }
  const locked = await api('auth/login', 'POST', { email, password: 'LockM3#Out1' });
  assert.equal(locked.status, 429, 'correct password is locked out after 5 failures');
  assert.equal((await locked.json()).code, 'LOGIN_LOCKED');
  // A success clears the counter: 4 fails + success + 4 fails still logs in.
  const email2 = 'b1-reset@local.test';
  await signup(api, email2, 'b1reset', 'ResetM3#Ok1');
  for (let i = 0; i < 4; i++) assert.equal((await api('auth/login', 'POST', { email: email2, password: 'wrong' })).status, 401);
  assert.equal((await api('auth/login', 'POST', { email: email2, password: 'ResetM3#Ok1' })).status, 200, 'success resets the counter');
  for (let i = 0; i < 4; i++) assert.equal((await api('auth/login', 'POST', { email: email2, password: 'wrong' })).status, 401);
  assert.equal((await api('auth/login', 'POST', { email: email2, password: 'ResetM3#Ok1' })).status, 200, 'four post-reset failures do not lock');
});

test('B1: per-minute rate limits return 429 past the cap', async () => {
  const { api } = await isolate();
  let capped = 0;
  for (let i = 0; i < 121; i++) {
    const r = await api('auth/refresh', 'POST', { refresh_token: 'junk' });
    if (r.status === 429) capped++;
    else assert.equal(r.status, 401, `attempt ${i} fails closed as invalid`);
  }
  assert.equal(capped, 1, 'exactly the 121st call in the window is rate limited');
});

test('B1: DELETE /me wipes the account via batch; alias behaves identically', async () => {
  const { api, db } = await isolate();
  const u = await signup(api, 'b1-wipe@local.test', 'b1wipe');
  const peer = await signup(api, 'b1-wipe-peer@local.test', 'b1wipepeer');
  assert.equal((await api('friends', 'POST', { friend_id: peer.id }, u.access_token)).status, 201);
  const cid = `conv-keep-${u.id}`;
  assert.equal((await api(`conversations/${cid}/messages`, 'POST', { kind: 'text', body: 'wipe me', client_id: 'wipe-1' }, u.access_token)).status, 201);
  const up = await api('attachments', 'POST', { conversation_id: cid, content_base64: Buffer.from('x').toString('base64'), mime_type: 'text/plain', original_name: 'x.txt' }, u.access_token);
  assert.equal(up.status, 201);
  assert.equal((await api('push-tokens', 'POST', { token: 'tok', platform: 'android', device_id: 'd1' }, u.access_token)).status, 201);
  assert.equal((await api('devices/d1/keys', 'PUT', { identity_key: 'ik' }, u.access_token)).status, 200);
  const del = await api('me', 'DELETE', { password: 'Hard3n#Passw0rd' }, u.access_token);
  assert.equal(del.status, 200);
  assert.ok(db.batched > 0, 'wipe ran through db.batch');
  const row = db.raw.prepare('SELECT * FROM users WHERE email = ?').get('b1-wipe@local.test');
  assert.equal(row.state, 'deleted');
  assert.equal(row.password_hash, 'pbkdf2$deleted', 'credentials unwound');
  assert.equal(row.display_name, '탈퇴한 사용자');
  for (const [table, col] of [['luno_sessions', 'user_id'], ['refresh_tokens', 'user_id'], ['push_tokens', 'user_id'], ['e2ee_keys', 'user_id'], ['luno_messages', 'sender_id'], ['luno_attachments', 'owner_id']]) {
    const n = db.raw.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${col} = ?`).get(u.id).n;
    assert.equal(Number(n), 0, `${table} wiped`);
  }
  const fr = db.raw.prepare('SELECT COUNT(*) n FROM friends WHERE user_id = ? OR friend_id = ?').get(u.id, u.id).n;
  assert.equal(Number(fr), 0, 'friendships wiped');
  assert.equal((await api('me', 'GET', null, u.access_token)).status, 401, 'token dead');
  assert.equal((await api('auth/login', 'POST', { email: 'b1-wipe@local.test', password: 'Hard3n#Passw0rd' })).status, 401, 'login dead');
  // Compatibility alias: same guards, same wipe.
  const v = await signup(api, 'b1-alias@local.test', 'b1alias');
  assert.equal((await api('me/delete-account', 'POST', {}, v.access_token)).status, 400, 'alias requires the password');
  assert.equal((await api('me/delete-account', 'POST', { password: 'nope' }, v.access_token)).status, 401, 'alias rejects wrong password');
  const del2 = await api('me/delete-account', 'POST', { password: 'Hard3n#Passw0rd' }, v.access_token);
  assert.equal(del2.status, 200);
  assert.equal((await del2.json()).status, 'account_deleted');
  const row2 = db.raw.prepare('SELECT state FROM users WHERE email = ?').get('b1-alias@local.test');
  assert.equal(row2.state, 'deleted');
  assert.equal((await api('auth/login', 'POST', { email: 'b1-alias@local.test', password: 'Hard3n#Passw0rd' })).status, 401);
});
