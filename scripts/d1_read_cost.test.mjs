// D1 bills rows read. These tests pin the hot read paths to index lookups so a
// conversation-list refresh reads about one row per room plus its unread messages,
// not every stored message (Cloudflare analytics, 2026-11: one ROW_NUMBER() window
// query on GET /conversations was ~91% of all rows read).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
let serial = 0;
function database({ roles = false } = {}) {
  const raw = new DatabaseSync(':memory:');
  raw.exec(fs.readFileSync(new URL('./schema_d1.sql', import.meta.url), 'utf8'));
  if (roles) raw.exec(fs.readFileSync(new URL('./migrations/20261105_explicit_user_roles.sql', import.meta.url), 'utf8'));
  const log = [];
  const db = { raw, log, prepare(sql) {
    let params = [];
    const st = {
      sql, bind(...p) { params = p; return st; },
      runDirect() { log.push({ sql, params }); const r = raw.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
      async run() { return st.runDirect(); },
      async first() { log.push({ sql, params }); const row = raw.prepare(sql).get(...params); return row ? { ...row } : null; },
      async all() { log.push({ sql, params }); return { results: raw.prepare(sql).all(...params).map(row => ({ ...row })) }; }
    };
    return st;
  }, async batch(statements) {
    raw.exec('BEGIN');
    try { const result = statements.map(st => st.runDirect()); raw.exec('COMMIT'); return result; }
    catch (error) { raw.exec('ROLLBACK'); throw error; }
  } };
  return db;
}
async function isolate(db) {
  const { default: worker } = await import(`./cf_worker.js?readcost=${++serial}`);
  return async (path, token, method = 'GET', body) => worker.fetch(new Request('http://localhost/api/v1/' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {})
  }), { ALLOW_LOCAL_DEMO: 'true', DB: db });
}
async function account(api) {
  const body = { email: `readcost-${serial}@example.test`, password: 'ReadCost#Audit2026', display_name: 'Read cost' };
  const registration = await api('auth/register', null, 'POST', body); assert.equal(registration.status, 201);
  const user = await registration.json();
  const login = await api('auth/login', null, 'POST', body); assert.equal(login.status, 200);
  return { ...user, ...await login.json() };
}
function plan(db, sql, params) {
  return db.raw.prepare('EXPLAIN QUERY PLAN ' + sql).all(...params).map(row => row.detail);
}
function assertIndexed(db, entry, table) {
  const details = plan(db, entry.sql, entry.params);
  const scans = details.filter(d => new RegExp(`^SCAN ${table}\\b`).test(d) && !/USING (COVERING )?INDEX/.test(d));
  assert.deepEqual(scans, [], `full scan of ${table}:\n${entry.sql}\n${details.join('\n')}`);
}

test('conversation list reads the latest and unread messages through indexes and keeps unread counts exact', async () => {
  const db = database();
  try {
    const api = await isolate(db);
    const me = await account(api);
    const list = await (await api('conversations', me.access_token)).json();
    const room = list.conversations.find(c => c.id === `conv-oa-notice-${me.id}`) || list.conversations[0];
    assert.ok(room, 'user has a default conversation');

    // 300 stored messages from another sender; the viewer has read up to 296.
    const insert = db.raw.prepare('INSERT INTO luno_messages (id, conversation_id, sender_id, sequence, kind, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const base = room.last_sequence || 0;
    for (let i = 1; i <= 300; i++) insert.run(`rc-${serial}-${i}`, room.id, 'oa-notice', base + i, 'text', `m${i}`, new Date(Date.UTC(2026, 10, 6, 0, 0, i)).toISOString());
    db.raw.prepare('INSERT OR REPLACE INTO luno_read_cursors (conversation_id, user_id, sequence, updated_at) VALUES (?, ?, ?, ?)').run(room.id, me.id, base + 296, new Date().toISOString());

    // A fresh isolate has none of these messages cached.
    const fresh = await isolate(db);
    db.log.length = 0;
    const response = await fresh('conversations', me.access_token);
    assert.equal(response.status, 200);
    const summary = (await response.json()).conversations.find(c => c.id === room.id);
    assert.equal(summary.unread_count, 4);
    assert.equal(summary.last_sequence, base + 300);
    assert.equal(summary.last_message.body, 'm300');

    const messageReads = db.log.filter(e => /FROM luno_messages/.test(e.sql));
    assert.ok(messageReads.length >= 1);
    assert.ok(!messageReads.some(e => /ROW_NUMBER|OVER\s*\(/i.test(e.sql)), 'no window function over all messages');
    for (const entry of messageReads) assertIndexed(db, entry, 'luno_messages');
    // Rows the list query returns: 1 latest + 4 unread for this room, never the 300 stored.
    const returned = messageReads.reduce((n, e) => n + db.raw.prepare(e.sql).all(...e.params).filter(r => r.conversation_id === room.id).length, 0);
    assert.ok(returned <= 5, `list returned ${returned} rows for one room`);

    // Reading clears the count, and a later list refresh stays exact.
    assert.equal((await fresh(`conversations/${room.id}/read`, me.access_token, 'POST', { sequence: base + 300 })).status, 200);
    const after = (await (await fresh('conversations', me.access_token)).json()).conversations.find(c => c.id === room.id);
    assert.equal(after.unread_count, 0);
  } finally { db.raw.close(); }
});

function authQueries(db) {
  return db.log.filter(e => /luno_sessions|luno_user_roles/.test(e.sql));
}
test('authenticated requests read session and grant in one indexed query; cursors and sessions are indexed', async () => {
  const db = database({ roles: true });
  try {
    const api = await isolate(db);
    const me = await account(api);
    db.log.length = 0;
    assert.equal((await api('me', me.access_token)).status, 200);
    const auth = authQueries(db);
    assert.equal(auth.length, 1, `auth queries:\n${auth.map(e => e.sql).join('\n')}`);
    assert.match(auth[0].sql, /LEFT JOIN luno_user_roles/);
    assertIndexed(db, auth[0], 's');
    assertIndexed(db, auth[0], 'r');

    const cursorRead = { sql: 'SELECT conversation_id, sequence FROM luno_read_cursors WHERE user_id = ?', params: [me.id] };
    assertIndexed(db, cursorRead, 'luno_read_cursors');
    const sessionList = { sql: 'SELECT session_id, device_name, platform, ip, created_at, last_seen_at FROM luno_sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 50', params: [me.id] };
    assert.ok(plan(db, sessionList.sql, sessionList.params).some(d => /idx_luno_sessions_user_active/.test(d)));
  } finally { db.raw.close(); }
});

test('without the grants migration each request costs one session query and still fails closed to user', async () => {
  const db = database();
  try {
    const api = await isolate(db);
    const me = await account(api);
    for (let i = 0; i < 3; i++) {
      db.log.length = 0;
      const response = await api('me', me.access_token);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).role ?? 'user', 'user');
      const auth = authQueries(db);
      assert.equal(auth.length, 1, `request ${i} auth queries:\n${auth.map(e => e.sql).join('\n')}`);
    }
    assert.equal(db.raw.prepare("SELECT name FROM sqlite_master WHERE name='luno_user_roles'").get(), undefined);
  } finally { db.raw.close(); }
});
