// Register must never clobber a D1 account that a fresh isolate's memory
// has not seen: re-registering an existing email on a cold isolate must
// answer 409 and leave the original password working.
// It must also work when the users table predates newer columns: runtime
// healing adds them, so register answers 201 instead of 500.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const BASE = 'https://localhost';
const FULL_USERS = `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, handle TEXT UNIQUE, password_hash TEXT NOT NULL, display_name TEXT NOT NULL, bio TEXT DEFAULT '', phone_number TEXT DEFAULT '', status_message TEXT DEFAULT '', avatar_url TEXT DEFAULT '', birthday TEXT DEFAULT '', state TEXT DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`;
// Pre-Phase-1 shape: the healing list must bring this up to INSERT shape.
const MINIMAL_USERS = `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL);`;

function makeD1(usersSql) {
  const raw = new DatabaseSync(':memory:');
  raw.exec(usersSql + `
            CREATE TABLE wallets (user_id TEXT PRIMARY KEY, balance INTEGER, updated_at TEXT);`);
  const mkStmt = (sql) => {
    let params = [];
    const st = {
      bind(...p) { params = p; return st; },
      async run() { const r = raw.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
      async all() { return { results: raw.prepare(sql).all(...params).map((r) => ({ ...r })) }; },
      async first() { const r = raw.prepare(sql).get(...params); return r ? { ...r } : null; },
      _sql: sql, _params: () => params,
    };
    return st;
  };
  return {
    raw,
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
        return out;
      } catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
}

let isoCounter = 9900;
async function step(db) {
  const mod = await import(`./cf_worker.js?regdup=${++isoCounter}`);
  const env = { DB: db };
  return (path, method = 'GET', body = null, token = null) => mod.default.fetch(new Request(`${BASE}/api/v1/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === null ? undefined : JSON.stringify(body),
  }), env);
}

test('re-register on a cold isolate returns 409 and keeps the original account', async () => {
  const db = makeD1(FULL_USERS);
  const email = 'dup@local.test';
  const first = await step(db);
  const reg = await first('auth/register', 'POST', { email, password: 'First#Pass99', display_name: 'dup' });
  assert.equal(reg.status, 201, 'initial register');
  const before = db.raw.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);

  // Fresh isolate: empty memory, same D1. This must NOT overwrite.
  const cold = await step(db);
  const again = await cold('auth/register', 'POST', { email, password: 'Second#Pass99', display_name: 'dup2' });
  assert.equal(again.status, 409, 'duplicate register on cold isolate');
  assert.match((await again.json()).error || '', /already exists/);

  const rows = db.raw.prepare('SELECT id, password_hash FROM users WHERE email = ?').all(email);
  assert.equal(rows.length, 1, 'still exactly one row');
  assert.equal(rows[0].id, before.id, 'row id untouched');
  assert.equal(rows[0].password_hash, before.password_hash, 'password hash untouched');

  // Original password still logs in; the second one never took effect.
  const loginApi = await step(db);
  assert.equal((await loginApi('auth/login', 'POST', { email, password: 'First#Pass99' })).status, 200, 'original password works');
  const loginApi2 = await step(db);
  assert.equal((await loginApi2('auth/login', 'POST', { email, password: 'Second#Pass99' })).status, 401, 'clobber password rejected');
});

test('register heals a pre-Phase-1 users table instead of 500', async () => {
  const db = makeD1(MINIMAL_USERS);
  // A husk row from the old era: no credentials, no display name yet.
  db.raw.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run('husk-1', 'husk@local.test');

  const api = await step(db);
  const reg = await api('auth/register', 'POST', { email: 'legacy@local.test', password: 'Legacy#Pass99', display_name: 'legacy' });
  assert.equal(reg.status, 201, 'register on legacy table');

  const cols = db.raw.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  for (const c of ['password_hash', 'display_name', 'created_at', 'updated_at', 'handle', 'bio']) {
    assert.ok(cols.includes(c), `healed column ${c}`);
  }
  const husk = db.raw.prepare('SELECT display_name FROM users WHERE id = ?').get('husk-1');
  assert.equal(husk.display_name, 'husk', 'husk display name backfilled from email');

  const loginApi = await step(db);
  assert.equal((await loginApi('auth/login', 'POST', { email: 'legacy@local.test', password: 'Legacy#Pass99' })).status, 200, 'fresh account logs in');
});
