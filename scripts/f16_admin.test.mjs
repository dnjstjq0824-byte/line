// Stage 10 (F16): admin console on D1 — users, reports, moderation
// (warn/suspend/ban/activate/dismiss/erase), audit logs, feature flags,
// stats. Sanctions kill sessions at once; report -> suspend -> login 401
// holds across isolates; expired suspensions lift themselves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeD1 , F24_CONSENT } from './test_helpers.mjs';

let f16Serial = 0;
async function f16Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f16=${++f16Serial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api };
}

const PW = 'Str0ng!Passw0rd';

async function register(api, email) {
  const res = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
  assert.equal(res.status, 201);
  return res.json();
}

async function login(api, email, password = PW) {
  return api('auth/login', 'POST', { email, password });
}

async function makeAdmin(db, email = 'f16-admin@luno-test.local') {
  const plain = await f16Isolate(db);
  const reg = await register(plain.api, email);
  const { api } = await f16Isolate(db, { ADMIN_USER_IDS: reg.id });
  const s = await (await login(api, email)).json();
  return { api, token: s.access_token, id: reg.id };
}

test('F16: report -> suspend -> login blocked, durable across isolates', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const a = await register(admin.api, 'f16-a@luno-test.local');
    const b = await register(admin.api, 'f16-b@luno-test.local');
    const sa = await (await login(admin.api, 'f16-a@luno-test.local')).json();
    const sb = await (await login(admin.api, 'f16-b@luno-test.local')).json();
    // A reports B; the report is open and listed.
    const rep = await admin.api('reports', 'POST', { subject_user_id: b.id, category: 'spam', details: 'ads daily' }, sa.access_token);
    assert.equal(rep.status, 201);
    const rid = (await rep.json()).id;
    const listed = await (await admin.api('admin/reports', 'GET', null, admin.token)).json();
    assert.ok(listed.reports.some((r) => r.id === rid && r.state === 'open'), 'open report listed');
    const statsOpen = await (await admin.api('admin/stats', 'GET', null, admin.token)).json();
    assert.equal(statsOpen.metrics.open_reports, 1, 'one open report');
    // Suspend with the report attached: resolved + ban row + sessions dead.
    const mod = await admin.api('admin/moderation/actions', 'POST', { subject_user_id: b.id, action: 'suspend', reason: 'spam wave', report_id: rid }, admin.token);
    assert.equal(mod.status, 200);
    assert.equal(db.raw.prepare('SELECT status FROM reports WHERE id = ?').get(rid).status, 'resolved');
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM user_bans WHERE user_id = ?').get(b.id).n, 1);
    assert.equal((await login(admin.api, 'f16-b@luno-test.local')).status, 401, 'login blocked');
    assert.equal((await admin.api('me', 'GET', null, sb.access_token)).status, 401, 'live session killed');
    // Fresh isolate (empty memory): everything still holds from D1.
    const cold = await f16Isolate(db, { ADMIN_USER_IDS: admin.id });
    const s2 = await (await login(cold.api, 'f16-admin@luno-test.local')).json();
    assert.equal((await login(cold.api, 'f16-b@luno-test.local')).status, 401, 'still blocked cold');
    const stats = await (await cold.api('admin/stats', 'GET', null, s2.access_token)).json();
    assert.ok(stats.metrics.users >= 3, 'user count from D1');
    assert.equal(stats.metrics.open_reports, 0, 'no open reports');
    assert.ok(stats.metrics.active_sessions >= 1, 'sessions counted');
    const logs = await (await cold.api('admin/audit-logs', 'GET', null, s2.access_token)).json();
    assert.ok(logs.audit_logs.some((l) => l.action === 'moderation.suspend' && l.target_id === b.id), 'suspend audited in D1');
    const users = await (await cold.api('admin/users', 'GET', null, s2.access_token)).json();
    assert.equal(users.users.find((u) => u.id === b.id).state, 'suspended', 'standing visible cold');
  } finally { db.raw.close(); }
});

test('F16: warn is audit-only, ban is permanent, activate lifts', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const w = await register(admin.api, 'f16-w@luno-test.local');
    const p = await register(admin.api, 'f16-p@luno-test.local');
    assert.equal((await admin.api('admin/moderation/actions', 'POST', { subject_user_id: w.id, action: 'warn', reason: 'noted' }, admin.token)).status, 200);
    assert.equal((await login(admin.api, 'f16-w@luno-test.local')).status, 200, 'warned user still logs in');
    assert.equal((await admin.api('admin/moderation/actions', 'POST', { subject_user_id: p.id, action: 'ban', reason: 'never again' }, admin.token)).status, 200);
    assert.equal(db.raw.prepare('SELECT expires_at FROM user_bans WHERE user_id = ?').get(p.id).expires_at, 0, 'ban never expires');
    assert.equal((await login(admin.api, 'f16-p@luno-test.local')).status, 401, 'banned login blocked');
    assert.equal((await admin.api('admin/moderation/actions', 'POST', { subject_user_id: p.id, action: 'activate' }, admin.token)).status, 200);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM user_bans WHERE user_id = ?').get(p.id).n, 0, 'ban row cleared');
    assert.equal((await login(admin.api, 'f16-p@luno-test.local')).status, 200, 'activate restores login');
    const logs = await (await admin.api('admin/audit-logs', 'GET', null, admin.token)).json();
    for (const a of ['moderation.warn', 'moderation.ban', 'moderation.activate']) {
      assert.ok(logs.audit_logs.some((l) => l.action === a), `${a} audited`);
    }
  } finally { db.raw.close(); }
});

test('F16: expired temporary suspensions lift themselves', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const t = await register(admin.api, 'f16-t@luno-test.local');
    await login(admin.api, 'f16-t@luno-test.local');
    assert.equal((await admin.api('admin/moderation/actions', 'POST', { subject_user_id: t.id, action: 'suspend', duration_days: 1, reason: 'cooldown' }, admin.token)).status, 200);
    assert.ok(db.raw.prepare('SELECT expires_at FROM user_bans WHERE user_id = ?').get(t.id).expires_at > Date.now(), 'future expiry set');
    assert.equal((await login(admin.api, 'f16-t@luno-test.local')).status, 401, 'blocked while live');
    db.raw.prepare('UPDATE user_bans SET expires_at = ? WHERE user_id = ?').run(Date.now() - 1000, t.id);
    assert.equal((await login(admin.api, 'f16-t@luno-test.local')).status, 200, 'login works past expiry');
    assert.equal(db.raw.prepare("SELECT state FROM users WHERE id = ?").get(t.id).state, 'active', 'standing healed');
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM user_bans WHERE user_id = ?').get(t.id).n, 0, 'spent row purged');
  } finally { db.raw.close(); }
});

test('F16: erase wipes a minor immediately with no grace', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const k = await register(admin.api, 'f16-k@luno-test.local');
    const sk = await (await login(admin.api, 'f16-k@luno-test.local')).json();
    assert.equal((await admin.api('admin/moderation/actions', 'POST', { subject_user_id: k.id, action: 'erase' }, admin.token)).status, 400, 'reason required');
    assert.equal((await admin.api('admin/moderation/actions', 'POST', { subject_user_id: admin.id, action: 'erase', reason: 'x' }, admin.token)).status, 403, 'admins immune');
    assert.equal((await admin.api('admin/moderation/actions', 'POST', { subject_user_id: k.id, action: 'erase', reason: 'under-14 confirmed' }, admin.token)).status, 200);
    assert.equal(db.raw.prepare('SELECT state FROM users WHERE id = ?').get(k.id).state, 'deleted');
    assert.equal((await login(admin.api, 'f16-k@luno-test.local')).status, 401, 'erased login blocked');
    assert.equal((await admin.api('me', 'GET', null, sk.access_token)).status, 401, 'erased session dead');
    const logs = await (await admin.api('admin/audit-logs', 'GET', null, admin.token)).json();
    assert.ok(logs.audit_logs.some((l) => l.action === 'moderation.erase' && l.target_id === k.id), 'erase audited');
  } finally { db.raw.close(); }
});

test('F16: feature flags persist across isolates', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const before = await (await admin.api('admin/feature-flags', 'GET', null, admin.token)).json();
    assert.ok(before.feature_flags.some((f) => f.key === 'webrtc_group_calling'), 'seeds listed');
    assert.equal((await admin.api('admin/feature-flags', 'PUT', { key: 'NOPE', enabled: true }, admin.token)).status, 400, 'bad key rejected');
    assert.equal((await admin.api('admin/feature-flags', 'PUT', { key: 'f16_drill_flag', enabled: true }, admin.token)).status, 200);
    const cold = await f16Isolate(db, { ADMIN_USER_IDS: admin.id });
    const s2 = await (await login(cold.api, 'f16-admin@luno-test.local')).json();
    const after = await (await cold.api('admin/feature-flags', 'GET', null, s2.access_token)).json();
    const flag = after.feature_flags.find((f) => f.key === 'f16_drill_flag');
    assert.ok(flag && flag.enabled === true, 'flag survives restart');
    const logs = await (await cold.api('admin/audit-logs', 'GET', null, s2.access_token)).json();
    assert.ok(logs.audit_logs.some((l) => l.action === 'feature_flag.enable' && l.target_id === 'f16_drill_flag'), 'flag change audited');
  } finally { db.raw.close(); }
});

test('F16: admin console drives users, reports, sanctions, flags and audit', async () => {
  const view = await readFile(new URL('../apps/admin-console/src/App.vue', import.meta.url), 'utf8');
  for (const ep of ['admin/stats', 'admin/users', 'admin/reports', 'admin/audit-logs', 'admin/feature-flags', 'admin/moderation/actions']) {
    assert.ok(view.includes(ep), `console calls ${ep}`);
  }
  assert.match(view, /takeAction\(row\.id, 'ban'\)/, 'ban button wired');
  assert.match(view, /takeAction\(row\.id, 'erase'\)/, 'erase button wired');
  assert.ok(view.includes('admin.eraseConfirm'), 'erase asks first');
  const i18n = await readFile(new URL('../apps/shared/console-i18n.ts', import.meta.url), 'utf8');
  for (const key of ['admin.ban', 'admin.erase', 'admin.eraseConfirm']) {
    assert.equal(i18n.split(`'${key}'`).length - 1, 2, `${key} in ko+en`);
  }
});
