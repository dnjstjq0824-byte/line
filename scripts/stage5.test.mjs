// Stage 5 (M1/M2/C1/C2/C3/C4/H1/H2/H3/H4): clients and hardening.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeBucket, makeD1 , F24_CONSENT } from './test_helpers.mjs';

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
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password, display_name: handle, handle });
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

// ---------- H3: QR challenge persistence ----------

test('H3: a challenge created on one isolate approves on another', async () => {
  const db = makeD1();
  try {
    const nodeA = await stage5Isolate(db);
    const nodeB = await stage5Isolate(db);
    const user = await registerLogin(nodeA.api, 'h3-a@luno-test.local', 'h3_a');
    const ch = await (await nodeA.api('auth/qr/challenge', 'POST', {})).json();
    assert.ok(ch.challenge_id && ch.qr_token);
    const approval = await nodeB.api('auth/qr/approve', 'POST', { challenge_id: ch.challenge_id, qr_token: ch.qr_token }, user.token);
    assert.equal(approval.status, 200, 'approval lands from the isolate that never saw creation');
    const polled = await (await nodeA.api('auth/qr/poll', 'POST', { challenge_id: ch.challenge_id, qr_token: ch.qr_token })).json();
    assert.equal(polled.status, 'authenticated');
    assert.ok(polled.access_token);
    assert.equal(polled.user_id, user.id);
    // Consumed on first use: re-poll is refused on either isolate.
    const againA = await nodeA.api('auth/qr/poll', 'POST', { challenge_id: ch.challenge_id, qr_token: ch.qr_token });
    assert.equal(againA.status, 401);
    const againB = await nodeB.api('auth/qr/poll', 'POST', { challenge_id: ch.challenge_id, qr_token: ch.qr_token });
    assert.equal(againB.status, 401);
    // And the row is gone from the table, not just flipped.
    const leftover = db.raw.prepare('SELECT challenge_id FROM luno_qr_challenges WHERE challenge_id = ?').get(ch.challenge_id);
    assert.equal(leftover, undefined);
  } finally { db.raw.close(); }
});

test('H4: display names no longer add friends', async () => {
  const db = makeD1();
  try {
    const { api } = await stage5Isolate(db);
    const adder = await registerLogin(api, 'h4-a@luno-test.local', 'h4_a');
    const target = await registerAs(api, 'h4-t@luno-test.local', 'h4_target', 'H4 Display Name');
    const byName = await api('friends', 'POST', { handle: 'H4 Display Name' }, adder.token);
    assert.equal(byName.status, 404, 'exact display-name match must not resolve');
    const byHandle = await api('friends', 'POST', { handle: 'h4_target' }, adder.token);
    assert.equal(byHandle.status, 201, 'handle still resolves');
    assert.equal((await byHandle.json()).friend.id, target.id);
  } finally { db.raw.close(); }
});

test('H4: QR and opted-in email still add friends', async () => {
  const db = makeD1();
  try {
    const { api } = await stage5Isolate(db);
    const adder = await registerLogin(api, 'h4q-a@luno-test.local', 'h4q_a');
    const qrTarget = await registerAs(api, 'h4q-t@luno-test.local', 'h4_qr', 'H4 Qr Name');
    const viaQr = await api('friends', 'POST', { qr_code: 'LUNO-FRIEND:h4_qr' }, adder.token);
    assert.equal(viaQr.status, 201, 'QR handle resolves');
    assert.equal((await viaQr.json()).friend.id, qrTarget.id);
    const mailTarget = await registerAs(api, 'h4m-t@luno-test.local', 'h4_mail', 'H4 Mail Name');
    const beforeOptIn = await api('friends', 'POST', { handle: 'h4m-t@luno-test.local' }, adder.token);
    assert.equal(beforeOptIn.status, 404, 'email without opt-in stays hidden');
    const patched = await api('me/settings', 'PATCH', { searchable_by_email: true }, mailTarget.token);
    assert.equal(patched.status, 200);
    const viaMail = await api('friends', 'POST', { handle: 'h4m-t@luno-test.local' }, adder.token);
    assert.equal(viaMail.status, 201, 'opted-in email resolves');
    assert.equal((await viaMail.json()).friend.id, mailTarget.id);
  } finally { db.raw.close(); }
});

test('H4: cross-isolate add ignores display names', async () => {
  const db = makeD1();
  try {
    const nodeA = await stage5Isolate(db);
    const nodeB = await stage5Isolate(db);
    await registerAs(nodeA.api, 'h4x-a@luno-test.local', 'h4x_a', 'H4X Adder');
    const target = await registerAs(nodeA.api, 'h4x-t@luno-test.local', 'h4x_target', 'H4X Display');
    // Fresh isolate B: nobody is in memory, so resolution runs the D1 path.
    const login = await nodeB.api('auth/login', 'POST', { email: 'h4x-a@luno-test.local', password: 'Str0ng!Passw0rd' });
    const token = (await login.json()).access_token;
    const byName = await nodeB.api('friends', 'POST', { handle: 'H4X Display' }, token);
    assert.equal(byName.status, 404, 'D1 display-name fallback is gone');
    const byHandle = await nodeB.api('friends', 'POST', { handle: 'h4x_target' }, token);
    assert.equal(byHandle.status, 201, 'D1 handle lookup still works');
    assert.equal((await byHandle.json()).friend.id, target.id);
  } finally { db.raw.close(); }
});

async function registerAs(api, email, handle, displayName, password = 'Str0ng!Passw0rd') {
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password, display_name: displayName, handle });
  assert.equal(reg.status, 201, `register ${email}`);
  const id = (await reg.json()).id;
  const login = await api('auth/login', 'POST', { email, password });
  assert.equal(login.status, 200, `login ${email}`);
  return { id, token: (await login.json()).access_token };
}

test('H3: expired challenges are refused and reaped', async () => {
  const db = makeD1();
  try {
    const { api } = await stage5Isolate(db);
    const user = await registerLogin(api, 'h3e-a@luno-test.local', 'h3e_a');
    await api('auth/qr/challenge', 'POST', {}); // creates the table
    const past = Math.floor(Date.now() / 1000) - 10;
    db.raw.prepare('INSERT INTO luno_qr_challenges(challenge_id,qr_token,status,user_id,expires_at,created_at) VALUES (?,?,?,?,?,?)')
      .run('expired-poll', 'qr-tok-expired-poll', 'pending', null, past, new Date().toISOString());
    db.raw.prepare('INSERT INTO luno_qr_challenges(challenge_id,qr_token,status,user_id,expires_at,created_at) VALUES (?,?,?,?,?,?)')
      .run('expired-approve', 'qr-tok-expired-approve', 'pending', null, past, new Date().toISOString());
    const polled = await api('auth/qr/poll', 'POST', { challenge_id: 'expired-poll', qr_token: 'qr-tok-expired-poll' });
    assert.equal(polled.status, 400);
    assert.match((await polled.json()).error, /만료/);
    const approval = await api('auth/qr/approve', 'POST', { challenge_id: 'expired-approve', qr_token: 'qr-tok-expired-approve' }, user.token);
    assert.equal(approval.status, 400);
    assert.match((await approval.json()).error, /만료/);
    const leftovers = db.raw.prepare('SELECT challenge_id FROM luno_qr_challenges').all();
    assert.deepEqual(leftovers.map((r) => r.challenge_id).filter((id) => id.startsWith('expired-')), []);
  } finally { db.raw.close(); }
});
