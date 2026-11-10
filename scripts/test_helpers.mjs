// Shared D1 + R2 fakes for worker tests (A-20/B-3). Not a test itself:
// node --test only runs scripts/*.test.mjs, so this helper never executes alone.
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function makeD1() {
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

// Minimal R2 bucket fake: put/get/delete with byte-fidelity bodies.
export function makeBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, value) {
      objects.set(key, value instanceof Uint8Array ? value.slice() : new Uint8Array(value));
    },
    async get(key) {
      const v = objects.get(key);
      if (!v) return null;
      const copy = v.slice();
      return { async arrayBuffer() { return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength); } };
    },
    async delete(key) { objects.delete(key); },
  };
}
