// Stage 10 (F2): mail/SMS driver adapter. Only none (quiet off) and log
// (persisted log + test outbox) exist; real sending is never connected,
// and no response ever carries a code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from './test_helpers.mjs';

let f2Serial = 0;
async function f2Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f2=${++f2Serial}`);
  const env = { ...(db ? { DB: db } : {}), ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api, mod };
}

const PW = 'Str0ng!Passw0rd';

test('F2: unknown provider behaves as none (quiet, no mail)', async () => {
  const db = makeD1();
  try {
    const { api, mod } = await f2Isolate(db, { RECOVERY_MAIL_PROVIDER: 'carrier-pigeon', SMS_PROVIDER: 'smoke-signal' });
    const reg = await api('auth/register', 'POST', { email: 'f2-a@luno-test.local', password: PW, display_name: 'f2a' });
    assert.equal(reg.status, 201);
    assert.equal((await reg.json()).email_verified, true, 'unconfigured mail auto-verifies');
    assert.equal(mod.verificationMailOutbox.length, 0);
    assert.equal((await api('auth/verify-email/resend', 'POST', { email: 'f2-a@luno-test.local' })).status, 200, 'resend quiet');
    assert.equal((await api('auth/phone/send-code', 'POST', { phone: '+821011112222' })).status, 501, 'sms stays fail-closed');
  } finally { db.raw.close(); }
});

test('F2: log driver persists entries, mock stays silent', async () => {
  const lines = [];
  const origLog = console.log;
  console.log = (...a) => { lines.push(a.join(' ')); };
  try {
    const db = makeD1();
    try {
      const logged = await f2Isolate(db, { RECOVERY_MAIL_PROVIDER: 'log', SMS_PROVIDER: 'log' });
      await logged.api('auth/register', 'POST', { email: 'f2-b@luno-test.local', password: PW, display_name: 'f2b' });
      await logged.api('auth/phone/send-code', 'POST', { phone: '+821011112222' });
      assert.equal(logged.mod.verificationMailOutbox.length, 1);
      assert.equal(logged.mod.smsOutbox.length, 1);
      assert.ok(lines.some((l) => l.includes('[LUNO mail]')), 'mail persisted to log');
      assert.ok(lines.some((l) => l.includes('[LUNO sms]')), 'sms persisted to log');
    } finally { db.raw.close(); }
    const db2 = makeD1();
    try {
      lines.length = 0;
      const mocked = await f2Isolate(db2, { RECOVERY_MAIL_PROVIDER: 'mock', SMS_PROVIDER: 'mock' });
      await mocked.api('auth/register', 'POST', { email: 'f2-c@luno-test.local', password: PW, display_name: 'f2c' });
      await mocked.api('auth/phone/send-code', 'POST', { phone: '+821011112222' });
      assert.equal(mocked.mod.verificationMailOutbox.length, 1);
      assert.equal(mocked.mod.smsOutbox.length, 1);
      assert.ok(!lines.some((l) => l.includes('[LUNO mail]') || l.includes('[LUNO sms]')), 'mock stays silent');
    } finally { db2.raw.close(); }
  } finally {
    console.log = origLog;
  }
});

test('F2: no response carries a code on any channel', async () => {
  const db = makeD1();
  try {
    const { api, mod } = await f2Isolate(db, { RECOVERY_MAIL_PROVIDER: 'mock', SMS_PROVIDER: 'mock' });
    await api('auth/register', 'POST', { email: 'f2-d@luno-test.local', password: PW, display_name: 'f2d' });
    const vcode = mod.verificationMailOutbox.find((m) => m.email === 'f2-d@luno-test.local').code;
    await api('auth/verify-email', 'POST', { email: 'f2-d@luno-test.local', code: vcode });
    const rec = await (await api('auth/recover', 'POST', { email: 'f2-d@luno-test.local' })).text();
    const rcode = mod.recoveryMailOutbox.find((m) => m.email === 'f2-d@luno-test.local').code;
    assert.ok(!rec.includes(rcode), 'recover leaks no code');
    const sent = await (await api('auth/phone/send-code', 'POST', { phone: '+821011112222' })).text();
    const scode = mod.smsOutbox.find((m) => m.phone === '+821011112222').code;
    assert.ok(!sent.includes(scode) && !sent.includes('dev_code'), 'phone leaks no code');
  } finally { db.raw.close(); }
});
