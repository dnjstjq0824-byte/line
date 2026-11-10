import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

// S1 (Phase 1 schema): the worker's runtime ensure must create every base
// + phase1 table on a fresh database (prod D1 is migrated by deploy, not by
// CLI), and legacy users rows must gain the handle backfill + unique index.
// Each case boots a FRESH worker isolate (module state is per-isolate).
let serial = 0;
function shim(raw) {
  return {
    raw,
    prepare(sql) {
      let params = [];
      const st = {
        sql,
        bind(...p) { params = p; return st; },
        runDirect() {
          const r = raw.prepare(sql).run(...params);
          return { success: true, meta: { changes: Number(r.changes) } };
        },
        async run() { return st.runDirect(); },
        async first() { const row = raw.prepare(sql).get(...params); return row ? { ...row } : null; },
        async all() { return { results: raw.prepare(sql).all(...params).map((row) => ({ ...row })) }; },
      };
      return st;
    },
    async batch(statements) {
      raw.exec('BEGIN');
      try { const r = statements.map((st) => st.runDirect()); raw.exec('COMMIT'); return r; } catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
}
async function apiFor(db) {
  const { default: worker } = await import(`./cf_worker.js?phase1=${++serial}`);
  return (path, token, method = 'GET', body) => worker.fetch(new Request('http://localhost/api/v1/' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), { ALLOW_LOCAL_DEMO: 'true', DB: db });
}
const tablesOf = (raw) => raw.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);

test('fresh database gains all base + phase1 tables via runtime ensure', async () => {
  const raw = new DatabaseSync(':memory:');
  const api = await apiFor(shim(raw));
  const reg = await api('auth/register', null, 'POST', { email: 's1a@example.test', password: 'S1#Schema2026', display_name: 'S1 A' });
  assert.equal(reg.status, 201);
  const tables = tablesOf(raw);
  for (const t of ['users', 'refresh_tokens', 'login_attempts', 'rate_limits', 'friends', 'blocks',
    'conversations', 'conversation_members', 'reports', 'user_bans', 'audit_logs', 'e2ee_keys',
    'push_tokens', 'conversation_notes', 'conversation_events', 'event_rsvps', 'polls', 'poll_votes',
    'reactions', 'call_logs', 'attachments', 'luno_sessions', 'luno_messages']) {
    assert.ok(tables.includes(t), 'missing table ' + t);
  }
  const cols = raw.prepare('PRAGMA table_info(users)').all().map((r) => r.name);
  assert.ok(cols.includes('handle') && cols.includes('birthday'));
});

test('legacy users rows gain handle backfill and unique index', async () => {
  const raw = new DatabaseSync(':memory:');
  raw.exec('CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, display_name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
  raw.exec(`INSERT INTO users VALUES ('u-legacy-1', 'legacy@example.test', 'x', 'Legacy', '2026-01-01', '2026-01-01')`);
  const api = await apiFor(shim(raw));
  const reg = await api('auth/register', null, 'POST', { email: 's1b@example.test', password: 'S1#Schema2026', display_name: 'S1 B' });
  assert.equal(reg.status, 201);
  const cols = raw.prepare('PRAGMA table_info(users)').all().map((r) => r.name);
  assert.ok(cols.includes('handle') && cols.includes('birthday'));
  const row = raw.prepare('SELECT handle FROM users WHERE id=?').get('u-legacy-1');
  assert.equal(row.handle, 'user_u-legacy');
  const idx = raw.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_users_handle'").get();
  assert.ok(idx, 'handle unique index exists');
});
