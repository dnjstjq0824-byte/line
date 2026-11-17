// A10 (F26 server): contact discovery is off unless phone auth runs. With
// it on, verified users bind E.164 numbers (HMAC-only directory); consented
// callers match uploads against verified, discoverable, unblocked users.
// Uploaded numbers are never stored or logged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, F24_CONSENT } from './test_helpers.mjs';

let f26Serial = 0;
async function f26Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f26=${++f26Serial}`);
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
const SECRET = 'test-contact-secret-0123456789abcdef';
const ON = { SMS_PROVIDER: 'log', CONTACT_MATCH_SECRET: SECRET };

async function registerLogin(api, email) {
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
  assert.equal(reg.status, 201);
  const s = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(s.status, 200);
  const sess = await s.json();
  return { ...(await reg.json()), token: sess.access_token, userId: sess.user_id };
}

async function verifyPhone(api, mod, token, phone) {
  assert.equal((await api('auth/phone/send-code', 'POST', { phone }, token)).status, 200);
  const entry = mod.smsOutbox.filter((m) => m.phone === phone).pop();
  assert.ok(entry, 'code delivered to outbox');
  const res = await api('auth/phone/verify', 'POST', { phone, code: entry.code }, token);
  assert.equal(res.status, 200);
  return res.json();
}

function dbDump(db) {
  let out = '';
  for (const t of db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) {
    try { out += JSON.stringify(db.raw.prepare(`SELECT * FROM "${t.name}"`).all()); } catch {}
  }
  return out;
}

test('F26: discovery is 503 without phone auth; consent still records', async () => {
  const db = makeD1();
  try {
    const { api } = await f26Isolate(db);
    const u = await registerLogin(api, 'f26-off@luno-test.local');
    const off = await api('contacts/match', 'POST', { phones: ['+821000000001'] }, u.token);
    assert.equal(off.status, 503);
    assert.equal((await off.json()).code, 'PHONE_AUTH_DISABLED');
    const consent = await api('contacts/consent', 'POST', { consented: true }, u.token);
    assert.equal(consent.status, 200, 'consent records while the feature rests');
    assert.equal((await consent.json()).consented, true);
    const noSecret = await f26Isolate(db, { SMS_PROVIDER: 'log' });
    const su = await loginNoDb(noSecret.api, 'f26-off@luno-test.local');
    const uncfg = await noSecret.api('contacts/match', 'POST', { phones: ['+821000000001'] }, su);
    assert.equal(uncfg.status, 503);
    assert.equal((await uncfg.json()).code, 'CONTACT_DISCOVERY_UNCONFIGURED');
  } finally { db.raw.close(); }
});

async function loginNoDb(api, email) {
  const s = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(s.status, 200);
  return (await s.json()).access_token;
}

test('F26: verified users bind E.164 numbers; conflicts and local formats fail', async () => {
  const db = makeD1();
  try {
    const { api, mod } = await f26Isolate(db, ON);
    const a = await registerLogin(api, 'f26-ba@luno-test.local');
    const b = await registerLogin(api, 'f26-bb@luno-test.local');
    const bound = await verifyPhone(api, mod, a.token, '+821000000101');
    assert.equal(bound.status, 'verified');
    const row = db.raw.prepare('SELECT phone_verified, phone_hmac, phone_number FROM users WHERE id = ?').get(a.userId);
    assert.equal(row.phone_verified, 1);
    assert.ok(row.phone_hmac && row.phone_hmac.length === 64, 'HMAC stored');
    assert.equal(row.phone_number, '+821000000101');
    assert.equal((await api('auth/phone/send-code', 'POST', { phone: '+821000000101' }, b.token)).status, 200);
    const entry = mod.smsOutbox.filter((m) => m.phone === '+821000000101').pop();
    assert.equal((await api('auth/phone/verify', 'POST', { phone: '+821000000101', code: entry.code }, b.token)).status, 409, 'number already owned');
    assert.equal((await api('auth/phone/send-code', 'POST', { phone: '01012345678' }, b.token)).status, 200);
    const local = mod.smsOutbox.filter((m) => m.phone === '01012345678').pop();
    const localRes = await api('auth/phone/verify', 'POST', { phone: '01012345678', code: local.code }, b.token);
    assert.equal(localRes.status, 400, 'bind needs E.164');
    assert.equal((await localRes.json()).code, 'E164_REQUIRED');
  } finally { db.raw.close(); }
});

test('F26: match returns only verified, discoverable, unblocked users', async () => {
  const db = makeD1();
  try {
    const { api, mod } = await f26Isolate(db, ON);
    const f = await registerLogin(api, 'f26-f@luno-test.local');
    const t = await registerLogin(api, 'f26-t@luno-test.local');
    const u = await registerLogin(api, 'f26-u@luno-test.local');
    const d = await registerLogin(api, 'f26-d@luno-test.local');
    const b = await registerLogin(api, 'f26-b@luno-test.local');
    const h = await registerLogin(api, 'f26-h@luno-test.local');
    await verifyPhone(api, mod, t.token, '+821000000201');
    await verifyPhone(api, mod, d.token, '+821000000202');
    await verifyPhone(api, mod, b.token, '+821000000203');
    await verifyPhone(api, mod, h.token, '+821000000204');
    assert.equal((await api('me/settings', 'PATCH', { discoverable_by_phone: false }, d.token)).status, 200);
    assert.equal((await api('friends', 'POST', { friend_id: b.userId }, f.token)).status, 201);
    assert.equal((await api(`friends/${b.userId}`, 'PATCH', { blocked: true }, f.token)).status, 200);
    assert.equal((await api('friends', 'POST', { friend_id: h.userId }, f.token)).status, 201);
    assert.equal((await api(`friends/${h.userId}`, 'PATCH', { hidden: true }, f.token)).status, 200);

    assert.equal((await api('contacts/match', 'POST', { phones: ['+821000000201'] }, f.token)).status, 403, 'consent first');
    assert.equal((await api('contacts/consent', 'POST', { consented: true }, f.token)).status, 200);
    assert.equal((await (await api('contacts/consent', 'GET', null, f.token)).json()).consented, true);
    const res = await api('contacts/match', 'POST', {
      phones: ['+821000000201', '+821000000202', '+821000000203', '+821000000204', '+821099999999', 'not-a-number', '', '123'],
    }, f.token);
    assert.equal(res.status, 200);
    const matches = (await res.json()).matches;
    assert.equal(matches.length, 1, 'only the verified discoverable friend');
    assert.equal(matches[0].phone, '+821000000201');
    assert.equal(matches[0].user.id, t.userId);
    assert.ok(!('phone' in matches[0].user) && !('phone_number' in matches[0].user), 'no numbers leak in profiles');

    await api('contacts/consent', 'POST', { consented: true }, t.token);
    const self = await api('contacts/match', 'POST', { phones: ['+821000000201'] }, t.token);
    assert.equal((await self.json()).matches.length, 0, 'self never matches');
    await api('contacts/consent', 'POST', { consented: false }, f.token);
    assert.equal((await api('contacts/match', 'POST', { phones: ['+821000000201'] }, f.token)).status, 403, 'withdrawal bites at once');
  } finally { db.raw.close(); }
});

test('F26: uploaded numbers are never stored or logged', async () => {
  const db = makeD1();
  try {
    const { api, mod } = await f26Isolate(db, ON);
    const f = await registerLogin(api, 'f26-sf@luno-test.local');
    const t = await registerLogin(api, 'f26-st@luno-test.local');
    await verifyPhone(api, mod, t.token, '+821000000301');
    await api('contacts/consent', 'POST', { consented: true }, f.token);
    const lines = [];
    const origLog = console.log, origErr = console.error;
    console.log = (...a) => { lines.push(a.join(' ')); };
    console.error = (...a) => { lines.push(a.join(' ')); };
    try {
      const res = await api('contacts/match', 'POST', { phones: ['+821000000301', '+821088888777'] }, f.token);
      assert.equal(res.status, 200);
    } finally {
      console.log = origLog; console.error = origErr;
    }
    const logged = lines.join('\n');
    assert.ok(!logged.includes('+821088888777'), 'unknown upload absent from logs');
    assert.ok(!logged.includes('+821000000301'), 'matched upload absent from logs');
    const dump = dbDump(db);
    assert.ok(!dump.includes('+821088888777'), 'unknown upload absent from every table');
    const audits = db.raw.prepare("SELECT * FROM luno_audit WHERE action = 'contacts.match'").all();
    assert.equal(audits.length, 1, 'match audited without numbers');
    assert.ok(!JSON.stringify(audits[0]).includes('+8210'), 'audit carries counts, not numbers');
  } finally { db.raw.close(); }
});

test('F26: match is rate-limited', async () => {
  const db = makeD1();
  try {
    const { api } = await f26Isolate(db, ON);
    const u = await registerLogin(api, 'f26-rl@luno-test.local');
    await api('contacts/consent', 'POST', { consented: true }, u.token);
    let limited = 0;
    for (let i = 0; i < 35; i++) {
      const r = await api('contacts/match', 'POST', { phones: ['+821000000001'] }, u.token);
      if (r.status === 429) limited++;
      else assert.equal(r.status, 200);
    }
    assert.ok(limited > 0, 'burst trips the limiter');
  } finally { db.raw.close(); }
});
