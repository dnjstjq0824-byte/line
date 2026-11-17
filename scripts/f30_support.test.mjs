// Stage 10 (F30): customer support tickets live in D1; users file and list
// their own, admins list and answer, and an answer lands on the ticket plus
// the user's customer-center official room and the push funnel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, F24_CONSENT } from './test_helpers.mjs';

let f30Serial = 0;
async function f30Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f30=${++f30Serial}`);
  const env = { ...(db ? { DB: db } : {}), ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api };
}

const PW = 'Str0ng!Passw0rd';

async function register(api, email) {
  const res = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
  assert.equal(res.status, 201);
  return res.json();
}

async function login(api, email) {
  const res = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(res.status, 200);
  return res.json();
}

async function makeAdmin(db, email = 'f30-admin@luno-test.local') {
  const plain = await f30Isolate(db);
  const reg = await register(plain.api, email);
  const { api } = await f30Isolate(db, { ADMIN_USER_IDS: reg.id, PUSH_PROVIDER: 'log' });
  const s = await login(api, email);
  return { api, token: s.access_token, id: reg.id };
}

test('F30: ticket to answer to my list with official message, notify and audit', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db);
    const u = await register(admin.api, 'f30-u@luno-test.local');
    await register(admin.api, 'f30-other@luno-test.local');
    const su = await login(admin.api, 'f30-u@luno-test.local');
    const so = await login(admin.api, 'f30-other@luno-test.local');

    const filed = await admin.api('support/tickets', 'POST', {
      category: 'bug', body: '채팅방 사진이 안 보여요', app_version: '2.0.0+11', device_info: 'android pixel',
    }, su.access_token);
    assert.equal(filed.status, 201);
    const id = (await filed.json()).id;
    assert.match(id, /^sup-/);
    const row = db.raw.prepare('SELECT * FROM luno_support_tickets WHERE id = ?').get(id);
    assert.equal(row.status, 'open');
    assert.equal(row.category, 'bug');
    assert.equal(row.app_version, '2.0.0+11');
    assert.equal(row.device_info, 'android pixel');
    assert.equal(row.user_id, u.id);

    const mine = await (await admin.api('support/tickets', 'GET', null, su.access_token)).json();
    assert.equal(mine.tickets.length, 1);
    assert.equal(mine.tickets[0].status, 'open');
    assert.equal(mine.tickets[0].answer, '');
    const theirs = await (await admin.api('support/tickets', 'GET', null, so.access_token)).json();
    assert.equal(theirs.tickets.length, 0, 'no cross-user leak');

    const queue = await (await admin.api('admin/support/tickets', 'GET', null, admin.token)).json();
    assert.ok((queue.tickets || []).some((t) => t.id === id), 'admin sees the queue');
    const openOnly = await (await admin.api('admin/support/tickets?status=open', 'GET', null, admin.token)).json();
    assert.ok(openOnly.tickets.some((t) => t.id === id), 'status filter keeps open');
    const answeredOnly = await (await admin.api('admin/support/tickets?status=answered', 'GET', null, admin.token)).json();
    assert.ok(!answeredOnly.tickets.some((t) => t.id === id), 'status filter hides open');
    assert.equal((await admin.api('admin/support/tickets', 'GET', null, su.access_token)).status, 403, 'users cannot list the queue');
    assert.equal((await admin.api(`admin/support/tickets/${id}/reply`, 'POST', { answer: 'x' }, su.access_token)).status, 403, 'users cannot reply');

    const reply = await admin.api(`admin/support/tickets/${id}/reply`, 'POST', { answer: '앱을 최신 버전으로 업데이트해 보세요.' }, admin.token);
    assert.equal(reply.status, 200);
    assert.equal((await reply.json()).conversation_id, `conv-oa-support-${u.id}`);
    const after = db.raw.prepare('SELECT * FROM luno_support_tickets WHERE id = ?').get(id);
    assert.equal(after.status, 'answered');
    assert.equal(after.answer, '앱을 최신 버전으로 업데이트해 보세요.');
    assert.equal(after.answered_by, admin.id);
    assert.ok(after.answered_at, 'answered_at stamped');
    const audit = db.raw.prepare("SELECT * FROM luno_audit WHERE action = 'support.ticket.reply' AND target = ?").get(id);
    assert.ok(audit, 'admin reply is audited');
    assert.equal(audit.actor, admin.id);

    const room = await (await admin.api(`conversations/conv-oa-support-${u.id}/messages`, 'GET', null, su.access_token)).json();
    const delivered = (room.messages || []).find((mes) => mes?.metadata?.support_ticket_id === id);
    assert.ok(delivered, 'answer posted to the official room');
    assert.equal(delivered.sender_id, 'oa-notice');
    assert.equal(delivered.body, '앱을 최신 버전으로 업데이트해 보세요.');
    const outbox = db.raw.prepare('SELECT * FROM luno_push_outbox WHERE user_id = ? AND conversation_id = ?').get(u.id, `conv-oa-support-${u.id}`);
    assert.ok(outbox, 'answer fanned out to the push funnel');
    assert.equal(outbox.title, 'LUNO 고객센터');

    const mineAfter = await (await admin.api('support/tickets', 'GET', null, su.access_token)).json();
    assert.equal(mineAfter.tickets.length, 1);
    assert.equal(mineAfter.tickets[0].status, 'answered');
    assert.equal(mineAfter.tickets[0].answer, '앱을 최신 버전으로 업데이트해 보세요.');

    const cold = await f30Isolate(db);
    const sc = await login(cold.api, 'f30-u@luno-test.local');
    const mineCold = await (await cold.api('support/tickets', 'GET', null, sc.access_token)).json();
    assert.equal(mineCold.tickets.length, 1, 'tickets durable across isolates');
    assert.equal(mineCold.tickets[0].status, 'answered');
    assert.equal(mineCold.tickets[0].answer, '앱을 최신 버전으로 업데이트해 보세요.');
  } finally { db.raw.close(); }
});

test('F30: filing validates category, body, attachment ownership and auth', async () => {
  const db = makeD1();
  try {
    const admin = await makeAdmin(db, 'f30b-admin@luno-test.local');
    const u = await register(admin.api, 'f30b-u@luno-test.local');
    const o = await register(admin.api, 'f30b-other@luno-test.local');
    const su = await login(admin.api, 'f30b-u@luno-test.local');
    assert.equal((await admin.api('support/tickets', 'POST', { category: 'nope', body: 'x' }, su.access_token)).status, 400, 'unknown category');
    assert.equal((await admin.api('support/tickets', 'POST', { category: 'bug', body: '  ' }, su.access_token)).status, 400, 'empty body');
    assert.equal((await admin.api('support/tickets', 'POST', { category: 'bug', body: 'x' })).status, 401, 'auth required');
    assert.equal((await admin.api('support/tickets', 'POST', { category: 'bug', body: 'x', attachment_id: 'att-ghost' }, su.access_token)).status, 400, 'unknown attachment');
    db.raw.prepare('INSERT INTO attachments (id, conversation_id, object_key, mime_type, size_bytes, sha256, uploader_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('att-mine', 'c1', 'k1', 'image/png', 10, 'aa', u.id, new Date().toISOString());
    db.raw.prepare('INSERT INTO attachments (id, conversation_id, object_key, mime_type, size_bytes, sha256, uploader_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('att-hers', 'c1', 'k2', 'image/png', 10, 'bb', o.id, new Date().toISOString());
    assert.equal((await admin.api('support/tickets', 'POST', { category: 'bug', body: 'x', attachment_id: 'att-hers' }, su.access_token)).status, 400, 'foreign attachment');
    const ok = await admin.api('support/tickets', 'POST', { category: 'bug', body: 'x', attachment_id: 'att-mine' }, su.access_token);
    assert.equal(ok.status, 201, 'own attachment accepted');
    const long = await admin.api('support/tickets', 'POST', { category: 'bug', body: 'y'.repeat(6000) }, su.access_token);
    assert.equal(long.status, 201);
    const longRow = db.raw.prepare('SELECT body FROM luno_support_tickets WHERE id = ?').get((await long.json()).id);
    assert.equal(longRow.body.length, 5000, 'body clipped to the cap');
    assert.equal((await admin.api('admin/support/tickets/sup-ghost/reply', 'POST', { answer: 'hi' }, admin.token)).status, 404, 'unknown ticket');
    assert.equal((await admin.api(`admin/support/tickets/${(await ok.json()).id}/reply`, 'POST', { answer: '  ' }, admin.token)).status, 400, 'empty answer');
  } finally { db.raw.close(); }
});
