// Stage 1 (P0 S1..S6) attack tests: every test replays the reported attack
// against a real sqlite-backed (or memory) isolate, following the
// register_duplicate.test.mjs pattern. One section per card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { makeD1 } from './test_helpers.mjs';

const workerSource = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');

let p0Serial = 0;
async function p0Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?p0=${++p0Serial}`);
  const env = { ...(db ? { DB: db } : {}), ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api, outbox: mod.recoveryMailOutbox, env };
}

async function register(api, email, password = 'Str0ng!Passw0rd', extra = {}) {
  const res = await api('auth/register', 'POST', { email, password, display_name: email.split('@')[0], ...extra });
  assert.equal(res.status, 201, `register ${email}: ${res.status}`);
  return res.json();
}

function codeFor(outbox, email) {
  const found = [...outbox].reverse().find((m) => m.email === email);
  assert.ok(found, `mock mail delivered to ${email}`);
  assert.ok(found.code && found.code.length >= 16, 'delivered code has full entropy');
  return found.code;
}

// ---------- S1: recovery code in the response ----------

test('S1: recover without a mail provider fails closed (501, no code, no challenge row)', async () => {
  const db = makeD1();
  try {
    const { api } = await p0Isolate(db);
    await register(api, 's1-closed@luno-test.local');
    const seen = [];
    for (const email of ['s1-closed@luno-test.local', 's1-nobody@luno-test.local']) {
      const res = await api('auth/recover', 'POST', { email });
      assert.equal(res.status, 501, `recover ${email}`);
      const body = await res.json();
      assert.equal(body.code, 'recovery_unavailable');
      assert.equal(body.recovery_code, undefined, 'no code leaks');
      assert.equal(body.challenge_id, undefined, 'no challenge without a sender');
      seen.push(JSON.stringify(body));
    }
    assert.equal(seen[0], seen[1], 'known and unknown emails answer identically');
    const count = db.raw.prepare('SELECT COUNT(*) AS n FROM luno_recovery_challenges').get();
    assert.equal(count.n, 0, 'no challenge rows created while unconfigured');
  } finally { db.raw.close(); }
});

test('S1: memory isolate without a provider also fails closed', async () => {
  const { api } = await p0Isolate(null);
  await register(api, 's1-mem@luno-test.local');
  for (const email of ['s1-mem@luno-test.local', 's1-mem-ghost@luno-test.local']) {
    const res = await api('auth/recover', 'POST', { email });
    assert.equal(res.status, 501);
    const body = await res.json();
    assert.equal(body.code, 'recovery_unavailable');
    assert.equal(body.recovery_code, undefined);
  }
});

test('S1: mock provider delivers the code out-of-band; verify resets the password', async () => {
  const db = makeD1();
  try {
    const first = await p0Isolate(db, { RECOVERY_MAIL_PROVIDER: 'mock' });
    await register(first.api, 's1-mock@luno-test.local');
    const rec = await first.api('auth/recover', 'POST', { email: 's1-mock@luno-test.local' });
    assert.equal(rec.status, 202);
    const body = await rec.json();
    assert.equal(body.status, 'recovery_token_sent_if_account_exists');
    assert.ok(body.challenge_id, 'client gets the challenge id');
    assert.equal(body.recovery_code, undefined, 'response carries no code');
    const code = codeFor(first.outbox, 's1-mock@luno-test.local');
    // Cross-isolate verify: the D1-backed challenge survives.
    const second = await p0Isolate(db, { RECOVERY_MAIL_PROVIDER: 'mock' });
    const done = await second.api('auth/recover/verify', 'POST', { challenge_id: body.challenge_id, recovery_code: code, new_password: 'N3w!MockPass12' });
    assert.equal(done.status, 200);
    assert.equal((await done.json()).status, 'password_reset');
    assert.equal((await second.api('auth/login', 'POST', { email: 's1-mock@luno-test.local', password: 'N3w!MockPass12' })).status, 200);
    assert.equal((await second.api('auth/login', 'POST', { email: 's1-mock@luno-test.local', password: 'Str0ng!Passw0rd' })).status, 401);
  } finally { db.raw.close(); }
});

test('S1: unknown email is indistinguishable from a known one', async () => {
  const db = makeD1();
  try {
    const { api, outbox } = await p0Isolate(db, { RECOVERY_MAIL_PROVIDER: 'mock' });
    await register(api, 's1-known@luno-test.local');
    const knownRes = await api('auth/recover', 'POST', { email: 's1-known@luno-test.local' });
    assert.equal(knownRes.status, 202);
    const known = await knownRes.json();
    const unknownRes = await api('auth/recover', 'POST', { email: 's1-ghost@luno-test.local' });
    assert.equal(unknownRes.status, 202);
    const unknown = await unknownRes.json();
    assert.deepEqual(Object.keys(unknown).sort(), Object.keys(known).sort(), 'same response shape');
    assert.equal(unknown.status, known.status);
    assert.ok(unknown.challenge_id && unknown.challenge_id !== known.challenge_id, 'decoy challenge id');
    assert.equal(outbox.length, 1, 'no mail sent for the unknown email');
    assert.equal((await api('auth/recover/verify', 'POST', { challenge_id: unknown.challenge_id, recovery_code: 'any-code-0123456789', new_password: 'N3w!GhostPass12' })).status, 401);
  } finally { db.raw.close(); }
});

test('S1/P1-20: concurrent verify consumes the challenge exactly once (D1)', async () => {
  const db = makeD1();
  try {
    const { api, outbox } = await p0Isolate(db, { RECOVERY_MAIL_PROVIDER: 'mock' });
    await register(api, 's1-race@luno-test.local');
    const { challenge_id } = await (await api('auth/recover', 'POST', { email: 's1-race@luno-test.local' })).json();
    const code = codeFor(outbox, 's1-race@luno-test.local');
    const [a, b] = await Promise.all([
      api('auth/recover/verify', 'POST', { challenge_id, recovery_code: code, new_password: 'Race!Winner0001' }),
      api('auth/recover/verify', 'POST', { challenge_id, recovery_code: code, new_password: 'Race!Winner0002' }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409], 'one winner, one replay rejection');
    const works1 = (await api('auth/login', 'POST', { email: 's1-race@luno-test.local', password: 'Race!Winner0001' })).status === 200;
    const works2 = (await api('auth/login', 'POST', { email: 's1-race@luno-test.local', password: 'Race!Winner0002' })).status === 200;
    assert.equal(works1 !== works2, true, 'exactly one winner password works');
    assert.equal((await api('auth/recover/verify', 'POST', { challenge_id, recovery_code: code, new_password: 'Race!Winner0003' })).status, 409);
  } finally { db.raw.close(); }
});

test('S1/P1-20: concurrent verify consumes the challenge exactly once (memory)', async () => {
  const { api, outbox } = await p0Isolate(null, { RECOVERY_MAIL_PROVIDER: 'mock' });
  await register(api, 's1-racem@luno-test.local');
  const { challenge_id } = await (await api('auth/recover', 'POST', { email: 's1-racem@luno-test.local' })).json();
  const code = codeFor(outbox, 's1-racem@luno-test.local');
  const [a, b] = await Promise.all([
    api('auth/recover/verify', 'POST', { challenge_id, recovery_code: code, new_password: 'Race!MemWin0001' }),
    api('auth/recover/verify', 'POST', { challenge_id, recovery_code: code, new_password: 'Race!MemWin0002' }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409], 'one winner, one replay rejection');
});

test('S1: recovery_code never appears in a worker response', () => {
  const hits = workerSource.split('\n').filter((l) => l.includes('recovery_code'));
  assert.ok(hits.length > 0, 'scan sees recovery_code usages');
  for (const line of hits) {
    assert.ok(line.includes('body.recovery_code'), `only the verify request may carry the code, never a response: ${line.trim()}`);
  }
});

const viewSource = await readFile(new URL('../apps/user-web/src/views/AuthView.vue', import.meta.url), 'utf8');
const i18nSource = await readFile(new URL('../apps/user-web/src/luno-i18n.ts', import.meta.url), 'utf8');

test('S1: web never displays the recovery code and explains 501 unavailability', () => {
  assert.ok(!viewSource.includes('recoverCodeShown'), 'no on-screen code variable');
  assert.ok(!/res\.\w*recovery_code/.test(viewSource), 'view never reads a code from the recover response');
  assert.ok(viewSource.includes('mvRecoverUnavailable'), '501 guidance key wired');
  const hits = i18nSource.match(/mvRecoverUnavailable\b/g) || [];
  assert.equal(hits.length, 4, 'mvRecoverUnavailable in all four locales');
});

// ---------- S2: register handle validation + plain INSERT ----------

test('S2: fresh handle registers and is lowercased; rule violations are 400', async () => {
  const db = makeD1();
  try {
    const { api } = await p0Isolate(db);
    const ok = await api('auth/register', 'POST', { email: 's2-fresh@luno-test.local', password: 'Str0ng!Passw0rd', display_name: 'fresh', handle: 'Fresh_Handle.9' });
    assert.equal(ok.status, 201);
    const row = db.raw.prepare('SELECT handle FROM users WHERE email = ?').get('s2-fresh@luno-test.local');
    assert.equal(row.handle, 'fresh_handle.9', 'handle stored lowercased');
    let n = 0;
    for (const badHandle of ['ab', 'a'.repeat(21), 'with space', 'with-hyphen', 'with@at', 'UPPER-HYPHEN', 'under_score_ok?']) {
      const res = await api('auth/register', 'POST', { email: `s2-bad${++n}@luno-test.local`, password: 'Str0ng!Passw0rd', display_name: 'bad', handle: badHandle });
      assert.equal(res.status, 400, `handle ${JSON.stringify(badHandle)}`);
    }
  } finally { db.raw.close(); }
});

test('S2: reserved handles are rejected with 409', async () => {
  const { api } = await p0Isolate(null);
  let n = 0;
  for (const reserved of ['admin', 'Admin', 'ADMIN', 'luno', 'LUNO', 'luno_notice', 'peer', 'peer_x', 'peer.9']) {
    const res = await api('auth/register', 'POST', { email: `s2-rsv${++n}@luno-test.local`, password: 'Str0ng!Passw0rd', display_name: 'rsv', handle: reserved });
    assert.equal(res.status, 409, `reserved ${reserved}`);
  }
  // Near-misses that are NOT the peer prefix stay available.
  const near = await api('auth/register', 'POST', { email: 's2-rsv-near@luno-test.local', password: 'Str0ng!Passw0rd', display_name: 'rsv', handle: 'pearl_diver' });
  assert.equal(near.status, 201, 'pearl_diver is not the peer prefix');
});

test('S2: existing handle in any case is 409 and the original row is untouched', async () => {
  const db = makeD1();
  try {
    const first = await p0Isolate(db);
    await register(first.api, 's2-owner@luno-test.local', 'Owner#Pass99', { handle: 'owner_handle' });
    const before = db.raw.prepare('SELECT id, password_hash FROM users WHERE email = ?').get('s2-owner@luno-test.local');
    const cold = await p0Isolate(db);
    const again = await cold.api('auth/register', 'POST', { email: 's2-thief@luno-test.local', password: 'Thief#Pass99', display_name: 'thief', handle: 'Owner_Handle' });
    assert.equal(again.status, 409, 'case-variant handle duplicate');
    const rows = db.raw.prepare('SELECT * FROM users WHERE LOWER(handle) = ?').all('owner_handle');
    assert.equal(rows.length, 1, 'exactly one row survives');
    assert.equal(rows[0].id, before.id, 'row id untouched');
    assert.equal(rows[0].password_hash, before.password_hash, 'password hash untouched');
    assert.equal(rows[0].email, 's2-owner@luno-test.local', 'owner email untouched');
    assert.equal((await cold.api('auth/login', 'POST', { email: 's2-owner@luno-test.local', password: 'Owner#Pass99' })).status, 200);
  } finally { db.raw.close(); }
});

test('S2: same-isolate handle duplicate is 409', async () => {
  const { api } = await p0Isolate(null);
  await register(api, 's2-mem1@luno-test.local', 'Str0ng!Passw0rd', { handle: 'mem_handle' });
  assert.equal((await api('auth/register', 'POST', { email: 's2-mem2@luno-test.local', password: 'Str0ng!Passw0rd', display_name: 'm2', handle: 'MEM_HANDLE' })).status, 409);
});

test('S2: auto-generated handles are valid and unique', async () => {
  const { api } = await p0Isolate(null);
  const seen = new Set();
  for (let i = 0; i < 5; i++) {
    const email = `s2-auto${i}@luno-test.local`;
    assert.equal((await api('auth/register', 'POST', { email, password: 'Str0ng!Passw0rd', display_name: `auto${i}` })).status, 201);
    const login = await (await api('auth/login', 'POST', { email, password: 'Str0ng!Passw0rd' })).json();
    const me = await (await api('me', 'GET', null, login.access_token)).json();
    assert.match(me.handle, /^[a-z0-9_.]{3,20}$/, 'auto handle follows the profile rule');
    assert.ok(!seen.has(me.handle), 'auto handles are unique');
    seen.add(me.handle);
  }
});

test('S2: auto-generated handle collision retries instead of clobbering', async () => {
  const { api } = await p0Isolate(null);
  const cryptoObj = globalThis.crypto;
  const fixedA = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const fixedB = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  cryptoObj.randomUUID = () => fixedA;
  try {
    await register(api, 's2-cola@luno-test.local');
  } finally {
    delete cryptoObj.randomUUID;
  }
  // id, handle try#1 (collides with user_aaaaaa), handle try#2 (free).
  const seq = [fixedA, fixedA, fixedB, fixedB];
  let n = 0;
  cryptoObj.randomUUID = () => seq[Math.min(n++, seq.length - 1)];
  let res;
  try {
    res = await api('auth/register', 'POST', { email: 's2-colb@luno-test.local', password: 'Str0ng!Passw0rd', display_name: 'colb' });
  } finally {
    delete cryptoObj.randomUUID;
  }
  assert.equal(res.status, 201, 'retry finds a free handle');
  const login = await (await api('auth/login', 'POST', { email: 's2-colb@luno-test.local', password: 'Str0ng!Passw0rd' })).json();
  const me = await (await api('me', 'GET', null, login.access_token)).json();
  assert.equal(me.handle, 'user_bbbbbb', 'second candidate used after the collision');
});

test('S2: users INSERT fails on conflict; wallets INSERT ignores conflicts', () => {
  assert.ok(!workerSource.includes('INSERT OR REPLACE INTO users'), 'no clobbering users write');
  assert.ok(!workerSource.includes('INSERT OR REPLACE INTO wallets'), 'no clobbering wallets write');
  assert.ok(workerSource.includes('INSERT OR IGNORE INTO wallets'), 'wallets write is OR IGNORE');
});

// ---------- S3: register email duplicate check hits D1 ----------

test('S3: email registered on another isolate is 409 with the row untouched', async () => {
  const db = makeD1();
  try {
    const bSide = await p0Isolate(db);
    // Boot B first: its memory snapshot predates the registration below.
    assert.equal((await bSide.api('auth/login', 'POST', { email: 's3-boot@luno-test.local', password: 'x' })).status, 401);
    const aSide = await p0Isolate(db);
    await register(aSide.api, 's3-victim@luno-test.local', 'Victim#Pass99');
    const before = db.raw.prepare('SELECT id, password_hash FROM users WHERE email = ?').get('s3-victim@luno-test.local');
    const again = await bSide.api('auth/register', 'POST', { email: 's3-victim@luno-test.local', password: 'Second#Pass99', display_name: 'second' });
    assert.equal(again.status, 409, 'cross-isolate duplicate email');
    const rows = db.raw.prepare('SELECT id, password_hash FROM users WHERE email = ?').all('s3-victim@luno-test.local');
    assert.equal(rows.length, 1, 'exactly one row survives');
    assert.equal(rows[0].id, before.id, 'row id untouched');
    assert.equal(rows[0].password_hash, before.password_hash, 'password hash untouched');
    assert.equal((await bSide.api('auth/login', 'POST', { email: 's3-victim@luno-test.local', password: 'Victim#Pass99' })).status, 200);
    assert.equal((await bSide.api('auth/login', 'POST', { email: 's3-victim@luno-test.local', password: 'Second#Pass99' })).status, 401);
  } finally { db.raw.close(); }
});

test('S3: case-variant email on a stale isolate is 409', async () => {
  const db = makeD1();
  try {
    const stale = await p0Isolate(db);
    assert.equal((await stale.api('auth/login', 'POST', { email: 's3-boot2@luno-test.local', password: 'x' })).status, 401);
    const other = await p0Isolate(db);
    await register(other.api, 's3-case@luno-test.local');
    assert.equal((await stale.api('auth/register', 'POST', { email: 'S3-Case@Luno-Test.Local', password: 'Second#Pass99', display_name: 'second' })).status, 409);
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1, 'no second row');
  } finally { db.raw.close(); }
});

// ---------- S4: plaintext password rows ----------

test('S4: PBKDF2 accounts log in; plaintext and sha256 rows get reset-required without migration', async () => {
  const db = makeD1();
  try {
    const { api } = await p0Isolate(db);
    await register(api, 's4-good@luno-test.local', 'Good#Pass99');
    assert.equal((await api('auth/login', 'POST', { email: 's4-good@luno-test.local', password: 'Good#Pass99' })).status, 200);
    db.raw.prepare(`INSERT INTO users (id, email, handle, password_hash, display_name, created_at, updated_at)
      VALUES ('s4-plain', 's4-plain@luno-test.local', 's4_plain', 'Plaintext#1', 'Plain', datetime('now'), datetime('now'))`).run();
    db.raw.prepare(`INSERT INTO users (id, email, handle, password_hash, display_name, created_at, updated_at)
      VALUES ('s4-sha', 's4-sha@luno-test.local', 's4_sha', 'sha256:deadbeefcafe', 'Sha', datetime('now'), datetime('now'))`).run();
    const cold = await p0Isolate(db);
    // Correct legacy password and wrong password fail closed identically.
    for (const [email, pw] of [['s4-plain@luno-test.local', 'Plaintext#1'], ['s4-plain@luno-test.local', 'Wrong#Pass99'], ['s4-sha@luno-test.local', 'deadbeefcafe'], ['s4-sha@luno-test.local', 'Wrong#Pass99']]) {
      const res = await cold.api('auth/login', 'POST', { email, password: pw });
      assert.equal(res.status, 403, `legacy login ${email}`);
      assert.equal((await res.json()).code, 'password_reset_required');
    }
    assert.equal(db.raw.prepare('SELECT password_hash AS h FROM users WHERE email = ?').get('s4-plain@luno-test.local').h, 'Plaintext#1', 'plaintext row never migrated');
    assert.equal(db.raw.prepare('SELECT password_hash AS h FROM users WHERE email = ?').get('s4-sha@luno-test.local').h, 'sha256:deadbeefcafe', 'sha256 row never migrated');
  } finally { db.raw.close(); }
});

test('S4: weak-but-valid PBKDF2 rows still verify and are never rewritten on login', async () => {
  const db = makeD1();
  try {
    const boot = await p0Isolate(db);
    await register(boot.api, 's4-boot@luno-test.local');
    const { subtle } = await import('node:crypto');
    const salt = 'ef'.repeat(16);
    const key = await subtle.importKey('raw', new TextEncoder().encode('Weak1k#Pass'), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(Buffer.from(salt, 'hex')), iterations: 1000 }, key, 256);
    const digest = `pbkdf2$1000$${salt}$${Buffer.from(bits).toString('hex')}`;
    db.raw.prepare('INSERT INTO users (id, email, handle, password_hash, display_name) VALUES (?, ?, ?, ?, ?)').run('s4-weak', 's4-weak@luno-test.local', 's4_weak', digest, 'Weak');
    const cold = await p0Isolate(db);
    assert.equal((await cold.api('auth/login', 'POST', { email: 's4-weak@luno-test.local', password: 'Weak1k#Pass' })).status, 200);
    assert.equal(db.raw.prepare('SELECT password_hash AS h FROM users WHERE email = ?').get('s4-weak@luno-test.local').h, digest, 'weak digest never rewritten (no login-time upgrade)');
  } finally { db.raw.close(); }
});

test('S4: no repo SQL file wipes the users table', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.sql')) continue;
      if (/DELETE\s+FROM\s+users\b/i.test(readFileSync(p, 'utf8'))) offenders.push(p);
    }
  };
  const root = join(fileURLToPath(new URL('./', import.meta.url)), '..');
  for (const d of ['database', 'docs', 'scripts']) walk(join(root, d));
  assert.deepEqual(offenders, [], 'wiper SQL must never return');
});

test('S4: revoked legacy passwords exist only as hashes', () => {
  assert.ok(!workerSource.includes('REVOKED_LEGACY_PASSWORDS'), 'plaintext revocation set is gone');
  assert.ok(workerSource.includes('REVOKED_LEGACY_PASSWORD_HASHES'), 'hashed revocation set present');
  const m = workerSource.match(/const REVOKED_LEGACY_PASSWORD_HASHES = new Set\(\[([^\]]*)\]\);/);
  assert.ok(m, 'revocation set declaration found');
  const entries = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
  assert.ok(entries.length >= 10, `revocation keeps all entries (${entries.length})`);
  for (const e of entries) assert.match(e, /^[0-9a-f]{64}$/, 'every entry is a sha256 hex digest');
});
