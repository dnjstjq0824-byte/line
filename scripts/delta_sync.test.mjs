// B4/A-23: GET conversations/:id/sync delta contract — the endpoint the
// mobile client polls after a reconnect instead of the 12-call reload().
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const BASE = 'https://localhost';

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

let isoCounter = 9000;
async function isolate() {
  const db = makeD1();
  const mod = await import(`./cf_worker.js?dsync=${++isoCounter}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true' };
  const api = (path, method = 'GET', body = null, token = null, headers = {}) => mod.default.fetch(new Request(`${BASE}/api/v1/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === null ? undefined : JSON.stringify(body)
  }), env);
  return { api, db };
}
async function signup(api, email, handle) {
  const reg = await api('auth/register', 'POST', { email, password: 'De1ta#Sync9x', display_name: handle, handle });
  assert.equal(reg.status, 201, `register ${email}`);
  const login = await api('auth/login', 'POST', { email, password: 'De1ta#Sync9x' });
  assert.equal(login.status, 200, `login ${email}`);
  return { id: (await reg.json()).id, ...(await login.json()) };
}

test('B4: sync returns only messages after since_sequence', async () => {
  const { api } = await isolate();
  const a = await signup(api, 'dsync-a@local.test', 'dsynca');
  const b = await signup(api, 'dsync-b@local.test', 'dsyncb');
  const room = await api('conversations', 'POST', { title: 'dm', member_ids: [b.id] }, a.access_token);
  assert.equal(room.status, 201);
  const cid = (await room.json()).id;
  const send = (token, body) => api(`conversations/${cid}/messages`, 'POST', { kind: 'text', body, client_id: `ds-${Date.now()}-${Math.random()}` }, token);
  const m1 = await (await send(a.access_token, 'one')).json();
  const m2 = await (await send(b.access_token, 'two')).json();
  assert.ok(m1.message.sequence < m2.message.sequence, 'sequences increase');

  const res = await api(`conversations/${cid}/sync?since_sequence=${m1.message.sequence}`, 'GET', null, a.access_token);
  assert.equal(res.status, 200);
  const page = await res.json();
  assert.equal(page.delta_messages.length, 1, 'exactly the missed message');
  assert.equal(page.delta_messages[0].id, m2.message.id);
  assert.equal(page.latest_sequence, m2.message.sequence);

  const empty = await api(`conversations/${cid}/sync?since_sequence=${m2.message.sequence}`, 'GET', null, a.access_token);
  assert.equal(empty.status, 200);
  const emptyPage = await empty.json();
  assert.deepEqual(emptyPage.delta_messages, []);
  assert.equal(emptyPage.latest_sequence, m2.message.sequence);
});

test('B4: sync rejects non-members and anonymous callers', async () => {
  const { api } = await isolate();
  const a = await signup(api, 'dsync2-a@local.test', 'dsync2a');
  const b = await signup(api, 'dsync2-b@local.test', 'dsync2b');
  const c = await signup(api, 'dsync2-c@local.test', 'dsync2c');
  const room = await api('conversations', 'POST', { title: 'dm', member_ids: [b.id] }, a.access_token);
  const cid = (await room.json()).id;
  assert.equal((await api(`conversations/${cid}/sync`, 'GET', null, c.access_token)).status, 404);
  assert.equal((await api(`conversations/${cid}/sync`, 'GET')).status, 401);
});
