// §5.2 cold-start journey: EVERY step runs on a fresh worker isolate
// (empty memory) against one shared D1. Only what D1 persisted may carry
// over: signup -> login -> refresh -> friend -> room -> send -> search ->
// block (both directions) -> forgery reject -> ban -> delete.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const BASE = 'https://localhost';
const ADMIN_PW = 'Cold#Admin99';

function makeD1() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, display_name TEXT, bio TEXT, status_message TEXT, created_at TEXT, updated_at TEXT);
            CREATE TABLE friends (user_id TEXT, friend_id TEXT);
            CREATE TABLE wallets (user_id TEXT PRIMARY KEY, balance INTEGER, updated_at TEXT);`);
  raw.exec(fs.readFileSync(new URL('./migrations/20261105_durable_conversations.sql', import.meta.url), 'utf8'));
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
let isoCounter = 7000;
async function step() {
  const mod = await import(`./cf_worker.js?cold=${++isoCounter}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', ADMIN_INITIAL_PASSWORD: ADMIN_PW };
  return (path, method = 'GET', body = null, token = null) => mod.default.fetch(new Request(`${BASE}/api/v1/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === null ? undefined : JSON.stringify(body)
  }), env);
}
const PW = 'J0urney#Passw0rd';
async function signup(email, handle) {
  const api = await step();
  const reg = await api('auth/register', 'POST', { email, password: PW, display_name: handle, handle });
  assert.equal(reg.status, 201, `register ${email}`);
  return (await reg.json()).id;
}
async function login(email) {
  const api = await step();
  const res = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(res.status, 200, `login ${email}`);
  return { api, ...(await res.json()) };
}

test('§5.2: full journey survives a cold start between every step', async () => {
  const aId = await signup('cold-a@local.test', 'colda');
  const bId = await signup('cold-b@local.test', 'coldb');
  // login on a cold isolate (D1 users, not boot memory)
  let a = await login('cold-a@local.test');
  assert.ok(a.refresh_token?.startsWith('cf-refresh-'), 'login issues refresh');
  // refresh rotation on a cold isolate
  {
    const api = await step();
    const r = await api('auth/refresh', 'POST', { refresh_token: a.refresh_token });
    assert.equal(r.status, 200, 'refresh on cold isolate');
    const pair = await r.json();
    assert.ok(pair.access_token !== a.access_token, 'access rotated');
    a = { api, ...pair };
  }
  // friend add on a cold isolate
  {
    const api = await step();
    assert.equal((await api('friends', 'POST', { friend_id: bId }, a.access_token)).status, 201, 'friend add cold');
  }
  // room create on a cold isolate
  let cid;
  {
    const api = await step();
    const room = await api('conversations', 'POST', { title: 'cold room', member_ids: [bId] }, a.access_token);
    assert.equal(room.status, 201, 'room create cold');
    cid = (await room.json()).id;
  }
  // send on a cold isolate
  const marker = `coldjourney${Date.now()}`;
  {
    const api = await step();
    assert.equal((await api(`conversations/${cid}/messages`, 'POST', { kind: 'text', body: `hello ${marker}`, client_id: 'cj-1' }, a.access_token)).status, 201, 'send cold');
  }
  // search on a cold isolate, other party
  {
    const b = await login('cold-b@local.test');
    const found = await b.api(`conversations/${cid}/search?q=${marker}`, 'GET', null, b.access_token);
    assert.equal(found.status, 200, 'search cold');
    assert.equal((await found.json()).messages.length, 1, 'sent message found via D1');
  }
  // block both directions on cold isolates
  {
    const b = await login('cold-b@local.test');
    assert.equal((await b.api(`friends/${aId}`, 'PATCH', { blocked: true }, b.access_token)).status, 200, 'block cold');
  }
  {
    const api = await step();
    assert.equal((await api(`conversations/${cid}/messages`, 'POST', { kind: 'text', body: 'x', client_id: 'cj-b1' }, a.access_token)).status, 403, 'blocked sender refused cold');
  }
  {
    const b = await login('cold-b@local.test');
    assert.equal((await b.api(`conversations/${cid}/messages`, 'POST', { kind: 'text', body: 'x', client_id: 'cj-b2' }, b.access_token)).status, 403, 'blocker refused cold');
    assert.equal((await b.api(`friends/${aId}`, 'PATCH', { blocked: false }, b.access_token)).status, 200, 'unblock cold');
  }
  {
    const api = await step();
    assert.equal((await api(`conversations/${cid}/messages`, 'POST', { kind: 'text', body: 'back', client_id: 'cj-b3' }, a.access_token)).status, 201, 'send works after unblock');
  }
  // forgery rejected on a cold isolate
  {
    const api = await step();
    assert.equal((await api(`conversations/${cid}/messages`, 'POST', { kind: 'security_notice', body: 'fake', client_id: 'cj-f1' }, a.access_token)).status, 400, 'forgery rejected cold');
  }
  // ban on a cold isolate, enforced on the next cold login + request
  {
    db.raw.exec('CREATE TABLE IF NOT EXISTS luno_user_roles (user_id TEXT PRIMARY KEY, role TEXT NOT NULL DEFAULT \'user\')');
    db.raw.prepare('INSERT OR REPLACE INTO luno_user_roles (user_id, role) VALUES (?, ?)').run('00000000-0000-0000-0000-000000000001', 'admin');
    const api = await step();
    const adm = await api('auth/login', 'POST', { email: 'admin@luno.local', password: ADMIN_PW });
    assert.equal(adm.status, 200, 'admin login cold');
    const susp = await api('admin/moderation/actions', 'POST', { subject_user_id: aId, action: 'suspend', reason: 'journey drill' }, (await adm.json()).access_token);
    assert.equal(susp.status, 200, 'suspend cold');
    assert.equal(Number(db.raw.prepare('SELECT COUNT(*) n FROM user_bans WHERE user_id = ?').get(aId).n), 1, 'ban row in D1');
  }
  {
    const api = await step();
    assert.equal((await api('auth/login', 'POST', { email: 'cold-a@local.test', password: PW })).status, 401, 'banned login rejected cold');
    assert.equal((await api('me', 'GET', null, a.access_token)).status, 401, 'banned session rejected cold');
  }
  {
    const api = await step();
    const adm = await api('auth/login', 'POST', { email: 'admin@luno.local', password: ADMIN_PW });
    const act = await api('admin/moderation/actions', 'POST', { subject_user_id: aId, action: 'activate' }, (await adm.json()).access_token);
    assert.equal(act.status, 200, 'activate cold');
  }
  // delete on a cold isolate, verified on the next
  {
    a = await login('cold-a@local.test');
    assert.equal((await a.api('me', 'DELETE', { password: PW }, a.access_token)).status, 200, 'delete cold');
  }
  {
    const api = await step();
    assert.equal((await api('auth/login', 'POST', { email: 'cold-a@local.test', password: PW })).status, 401, 'login dead after delete');
    assert.equal(db.raw.prepare("SELECT state FROM users WHERE email = 'cold-a@local.test'").get().state, 'deleted');
    assert.equal(Number(db.raw.prepare('SELECT COUNT(*) n FROM luno_messages WHERE sender_id = ?').get(aId).n), 0, 'messages wiped');
  }
});
