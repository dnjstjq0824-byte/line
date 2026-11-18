// PC agent (remote work) server side: slash-command routing, decision jobs,
// runner presence and the durable-room runtime schema. Real sqlite isolates,
// no model is ever called.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { makeD1, F24_CONSENT } from './test_helpers.mjs';

const PW = 'Str0ng!Passw0rd';
let serial = 0;
async function isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?pca=${++serial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api, env };
}
async function signup(api, email) {
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
  assert.equal(reg.status, 201, `register ${email}`);
  return (await reg.json()).id;
}
async function login(api, email) {
  const res = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(res.status, 200, `login ${email}`);
  return (await res.json()).access_token;
}

// One world: admin, owner (allow-listed), outsider, two bots, one work room.
async function world(env = { LLM_ENABLED: 'true' }) {
  const db = makeD1();
  const plain = await isolate(db);
  const adminId = await signup(plain.api, 'pca-admin@luno-test.local');
  const { api } = await isolate(db, { ...env, ADMIN_USER_IDS: adminId });
  const adminToken = await login(api, 'pca-admin@luno-test.local');
  const ownerId = await signup(api, 'pca-owner@luno-test.local');
  const owner = await login(api, 'pca-owner@luno-test.local');
  const otherId = await signup(api, 'pca-other@luno-test.local');
  const other = await login(api, 'pca-other@luno-test.local');
  const mkBot = async (name, handle) => (await (await api('admin/bots', 'POST', { display_name: name, handle }, adminToken)).json());
  const botA = await mkBot('PC-LUNO', 'pc_luno');
  const botB = await mkBot('PC-Shop', 'pc_shop');
  const room = await (await api('conversations', 'POST', { kind: 'group', title: 'PC', member_ids: [botA.id, botB.id, otherId] }, owner)).json();
  await api('admin/llm/allowlist', 'POST', { kind: 'room', ref_id: room.id }, adminToken);
  await api('admin/llm/allowlist', 'POST', { kind: 'user', ref_id: ownerId }, adminToken);
  const mint = async (bot) => (await (await api(`admin/bots/${bot.id}/tokens`, 'POST', { rooms: [room.id], ops: ['read', 'post', 'propose'], ttl_sec: 3600 }, adminToken)).json()).token;
  const tokA = await mint(botA);
  const tokB = await mint(botB);
  const jobs = (kind) => db.raw.prepare('SELECT bot_id, kind, payload_json FROM luno_bot_jobs WHERE kind = ? ORDER BY rowid').all(kind)
    .map((r) => ({ bot_id: r.bot_id, kind: r.kind, payload: JSON.parse(r.payload_json) }));
  const send = (token, body, extra = {}) => api(`conversations/${room.id}/messages`, 'POST', { body, ...extra }, token);
  return { db, api, adminToken, ownerId, owner, otherId, other, botA, botB, room, tokA, tokB, jobs, send };
}

test('a slash command from the allow-listed owner queues one command job per bot', async () => {
  const w = await world();
  try {
    const res = await w.send(w.owner, '/dev fix the login button');
    assert.equal(res.status, 201);
    const sent = await res.json();
    const jobs = w.jobs('command');
    assert.equal(jobs.length, 2, 'one per bot member');
    assert.deepEqual(jobs.map((j) => j.bot_id).sort(), [w.botA.id, w.botB.id].sort());
    assert.equal(jobs[0].payload.body, '/dev fix the login button');
    assert.equal(jobs[0].payload.author_id, w.ownerId);
    assert.equal(jobs[0].payload.message_id, sent.id);
    assert.ok(jobs[0].payload.created_at, 'carries the message time for the stale check');
    assert.equal(w.jobs('mention').length, 0);
  } finally { w.db.raw.close(); }
});

test('plain text, other users and bots never queue command jobs', async () => {
  const w = await world();
  try {
    assert.equal((await w.send(w.owner, 'just a note, no slash')).status, 201);
    assert.equal((await w.send(w.other, '/dev do something')).status, 201, 'message still sends');
    assert.equal((await w.send(w.tokA, '/dev bot talking to itself')).status, 201);
    assert.equal(w.jobs('command').length, 0);
  } finally { w.db.raw.close(); }
});

test('the master switch and the killswitch both stop command routing', async () => {
  const off = await world({});
  try {
    assert.equal((await off.send(off.owner, '/status')).status, 201);
    assert.equal(off.jobs('command').length, 0, 'LLM_ENABLED off');
  } finally { off.db.raw.close(); }
  const w = await world();
  try {
    await w.api('admin/llm/kill', 'PUT', { stopped: true }, w.adminToken);
    assert.equal((await w.send(w.owner, '/status')).status, 201);
    assert.equal(w.jobs('command').length, 0, 'killed');
    await w.api('admin/llm/kill', 'PUT', { stopped: false }, w.adminToken);
    await w.send(w.owner, '/status');
    assert.equal(w.jobs('command').length, 2, 'resumes');
  } finally { w.db.raw.close(); }
});

test('a mentioned command goes to that bot only, as a command and never also a mention', async () => {
  const w = await world();
  try {
    await w.send(w.owner, '@PC-Shop /dev cart bug', { metadata: { mentions: [w.botB.id] } });
    const jobs = w.jobs('command');
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].bot_id, w.botB.id);
    assert.equal(jobs[0].payload.body, '/dev cart bug', 'leading mention stripped');
    assert.equal(w.jobs('mention').length, 0, 'not double-routed');
    await w.send(w.owner, 'hey @PC-Shop are you there', { metadata: { mentions: [w.botB.id] } });
    assert.equal(w.jobs('mention').length, 1, 'plain mentions keep the L-02 path');
    assert.equal(w.jobs('command').length, 1);
  } finally { w.db.raw.close(); }
});

test('@all never pages bots, even on a slash command', async () => {
  const w = await world();
  try {
    await w.send(w.owner, '/dev everyone look', { metadata: { mentions: ['all'] } });
    assert.equal(w.jobs('command').length, 0);
  } finally { w.db.raw.close(); }
});

test('a reply to a bot message is a command for that bot without the slash', async () => {
  const w = await world();
  try {
    const report = await (await w.send(w.tokA, 'T-0001 done', { kind: 'report' })).json();
    await w.send(w.owner, 'make the button blue', { reply_to: report.id });
    const jobs = w.jobs('command');
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].bot_id, w.botA.id);
    assert.equal(jobs[0].payload.reply_to, report.id);
    assert.equal(jobs[0].payload.body, 'make the button blue');
    const human = await (await w.send(w.other, 'human note')).json();
    await w.send(w.owner, 'replying to a person', { reply_to: human.id });
    assert.equal(w.jobs('command').length, 1, 'replies to people stay chat');
  } finally { w.db.raw.close(); }
});

test('deciding a bot proposal queues a decision job for that bot', async () => {
  const w = await world();
  try {
    const p1 = await (await w.send(w.tokA, 'merge T-0001 into main?', { kind: 'proposal' })).json();
    const p2 = await (await w.send(w.tokA, 'merge T-0002 into main?', { kind: 'proposal' })).json();
    assert.equal((await w.api(`conversations/${w.room.id}/messages/${p1.id}/decide`, 'POST', { decision: 'approved' }, w.other)).status, 403, 'members cannot decide');
    const ok = await w.api(`conversations/${w.room.id}/messages/${p1.id}/decide`, 'POST', { decision: 'approved' }, w.owner);
    assert.equal(ok.status, 201);
    await w.api(`conversations/${w.room.id}/messages/${p2.id}/decide`, 'POST', { decision: 'rejected' }, w.owner);
    const jobs = w.jobs('decision');
    assert.equal(jobs.length, 2);
    assert.deepEqual(jobs[0], { bot_id: w.botA.id, kind: 'decision', payload: { proposal_message_id: p1.id, decision: 'approved', decided_by: w.ownerId } });
    assert.equal(jobs[1].payload.decision, 'rejected');
    const row = w.db.raw.prepare("SELECT metadata FROM luno_messages WHERE kind = 'decision' ORDER BY sequence LIMIT 1").get();
    assert.equal(JSON.parse(row.metadata).proposal_message_id, p1.id, 'decision message names its proposal');
  } finally { w.db.raw.close(); }
});

test('friend-add the bot, open a 1:1 chat: the room id is predictable, commands and approvals work there', async () => {
  const w = await world();
  try {
    // The everyday account adds the bot by its ID (handle), like any friend.
    const added = await w.api('friends', 'POST', { handle: 'pc_luno' }, w.other);
    assert.ok(added.status === 200 || added.status === 201, `friend add: ${added.status}`);
    const friends = await (await w.api('friends', 'GET', null, w.other)).json();
    assert.ok(friends.friends.some((f) => f.id === w.botA.id), 'the bot is in the friend list');
    // provision.mjs authorises the 1:1 room before it exists, from this formula.
    const expected = `dm-${createHash('sha256').update([w.otherId, w.botA.id].sort().join(':')).digest('hex')}`;
    await w.api('admin/llm/allowlist', 'POST', { kind: 'user', ref_id: w.otherId }, w.adminToken);
    await w.api('admin/llm/allowlist', 'POST', { kind: 'room', ref_id: expected }, w.adminToken);
    const dm = await (await w.api('conversations', 'POST', { kind: 'direct', member_ids: [w.botA.id] }, w.other)).json();
    assert.equal(dm.id, expected, 'the server derives the same 1:1 room id');
    const tok = (await (await w.api(`admin/bots/${w.botA.id}/tokens`, 'POST', { rooms: [w.room.id, dm.id], ops: ['read', 'post', 'propose'], ttl_sec: 3600 }, w.adminToken)).json()).token;
    assert.equal((await w.api(`conversations/${dm.id}/messages`, 'POST', { body: '/status' }, w.other)).status, 201);
    const jobs = w.jobs('command');
    assert.equal(jobs.length, 1);
    assert.deepEqual([jobs[0].bot_id, jobs[0].payload.author_id, jobs[0].payload.body], [w.botA.id, w.otherId, '/status']);
    // The bot answers and proposes in the 1:1 room; its one human member decides.
    assert.equal((await w.api(`conversations/${dm.id}/messages`, 'POST', { body: 'ready' }, tok)).status, 201);
    const proposal = await (await w.api(`conversations/${dm.id}/messages`, 'POST', { kind: 'proposal', body: 'merge?' }, tok)).json();
    assert.equal((await w.api(`conversations/${dm.id}/messages/${proposal.id}/decide`, 'POST', { decision: 'approved' }, w.other)).status, 201);
    assert.equal(w.jobs('decision').at(-1).payload.decided_by, w.otherId);
    const status = await (await w.api(`conversations/${dm.id}/bots`, 'GET', null, w.other)).json();
    assert.deepEqual([status.bots.length, status.commands_allowed], [1, true]);
  } finally { w.db.raw.close(); }
});

test('the admin user list still names every account when the roles table does not exist', async () => {
  // Production has no luno_user_roles table; provision.mjs add-owner finds an
  // account by email through this list, from an isolate that never saw it.
  const w = await world();
  try {
    w.db.raw.exec('DROP TABLE IF EXISTS luno_user_roles');
    const adminRow = w.db.raw.prepare("SELECT id FROM users WHERE email = 'pca-admin@luno-test.local'").get();
    const cold = await isolate(w.db, { LLM_ENABLED: 'true', ADMIN_USER_IDS: adminRow.id });
    const token = await login(cold.api, 'pca-admin@luno-test.local');
    const list = await (await cold.api('admin/users', 'GET', null, token)).json();
    const emails = list.users.map((u) => u.email);
    for (const email of ['pca-owner@luno-test.local', 'pca-other@luno-test.local']) assert.ok(emails.includes(email), email);
    assert.equal(list.users.find((u) => u.id === adminRow.id).role, 'admin');
  } finally { w.db.raw.close(); }
});

test('a routing failure never breaks sending', async () => {
  const w = await world();
  try {
    w.db.raw.exec('DROP TABLE luno_bot_jobs');
    w.db.raw.exec('CREATE TABLE luno_bot_jobs (id TEXT PRIMARY KEY)');
    assert.equal((await w.send(w.owner, '/dev still delivered')).status, 201);
  } finally { w.db.raw.close(); }
});

test('claim reports presence and room members read it as ready, busy or offline', async () => {
  const w = await world();
  try {
    const before = await (await w.api(`conversations/${w.room.id}/bots`, 'GET', null, w.owner)).json();
    assert.equal(before.bots.length, 2);
    assert.ok(before.bots.every((b) => b.state === 'offline' && b.last_seen_at === null));
    assert.equal(before.commands_allowed, true);
    await w.api('bot/jobs/claim', 'POST', { presence: { state: 'ready', version: '1.0.0', queue: 0 } }, w.tokA);
    let now = await (await w.api(`conversations/${w.room.id}/bots`, 'GET', null, w.owner)).json();
    const a = now.bots.find((b) => b.id === w.botA.id);
    assert.equal(a.state, 'ready');
    assert.equal(a.version, '1.0.0');
    assert.equal(now.bots.find((b) => b.id === w.botB.id).state, 'offline');
    await w.api('bot/jobs/claim', 'POST', { presence: { state: 'busy', detail: 'T-0007 /dev', queue: 2 } }, w.tokA);
    now = await (await w.api(`conversations/${w.room.id}/bots`, 'GET', null, w.owner)).json();
    const busy = now.bots.find((b) => b.id === w.botA.id);
    assert.deepEqual([busy.state, busy.detail, busy.queue], ['busy', 'T-0007 /dev', 2]);
    // A runner that stopped calling goes offline after the TTL.
    const stale = JSON.stringify({ state: 'ready', detail: '', queue: 0, version: '1.0.0', at: Date.now() - 5 * 60 * 1000 });
    w.db.raw.prepare('UPDATE luno_bot_config SET value = ? WHERE key = ?').run(stale, 'presence:' + w.botA.id);
    now = await (await w.api(`conversations/${w.room.id}/bots`, 'GET', null, w.owner)).json();
    assert.equal(now.bots.find((b) => b.id === w.botA.id).state, 'offline');
    assert.ok(now.bots.find((b) => b.id === w.botA.id).last_seen_at, 'last seen kept for the offline label');
    // Outsiders learn nothing; non-allow-listed members see commands_allowed false.
    const strangerId = await signup(w.api, 'pca-stranger@luno-test.local');
    assert.ok(strangerId);
    const stranger = await login(w.api, 'pca-stranger@luno-test.local');
    assert.equal((await w.api(`conversations/${w.room.id}/bots`, 'GET', null, stranger)).status, 404);
    const member = await (await w.api(`conversations/${w.room.id}/bots`, 'GET', null, w.other)).json();
    assert.equal(member.commands_allowed, false);
    assert.equal((await w.api(`conversations/${w.room.id}/bots`, 'GET', null, w.tokA)).status, 403, 'bots cannot use the status route');
  } finally { w.db.raw.close(); }
});

test('a killed runner still shows online', async () => {
  const w = await world();
  try {
    await w.api('admin/llm/kill', 'PUT', { stopped: true }, w.adminToken);
    const res = await w.api('bot/jobs/claim', 'POST', { presence: { state: 'ready' } }, w.tokA);
    assert.equal(res.status, 403);
    const now = await (await w.api(`conversations/${w.room.id}/bots`, 'GET', null, w.owner)).json();
    assert.equal(now.bots.find((b) => b.id === w.botA.id).state, 'ready');
  } finally { w.db.raw.close(); }
});

test('the runtime schema creates durable rooms on a database with no migrations applied', async () => {
  // makeD1 pre-applies the migrations; dropping both tables leaves the
  // database the way production is before any hand-applied migration.
  const bare = makeD1();
  bare.raw.exec('DROP TABLE IF EXISTS luno_conversation_members; DROP TABLE IF EXISTS luno_conversations;');
  try {
    const { api } = await isolate(bare);
    const aId = await signup(api, 'pca-bare-a@luno-test.local');
    const bId = await signup(api, 'pca-bare-b@luno-test.local');
    assert.ok(aId && bId);
    const a = await login(api, 'pca-bare-a@luno-test.local');
    const created = await api('conversations', 'POST', { kind: 'group', title: 'Bare', member_ids: [bId] }, a);
    assert.equal(created.status, 201);
    const room = await created.json();
    const row = bare.raw.prepare('SELECT kind, title FROM luno_conversations WHERE id = ?').get(room.id);
    assert.deepEqual({ ...row }, { kind: 'group', title: 'Bare' });
    // A cold isolate reads the same room back from D1.
    const cold = await isolate(bare);
    const a2 = await login(cold.api, 'pca-bare-a@luno-test.local');
    const list = await (await cold.api('conversations', 'GET', null, a2)).json();
    assert.ok(list.conversations.some((c) => c.id === room.id), 'room survives a new isolate');
    // The admin role fits the member CHECK (group_roles shape).
    bare.raw.prepare("UPDATE luno_conversation_members SET role = 'admin' WHERE conversation_id = ? AND user_id = ?").run(room.id, bId);
  } finally { bare.raw.close(); }
});

test('production config turns the remote-work switches on', async () => {
  const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(wrangler, /"LLM_ENABLED"\s*:\s*"true"/);
  assert.match(wrangler, /"DURABLE_CONVERSATIONS"\s*:\s*"true"/);
  const worker = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  assert.match(worker, /CREATE TABLE IF NOT EXISTS luno_conversations \(/, 'the flag is only safe because the tables self-create');
  assert.match(worker, /CREATE TABLE IF NOT EXISTS luno_conversation_members \(/);
});

test('a bot token reports its own expiry, users get 403', async () => {
  const w = await world();
  try {
    const res = await w.api('bot/token', 'GET', null, w.tokA);
    assert.equal(res.status, 200);
    const info = await res.json();
    assert.equal(info.bot_id, w.botA.id);
    assert.ok(Math.abs(info.expires_at - (Date.now() + 3600000)) < 120000);
    assert.deepEqual(info.rooms, [w.room.id]);
    assert.equal((await w.api('bot/token', 'GET', null, w.owner)).status, 403);
  } finally { w.db.raw.close(); }
});
