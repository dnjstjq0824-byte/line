import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
let serial = 0;
function database() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(fs.readFileSync(new URL('./schema_d1.sql', import.meta.url), 'utf8'));
  return { raw, prepare(sql) {
    let params = [];
    const statement = {
      bind(...args) { params = args; return statement; },
      async run() { const result = raw.prepare(sql).run(...params); return { success: true, meta: { changes: Number(result.changes) } }; },
      async first() { const result = raw.prepare(sql).get(...params); return result ? { ...result } : null; },
      async all() { return { results: raw.prepare(sql).all(...params).map(row => ({ ...row })) }; }
    }; return statement;
  } };
}
async function isolate(db, source) {
  const module = source ? await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${++serial}`) : await import(`./cf_worker.js?roles=${++serial}`);
  return async (path, token, method = 'GET', body) => module.default.fetch(new Request('http://localhost/api/v1/' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {})
  }), { ALLOW_LOCAL_DEMO: 'true', DB: db });
}
async function register(api, email) {
  const body = { email, password: 'Isolated#Audit2026', display_name: 'Role audit' };
  const registration = await api('auth/register', null, 'POST', body); assert.equal(registration.status, 201);
  const user = await registration.json();
  const login = await api('auth/login', null, 'POST', body); assert.equal(login.status, 200);
  return { user, session: await login.json(), body };
}
test('email-derived role escalation is reproduced in pre-fix source on an isolated SQLite database', async () => {
  const db = database();
  try {
    const fixed = fs.readFileSync(new URL('./cf_worker.js', import.meta.url), 'utf8');
    // Restore only the two former role-inference expressions, and bypass the
    // new role rechecks, to reproduce the old authorization behavior in isolation.
    const before = fixed.replaceAll('role: await storedUserRole(row.id)', "role: row.email.includes('admin') ? 'admin' : 'user'")
      .replace('if (dbOf()) user.role = await storedUserRole(user.id);', '')
      .replace('if (db) user.role = await storedUserRole(userId);', '');
    const api = await isolate(db, before);
    const account = await register(api, 'ordinary-admin-word@example.test');
    const fresh = await isolate(db, before);
    const response = await fresh('partner/accounts/oa-notice/bot-rules', account.session.access_token);
    assert.equal(response.status, 200, 'old code improperly admits an ordinary registrant after isolate reload');
  } finally { db.raw.close(); }
});
test('explicit DB grants survive reload, email does not grant admin, and revocation affects cached sessions', async () => {
  const db = database();
  try {
    const migration = fs.readFileSync(new URL('./migrations/20261105_explicit_user_roles.sql', import.meta.url), 'utf8');
    db.raw.exec(migration); db.raw.exec(migration);
    const api = await isolate(db);
    const account = await register(api, 'ordinary-admin-word@example.test');
    assert.equal(account.session.role, 'user');
    const fresh = await isolate(db);
    for (const instance of [api, fresh]) assert.equal((await instance('partner/accounts/oa-notice/bot-rules', account.session.access_token)).status, 403);
    db.raw.prepare('INSERT INTO luno_user_roles VALUES (?, ?, ?, ?)').run(account.user.id, 'admin', 'isolated test operator', new Date().toISOString());
    assert.equal((await fresh('partner/accounts/oa-notice/bot-rules', account.session.access_token)).status, 200);
    db.raw.prepare("UPDATE luno_user_roles SET role='user' WHERE user_id=?").run(account.user.id);
    const history = db.raw.prepare('SELECT old_role,new_role FROM luno_role_events WHERE user_id=? ORDER BY id').all(account.user.id);
    assert.deepEqual(history.map(row => [row.old_role,row.new_role]), [[null,'admin'],['admin','user']]);
    assert.throws(() => db.raw.exec('DELETE FROM luno_role_events'), /append only/);
    assert.equal((await fresh('partner/accounts/oa-notice/bot-rules', account.session.access_token)).status, 403);
    db.raw.prepare("UPDATE luno_sessions SET role='admin'").run();
    assert.equal((await (await isolate(db))('partner/accounts/oa-notice/bot-rules', account.session.access_token)).status, 403, 'stale session role is not a grant');
  } finally { db.raw.close(); }
});
test('legacy databases without the grant migration default to user without creating a grants table', async () => {
  const db = database();
  try {
    const account = await register(await isolate(db), 'admin-in-email@example.test');
    assert.equal(account.session.role, 'user');
    assert.equal((await (await isolate(db))('partner/accounts/oa-notice/bot-rules', account.session.access_token)).status, 403);
    assert.equal(db.raw.prepare("SELECT name FROM sqlite_master WHERE name='luno_user_roles'").get(), undefined);
  } finally { db.raw.close(); }
});
test('developer app lists isolate owners, never repeat secrets, and reject another owner webhook changes', async () => {
  const db = database();
  try {
    const api = await isolate(db);
    const owner = await register(api, 'app-owner@example.test');
    const other = await register(api, 'app-other@example.test');
    const create = await api('developer/apps', owner.session.access_token, 'POST', { name: 'Private application' });
    assert.equal(create.status, 201);
    const app = await create.json(); assert.ok(app.client_secret); assert.equal(app.client_secret_hash, undefined);
    const ownList = await (await api('developer/apps', owner.session.access_token)).json();
    assert.equal(ownList.apps.length, 1); assert.equal(ownList.apps[0].client_secret, undefined); assert.equal(ownList.apps[0].client_secret_hash, undefined);
    const otherList = await (await api('developer/apps', other.session.access_token)).json();
    assert.equal(otherList.apps.some(value => value.id === app.id), false);
    assert.equal((await api(`developer/apps/${app.id}/webhooks`, other.session.access_token, 'POST', { endpoint_url: 'https://example.test/webhook' })).status, 403);
    assert.equal((await api(`developer/apps/${app.id}/webhooks`, owner.session.access_token, 'POST', { endpoint_url: 'https://example.test/webhook' })).status, 503, 'no fake active webhook without durable configuration');
  } finally { db.raw.close(); }
});
