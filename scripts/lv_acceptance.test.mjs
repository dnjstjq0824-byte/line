// LV-01..LV-10 acceptance tests (A-01..A-13, A-15 in-process; A-09/10/14/16 run against artifacts / live in scripts/verify_*.mjs).
// D1 is emulated with node:sqlite (same SQL dialect). A fresh module instance (?iso=N) emulates a different
// Worker isolate / a redeploy: it has empty in-memory state and may only see what D1 persisted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const BASE = 'https://localhost';
const DEMO = '00000000-0000-0000-0000-000000000002';
const ALICE = '00000000-0000-0000-0000-000000000003';

function makeD1() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, display_name TEXT, bio TEXT, status_message TEXT, created_at TEXT, updated_at TEXT);
            CREATE TABLE friends (user_id TEXT, friend_id TEXT);
            CREATE TABLE wallets (user_id TEXT PRIMARY KEY, balance INTEGER, updated_at TEXT);`);
  return {
    raw,
    prepare(sql) {
      let params = [];
      const st = {
        bind(...p) { params = p; return st; },
        async run() { const r = raw.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
        async all() { return { results: raw.prepare(sql).all(...params).map(r => ({ ...r })) }; },
        async first() { const r = raw.prepare(sql).get(...params); return r ? { ...r } : null; }
      };
      return st;
    }
  };
}

const db = makeD1();
const env = { ALLOW_LOCAL_DEMO: 'true', ALLOW_EDGE_STANDALONE: 'true', ENABLE_DEMO_ACCOUNTS: 'true', DB: db };
let isoCounter = 0;
async function isolate(extraEnv = {}, database = db) {
  const mod = await import(`./cf_worker.js?iso=${++isoCounter}`);
  const e = { ...env, DB: database, ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null, headers = {}) => mod.default.fetch(new Request(`${BASE}/api/v1/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === null ? undefined : JSON.stringify(body)
  }), e);
  api.raw = (path, method = 'GET') => mod.default.fetch(new Request(`${BASE}${path}`, { method }), e);
  return api;
}
async function demo(api, account = 'user') {
  const res = await api('auth/demo', 'POST', { account });
  assert.equal(res.status, 200, `demo ${account} login`);
  return res.json();
}
const keepId = uid => `conv-keep-${uid}`;

test('A-01: revoking another session makes exactly that token 401 on every route; revoker stays valid', async () => {
  const api = await isolate();
  const t1 = await demo(api), t2 = await demo(api);
  assert.notEqual(t1.device_id, t2.device_id);
  assert.equal((await api('me', 'GET', null, t2.access_token)).status, 200);
  const rev = await api('auth/sessions/revoke', 'POST', { session_id: t2.device_id }, t1.access_token);
  assert.equal(rev.status, 200);
  const body = await rev.json();
  assert.equal(body.status, 'revoked'); assert.equal(body.self, false);
  for (const p of ['me', 'conversations', 'friends', 'devices', 'calls', 'news']) {
    assert.equal((await api(p, 'GET', null, t2.access_token)).status, 401, `revoked token must be 401 on ${p}`);
  }
  assert.equal((await api('me', 'GET', null, t1.access_token)).status, 200, 'revoker must stay valid');
  // revocation is durable: a different isolate must also reject the token
  const other = await isolate();
  assert.equal((await other('me', 'GET', null, t2.access_token)).status, 401, 'other isolate must reject revoked token');
  assert.equal((await other('me', 'GET', null, t1.access_token)).status, 200, 'other isolate must accept live token');
});

test('A-02: revoke never claims success without a concrete, owned, live session', async () => {
  const api = await isolate();
  const u = await demo(api, 'user'), a = await demo(api, 'alice');
  for (const body of [{}, { session_id: '' }, { session_token: u.access_token }]) {
    const r = await api('auth/sessions/revoke', 'POST', body, u.access_token);
    assert.equal(r.status, 400, `body ${JSON.stringify(body).slice(0, 30)} must be 400`);
    assert.notEqual((await r.json()).status, 'revoked');
  }
  const unknown = await api('auth/sessions/revoke', 'POST', { session_id: 'does-not-exist' }, u.access_token);
  assert.equal(unknown.status, 404);
  const foreign = await api('auth/sessions/revoke', 'POST', { session_id: a.device_id }, u.access_token);
  assert.equal(foreign.status, 403);
  assert.equal((await api('me', 'GET', null, a.access_token)).status, 200, 'foreign session must be untouched');
  assert.equal((await api('auth/sessions/revoke', 'POST', { session_id: u.device_id })).status, 401, 'unauthenticated');
});

test('A-03: login creates a real security notice carrying an opaque session_id that the revoke API honours', async () => {
  const api = await isolate();
  const victim = await demo(api);                        // "other device"
  const me = await demo(api);                            // device that reads the notice
  const msgs = await (await api(`conversations/${keepId(DEMO).replace('keep', 'oa-notice')}/messages`, 'GET', null, me.access_token)).json();
  const real = msgs.messages.filter(m => m.kind === 'security_notice' && m.metadata?.session_id);
  assert.ok(real.length >= 2, 'real login events produced notices');
  const notice = real.find(m => m.metadata.session_id === victim.device_id);
  assert.ok(notice, 'notice exists for the other device login');
  assert.ok(!JSON.stringify(notice).includes(victim.access_token), 'raw token must never be stored in the notice');
  assert.equal((await api('auth/sessions/revoke', 'POST', { session_id: notice.metadata.session_id }, me.access_token)).status, 200);
  assert.equal((await api('me', 'GET', null, victim.access_token)).status, 401, 'token behind the notice is really dead');
  // UI contract (static): no success toast on failure, sample notices cannot call revoke
  const ui = fs.readFileSync(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
  const fn = ui.slice(ui.indexOf('async function handleSecurityNoticeLogout'), ui.indexOf('const showPasswordModal'));
  assert.ok(fn.includes('metadata?.session_id') && !/catch\s*\{[^}]*처리가 완료/.test(fn), 'handler must use session_id and not fake success');
});

test('A-04: text message round-trip: POST -> GET same token -> GET other token -> GET after redeploy', async () => {
  const api = await isolate();
  const a = await demo(api), b = await demo(api);
  const cid = keepId(DEMO);
  const sent = await api(`conversations/${cid}/messages`, 'POST', { kind: 'text', body: `A04-${Date.now()}`, client_id: `a04-${Date.now()}` }, a.access_token);
  assert.equal(sent.status, 201);
  const m = await sent.json();
  const has = async (call, token) => (await (await call(`conversations/${cid}/messages`, 'GET', null, token)).json()).messages.some(x => x.id === m.id && x.body === m.body);
  assert.ok(await has(api, a.access_token), 'same token');
  assert.ok(await has(api, b.access_token), 'second session');
  const redeployed = await isolate();
  const c = await demo(redeployed);
  assert.ok(await has(redeployed, c.access_token), 'after redeploy (fresh isolate, same D1)');
  const row = db.raw.prepare('SELECT COUNT(*) n FROM luno_messages WHERE id = ?').get(m.id);
  assert.equal(Number(row.n), 1, 'message row exists in D1');
});

test('A-05: all 13 message kinds persist and are visible to a second session and after redeploy', async () => {
  const api = await isolate();
  const a = await demo(api), b = await demo(api);
  const cid = keepId(DEMO);
  const kinds = [
    { kind: 'text', body: '텍스트' }, { kind: 'sticker', body: '🐻', metadata: { sticker_id: 'pack-1' } },
    { kind: 'image', body: 'https://example.test/a.png', metadata: { url: 'https://example.test/a.png' } },
    { kind: 'video', body: 'https://example.test/a.mp4', metadata: { url: 'https://example.test/a.mp4' } },
    { kind: 'voice', body: 'v.webm', metadata: { duration: 15 } }, { kind: 'file', body: 'd.pdf', metadata: { filename: 'd.pdf', size: 1024 } },
    { kind: 'location', body: '서울역', metadata: { lat: 37.5547, lng: 126.9706, label: '서울역' } },
    { kind: 'contact', body: '연락처', metadata: { display_name: '도도형님' } },
    { kind: 'pay', body: '10000', metadata: { amount: 10000, memo: 'sandbox' } }, { kind: 'transfer', body: '5000', metadata: { amount: 5000, memo: 'sandbox' } },
    { kind: 'ciphertext', body: 'enc:AES-GCM:dGVzdA==', metadata: { iv: 'YWJj' } },
    { kind: 'call_status', body: '음성통화', metadata: { duration: '1:23', call_type: 'voice', call_status: 'completed' } },
    { kind: 'security_notice', body: '로그인 성공', metadata: { ip: '127.0.0.1', device: 'Web PC' } }
  ];
  assert.equal(kinds.length, 13);
  const ids = {};
  for (const k of kinds) {
    const r = await api(`conversations/${cid}/messages`, 'POST', { ...k, client_id: `a05-${k.kind}-${Date.now()}` }, a.access_token);
    assert.equal(r.status, 201, `POST ${k.kind}`);
    const j = await r.json();
    assert.equal(j.message.kind, k.kind);
    ids[k.kind] = j.message.id;
  }
  const redeployed = await isolate();
  const c = await demo(redeployed);
  for (const [name, call, token] of [['same token', api, a.access_token], ['second session', api, b.access_token], ['after redeploy', redeployed, c.access_token]]) {
    const list = (await (await call(`conversations/${cid}/messages?limit=100`, 'GET', null, token)).json()).messages;
    for (const [kind, id] of Object.entries(ids)) assert.ok(list.some(x => x.id === id && x.kind === kind), `${kind} missing for ${name}`);
  }
  console.log('A-05 kind -> id:', JSON.stringify(ids));
});

test('A-05b: attachments are durable and linked to the message record', async () => {
  const api = await isolate();
  const a = await demo(api);
  const cid = keepId(DEMO);
  const b64 = Buffer.from('hello-luno-file').toString('base64');
  const up = await api('attachments', 'POST', { conversation_id: cid, content_base64: b64, mime_type: 'text/plain', original_name: 'hi.txt' }, a.access_token);
  assert.equal(up.status, 201);
  const att = await up.json();
  const msg = await api(`conversations/${cid}/messages`, 'POST', { kind: 'file', body: 'hi.txt', metadata: { attachment_id: att.id }, client_id: `att-${Date.now()}` }, a.access_token);
  assert.equal(msg.status, 201);
  assert.equal((await msg.json()).message.metadata.attachment_id, att.id);
  const redeployed = await isolate();
  const c = await demo(redeployed);
  const dl = await redeployed(`attachments/${att.id}`, 'GET', null, c.access_token);
  assert.equal(dl.status, 200);
  assert.equal(Buffer.from(await dl.arrayBuffer()).toString(), 'hello-luno-file');
});

test('A-06: read state is server-side across sessions; nav badge === sum of numeric room unread', async () => {
  const api = await isolate();
  const s1 = await demo(api), s2 = await demo(api);
  const list = async (call, token) => (await call('conversations', 'GET', null, token)).json();
  const before = await list(api, s2.access_token);
  const room = before.conversations.find(c => !c.badge_n && c.unread_count > 0 && !c.id.startsWith('conv-oa-notice-'));
  assert.ok(room, 'a room with unread exists');
  const sum = l => l.conversations.reduce((s, c) => s + (c.badge_n ? 0 : c.unread_count), 0);
  assert.equal(before.unread_total, sum(before));
  assert.equal((await api(`conversations/${room.id}/read`, 'POST', {}, s1.access_token)).status, 200);
  const other = await isolate();                        // fresh isolate, other session
  const s3 = await demo(other);
  const after = await list(other, s3.access_token);
  assert.equal(after.conversations.find(c => c.id === room.id).unread_count, 0, 'read state visible to another isolate');
  assert.equal(after.unread_total, sum(after));
  assert.ok(after.unread_total < before.unread_total + 1, 'unread dropped by the read');
  assert.equal((await api('conversations/read-all', 'POST', {}, s1.access_token)).status, 200);
  const none = await list(other, s3.access_token);
  assert.equal(none.conversations.filter(c => !c.badge_n).every(c => c.unread_count === 0), true);
  assert.equal(none.unread_total, 0);
  assert.ok(none.conversations.some(c => c.badge_n), "'N' rooms stay outside the numeric sum");
});

test('A-07: reading the security room never creates or rewrites notices; only a real login adds one', async () => {
  const api = await isolate();
  const t = await demo(api);
  const sec = `conv-oa-notice-${DEMO}`;
  const snap = async (call, token) => (await (await call(`conversations/${sec}/messages`, 'GET', null, token)).json()).messages;
  const key = m => `${m.id}|${m.created_at}|${m.body}`;
  const one = await snap(api, t.access_token);
  await new Promise(r => setTimeout(r, 30));
  await api('conversations', 'GET', null, t.access_token);
  const two = await snap(api, t.access_token);
  assert.deepEqual(two.map(key), one.map(key), 'identical ids and created_at on repeated reads');
  const redeployed = await isolate();
  const t2 = await demo(redeployed);                       // exactly one real login event
  const three = await snap(redeployed, t2.access_token);
  const sample = l => l.filter(m => m.metadata?.sample).map(key);
  assert.deepEqual(sample(three), sample(one), 'sample notices byte-identical after redeploy');
  const realOne = one.filter(m => m.metadata?.session_id), realThree = three.filter(m => m.metadata?.session_id);
  assert.ok(realThree.length <= 5, 'real notices are capped at 5');
  const newest = realOne.slice(-4).map(key);              // oldest real notice may be pruned by the cap
  for (const k of newest) assert.ok(three.map(key).includes(k), 'recent notices unchanged across redeploy');
  assert.ok(realThree.some(m => m.metadata.session_id === t2.device_id), 'the new login produced its own notice');
});
test('A-08: no placeholder endpoints; news/devices/calls follow their contracts', async () => {
  const api = await isolate();
  const t = await demo(api);
  const news = await (await api('news', 'GET', null, t.access_token)).json();
  assert.equal(news.sample, true); assert.ok(news.hero.length === 5 && news.popular.length === 4);
  assert.ok(news.hero.concat(news.popular).every(a => a.sample === true && a.press.includes('샘플') && !Number.isNaN(Date.parse(a.published_at))));
  const devices = await (await api('devices', 'GET', null, t.access_token)).json();
  assert.ok(devices.devices.some(d => d.id === t.device_id && d.current === true));
  const calls = await (await api('calls', 'GET', null, t.access_token)).json();
  assert.ok(calls.calls.length >= 5 && calls.calls.every(c => c.source && c.started_at));
  const sampleCallMsgs = (await (await api(`conversations/conv-k-${DEMO}/messages`, 'GET', null, t.access_token)).json()).messages.filter(m => m.kind === 'call_status');
  assert.equal(calls.calls.filter(c => c.source === 'message' && c.conversation_id === `conv-k-${DEMO}`).length, sampleCallMsgs.length, 'calls list agrees with call_status bubbles');
  for (const p of ['bookmarks', 'totally/unknown', 'auth/nothing']) {
    const r = await api(p, 'GET', null, t.access_token);
    const text = await r.text();
    assert.equal(r.status, 404, p);
    assert.ok(!/"status":"ok","endpoint"/.test(text), 'no stub pattern');
  }
  assert.equal((await api('conversations/read-all', 'GET', null, t.access_token)).status < 500, true, 'no unhandled exception');
});

test('A-11 (static): single source of truth for version; no legacy commit string in sources; LUNO title', async () => {
  const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  assert.ok(!read('../apps/user-web/src/App.vue').includes('6e92f6b'), 'App.vue must not hard-code the old commit');
  const html = read('../apps/user-web/index.html');
  assert.match(html, /<title>[^<]*LUNO[^<]*<\/title>/);
  assert.ok(!/Open Messenger/.test(html.match(/<title>[^<]*<\/title>/)[0]));
  const api = await isolate();
  const v = await (await api('version')).json();
  assert.match(v.commit, /^[0-9a-f]{40}$/);
  assert.equal(v.short_commit, v.commit.slice(0, 7));
  assert.deepEqual(await (await api.raw('/api/version')).json(), v);
});

test('A-12: demo login is a strict allow-list', async () => {
  const api = await isolate();
  const post = body => api('auth/demo', 'POST', body);
  assert.equal((await post({ account: 'admin' })).status, 403);
  assert.equal((await post({ role: 'admin' })).status, 403);
  assert.equal((await post({ account: 'administrator' })).status, 400);
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ account: '' })).status, 400);
  assert.equal((await post({ account: 42 })).status, 400);
  for (const account of ['user', 'alice']) {
    const r = await post({ account });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).role, 'user');
  }
});

test('A-13: regression matrix (auth gates, RBAC, official accounts, friends, enumeration, forged tokens)', async () => {
  const api = await isolate({}, makeD1());   // pristine D1 = the initial state PO measured
  for (const p of ['me', 'conversations', 'friends', 'official-accounts', 'admin/stats', 'devices', 'news']) {
    assert.equal((await api(p)).status, 401, `unauthenticated ${p}`);
  }
  const wrong = await api('auth/login', 'POST', { email: 'user@luno.local', password: 'wrong-password' });
  const ghost = await api('auth/login', 'POST', { email: 'nobody@luno.local', password: 'wrong-password' });
  assert.equal(wrong.status, 401); assert.equal(ghost.status, 401);
  assert.deepEqual(await wrong.json(), await ghost.json(), 'identical error body: no account enumeration');
  assert.equal((await api('auth/login', 'POST', { email: 'user@luno.local', password: 'LineUser#2026!' })).status, 401, 'legacy password');
  const t = await demo(api);
  for (const p of ['admin/stats', 'admin/users', 'admin/reports', 'admin/audit-logs', 'admin/feature-flags']) {
    assert.equal((await api(p, 'GET', null, t.access_token)).status, 403, `RBAC ${p}`);
  }
  const oa = (await (await api('official-accounts', 'GET', null, t.access_token)).json()).accounts;
  assert.deepEqual(oa.map(o => o.id).sort(), ['oa-deals', 'oa-notice', 'oa-weather']);
  assert.equal((await (await api('friends', 'GET', null, t.access_token)).json()).friends.length, 20);
  // forged / legacy stateless tokens must no longer authenticate
  assert.equal((await api('me', 'GET', null, `cf-token-${DEMO}.forged`)).status, 401);
  assert.equal((await api('me', 'GET', null, `cf-token-00000000-0000-0000-0000-000000000001.forged`)).status, 401);
  const conv = await (await api('conversations', 'GET', null, t.access_token)).json();
  const by = n => conv.conversations.find(c => c.id.startsWith(n))?.unread_count;
  assert.equal(by('conv-k-'), 4); assert.equal(by('conv-care-'), 1);
  assert.equal(conv.conversations.find(c => c.id.startsWith('conv-dodo-')).badge_n, true);
  assert.equal(conv.conversations.find(c => c.id.startsWith('conv-dodo-')).unread_count, 0);
  const secUnread = by('conv-oa-notice-');
  console.log(`A-13 baseline badge after one real login: security=${secUnread} (2 sample + ${secUnread - 2} real) K=4 care=1 total=${conv.unread_total}`);
  assert.equal(conv.unread_total, secUnread + 4 + 1);
});

test('SEC: phone login can no longer mint an admin (or any) session without a verified, registered number', async () => {
  const api = await isolate();
  const verify = await api('auth/phone/verify', 'POST', { phone: '+821099998888', code: '123456' });
  assert.ok([400, 404].includes(verify.status), `verify must fail, got ${verify.status}`);
  assert.ok(!(await verify.json()).access_token);
  assert.equal((await api('auth/phone/send-code', 'POST', { phone: '+821099998888' })).status, 501, 'no SMS provider -> fail closed');
  const dev = await isolate({ ALLOW_DEV_PHONE_CODE: 'true' });
  const sent = await (await dev('auth/phone/send-code', 'POST', { phone: '+821011112222' })).json();
  assert.match(sent.dev_code, /^\d{6}$/);
  assert.equal((await dev('auth/phone/verify', 'POST', { phone: '+821011112222', code: sent.dev_code })).status, 404, 'valid code but unregistered number');
});

test('LV-01 policy: password change keeps current session, revokes all others, survives redeploy', async () => {
  const ownDb = makeD1();
  const api = await isolate({}, ownDb);
  const reg = await api('auth/register', 'POST', { email: 'pwtest@luno.test', password: 'Initial#Pass123', display_name: 'PW Test' });
  assert.equal(reg.status, 201);
  const login = async (call, pw) => (await call('auth/login', 'POST', { email: 'pwtest@luno.test', password: pw }));
  const s1 = await (await login(api, 'Initial#Pass123')).json(), s2 = await (await login(api, 'Initial#Pass123')).json();
  const ch = await api('auth/change-password', 'POST', { current_password: 'Initial#Pass123', new_password: 'Changed#Pass456' }, s1.access_token);
  assert.equal(ch.status, 200);
  assert.equal((await ch.json()).other_sessions_revoked, true);
  assert.equal((await api('me', 'GET', null, s1.access_token)).status, 200, 'current session survives');
  assert.equal((await api('me', 'GET', null, s2.access_token)).status, 401, 'other session revoked');
  const redeployed = await isolate({}, ownDb);
  assert.equal((await login(redeployed, 'Changed#Pass456')).status, 200, 'new password valid after redeploy');
  assert.equal((await login(redeployed, 'Initial#Pass123')).status, 401, 'old password dead after redeploy');
  const stored = ownDb.raw.prepare("SELECT password_hash FROM users WHERE email = 'pwtest@luno.test'").get().password_hash;
  assert.ok(stored.startsWith('pbkdf2$') && !stored.includes('Changed#Pass456'), 'password stored as PBKDF2, not plaintext');
});

test('LV-01: logout and device-list revoke are real; audit trail records session revocations', async () => {
  const api = await isolate();
  const a = await demo(api), b = await demo(api);
  assert.equal((await api('auth/logout', 'POST', {}, a.access_token)).status, 200);
  assert.equal((await api('me', 'GET', null, a.access_token)).status, 401, 'logout really kills the session');
  const del = await api(`devices/${b.device_id}`, 'DELETE', null, b.access_token);
  assert.equal(del.status, 200); assert.equal((await del.json()).self, true);
  assert.equal((await api('me', 'GET', null, b.access_token)).status, 401);
  const n = db.raw.prepare("SELECT COUNT(*) n FROM luno_audit WHERE action LIKE 'session.%'").get().n;
  assert.ok(Number(n) >= 2, 'audit rows written to D1');
});

