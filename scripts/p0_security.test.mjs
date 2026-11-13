// Stage 1 (P0 S1..S6) attack tests: every test replays the reported attack
// against a real sqlite-backed (or memory) isolate, following the
// register_duplicate.test.mjs pattern. One section per card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
