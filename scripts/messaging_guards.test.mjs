// B2 messaging guards: bidirectional blocks (memory + D1), forged-kind
// rejection, media scheme validation, D1 call membership, D1 SQL search.
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

let isoCounter = 6000;
async function isolate(database) {
  const db = database || makeD1();
  const mod = await import(`./cf_worker.js?b2=${++isoCounter}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true' };
  const api = (path, method = 'GET', body = null, token = null, headers = {}) => mod.default.fetch(new Request(`${BASE}/api/v1/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === null ? undefined : JSON.stringify(body)
  }), env);
  return { api, db };
}
async function signup(api, email, handle) {
  const reg = await api('auth/register', 'POST', { email, password: 'Gu4rd#Passw0rd', display_name: handle, handle });
  assert.equal(reg.status, 201, `register ${email}`);
  const login = await api('auth/login', 'POST', { email, password: 'Gu4rd#Passw0rd' });
  assert.equal(login.status, 200, `login ${email}`);
  return { id: (await reg.json()).id, ...(await login.json()) };
}
async function directRoom(api, token, peerId, title = 'dm') {
  const room = await api('conversations', 'POST', { title, member_ids: [peerId] }, token);
  assert.equal(room.status, 201);
  return (await room.json()).id;
}

test('B2: bidirectional blocks refuse 1:1 sends and calls, survive redeploy', async () => {
  const { api, db } = await isolate();
  const a = await signup(api, 'b2-block-a@local.test', 'b2blocka');
  const b = await signup(api, 'b2-block-b@local.test', 'b2blockb');
  const cid = await directRoom(api, a.access_token, b.id);
  const send = (token, body) => api(`conversations/${cid}/messages`, 'POST', { kind: 'text', body, client_id: `b-${Date.now()}-${Math.random()}` }, token);
  assert.equal((await send(a.access_token, 'hi')).status, 201, 'unblocked send works');
  assert.equal((await api(`friends/${b.id}`, 'PATCH', { blocked: true }, a.access_token)).status, 200);
  assert.equal(Number(db.raw.prepare('SELECT COUNT(*) n FROM blocks WHERE blocker_id = ? AND blocked_id = ?').get(a.id, b.id).n), 1, 'block persisted to D1');
  assert.equal((await send(a.access_token, 'nope')).status, 403, 'blocker cannot send');
  assert.equal((await send(b.access_token, 'nope')).status, 403, 'blocked peer cannot send');
  assert.equal((await api('calls', 'POST', { conversation_id: cid, kind: 'voice' }, a.access_token)).status, 403, 'blocker cannot call');
  assert.equal((await api('calls', 'POST', { conversation_id: cid, kind: 'voice' }, b.access_token)).status, 403, 'blocked peer cannot call');
  assert.equal((await api(`friends/${b.id}`, 'PATCH', { blocked: false }, a.access_token)).status, 200);
  assert.equal((await send(a.access_token, 'back')).status, 201, 'unblock restores sending');
  // Reverse direction + redeploy durability.
  assert.equal((await api(`friends/${a.id}`, 'PATCH', { blocked: true }, b.access_token)).status, 200);
  const cold = await isolate(db);
  const b2 = await cold.api('auth/login', 'POST', { email: 'b2-block-b@local.test', password: 'Gu4rd#Passw0rd' });
  const bTok = (await b2.json()).access_token;
  assert.equal((await cold.api(`conversations/${cid}/messages`, 'POST', { kind: 'text', body: 'x', client_id: 'cold-1' }, bTok)).status, 403, 'block enforced on a cold isolate via D1');
});

test('B2: forged system kinds are rejected; real kinds still send', async () => {
  const { api } = await isolate();
  const a = await signup(api, 'b2-forge-a@local.test', 'b2forgea');
  const b = await signup(api, 'b2-forge-b@local.test', 'b2forgeb');
  const cid = await directRoom(api, a.access_token, b.id);
  for (const kind of ['security_notice', 'pay', 'transfer', 'call_status', 'system']) {
    const r = await api(`conversations/${cid}/messages`, 'POST', { kind, body: 'forged', metadata: { amount: 999 }, client_id: `f-${kind}` }, a.access_token);
    assert.equal(r.status, 400, `forged ${kind} rejected`);
  }
  for (const [kind, body, metadata] of [
    ['text', 'hello', undefined],
    ['sticker', 'hi', { sticker_id: 'pack-1' }],
    ['location', '서울역', { lat: 37.5, lng: 127.0, label: '서울역' }],
    ['contact', '연락처', { display_name: '누구' }],
  ]) {
    const r = await api(`conversations/${cid}/messages`, 'POST', { kind, body, metadata, client_id: `ok-${kind}-${Date.now()}` }, a.access_token);
    assert.equal(r.status, 201, `real ${kind} still sends`);
  }
});

test('B2: active URL schemes are rejected; https embeds still work', async () => {
  const { api } = await isolate();
  const a = await signup(api, 'b2-url-a@local.test', 'b2urla');
  const b = await signup(api, 'b2-url-b@local.test', 'b2urlb');
  const cid = await directRoom(api, a.access_token, b.id);
  const post = (payload) => api(`conversations/${cid}/messages`, 'POST', { client_id: `u-${Date.now()}-${Math.random()}`, ...payload }, a.access_token);
  assert.equal((await post({ kind: 'image', body: 'data:image/png;base64,AAAA' })).status, 400, 'data: body rejected');
  assert.equal((await post({ kind: 'image', body: 'x', metadata: { url: 'javascript:alert(1)' } })).status, 400, 'javascript: url rejected');
  assert.equal((await post({ kind: 'video', body: 'x', metadata: { uri: 'file:///etc/passwd' } })).status, 400, 'file: uri rejected');
  assert.equal((await post({ kind: 'file', body: 'vbscript:msgbox(1)' })).status, 400, 'vbscript: body rejected');
  assert.equal((await post({ kind: 'voice', body: 'blob:https://x/y' })).status, 400, 'blob: body rejected');
  const ok = await post({ kind: 'image', body: 'https://example.test/a.png', metadata: { url: 'https://example.test/a.png' } });
  assert.equal(ok.status, 201, 'https embed still sends');
});

test('B2: conversation search runs on D1 with membership enforced', async () => {
  const { api } = await isolate();
  const a = await signup(api, 'b2-search-a@local.test', 'b2searcha');
  const b = await signup(api, 'b2-search-b@local.test', 'b2searchb');
  const o = await signup(api, 'b2-search-o@local.test', 'b2searcho');
  const cid = await directRoom(api, a.access_token, b.id);
  const token = `zebrastripe${Date.now()}`;
  await api(`conversations/${cid}/messages`, 'POST', { kind: 'text', body: `first ${token} here`, client_id: 's-1' }, a.access_token);
  await api(`conversations/${cid}/messages`, 'POST', { kind: 'text', body: 'unrelated chatter', client_id: 's-2' }, b.access_token);
  const found = await api(`conversations/${cid}/search?q=${token}`, 'GET', null, a.access_token);
  assert.equal(found.status, 200);
  const hits = (await found.json()).messages;
  assert.equal(hits.length, 1, 'exactly the matching message');
  assert.ok(hits[0].body.includes(token));
  assert.equal((await api(`conversations/${cid}/search?q=${token}`, 'GET', null, o.access_token)).status, 404, 'outsider cannot search the room');
  const pct = await api(`conversations/${cid}/search?q=100%25`, 'GET', null, a.access_token);
  assert.equal(pct.status, 200, 'LIKE metacharacters do not break the query');
  assert.deepEqual((await pct.json()).messages, []);
});

test('B2: call create and signaling verify D1 membership across isolates', async () => {
  const db = makeD1();
  const first = await isolate(db);
  const a = await signup(first.api, 'b2-call-a@local.test', 'b2calla');
  const b = await signup(first.api, 'b2-call-b@local.test', 'b2callb');
  const o = await signup(first.api, 'b2-call-o@local.test', 'b2callo');
  const room = await first.api('conversations', 'POST', { kind: 'group', title: 'call room', member_ids: [b.id] }, a.access_token);
  assert.equal(room.status, 201);
  const cid = (await room.json()).id;
  const second = await isolate(db);
  const loginB = await second.api('auth/login', 'POST', { email: 'b2-call-b@local.test', password: 'Gu4rd#Passw0rd' });
  const bTok = (await loginB.json()).access_token;
  const loginO = await second.api('auth/login', 'POST', { email: 'b2-call-o@local.test', password: 'Gu4rd#Passw0rd' });
  const oTok = (await loginO.json()).access_token;
  const call = await second.api('calls', 'POST', { conversation_id: cid, kind: 'voice' }, bTok);
  assert.equal(call.status, 201, 'member creates a call on a cold isolate via D1');
  const callId = (await call.json()).id;
  assert.equal((await second.api(`calls/${callId}/signal`, 'POST', { signal_type: 'offer', sdp: 's' }, bTok)).status, 200, 'member signals');
  assert.equal((await second.api('calls', 'POST', { conversation_id: cid, kind: 'voice' }, oTok)).status, 404, 'outsider cannot create');
  assert.equal((await second.api(`calls/${callId}/signal`, 'POST', { signal_type: 'offer', sdp: 's' }, oTok)).status, 404, 'outsider cannot signal');
  assert.equal((await second.api('calls/does-not-exist/signal', 'POST', { signal_type: 'offer', sdp: 's' }, bTok)).status, 404, 'forged call id fails closed');
});
