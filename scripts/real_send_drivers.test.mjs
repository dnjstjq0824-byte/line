// Audit P0-1: real Resend (mail) + Twilio (SMS) drivers. Provider HTTP is
// stubbed; the tests prove request shape, fail-closed behavior, and the
// end-to-end code journeys (code travels via the provider body only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket, F24_CONSENT } from './test_helpers.mjs';

let p01Serial = 0;
async function isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?p01-${++p01Serial}`);
  const env = { DB: db, MEDIA_BUCKET: makeBucket(), ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api, mod };
}

const PW = 'Str0ng!Passw0rd';
const RESEND_ENV = {
  RECOVERY_MAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 're_test_key',
  MAIL_FROM: 'LUNO <noreply@lunotalk.com>',
};
const TWILIO_ENV = {
  SMS_PROVIDER: 'twilio',
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_AUTH_TOKEN: 'tok_test',
  TWILIO_FROM: '+15550001111',
};

function stubFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

function okJson(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

test('P0-1: recovery mail goes through Resend (shape + redacted outbox)', async () => {
  const db = makeD1();
  const calls = [];
  const restore = stubFetch(async (url, init) => {
    calls.push({ url: String(url), init });
    return okJson({ id: 're_123' });
  });
  try {
    const { api, mod } = await isolate(db, RESEND_ENV);
    const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email: 'p01-r@luno-test.local', password: PW, display_name: 'r' });
    assert.equal(reg.status, 201);
    const rec = await api('auth/recover', 'POST', { email: 'p01-r@luno-test.local' });
    assert.equal(rec.status, 202);
    assert.equal(calls.length, 2, 'register-verify mail + recovery mail');
    const [verifyCall, recoverCall] = calls;
    for (const c of calls) {
      assert.equal(c.url, 'https://api.resend.com/emails');
      assert.equal(c.init.method, 'POST');
      assert.equal(c.init.headers.Authorization, 'Bearer re_test_key');
    }
    const vBody = JSON.parse(verifyCall.init.body);
    assert.deepEqual(vBody.to, ['p01-r@luno-test.local']);
    assert.equal(vBody.from, 'LUNO <noreply@lunotalk.com>');
    assert.ok(vBody.subject.includes('인증번호'), 'verify subject');
    assert.ok(/\d{6}/.test(vBody.text), 'verify body carries the 6-digit code');
    const rBody = JSON.parse(recoverCall.init.body);
    assert.ok(rBody.subject.includes('재설정'), 'recovery subject');
    assert.ok(rBody.text.length > 20 && /[a-f0-9]{16,}/.test(rBody.text), 'recovery body carries the code');
    // The test outbox keeps redacted provider records only — no addresses/codes.
    assert.equal(mod.recoveryMailOutbox.length, 1);
    assert.deepEqual({ ...mod.recoveryMailOutbox[0], created_at: 0 }, {
      channel: 'mail', purpose: 'recovery', provider: 'resend', provider_id: 're_123', created_at: 0,
    });
    assert.equal(mod.verificationMailOutbox.length, 1);
    assert.ok(!('email' in mod.verificationMailOutbox[0]) && !('code' in mod.verificationMailOutbox[0]));
  } finally { restore(); db.raw.close(); }
});

test('P0-1: email verify round-trips through the Resend body', async () => {
  const db = makeD1();
  let verifyText = '';
  const restore = stubFetch(async (url, init) => {
    verifyText = JSON.parse(init.body).text;
    return okJson({ id: 're_1' });
  });
  try {
    const { api } = await isolate(db, RESEND_ENV);
    const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email: 'p01-v@luno-test.local', password: PW, display_name: 'v' });
    assert.equal((await reg.json()).email_verified, false, 'needs verification with a driver');
    const code = (verifyText.match(/\d{6}/) || [])[0];
    assert.ok(code, 'code traveled via the provider body');
    assert.equal((await api('auth/verify-email', 'POST', { email: 'p01-v@luno-test.local', code })).status, 200);
  } finally { restore(); db.raw.close(); }
});

test('P0-1: resend without a key fails closed; provider outage is 503', async () => {
  const db = makeD1();
  try {
    const noKey = await isolate(db, { RECOVERY_MAIL_PROVIDER: 'resend' });
    const reg = await noKey.api('auth/register', 'POST', { ...F24_CONSENT, email: 'p01-k@luno-test.local', password: PW, display_name: 'k' });
    assert.equal((await reg.json()).email_verified, true, 'no key: driver is none, auto-verified as before');
    assert.equal((await noKey.api('auth/recover', 'POST', { email: 'p01-k@luno-test.local' })).status, 501);

    let fail = false;
    const restore = stubFetch(async () => (fail ? new Response('bad', { status: 500 }) : okJson({ id: 're_2' })));
    try {
      const { api } = await isolate(db, RESEND_ENV);
      const r2 = await api('auth/register', 'POST', { ...F24_CONSENT, email: 'p01-o@luno-test.local', password: PW, display_name: 'o' });
      assert.equal(r2.status, 201);
      fail = true;
      const rs = await api('auth/verify-email/resend', 'POST', { email: 'p01-o@luno-test.local' });
      assert.equal(rs.status, 503);
      assert.equal((await rs.json()).code, 'mail_unavailable');
      const r3 = await api('auth/register', 'POST', { ...F24_CONSENT, email: 'p01-o2@luno-test.local', password: PW, display_name: 'o2' });
      assert.equal(r3.status, 503, 'register maps the outage too');
    } finally { restore(); }
  } finally { db.raw.close(); }
});

test('P0-1: phone login round-trips through Twilio (bind then login)', async () => {
  const db = makeD1();
  const calls = [];
  const restore = stubFetch(async (url, init) => {
    const text = String(init.body);
    calls.push({ url: String(url), init, text });
    return okJson({ sid: 'SM123' });
  });
  try {
    const { api } = await isolate(db, TWILIO_ENV);
    const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email: 'p01-p@luno-test.local', password: PW, display_name: 'p' });
    assert.equal(reg.status, 201);
    const login = await api('auth/login', 'POST', { email: 'p01-p@luno-test.local', password: PW });
    const token = (await login.json()).access_token;
    const phone = '+821012345678';
    assert.equal((await api('auth/phone/send-code', 'POST', { phone }, token)).status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json');
    assert.ok(calls[0].init.headers.Authorization.startsWith('Basic '), 'basic auth');
    const form = decodeURIComponent(calls[0].text);
    assert.ok(form.includes(`To=${phone}`), 'To set');
    assert.ok(form.includes('From=+15550001111'), 'From set');
    const smsBody = new URLSearchParams(calls[0].text).get('Body') || '';
    const code = (smsBody.match(/\d{6}/) || [])[0];
    assert.ok(code, 'code traveled via the SMS body');
    assert.equal((await api('auth/phone/verify', 'POST', { phone, code }, token)).status, 200, 'binds to the authed account');
    // Anonymous login-by-phone with the bound number.
    assert.equal((await api('auth/phone/send-code', 'POST', { phone })).status, 200);
    const smsBody2 = new URLSearchParams(calls[1].text).get('Body') || '';
    const code2 = (smsBody2.match(/\d{6}/) || [])[0];
    const logged = await api('auth/phone/verify', 'POST', { phone, code: code2 });
    assert.equal(logged.status, 200);
    const lbody = await logged.json();
    assert.equal(lbody.status, 'authenticated');
    assert.ok(lbody.access_token, 'session minted');
  } finally { restore(); db.raw.close(); }
});

test('P0-1: sms without secrets is 501; provider outage is 503 with no code kept', async () => {
  const db = makeD1();
  try {
    const noKey = await isolate(db, { SMS_PROVIDER: 'twilio' });
    assert.equal((await noKey.api('auth/phone/send-code', 'POST', { phone: '+821011111111' })).status, 501);
    let fail = false;
    const restore = stubFetch(async () => (fail ? new Response('bad', { status: 500 }) : okJson({ sid: 'SM1' })));
    try {
      const { api } = await isolate(db, TWILIO_ENV);
      assert.equal((await api('auth/phone/send-code', 'POST', { phone: '+821022222222' })).status, 200);
      fail = true;
      const r = await api('auth/phone/send-code', 'POST', { phone: '+821033333333' });
      assert.equal(r.status, 503);
      assert.equal((await r.json()).code, 'sms_unavailable');
      assert.equal((await api('auth/phone/verify', 'POST', { phone: '+821033333333', code: '000000' })).status, 400, 'no code was kept');
    } finally { restore(); }
  } finally { db.raw.close(); }
});
