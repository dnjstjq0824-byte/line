// Stage 10 (F1): email verification on signup/login/send, with web + app
// verify screens. Strict only when a mail provider is configured; without
// one, registration auto-verifies (documented dev-mode behavior).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeD1 , F24_CONSENT } from './test_helpers.mjs';

let f1Serial = 0;
async function f1Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f1=${++f1Serial}`);
  const env = { ...(db ? { DB: db } : {}), ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api, outbox: mod.verificationMailOutbox };
}

const PW = 'Str0ng!Passw0rd';

test('F1: register mails a code, login and send wait for verify', async () => {
  const db = makeD1();
  try {
    const { api, outbox } = await f1Isolate(db, { RECOVERY_MAIL_PROVIDER: 'mock' });
    const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email: 'f1-a@luno-test.local', password: PW, display_name: 'f1a' });
    assert.equal(reg.status, 201);
    const regBody = await reg.json();
    assert.equal(regBody.email_verified, false);
    assert.equal(db.raw.prepare('SELECT email_verified FROM users WHERE email = ?').get('f1-a@luno-test.local').email_verified, 0);
    const mails = outbox.filter((m) => m.email === 'f1-a@luno-test.local');
    assert.equal(mails.length, 1, 'code mailed at signup');
    assert.match(mails[0].code, /^\d{6}$/);
    const blocked = await api('auth/login', 'POST', { email: 'f1-a@luno-test.local', password: PW });
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json()).code, 'EMAIL_NOT_VERIFIED');
    assert.equal((await api('auth/verify-email', 'POST', { email: 'f1-a@luno-test.local', code: '000000' })).status, 400, 'wrong code');
    const ok = await api('auth/verify-email', 'POST', { email: 'f1-a@luno-test.local', code: mails[0].code });
    assert.equal(ok.status, 200);
    const s = await (await api('auth/login', 'POST', { email: 'f1-a@luno-test.local', password: PW })).json();
    assert.ok(s.access_token, 'verified login works');
    assert.equal(db.raw.prepare('SELECT email_verified FROM users WHERE email = ?').get('f1-a@luno-test.local').email_verified, 1);
  } finally { db.raw.close(); }
});

test('F1: unverified send blocked even with a live session', async () => {
  const db = makeD1();
  try {
    const { api, outbox } = await f1Isolate(db, { RECOVERY_MAIL_PROVIDER: 'mock' });
    await api('auth/register', 'POST', { ...F24_CONSENT, email: 'f1-c@luno-test.local', password: PW, display_name: 'f1c' });
    await api('auth/register', 'POST', { ...F24_CONSENT, email: 'f1-d@luno-test.local', password: PW, display_name: 'f1d' });
    const code = outbox.find((m) => m.email === 'f1-c@luno-test.local').code;
    await api('auth/verify-email', 'POST', { email: 'f1-c@luno-test.local', code });
    const s = await (await api('auth/login', 'POST', { email: 'f1-c@luno-test.local', password: PW })).json();
    const dRow = db.raw.prepare('SELECT id FROM users WHERE email = ?').get('f1-d@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'V', member_ids: [dRow.id] }, s.access_token)).json();
    assert.equal((await api(`conversations/${room.id}/messages`, 'POST', { body: 'verified send' }, s.access_token)).status, 201);
    db.raw.exec(`UPDATE users SET email_verified = 0 WHERE email = 'f1-c@luno-test.local'`);
    const gated = await api(`conversations/${room.id}/messages`, 'POST', { body: 'unverified send' }, s.access_token);
    assert.equal(gated.status, 403, 'send gate reads fresh verification state');
    assert.equal((await gated.json()).code, 'EMAIL_NOT_VERIFIED');
  } finally { db.raw.close(); }
});

test('F1: resend rotates the code, expiry and attempts fail closed', async () => {
  const db = makeD1();
  try {
    const { api, outbox } = await f1Isolate(db, { RECOVERY_MAIL_PROVIDER: 'mock' });
    await api('auth/register', 'POST', { ...F24_CONSENT, email: 'f1-e@luno-test.local', password: PW, display_name: 'f1e' });
    const first = outbox.find((m) => m.email === 'f1-e@luno-test.local').code;
    assert.equal((await api('auth/verify-email/resend', 'POST', { email: 'f1-e@luno-test.local' })).status, 200);
    const mails = outbox.filter((m) => m.email === 'f1-e@luno-test.local');
    assert.equal(mails.length, 2);
    assert.equal((await api('auth/verify-email', 'POST', { email: 'f1-e@luno-test.local', code: first })).status, 400, 'old code dead after resend');
    assert.equal((await api('auth/verify-email', 'POST', { email: 'f1-e@luno-test.local', code: mails[1].code })).status, 200);
    await api('auth/register', 'POST', { ...F24_CONSENT, email: 'f1-f@luno-test.local', password: PW, display_name: 'f1f' });
    db.raw.exec(`UPDATE luno_email_codes SET expires_at = 1 WHERE email = 'f1-f@luno-test.local'`);
    const fresh = outbox.find((m) => m.email === 'f1-f@luno-test.local').code;
    assert.equal((await api('auth/verify-email', 'POST', { email: 'f1-f@luno-test.local', code: fresh })).status, 400, 'expired code rejected');
    await api('auth/register', 'POST', { ...F24_CONSENT, email: 'f1-g@luno-test.local', password: PW, display_name: 'f1g' });
    const gcode = outbox.find((m) => m.email === 'f1-g@luno-test.local').code;
    for (let i = 0; i < 5; i++) {
      await api('auth/verify-email', 'POST', { email: 'f1-g@luno-test.local', code: '000000' });
    }
    assert.equal((await api('auth/verify-email', 'POST', { email: 'f1-g@luno-test.local', code: gcode })).status, 400, 'attempts exhausted');
  } finally { db.raw.close(); }
});

test('F1: codes never appear in API responses', async () => {
  const db = makeD1();
  try {
    const { api, outbox } = await f1Isolate(db, { RECOVERY_MAIL_PROVIDER: 'mock' });
    const reg = await (await api('auth/register', 'POST', { ...F24_CONSENT, email: 'f1-h@luno-test.local', password: PW, display_name: 'f1h' })).text();
    const code = outbox.find((m) => m.email === 'f1-h@luno-test.local').code;
    assert.ok(!reg.includes(code), 'register leaks no code');
    const resend = await (await api('auth/verify-email/resend', 'POST', { email: 'f1-h@luno-test.local' })).text();
    for (const m of outbox.filter((x) => x.email === 'f1-h@luno-test.local')) {
      assert.ok(!resend.includes(m.code), 'resend leaks no code');
    }
  } finally { db.raw.close(); }
});

test('F1: no provider auto-verifies, legacy rows grandfathered', async () => {
  const db = makeD1();
  try {
    const { api, outbox } = await f1Isolate(db);
    await api('auth/register', 'POST', { ...F24_CONSENT, email: 'f1-i@luno-test.local', password: PW, display_name: 'f1i' });
    assert.equal(db.raw.prepare('SELECT email_verified FROM users WHERE email = ?').get('f1-i@luno-test.local').email_verified, 1, 'auto-verify without provider');
    assert.equal(outbox.length, 0, 'no mail without provider');
    assert.equal((await api('auth/login', 'POST', { email: 'f1-i@luno-test.local', password: PW })).status, 200);
  } finally { db.raw.close(); }
  const old = makeD1();
  try {
    old.raw.exec(`INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
      VALUES ('f1-legacy', 'f1-legacy@luno-test.local', 'pbkdf2$100000$salt$hash', 'Legacy', '2026-01-01', '2026-01-01')`);
    const { api } = await f1Isolate(old, { RECOVERY_MAIL_PROVIDER: 'mock' });
    await api('auth/register', 'POST', { ...F24_CONSENT, email: 'f1-new@luno-test.local', password: PW, display_name: 'f1new' });
    assert.equal(old.raw.prepare('SELECT email_verified FROM users WHERE id = ?').get('f1-legacy').email_verified, 1, 'pre-existing accounts stay verified');
    assert.equal(old.raw.prepare('SELECT email_verified FROM users WHERE email = ?').get('f1-new@luno-test.local').email_verified, 0, 'new accounts verify');
  } finally { old.raw.close(); }
});

test('F1: web verify screen is wired to the endpoints', async () => {
  const view = await readFile(new URL('../apps/user-web/src/views/AuthView.vue', import.meta.url), 'utf8');
  assert.ok(view.includes('/api/v1/auth/verify-email'), 'verify endpoint called');
  assert.ok(view.includes('verify-email/resend'), 'resend called');
  assert.ok(view.includes('EMAIL_NOT_VERIFIED'), 'login gate surfaces the verify step');
});
