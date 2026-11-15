// F22 monitoring: request ids, structured masked logs, error counters,
// /metrics additions, authed + rate-limited client telemetry ingest with
// server-side masking, and worker/shared mask parity.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from './test_helpers.mjs';
import { maskTelemetryValue as tsMask } from '../apps/shared/mask_telemetry.ts';

let f22Serial = 0;
async function f22Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f22=${++f22Serial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null, rawPath = false) =>
    mod.default.fetch(new Request(rawPath ? `https://localhost${path}` : `https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api, mod };
}

const PW = 'Str0ng!Passw0rd';

async function register(api, email) {
  const res = await api('auth/register', 'POST', { email, password: PW, display_name: email.split('@')[0] });
  assert.equal(res.status, 201);
  return res.json();
}

async function makeAdmin(db, email = 'f22-admin@luno-test.local') {
  const plain = await f22Isolate(db);
  const reg = await register(plain.api, email);
  const { api } = await f22Isolate(db, { ADMIN_USER_IDS: reg.id });
  const s = await (await api('auth/login', 'POST', { email, password: PW })).json();
  return { api, token: s.access_token };
}

test('F22: every response carries a unique x-request-id', async () => {
  const db = makeD1();
  const { api } = await f22Isolate(db);
  const a = await api('auth/login', 'POST', { email: 'nobody@luno-test.local', password: 'wrong' });
  const b = await api('version', 'GET');
  const ida = a.headers.get('x-request-id');
  const idb = b.headers.get('x-request-id');
  assert.ok(ida && ida.length >= 8, 'rid on error response');
  assert.ok(idb && idb.length >= 8, 'rid on ok response');
  assert.notEqual(ida, idb, 'ids differ per request');
});

test('F22: error + request counters surface in /metrics', async () => {
  const db = makeD1();
  const admin = await makeAdmin(db);
  const miss = await admin.api('definitely-not-a-route', 'GET', null, admin.token);
  assert.equal(miss.status, 404);
  const denied = await admin.api('admin/users', 'GET');
  assert.equal(denied.status, 401);
  const m = await admin.api('/metrics', 'GET', null, admin.token, true);
  assert.equal(m.status, 200);
  const text = await m.text();
  assert.match(text, /luno_errors_total\{route="\/api\/v1\/definitely-not-a-route",code="404"\} 1/);
  assert.match(text, /luno_errors_total\{route="\/api\/v1\/admin\/users",code="401"\} 1/);
  assert.match(text, /luno_requests_total\{route="\/metrics"\} 1/);
  assert.match(text, /luno_telemetry_total\{kind="error"\} 0|luno_telemetry_total/);
});

test('F22: telemetry ingest masks secrets, bodies, emails; perf validated', async () => {
  const db = makeD1();
  const admin = await makeAdmin(db);
  const u = await register(admin.api, 'f22-u@luno-test.local');
  const s = await (await admin.api('auth/login', 'POST', { email: 'f22-u@luno-test.local', password: PW })).json();
  const secretMsg = 'boom Bearer abc123xyz and cf-token-9f8e7d6c plus eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature';
  const put = await admin.api('telemetry', 'POST', {
    reporter: 'probe',
    errors: [{
      name: 'TypeError',
      message: secretMsg,
      stack: 'at boom (secret-token-here)',
      context: { password: 's3cret!', body: 'hello world chat text', email: 'f22-u@luno-test.local', nested: { api_key: 'KEY-1' }, op: 'POST /x' },
    }],
    perf: [
      { op: 'GET /api/v1/chats', ms: 12 },
      { op: 'bad', ms: -1 },
      { op: 'huge', ms: 99999999999 },
    ],
  }, s.access_token);
  assert.equal(put.status, 202);
  const errs = await (await admin.api('admin/telemetry?kind=error&limit=10', 'GET', null, admin.token)).json();
  assert.equal(errs.telemetry.length, 1);
  const row = errs.telemetry[0];
  assert.equal(row.reporter, 'probe');
  assert.equal(row.user_id, u.id);
  assert.ok(!row.message.includes('abc123xyz'), 'bearer gone from message');
  assert.ok(!row.message.includes('9f8e7d6c'), 'cf token gone from message');
  assert.ok(!row.message.includes('eyJhbGciOiJIUzI1NiJ9'), 'jwt gone from message');
  const ctx = JSON.parse(row.context_json);
  assert.equal(ctx.password, '[redacted]');
  assert.equal(ctx.body, '[text len=21]');
  assert.equal(ctx.email, '[email]');
  assert.equal(ctx.nested.api_key, '[redacted]');
  assert.equal(ctx.op, 'POST /x', 'non-secret context survives');
  const perfs = await (await admin.api('admin/telemetry?kind=perf&limit=10', 'GET', null, admin.token)).json();
  assert.equal(perfs.telemetry.length, 1, 'invalid ms rows dropped');
  assert.equal(perfs.telemetry[0].ms, 12);
  assert.deepEqual(perfs.counts, { error: 1, perf: 1 });
  // Non-admins and logged-out callers cannot read telemetry.
  const userRead = await admin.api('admin/telemetry', 'GET', null, s.access_token);
  assert.equal(userRead.status, 403);
  const anonPost = await admin.api('telemetry', 'POST', { errors: [] });
  assert.equal(anonPost.status, 401);
});

test('F22: telemetry ingest is rate-limited per user', async () => {
  const db = makeD1();
  const { api } = await f22Isolate(db);
  await register(api, 'f22-rl@luno-test.local');
  const s = await (await api('auth/login', 'POST', { email: 'f22-rl@luno-test.local', password: PW })).json();
  let limited = 0;
  for (let i = 0; i < 65; i++) {
    const r = await api('telemetry', 'POST', { errors: [], perf: [] }, s.access_token);
    if (r.status === 429) limited++;
    else assert.equal(r.status, 202);
  }
  assert.equal(limited, 5, 'requests past 60/min are rejected');
});

test('F22: worker and shared-TS masks agree on every pinned case', async () => {
  const db = makeD1();
  const { mod } = await f22Isolate(db);
  const workerMask = mod.maskTelemetryValue;
  assert.equal(typeof workerMask, 'function', 'mask seam exported');
  const cases = [
    { password: 'x', Password: 'y', user_password_hash: 'z', code: '123456', pin: '9999', decode: 'keep' },
    { body: 'hello', text: 't', message: 'm', content: 'c', bio: 'b', tbody: 'kept-as-value' },
    { email: 'a@b.co', emails: ['a@b.co'], email_address: 'c@d.io', mail: 'kept' },
    'Bearer abcDEF123._-~+/== tail',
    'cf-token-9f8e7d6c-aaaa and cf-refresh-1234abcd',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----',
    'plain text untouched 123',
    { nested: { deep: { token: 'T', list: [{ body: 'secret chat' }, 7, null] } } },
    { sdp: 'v=0\r\no=- 1', authorization: 'Bearer zzz', cookie: 'sid=1', otp: '424242' },
    { count: 3, flag: true, nothing: null },
  ];
  for (const c of cases) {
    const a = JSON.stringify(workerMask(structuredClone(c)));
    const b = JSON.stringify(tsMask(structuredClone(c)));
    assert.equal(a, b, `parity for ${JSON.stringify(c).slice(0, 80)}`);
  }
});

test('F22: mail-log driver never prints the recipient address', async () => {
  const db = makeD1();
  const { api } = await f22Isolate(db, { RECOVERY_MAIL_PROVIDER: 'log' });
  await register(api, 'f22-logrecip@luno-test.local');
  const lines = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a) => { lines.push(a.map(String).join(' ')); };
  console.error = (...a) => { lines.push(a.map(String).join(' ')); };
  try {
    const rec = await api('auth/recover', 'POST', { email: 'f22-logrecip@luno-test.local' });
    assert.equal(rec.status, 202);
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
  assert.ok(lines.length > 0, 'driver logged a line');
  for (const l of lines) {
    assert.ok(!l.includes('f22-logrecip@luno-test.local'), `recipient leaked: ${l.slice(0, 120)}`);
    if (l.includes('code delivered')) {
      const parsed = JSON.parse(l);
      assert.ok(parsed.rid && parsed.rid !== '-', 'structured line carries rid');
    }
  }
});
