// F24 terms consent: signup demands current-version consent + a 14+
// birthdate (server-side); the birthdate is never stored; a version bump
// re-gates login until fresh consent rides along; worker/Go/shared-test
// versions cannot drift silently.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeD1, F24_CONSENT } from './test_helpers.mjs';
import { ageOnDate as tsAge } from '../apps/shared/legal.ts';

let f24Serial = 0;
async function f24Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f24=${++f24Serial}`);
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
const ADULT = '1990-01-01';
const CHILD = '2020-06-01';

async function register(api, email, extra = {}) {
  return api('auth/register', 'POST', { email, password: PW, display_name: email.split('@')[0], birthdate: ADULT, consent: F24_CONSENT.consent, ...extra });
}

test('F24: signup without consent or birthdate fails; under-14 blocked', async () => {
  const db = makeD1();
  try {
    const { api } = await f24Isolate(db);
    const none = await api('auth/register', 'POST', { email: 'f24-a@luno-test.local', password: PW, display_name: 'a', birthdate: ADULT });
    assert.equal(none.status, 400);
    assert.equal((await none.json()).code, 'CONSENT_REQUIRED');
    const stale = await register(api, 'f24-b@luno-test.local', { consent: { terms: '0.0', privacy: '0.0' } });
    assert.equal(stale.status, 400);
    assert.equal((await stale.json()).code, 'CONSENT_REQUIRED');
    const noBirth = await api('auth/register', 'POST', { email: 'f24-c@luno-test.local', password: PW, display_name: 'c', consent: F24_CONSENT.consent });
    assert.equal(noBirth.status, 400);
    assert.equal((await noBirth.json()).code, 'BIRTHDATE_REQUIRED');
    const badBirth = await register(api, 'f24-d@luno-test.local', { birthdate: 'not-a-date' });
    assert.equal(badBirth.status, 400);
    const impossible = await register(api, 'f24-e@luno-test.local', { birthdate: '2012-02-30' });
    assert.equal(impossible.status, 400);
    const future = await register(api, 'f24-f@luno-test.local', { birthdate: '2030-01-01' });
    assert.equal(future.status, 400);
    const young = await register(api, 'f24-g@luno-test.local', { birthdate: CHILD });
    assert.equal(young.status, 403);
    assert.equal((await young.json()).code, 'UNDERAGE');
    // Boundary: exactly 14 today passes. (Computed against UTC today, the
    // same day the server uses.)
    const today = new Date().toISOString().slice(0, 10);
    const [y, m, d] = today.split('-').map(Number);
    // Feb 29 babies turn 14 on Feb 28 off leap years; keep the boundary valid.
    const bd = (m === 2 && d === 29) ? 28 : d;
    const exact14 = `${y - 14}-${String(m).padStart(2, '0')}-${String(bd).padStart(2, '0')}`;
    const edge = await register(api, 'f24-h@luno-test.local', { birthdate: exact14 });
    assert.equal(edge.status, 201, 'exactly 14 joins');
    // One day short of 14 is still underage (server-side, UTC day).
    const almostD = new Date(Date.UTC(y, m - 1, bd) + 86400000).toISOString().slice(0, 10);
    const [ay, am, ad] = almostD.split('-').map(Number);
    const almost14 = `${ay - 14}-${String(am).padStart(2, '0')}-${String(ad).padStart(2, '0')}`;
    const edge2 = await register(api, 'f24-h2@luno-test.local', { birthdate: almost14 });
    assert.equal(edge2.status, 403, 'one day short of 14 blocked');
    // None of the rejected signups left a user behind.
    for (const em of ['f24-a', 'f24-b', 'f24-c', 'f24-d', 'f24-e', 'f24-f', 'f24-g', 'f24-h2']) {
      assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM users WHERE email = ?').get(`${em}@luno-test.local`).n, 0);
    }
  } finally { db.raw.close(); }
});

test('F24: consent record keeps versions + age bit; birthdate never stored', async () => {
  const db = makeD1();
  try {
    const { api } = await f24Isolate(db);
    const reg = await register(api, 'f24-i@luno-test.local');
    assert.equal(reg.status, 201);
    const id = (await reg.json()).id;
    const row = db.raw.prepare('SELECT terms_version, privacy_version, age14_confirmed, consented_at FROM luno_consents WHERE user_id = ?').get(id);
    assert.ok(row, 'consent row recorded');
    assert.equal(row.terms_version, F24_CONSENT.consent.terms);
    assert.equal(row.privacy_version, F24_CONSENT.consent.privacy);
    assert.equal(row.age14_confirmed, 1);
    assert.ok(row.consented_at, 'timestamp recorded');
    // The birthdate appears in no table, no column, no log-shaped row.
    const dump = JSON.stringify(db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      .map(t => { try { return db.raw.prepare(`SELECT * FROM ${t.name}`).all(); } catch { return []; } }));
    assert.ok(!dump.includes('1990-01-01'), 'birthdate stored nowhere');
  } finally { db.raw.close(); }
});

test('F24: version bump re-gates login until inline re-consent', async () => {
  const db = makeD1();
  try {
    const { api } = await f24Isolate(db);
    const email = 'f24-j@luno-test.local';
    assert.equal((await register(api, email)).status, 201);
    const id = db.raw.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    // Simulate a user who agreed to an older version. A cold isolate reads
    // the D1 row (the minting isolate's memory still holds current).
    db.raw.prepare('UPDATE luno_consents SET terms_version = ?, updated_at = ? WHERE user_id = ?').run('0.0', new Date().toISOString(), id);
    const cold = await f24Isolate(db);
    const stale = await cold.api('auth/login', 'POST', { email, password: PW });
    assert.equal(stale.status, 403);
    const body = await stale.json();
    assert.equal(body.code, 'CONSENT_STALE');
    assert.deepEqual(body.current, F24_CONSENT.consent);
    const fresh = await cold.api('auth/login', 'POST', { email, password: PW, consent: F24_CONSENT.consent });
    assert.equal(fresh.status, 200, 'inline re-consent logs in');
    assert.ok((await fresh.json()).access_token);
    const row = db.raw.prepare('SELECT terms_version, age14_confirmed FROM luno_consents WHERE user_id = ?').get(id);
    assert.equal(row.terms_version, F24_CONSENT.consent.terms, 'row refreshed');
    assert.equal(row.age14_confirmed, 1, 'age bit preserved');
  } finally { db.raw.close(); }
});

test('F24: shared TS age helper matches the pinned boundaries', () => {
  const today = '2026-11-15';
  const cases = [
    ['2012-11-15', 14],
    ['2012-11-16', 13],
    ['1990-01-01', 36],
    ['2026-11-15', 0],
    ['2026-11-16', null],
    ['2012-02-30', null],
    ['2012-13-01', null],
    ['not-a-date', null],
    ['', null],
  ];
  for (const [birth, want] of cases) {
    assert.equal(tsAge(birth, today), want, `ageOnDate(${birth})`);
  }
});

test('F24: every legal doc carries the current version', async () => {
  const { api } = await f24Isolate(makeD1());
  const live = await (await api('legal', 'GET')).json();
  // Canonical Korean docs keep short names; other locales are suffixed.
  const files = ['terms.html', 'privacy.html', 'terms.en.html', 'privacy.en.html', 'terms.th.html', 'privacy.th.html', 'terms.ja.html', 'privacy.ja.html'];
  for (const file of files) {
    const html = await readFile(new URL(`../apps/user-web/public/legal/${file}`, import.meta.url), 'utf8');
    const want = file.startsWith('terms') ? live.terms_version : live.privacy_version;
    assert.ok(html.includes(want), `${file} tracks ${want}`);
  }
});

test('F24: legal versions cannot drift across worker, Go, and test preset', async () => {
  const db = makeD1();
  const { api } = await f24Isolate(db);
  const live = await (await api('legal', 'GET')).json();
  db.raw.close();
  assert.equal(live.terms_version, F24_CONSENT.consent.terms, 'test preset tracks the worker');
  assert.equal(live.privacy_version, F24_CONSENT.consent.privacy, 'test preset tracks the worker');
  const go = await readFile(new URL('../backend/internal/server/consent.go', import.meta.url), 'utf8');
  const terms = go.match(/legalTermsVersion\s*=\s*"([^"]+)"/);
  const privacy = go.match(/legalPrivacyVersion\s*=\s*"([^"]+)"/);
  assert.ok(terms && privacy, 'Go versions found');
  assert.equal(terms[1], live.terms_version, 'Go terms track the worker');
  assert.equal(privacy[1], live.privacy_version, 'Go privacy tracks the worker');
});
