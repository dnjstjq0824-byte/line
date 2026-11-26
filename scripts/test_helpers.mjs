// Shared D1 + R2 fakes for worker tests (A-20/B-3). Not a test itself:
// node --test only runs scripts/*.test.mjs, so this helper never executes alone.
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// F24: legal consent preset spread into every test signup body. Versions MUST
// track LEGAL_VERSIONS in cf_worker.js; scripts/f24_consent.test.mjs fails on
// drift, so a version bump breaks loudly instead of silently.
export const F24_CONSENT = {
  birthdate: '1990-01-01',
  consent: { terms: '2026-11-24.1', privacy: '2026-11-21.1' },
};

export function makeD1() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, display_name TEXT, bio TEXT, status_message TEXT, created_at TEXT, updated_at TEXT);
            CREATE TABLE friends (user_id TEXT, friend_id TEXT);
            CREATE TABLE wallets (user_id TEXT PRIMARY KEY, balance INTEGER, updated_at TEXT);`);
  raw.exec(fs.readFileSync(new URL('./migrations/20261105_durable_conversations.sql', import.meta.url), 'utf8'));
  raw.exec(fs.readFileSync(new URL('./migrations/20261114_group_roles.sql', import.meta.url), 'utf8'));
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

// P2 split: worker source scan. Tests asserting on worker source text must
// read the entry plus every worker module, because names move out of
// cf_worker.js into scripts/worker/. Entry stays first so its line numbers
// never shift for positional assertions (f23 caps block).
export async function readWorkerSources() {
  const { readFile } = await import('node:fs/promises');
  const parts = [await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8')];
  let names = [];
  try {
    names = fs.readdirSync(new URL('./worker/', import.meta.url)).filter((f) => f.endsWith('.mjs')).sort();
  } catch { names = []; }
  for (const n of names) parts.push(await readFile(new URL(`./worker/${n}`, import.meta.url), 'utf8'));
  return parts.join('\n');
}

// P2 split: bundle worker modules into one importable source. ONLY for tests
// that patch worker source before importing (explicit_roles): data-URL imports
// cannot resolve relative ./worker/*.mjs specifiers. Constraint: worker modules
// must export through trailing `export {...}` lists only (no inline exports),
// and the entry must reference them through single-line worker import /
// re-export lines only.
export async function bundleWorkerSource(patchedEntrySource) {
  const { readFile } = await import('node:fs/promises');
  const names = fs.readdirSync(new URL('./worker/', import.meta.url)).filter((f) => f.endsWith('.mjs')).sort();
  const mods = [];
  for (const n of names) {
    const text = await readFile(new URL(`./worker/${n}`, import.meta.url), 'utf8');
    // Strip the export list and inter-module imports: concatenated modules
    // share one scope, so cross-module names resolve as globals.
    const flat = text
      .replace(/^export \{[^}]*\};?\s*$/gm, '')
      .replace(/^import \{[^}]*\} from '\.\/[^']+\.mjs';\s*$/gm, '');
    mods.push(`\n// ---- bundled: worker/${n} ----\n${flat}`);
  }
  // Strip both worker imports and worker re-exports (`export ... from`):
  // the concatenated modules already define every name in one scope.
  const entry = patchedEntrySource
    .replace(/^import \{[^}]*\} from '\.\/worker\/[^']+';\s*$/gm, '')
    .replace(/^export \{[^}]*\} from '\.\/worker\/[^']+';[^\n]*$/gm, '');
  return `${mods.join('\n')}\n${entry}`;
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
