// S1 (blueprint 9-2): PC-off detection. Claims record a throttled
// seen:<bot> heartbeat; a 2-minute cron warns each work room once when a
// bot has been silent for over 3 minutes. Real sqlite isolates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, F24_CONSENT } from './test_helpers.mjs';

const PW = 'Str0ng!Passw0rd';
const KST = 9 * 3600 * 1000;
let serial = 0;
async function isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?pco=${++serial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  const cron = () => mod.default.scheduled({ cron: '*/2 * * * *' }, env, null);
  return { api, cron };
}

// One world: admin, owner, one bot, one durable work room, one scoped token.
async function world(env = { LLM_ENABLED: 'true' }) {
  const db = makeD1();
  const plain = await isolate(db);
  const reg = await plain.api('auth/register', 'POST', { ...F24_CONSENT, email: 'pco-admin@luno-test.local', password: PW, display_name: 'admin' });
  assert.equal(reg.status, 201);
  const adminId = (await reg.json()).id;
  const { api, cron } = await isolate(db, { ...env, ADMIN_USER_IDS: adminId });
  const login = async (email) => (await (await api('auth/login', 'POST', { email, password: PW })).json()).access_token;
  const adminToken = await login('pco-admin@luno-test.local');
  const oreg = await api('auth/register', 'POST', { ...F24_CONSENT, email: 'pco-owner@luno-test.local', password: PW, display_name: 'owner' });
  assert.equal(oreg.status, 201);
  const ownerId = (await oreg.json()).id;
  const owner = await login('pco-owner@luno-test.local');
  const bot = await (await api('admin/bots', 'POST', { display_name: 'PC-LUNO', handle: 'pc_luno' }, adminToken)).json();
  const room = await (await api('conversations', 'POST', { kind: 'group', title: 'PC', member_ids: [bot.id] }, owner)).json();
  await api('admin/llm/allowlist', 'POST', { kind: 'room', ref_id: room.id }, adminToken);
  await api('admin/llm/allowlist', 'POST', { kind: 'user', ref_id: ownerId }, adminToken);
  const tok = (await (await api(`admin/bots/${bot.id}/tokens`, 'POST', { rooms: [room.id], ops: ['read', 'post', 'propose'], ttl_sec: 3600 }, adminToken)).json()).token;
  return { db, api, cron, adminToken, owner, ownerId, bot, room, tok };
}
function seedSeen(db, botId, at, rooms) {
  db.raw.prepare('INSERT INTO luno_bot_config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .run(`seen:${botId}`, JSON.stringify({ at, rooms }));
}
function warnedAt(db, botId) {
  return db.raw.prepare('SELECT value FROM luno_bot_config WHERE key = ?').get(`warned:${botId}`);
}
function roomTexts(db, roomId) {
  return db.raw.prepare("SELECT sender_id, kind, body, metadata FROM luno_messages WHERE conversation_id = ? AND kind != 'system' ORDER BY sequence").all(roomId);
}

test('offline: silent for 4 minutes warns once, as the bot, with the KST time', async () => {
  const w = await world();
  try {
    const at = Date.now() - 4 * 60 * 1000;
    seedSeen(w.db, w.bot.id, at, [w.room.id]);
    await w.cron();
    const msgs = roomTexts(w.db, w.room.id);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].sender_id, w.bot.id);
    const hhmm = new Date(at + KST).toISOString().slice(11, 16);
    assert.equal(msgs[0].body, `⚠️ 집 PC 응답 없음 (마지막 접속 ${hhmm}) — 정전·재부팅 확인 필요`);
    assert.equal(JSON.parse(msgs[0].metadata).offline_warning, true);
    assert.ok(warnedAt(w.db, w.bot.id), 'warned marker set');
  } finally { w.db.raw.close(); }
});

test('offline: silent for 2 minutes stays silent', async () => {
  const w = await world();
  try {
    seedSeen(w.db, w.bot.id, Date.now() - 2 * 60 * 1000, [w.room.id]);
    await w.cron();
    assert.equal(roomTexts(w.db, w.room.id).length, 0);
    assert.equal(warnedAt(w.db, w.bot.id), undefined);
  } finally { w.db.raw.close(); }
});

test('offline: repeat crons never duplicate the warning', async () => {
  const w = await world();
  try {
    seedSeen(w.db, w.bot.id, Date.now() - 10 * 60 * 1000, [w.room.id]);
    await w.cron();
    await w.cron();
    await w.cron();
    assert.equal(roomTexts(w.db, w.room.id).length, 1);
  } finally { w.db.raw.close(); }
});

test('offline: recovery clears the marker, going dark again warns again', async () => {
  const w = await world();
  try {
    seedSeen(w.db, w.bot.id, Date.now() - 4 * 60 * 1000, [w.room.id]);
    await w.cron();
    assert.equal(roomTexts(w.db, w.room.id).length, 1);
    const claim = await w.api('bot/jobs/claim', 'POST', {}, w.tok);
    assert.equal(claim.status, 200);
    assert.equal(warnedAt(w.db, w.bot.id), undefined, 'a fresh claim clears the marker');
    seedSeen(w.db, w.bot.id, Date.now() - 4 * 60 * 1000, [w.room.id]);
    await w.cron();
    assert.equal(roomTexts(w.db, w.room.id).length, 2);
  } finally { w.db.raw.close(); }
});

test('offline: the killswitch and the master switch suppress the warning', async () => {
  const w = await world();
  try {
    seedSeen(w.db, w.bot.id, Date.now() - 4 * 60 * 1000, [w.room.id]);
    await w.api('admin/llm/kill', 'PUT', { stopped: true }, w.adminToken);
    await w.cron();
    assert.equal(roomTexts(w.db, w.room.id).length, 0, 'killed: halted by operator, not a dead PC');
    await w.api('admin/llm/kill', 'PUT', { stopped: false }, w.adminToken);
    await w.cron();
    assert.equal(roomTexts(w.db, w.room.id).length, 1);
  } finally { w.db.raw.close(); }
  const off = await world({});
  try {
    seedSeen(off.db, off.bot.id, Date.now() - 4 * 60 * 1000, [off.room.id]);
    await off.cron();
    assert.equal(roomTexts(off.db, off.room.id).length, 0, 'master switch off');
  } finally { off.db.raw.close(); }
});

test('seen: claims record the heartbeat at most every 60 seconds', async () => {
  const w = await world();
  try {
    const before = Date.now();
    assert.equal((await w.api('bot/jobs/claim', 'POST', {}, w.tok)).status, 200);
    const row = w.db.raw.prepare('SELECT value FROM luno_bot_config WHERE key = ?').get(`seen:${w.bot.id}`);
    assert.ok(row, 'claim writes seen');
    const first = JSON.parse(row.value);
    assert.ok(first.at >= before && first.at <= Date.now());
    assert.deepEqual(first.rooms, [w.room.id]);
    assert.equal((await w.api('bot/jobs/claim', 'POST', {}, w.tok)).status, 200);
    const again = JSON.parse(w.db.raw.prepare('SELECT value FROM luno_bot_config WHERE key = ?').get(`seen:${w.bot.id}`).value);
    assert.equal(again.at, first.at, 'a rapid second claim rewrites nothing');
  } finally { w.db.raw.close(); }
});
