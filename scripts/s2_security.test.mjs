import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

// S2 security pins: CORS allowlist, admin-only real metrics. Grows with the
// S2 batch (demo removal, plaintext fallback, kinds, blocks, delete, wallet).
async function mkWorker(tag) {
  const { default: w } = await import(`./cf_worker.js?s2-${tag}`);
  return w;
}
const worker = await mkWorker('cors');
const workerDb = await mkWorker('metrics');

const ALLOW = 'https://luno-messenger.dnjstjqppk.workers.dev,http://localhost:5173';
async function call(path, { token = null, method = 'GET', body, origin = null, env = {} } = {}) {
  const res = await worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(origin ? { Origin: origin } : {}),
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { ALLOW_LOCAL_DEMO: 'true', ALLOWED_ORIGINS: ALLOW, ...env });
  return res;
}
async function callDb(path, opts = {}) {
  const { token = null, method = 'GET', body, origin = null, env = {} } = opts;
  const res = await workerDb.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(origin ? { Origin: origin } : {}),
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { ALLOW_LOCAL_DEMO: 'true', ALLOWED_ORIGINS: ALLOW, ...env });
  return res;
}
async function adminToken() {
  const res = await callDb('auth/login', {
    method: 'POST',
    body: { email: 'admin@luno.local', password: 'S2#Admin2026!' },
    env: { ADMIN_INITIAL_PASSWORD: 'S2#Admin2026!' },
  });
  assert.equal(res.status, 200);
  return (await res.json()).access_token;
}

test('CORS reflects allowlisted origins only', async () => {
  const ok = await call('version', { origin: 'http://localhost:5173' });
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
  assert.equal(ok.headers.get('Vary'), 'Origin');
  const same = await call('version', { origin: 'http://localhost' });
  assert.equal(same.headers.get('Access-Control-Allow-Origin'), 'http://localhost');
  const evil = await call('version', { origin: 'https://evil.test' });
  assert.equal(evil.headers.get('Access-Control-Allow-Origin'), null);
  const none = await call('version');
  assert.equal(none.headers.get('Access-Control-Allow-Origin'), null);
});

test('preflight gates methods on the allowlist', async () => {
  const raw = await worker.fetch(new Request('http://localhost/api/v1/auth/login', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' },
  }), { ALLOW_LOCAL_DEMO: 'true', ALLOWED_ORIGINS: ALLOW });
  assert.equal(raw.status, 204);
  assert.ok((raw.headers.get('Access-Control-Allow-Methods') || '').includes('POST'));
  const evil = await worker.fetch(new Request('http://localhost/api/v1/auth/login', {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.test', 'Access-Control-Request-Method': 'POST' },
  }), { ALLOW_LOCAL_DEMO: 'true', ALLOWED_ORIGINS: ALLOW });
  assert.equal(evil.status, 204);
  assert.equal(evil.headers.get('Access-Control-Allow-Origin'), null);
});

test('metrics requires admin and reports real D1 counts', async () => {
  const anon = await workerDb.fetch(new Request('http://localhost/metrics'), { ALLOW_LOCAL_DEMO: 'true', ADMIN_INITIAL_PASSWORD: 'S2#Admin2026!' });
  assert.equal(anon.status, 401);
  const reg = await callDb('auth/register', { method: 'POST', body: { email: 's2m@example.test', password: 'S2#Metr2026', display_name: 'S2 M' } });
  assert.equal(reg.status, 201);
  const login = await callDb('auth/login', { method: 'POST', body: { email: 's2m@example.test', password: 'S2#Metr2026' } });
  const userTok = (await login.json()).access_token;
  const userRes = await workerDb.fetch(new Request('http://localhost/metrics', {
    headers: { Authorization: `Bearer ${userTok}` },
  }), { ALLOW_LOCAL_DEMO: 'true' });
  assert.equal(userRes.status, 403);
  const adm = await adminToken();
  const noDb = await workerDb.fetch(new Request('http://localhost/metrics', {
    headers: { Authorization: `Bearer ${adm}` },
  }), { ALLOW_LOCAL_DEMO: 'true' });
  assert.equal(noDb.status, 503);
  const raw = new DatabaseSync(':memory:');
  const fsMod = await import('node:fs');
  raw.exec(fsMod.readFileSync(new URL('./schema_d1.sql', import.meta.url), 'utf8'));
  raw.exec(fsMod.readFileSync(new URL('./migrations/20261105_explicit_user_roles.sql', import.meta.url), 'utf8'));
  raw.exec(`INSERT OR IGNORE INTO users (id, email, handle, password_hash, display_name, created_at, updated_at) VALUES ('00000000-0000-0000-0000-000000000001', 'admin@luno.local', 'admin', 'seeded-memory', 'System Administrator', datetime('now'), datetime('now'))`);
  raw.exec(`INSERT OR REPLACE INTO luno_user_roles (user_id, role, approved_by, approved_at) VALUES ('00000000-0000-0000-0000-000000000001', 'admin', 's2-test', datetime('now'))`);
  const db = {
    prepare(sql) {
      let params = [];
      const st = {
        sql,
        bind(...p) { params = p; return st; },
        runDirect() { const r = raw.prepare(sql).run(...params); return { success: true, meta: { changes: 1 } }; },
        async run() { return st.runDirect(); },
        async first() { const row = raw.prepare(sql).get(...params); return row ? { ...row } : null; },
        async all() { return { results: raw.prepare(sql).all(...params).map((r) => ({ ...r })) }; },
      };
      return st;
    },
    async batch(s) { raw.exec('BEGIN'); try { const r = s.map((x) => x.runDirect()); raw.exec('COMMIT'); return r; } catch (e) { raw.exec('ROLLBACK'); throw e; } },
  };
  const dbLogin = await callDb('auth/login', {
    method: 'POST',
    body: { email: 'admin@luno.local', password: 'S2#Admin2026!' },
    env: { ADMIN_INITIAL_PASSWORD: 'S2#Admin2026!', DB: db },
  });
  assert.equal(dbLogin.status, 200);
  const dbAdm = (await dbLogin.json()).access_token;
  const ok = await workerDb.fetch(new Request('http://localhost/metrics', {
    headers: { Authorization: `Bearer ${dbAdm}` },
  }), { ALLOW_LOCAL_DEMO: 'true', DB: db });
  assert.equal(ok.status, 200);
  const text = await ok.text();
  assert.match(text, /luno_users_total \d+/);
  assert.match(text, /luno_sessions_active \d+/);
  assert.match(text, /luno_build_info\{commit="[^"]+"\} 1/);
  assert.doesNotMatch(text, /cf_edge_requests_total 1\n/);
});
