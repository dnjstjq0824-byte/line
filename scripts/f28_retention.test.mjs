// A9 (F28): retention windows live in one constant (TEMPORARY values until
// legal review); the admin purge deletes only expired rows — old messages,
// old attachments (+R2 bytes), revoked-only old sessions, old audit rows,
// closed-only old reports — and finalizes grace-expired deletions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket, F24_CONSENT } from './test_helpers.mjs';

let f28Serial = 0;
async function f28Isolate(db, bucket, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f28=${++f28Serial}`);
  const env = { DB: db, MEDIA_BUCKET: bucket, ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api };
}

const PW = 'Str0ng!Passw0rd';
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();

async function register(api, email) {
  const res = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
  assert.equal(res.status, 201);
  return res.json();
}

async function login(api, email) {
  const res = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(res.status, 200);
  return res.json();
}

test('F28: purge deletes only expired rows and finalizes old deletions', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api } = await f28Isolate(db, bucket);
    const adminReg = await register(api, 'f28-admin@luno-test.local');
    const adminIso = await f28Isolate(db, bucket, { ADMIN_USER_IDS: adminReg.id });
    const sa = await login(adminIso.api, 'f28-admin@luno-test.local');
    const adminTok = sa.access_token;
    await register(api, 'f28-u@luno-test.local');
    const su = await login(api, 'f28-u@luno-test.local');

    // Two soft-deleted users: one past grace, one fresh.
    for (const email of ['f28-old@luno-test.local', 'f28-new@luno-test.local']) {
      await register(api, email);
      const s = await login(api, email);
      assert.equal((await api('me', 'DELETE', { password: PW, confirm_text: email }, s.access_token)).status, 200);
    }
    db.raw.prepare('UPDATE users SET deleted_at = ? WHERE email = ?').run(ago(40), 'f28-old@luno-test.local');

    // Old + fresh rows per type.
    db.raw.prepare("INSERT INTO luno_messages (id, conversation_id, sender_id, client_id, sequence, kind, body, metadata, reply_to, created_at, unsent, edited_at) VALUES ('m-old', 'c1', 'u1', 'c-old', 1, 'text', 'old', '{}', NULL, ?, 0, NULL)").run(ago(1460));
    db.raw.prepare("INSERT INTO luno_messages (id, conversation_id, sender_id, client_id, sequence, kind, body, metadata, reply_to, created_at, unsent, edited_at) VALUES ('m-new', 'c1', 'u1', 'c-new', 2, 'text', 'new', '{}', NULL, ?, 0, NULL)").run(ago(10));
    await bucket.put('att/old', new Uint8Array([1, 2, 3]));
    await bucket.put('att/new', new Uint8Array([4, 5, 6]));
    db.raw.prepare('INSERT INTO attachments (id, conversation_id, object_key, name, mime_type, size_bytes, sha256, uploader_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('att-old', 'c1', 'att/old', 'o.png', 'image/png', 3, 'aa', su.user_id, ago(1460));
    db.raw.prepare('INSERT INTO attachments (id, conversation_id, object_key, name, mime_type, size_bytes, sha256, uploader_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('att-new', 'c1', 'att/new', 'n.png', 'image/png', 3, 'bb', su.user_id, ago(10));
    db.raw.prepare('INSERT INTO luno_attachments (id, conversation_id, owner_id, name, mime, size, b64, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('latt-old', 'c1', su.user_id, 'l.png', 'image/png', 3, 'eA==', ago(1460));
    db.raw.prepare('INSERT INTO luno_sessions (token_hash, session_id, user_id, role, device_name, platform, ip, created_at, last_seen_at, revoked_at, revoked_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('h-old', 's-old', su.user_id, 'user', 'd', 'web', '1.1.1.1', ago(200), ago(200), ago(100), 'admin');
    db.raw.prepare('INSERT INTO luno_sessions (token_hash, session_id, user_id, role, device_name, platform, ip, created_at, last_seen_at, revoked_at, revoked_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('h-live', 's-live', su.user_id, 'user', 'd', 'web', '1.1.1.1', ago(200), ago(1), null, null);
    db.raw.prepare('INSERT INTO luno_sessions (token_hash, session_id, user_id, role, device_name, platform, ip, created_at, last_seen_at, revoked_at, revoked_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('h-fresh', 's-fresh', su.user_id, 'user', 'd', 'web', '1.1.1.1', ago(20), ago(20), ago(10), 'admin');
    db.raw.prepare('INSERT INTO luno_audit (actor, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)').run('u1', 'probe.old', 't', null, ago(2200));
    db.raw.prepare('INSERT INTO luno_audit (actor, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)').run('u1', 'probe.new', 't', null, ago(10));
    db.raw.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('r-old-closed', su.user_id, 'user', su.user_id, 'spam', '', 'resolved', ago(1460));
    db.raw.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('r-old-open', su.user_id, 'user', su.user_id, 'spam', '', 'open', ago(1460));
    db.raw.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('r-new', su.user_id, 'user', su.user_id, 'spam', '', 'resolved', ago(10));

    assert.equal((await adminIso.api('admin/retention/purge', 'POST', null, su.access_token)).status, 403, 'users cannot purge');
    const res = await adminIso.api('admin/retention/purge', 'POST', null, adminTok);
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.deepEqual(out.purged, { messages: 1, attachments: 2, access_records: 1, audit_logs: 1, reports: 1, deleted_accounts: 1 });
    assert.deepEqual(Object.keys(out.retention_days).sort(), ['access_records', 'attachments', 'audit_logs', 'deleted_accounts_grace_days', 'messages', 'reports']);

    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_messages WHERE id = ?').get('m-old').n, 0);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_messages WHERE id = ?').get('m-new').n, 1);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM attachments WHERE id = ?').get('att-old').n, 0);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM attachments WHERE id = ?').get('att-new').n, 1);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_attachments WHERE id = ?').get('latt-old').n, 0);
    assert.equal(await bucket.get('att/old'), null, 'old bytes gone');
    assert.ok(await bucket.get('att/new'), 'fresh bytes stay');
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_sessions WHERE session_id = ?').get('s-old').n, 0);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_sessions WHERE session_id = ?').get('s-live').n, 1, 'live sessions are state, not history');
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_sessions WHERE session_id = ?').get('s-fresh').n, 1);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_audit WHERE action = ?').get('probe.old').n, 0);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM luno_audit WHERE action = ?').get('probe.new').n, 1);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM reports WHERE id = ?').get('r-old-closed').n, 0);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM reports WHERE id = ?').get('r-old-open').n, 1, 'open reports are pending work');
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM reports WHERE id = ?').get('r-new').n, 1);
    const oldUser = db.raw.prepare('SELECT display_name, password_hash FROM users WHERE email = ?').get('f28-old@luno-test.local');
    assert.equal(oldUser.display_name, '탈퇴한 사용자');
    assert.equal(oldUser.password_hash, 'pbkdf2$deleted');
    const newUser = db.raw.prepare("SELECT state, deleted_at FROM users WHERE email = ?").get('f28-new@luno-test.local');
    assert.equal(newUser.state, 'deleted', 'fresh deletion stays in grace');
    assert.ok(newUser.deleted_at, 'grace stamp kept');
    assert.ok(db.raw.prepare("SELECT * FROM luno_audit WHERE action = 'retention.purge'").get(), 'purge audited');
  } finally { db.raw.close(); }
});

test('F28: purge needs a database', async () => {
  const mod = await import(`./cf_worker.js?f28=${++f28Serial}`);
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), { ADMIN_INITIAL_PASSWORD: 'Str0ng!Passw0rd' });
  const s = await api('auth/login', 'POST', { email: 'admin@luno.local', password: 'Str0ng!Passw0rd' });
  assert.equal(s.status, 200);
  assert.equal((await api('admin/retention/purge', 'POST', null, (await s.json()).access_token)).status, 503);
});
