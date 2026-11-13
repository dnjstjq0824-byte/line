// Stage 5 (M1/M2/C1/C2/C3/C4/H1/H2/H3/H4): clients and hardening.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeBucket, makeD1 } from './test_helpers.mjs';

const workerSource = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');

let stage5Serial = 0;
async function stage5Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?stage5=${++stage5Serial}`);
  const env = { ...(db ? { DB: db } : {}), ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api, env };
}

async function registerLogin(api, email, handle, password = 'Str0ng!Passw0rd') {
  const reg = await api('auth/register', 'POST', { email, password, display_name: handle, handle });
  assert.equal(reg.status, 201, `register ${email}`);
  const id = (await reg.json()).id;
  const login = await api('auth/login', 'POST', { email, password });
  assert.equal(login.status, 200, `login ${email}`);
  return { id, token: (await login.json()).access_token };
}

// ---------- C2: official rooms are read-only ----------

test('C2: official rooms reject sends and calls', async () => {
  const db = makeD1();
  try {
    const demo = await stage5Isolate(db, { DEMO_MODE: 'true' });
    const a = await registerLogin(demo.api, 'c2-a@luno-test.local', 'c2_a');
    const convos = await (await demo.api('conversations', 'GET', null, a.token)).json();
    const notice = convos.conversations.find((c) => c.id.includes('oa-notice'));
    assert.ok(notice && notice.official, 'notice room flagged official');
    assert.equal((await demo.api(`conversations/${notice.id}/messages`, 'POST', { body: 'hi' }, a.token)).status, 400);
    assert.equal((await demo.api('calls', 'POST', { conversation_id: notice.id, kind: 'voice' }, a.token)).status, 400);
    assert.equal((await demo.api('calls/group/join', 'POST', { room_id: notice.id }, a.token)).status, 400);
    const b = await registerLogin(demo.api, 'c2-b@luno-test.local', 'c2_b');
    const room = await (await demo.api('conversations', 'POST', { kind: 'group', title: 'C2', member_ids: [b.id] }, a.token)).json();
    assert.equal((await demo.api(`conversations/${room.id}/messages`, 'POST', { body: 'hi' }, a.token)).status, 201, 'regular rooms unaffected');
    assert.equal((await demo.api('calls/group/join', 'POST', { room_id: room.id }, a.token)).status, 201, 'regular group calls unaffected');
  } finally { db.raw.close(); }
});

const paneSource = await readFile(new URL('../apps/user-web/src/components/MessagePane.vue', import.meta.url), 'utf8');

test('C2: web hides calls and composer in official rooms', () => {
  assert.ok(paneSource.includes('v-if="!selectedChat?.official" class="btn-chat-action"'), 'call buttons gated');
  assert.ok(paneSource.includes('<footer v-if="!selectedChat?.official" class="pc-chat-input-dock">'), 'composer gated');
});

// ---------- H1: auth-adjacent rate limits ----------

async function capProbe(api, path, method, body, token, cap, openStatus) {
  // Fresh isolate + DB per test, so the first `cap` hits stay under the cap
  // and answer with the endpoint's normal status; hit cap+1 must be 429.
  for (let i = 0; i < cap; i++) {
    const r = await api(path, method, body, token);
    assert.equal(r.status, openStatus, `${path} attempt ${i + 1} stays open`);
  }
  const capped = await api(path, method, body, token);
  assert.equal(capped.status, 429, `${path} caps past ${cap}`);
  assert.equal((await capped.json()).code, 'RATE_LIMITED');
}

test('H1: passkeys login begin/finish cap per IP', async () => {
  const db = makeD1();
  try {
    const { api } = await stage5Isolate(db);
    await capProbe(api, 'passkeys/login/begin', 'POST', { email: 'nobody@luno.local' }, null, 60, 401);
  } finally { db.raw.close(); }
  const db2 = makeD1();
  try {
    const { api } = await stage5Isolate(db2);
    await capProbe(api, 'passkeys/login/finish', 'POST', { id: 'x', response: {} }, null, 60, 400);
  } finally { db2.raw.close(); }
});

test('H1: phone verify caps per IP and number', async () => {
  const db = makeD1();
  try {
    const { api } = await stage5Isolate(db);
    await capProbe(api, 'auth/phone/verify', 'POST', { phone: '+821099991111', code: '000000' }, null, 30, 400);
  } finally { db.raw.close(); }
});

test('H1: QR challenge caps per IP, poll gets headroom', async () => {
  const db = makeD1();
  try {
    const { api } = await stage5Isolate(db);
    await capProbe(api, 'auth/qr/challenge', 'POST', {}, null, 60, 201);
  } finally { db.raw.close(); }
  const db2 = makeD1();
  try {
    const { api } = await stage5Isolate(db2);
    await capProbe(api, 'auth/qr/poll', 'POST', { challenge_id: 'nope', qr_token: 'nope' }, null, 120, 401);
  } finally { db2.raw.close(); }
});

test('H1: QR approve and ws-ticket cap per user', async () => {
  const db = makeD1();
  try {
    const { api } = await stage5Isolate(db);
    const a = await registerLogin(api, 'h1-a@luno-test.local', 'h1_a');
    await capProbe(api, 'auth/qr/approve', 'POST', { challenge_id: 'nope', qr_token: 'nope' }, a.token, 60, 400);
  } finally { db.raw.close(); }
  const db2 = makeD1();
  try {
    const { api } = await stage5Isolate(db2);
    const b = await registerLogin(api, 'h1-b@luno-test.local', 'h1_b');
    await capProbe(api, 'ws-ticket', 'POST', {}, b.token, 60, 200);
  } finally { db2.raw.close(); }
});

// ---------- H2: upload and room-creation quotas ----------

test('H2: quota defaults live in one exported place', async () => {
  const mod = await import(`./cf_worker.js?h2quota=${++stage5Serial}`);
  assert.equal(mod.QUOTA_UPLOADS_PER_DAY, 200);
  assert.equal(mod.QUOTA_UPLOAD_BYTES_PER_DAY, 1024 * 1024 * 1024);
  assert.equal(mod.QUOTA_ROOMS_PER_DAY, 50);
  assert.equal(mod.quotaWouldExceed(199, 1, 200), false);
  assert.equal(mod.quotaWouldExceed(200, 1, 200), true);
  assert.equal(mod.quotaWouldExceed(1024 ** 3 - 1, 1, 1024 ** 3), false);
  assert.equal(mod.quotaWouldExceed(1024 ** 3, 1, 1024 ** 3), true);
});

test('H2: 201st upload of the day is 429, usage accumulates', async () => {
  const db = makeD1();
  try {
    const { api } = await stage5Isolate(db, { MEDIA_BUCKET: makeBucket() });
    const a = await registerLogin(api, 'h2-a@luno-test.local', 'h2_a');
    const b = await registerLogin(api, 'h2-b@luno-test.local', 'h2_b');
    const room = await (await api('conversations', 'POST', { kind: 'group', title: 'H2', member_ids: [b.id] }, a.token)).json();
    const payload = (i) => Buffer.from(`h2-${i}`).toString('base64');
    let bytesSoFar = 0;
    for (let i = 0; i < 200; i++) {
      const body = { conversation_id: room.id, content_base64: payload(i), mime_type: 'text/plain', original_name: `h2-${i}.txt` };
      const up = await api('attachments', 'POST', body, a.token);
      assert.equal(up.status, 201, `upload ${i + 1} accepted`);
      bytesSoFar += Buffer.from(`h2-${i}`).length;
      const data = await up.json();
      assert.equal(data.quota.uploads_today, i + 1);
      assert.equal(data.quota.bytes_today, bytesSoFar);
    }
    const over = await api('attachments', 'POST', { conversation_id: room.id, content_base64: payload(200), mime_type: 'text/plain', original_name: 'h2-200.txt' }, a.token);
    assert.equal(over.status, 429);
    const overBody = await over.json();
    assert.equal(overBody.code, 'QUOTA_EXCEEDED');
    assert.equal(overBody.quota_reason, 'upload_count');
  } finally { db.raw.close(); }
});

test('H2: 51st room of the day is 429', async () => {
  const db = makeD1();
  try {
    const { api } = await stage5Isolate(db);
    const a = await registerLogin(api, 'h2r-a@luno-test.local', 'h2r_a');
    const b = await registerLogin(api, 'h2r-b@luno-test.local', 'h2r_b');
    for (let i = 0; i < 50; i++) {
      const r = await api('conversations', 'POST', { kind: 'group', title: `H2R-${i}`, member_ids: [b.id] }, a.token);
      assert.equal(r.status, 201, `room ${i + 1} accepted`);
    }
    const over = await api('conversations', 'POST', { kind: 'group', title: 'H2R-50', member_ids: [b.id] }, a.token);
    assert.equal(over.status, 429);
    assert.equal((await over.json()).code, 'QUOTA_EXCEEDED');
  } finally { db.raw.close(); }
});
