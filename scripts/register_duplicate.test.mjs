// Register must never clobber a D1 account that a fresh isolate's memory
// has not seen: re-registering an existing email on a cold isolate must
// answer 409 and leave the original password working.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const BASE = 'https://localhost';

function makeD1() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, handle TEXT UNIQUE, password_hash TEXT NOT NULL, display_name TEXT NOT NULL, bio TEXT DEFAULT '', phone_number TEXT DEFAULT '', status_message TEXT DEFAULT '', avatar_url TEXT DEFAULT '', birthday TEXT DEFAULT '', state TEXT DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
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

const db = makeD1();
let isoCounter = 9900;
async function step() {
  const mod = await import(`./cf_worker.js?regdup=${++isoCounter}`);
  const env = { DB: db };
  return (path, method = 'GET', body = null, token = null) => mod.default.fetch(new Request(`${BASE}/api/v1/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === null ? undefined : JSON.stringify(body),
  }), env);
}

test('re-register on a cold isolate returns 409 and keeps the original account', async () => {
  const email = 'dup@local.test';
  const first = await step();
  const reg = await first('auth/register', 'POST', { email, password: 'First#Pass99', display_name: 'dup' });
  assert.equal(reg.status, 201, 'initial register');
  const before = db.raw.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);

  // Fresh isolate: empty memory, same D1. This must NOT overwrite.
  const cold = await step();
  const again = await cold('auth/register', 'POST', { email, password: 'Second#Pass99', display_name: 'dup2' });
  assert.equal(again.status, 409, 'duplicate register on cold isolate');
  assert.match((await again.json()).error || '', /already exists/);

  const rows = db.raw.prepare('SELECT id, password_hash FROM users WHERE email = ?').all(email);
  assert.equal(rows.length, 1, 'still exactly one row');
  assert.equal(rows[0].id, before.id, 'row id untouched');
  assert.equal(rows[0].password_hash, before.password_hash, 'password hash untouched');

  // Original password still logs in; the second one never took effect.
  const loginApi = await step();
  assert.equal((await loginApi('auth/login', 'POST', { email, password: 'First#Pass99' })).status, 200, 'original password works');
  const loginApi2 = await step();
  assert.equal((await loginApi2('auth/login', 'POST', { email, password: 'Second#Pass99' })).status, 401, 'clobber password rejected');
});
