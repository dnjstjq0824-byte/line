import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
let serial = 0;
function database() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(fs.readFileSync(new URL('./schema_d1.sql', import.meta.url), 'utf8'));
  const migration = fs.readFileSync(new URL('./migrations/20261105_durable_conversations.sql', import.meta.url), 'utf8');
  raw.exec(migration); raw.exec(migration);
  raw.exec(fs.readFileSync(new URL('./migrations/20261105_owned_resources.sql', import.meta.url), 'utf8'));
  return { raw, prepare(sql) {
    let params = [];
    const st = { sql, bind(...p) { params = p; return st; }, runDirect() { const result = raw.prepare(sql).run(...params); return { success: true, meta: { changes: Number(result.changes) } }; }, async run() { return st.runDirect(); }, async first() { const row = raw.prepare(sql).get(...params); return row ? { ...row } : null; }, async all() { return { results: raw.prepare(sql).all(...params).map(row => ({ ...row })) }; } }; return st;
  }, async batch(statements) {
    if (this.beforeBatch) await this.beforeBatch(statements);
    raw.exec('BEGIN');
    try { const result = statements.map(st => st.runDirect()); raw.exec('COMMIT'); return result; }
    catch (error) { raw.exec('ROLLBACK'); throw error; }
  } };
}
async function isolate(db) {
  const { default: worker } = await import(`./cf_worker.js?durable=${++serial}`);
  return async (path, token, method = 'GET', body) => worker.fetch(new Request('http://localhost/api/v1/' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), { ALLOW_LOCAL_DEMO: 'true', DB: db, DURABLE_CONVERSATIONS: 'true', DURABLE_BUSINESS: 'true' });
}
async function account(api, index) {
  const body = { email: `durable-${serial}-${index}@example.test`, password: 'Durable#Audit2026', display_name: `Durable ${index}` };
  const registration = await api('auth/register', null, 'POST', body); assert.equal(registration.status, 201);
  const user = await registration.json();
  const login = await api('auth/login', null, 'POST', body); assert.equal(login.status, 200);
  return { ...user, ...await login.json() };
}
test('new direct chat and messages survive fresh isolates; concurrent create deduplicates and outsider is denied', async () => {
  const db = database();
  try {
    const first = await isolate(db), a = await account(first, 'a'), b = await account(first, 'b'), c = await account(first, 'c');
    const other = await isolate(db);
    const responses = await Promise.all([first('conversations', a.access_token, 'POST', { member_ids: [b.id] }), other('conversations', b.access_token, 'POST', { member_ids: [a.id] })]);
    for (const response of responses) assert.ok([200, 201].includes(response.status));
    const rooms = await Promise.all(responses.map(response => response.json()));
    assert.equal(rooms[0].id, rooms[1].id);
    const cid = rooms[0].id;
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_conversations').get().n, 1);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_conversation_members').get().n, 2);
    const sent = await first(`conversations/${cid}/messages`, a.access_token, 'POST', { body: 'durable across isolates', client_id: 'persist-1' });
    assert.equal(sent.status, 201);
    const restarted = await isolate(db);
    const list = await (await restarted('conversations', b.access_token)).json();
    assert.ok(list.conversations.some(room => room.id === cid));
    const history = await (await restarted(`conversations/${cid}/messages`, b.access_token)).json();
    assert.ok(history.messages.some(message => message.body === 'durable across isolates'));
    for (const path of ['', '/messages', '/sync']) assert.equal((await restarted(`conversations/${cid}${path}`, c.access_token)).status, 404);
    assert.equal((await restarted(`conversations/${cid}/messages`, c.access_token, 'POST', { body: 'intrusion' })).status, 404);
    assert.equal(db.raw.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally { db.raw.close(); }
});
test('group title, owner transfer, kicking and leaving persist and invalidate stale member access', async () => {
  const db = database();
  try {
    const api = await isolate(db), a = await account(api, 'a'), b = await account(api, 'b'), c = await account(api, 'c');
    const created = await api('conversations', a.access_token, 'POST', { kind: 'group', title: 'Original', member_ids: [b.id, c.id] });
    assert.equal(created.status, 201); const room = await created.json();
    const second = await isolate(db);
    assert.equal((await second(`conversations/${room.id}`, b.access_token)).status, 200);
    assert.equal((await api(`conversations/${room.id}`, a.access_token, 'PATCH', { title: 'Persisted title', owner_id: b.id })).status, 200);
    assert.equal((await api(`conversations/${room.id}/members/${c.id}`, a.access_token, 'DELETE')).status, 403);
    assert.equal((await second(`conversations/${room.id}/members/${c.id}`, b.access_token, 'DELETE')).status, 200);
    assert.equal((await api(`conversations/${room.id}`, c.access_token)).status, 404);
    const third = await isolate(db);
    const restored = await (await third(`conversations/${room.id}`, b.access_token)).json();
    assert.equal(restored.title, 'Persisted title'); assert.equal(restored.owner_id, b.id);
    assert.equal((await third(`conversations/${room.id}`, a.access_token, 'DELETE')).status, 200);
    assert.equal((await second(`conversations/${room.id}`, a.access_token)).status, 404);
    assert.equal((await third(`conversations/${room.id}`, b.access_token, 'DELETE')).status, 200);
    assert.ok(db.raw.prepare('SELECT deleted_at FROM luno_conversations WHERE id=?').get(room.id).deleted_at);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_conversation_members WHERE conversation_id=?').get(room.id).n, 0);
    assert.ok(db.raw.prepare('SELECT COUNT(*) n FROM luno_messages WHERE conversation_id=?').get(room.id).n > 0, 'soft deletion retains message rows');
  } finally { db.raw.close(); }
});
test('failed member insert rolls back conversation creation and leaves no partial metadata', async () => {
  const db = database();
  try {
    const api = await isolate(db), a = await account(api, 'a'), b = await account(api, 'b');
    db.raw.exec("CREATE TRIGGER reject_member BEFORE INSERT ON luno_conversation_members BEGIN SELECT RAISE(ABORT,'injected membership failure'); END;");
    assert.equal((await api('conversations', a.access_token, 'POST', { kind: 'group', title: 'must roll back', member_ids: [b.id] })).status, 500);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_conversations').get().n, 0);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_conversation_members').get().n, 0);
  } finally { db.raw.close(); }
});
test('creator and ads ownership survives isolate reload and rejects cross-owner read/update', async () => {
  const db = database();
  try {
    const api = await isolate(db), a = await account(api, 'a'), b = await account(api, 'b');
    for (const [path, field, listKey] of [['creator/packs','title','packs'],['ads/campaigns','name','campaigns']]) {
      const response = await api(path, a.access_token, 'POST', { [field]: 'Private draft' });
      assert.equal(response.status, 201); const value = await response.json();
      const fresh = await isolate(db);
      assert.equal((await fresh(`${path}/${value.id}`, b.access_token)).status, 403);
      assert.equal((await fresh(`${path}/${value.id}`, b.access_token, 'PATCH', { [field]: 'forged', owner_id: b.id })).status, 403);
      const list = await (await fresh(path, b.access_token)).json(); assert.equal(list[listKey].some(row => row.id === value.id), false);
      assert.equal((await fresh(`${path}/${value.id}`, a.access_token, 'PATCH', { [field]: 'Saved draft', owner_id: b.id })).status, 200);
      const restored = await (await (await isolate(db))(`${path}/${value.id}`, a.access_token)).json();
      assert.equal(restored[field], 'Saved draft'); assert.equal(restored.owner_id, a.id); assert.equal(restored.status, 'draft');
    }
  } finally { db.raw.close(); }
});
test('simultaneous group edits reject a stale revision without partially rewriting members', async () => {
  const db = database();
  try {
    const api = await isolate(db), a = await account(api, 'a'), b = await account(api, 'b');
    const room = await (await api('conversations', a.access_token, 'POST', { kind: 'group', title: 'Version one', member_ids: [b.id] })).json();
    const other = await isolate(db);
    let arrived = 0, release; const gate = new Promise(resolve => { release = resolve; });
    db.beforeBatch = async statements => { if (!statements[0].sql.startsWith('UPDATE luno_conversations')) return; if (++arrived === 2) release(); await gate; };
    const responses = await Promise.all([api(`conversations/${room.id}`, a.access_token, 'PATCH', { title: 'Edit A' }), other(`conversations/${room.id}`, a.access_token, 'PATCH', { title: 'Edit B' })]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200,409]);
    const row = db.raw.prepare('SELECT * FROM luno_conversations WHERE id=?').get(room.id);
    assert.equal(row.revision, 2); assert.ok(['Edit A','Edit B'].includes(row.title));
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_conversation_members WHERE conversation_id=?').get(room.id).n, 2);
    assert.equal(db.raw.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally { db.raw.close(); }
});
