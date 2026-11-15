// F23 ops remainder: WS ticket storage faults answer 503 (retryable), never
// a misleading intermittent 401; the minting isolate honours its memory copy
// once while D1 is down; genuine unknown/expired/replayed tickets still 401.
// Cost caps (H2/T1/L-09) live in one block at the top of cf_worker.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeD1 , F24_CONSENT } from './test_helpers.mjs';

// --- Upgrade shims (same shape as realtime_fanout.test.mjs) ----------------
const nativeResponse = globalThis.Response;
globalThis.Response = class extends nativeResponse {
  constructor(body, init) {
    super(body, init?.status === 101 ? { status: 200 } : init);
    if (init?.status === 101) {
      Object.defineProperty(this, 'status', { value: 101 });
      Object.defineProperty(this, 'webSocket', { value: init.webSocket ?? null });
    }
  }
};
globalThis.WebSocketPair = class {
  constructor() {
    const server = { sent: [], accept() {}, addEventListener() {}, send(d) { this.sent.push(d); } };
    this[0] = { isClient: true };
    this[1] = server;
  }
};

let f23Serial = 0;
async function f23Isolate(db) {
  const mod = await import(`./cf_worker.js?f23=${++f23Serial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true' };
  const api = (path, method = 'GET', body = null, token = null, extraHeaders = {}) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api, env };
}

// D1 blip scoped to ticket rows: CREATEs (ensureSchema) pass, row reads and
// writes fail. Every other table keeps working.
function outageD1(db) {
  return {
    ...db,
    prepare: (sql) => {
      if (sql.includes('luno_ws_tickets') && !sql.startsWith('CREATE')) throw new Error('D1 down');
      return db.prepare(sql);
    },
  };
}

const PW = 'Str0ng!Passw0rd';

async function userToken(api, email) {
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
  assert.equal(reg.status, 201);
  const login = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(login.status, 200);
  return (await login.json()).access_token;
}

async function issue(api, token) {
  const r = await api('ws-ticket', 'POST', null, token);
  assert.equal(r.status, 200);
  return (await r.json()).ticket;
}

async function upgrade(api, ticket) {
  return api(`ws?ticket=${encodeURIComponent(ticket)}`, 'GET', null, null, { Upgrade: 'websocket' });
}

test('F23: healthy redeem is single-use; unknown tickets 401', async () => {
  const db = makeD1();
  try {
    const { api } = await f23Isolate(db);
    const token = await userToken(api, 'f23-a@luno-test.local');
    const ticket = await issue(api, token);
    const up = await upgrade(api, ticket);
    assert.equal(up.status, 101, 'first redeem upgrades');
    const replay = await upgrade(api, ticket);
    assert.equal(replay.status, 401, 'replay rejected, no fallback');
    const unknown = await upgrade(api, 'wst-00000000-0000-0000-0000-000000000000');
    assert.equal(unknown.status, 401, 'unknown ticket rejected');
  } finally { db.raw.close(); }
});

test('F23: D1 outage at redeem — minting isolate falls back once, then 503', async () => {
  const db = makeD1();
  try {
    const { api, env } = await f23Isolate(db);
    const token = await userToken(api, 'f23-b@luno-test.local');
    const ticket = await issue(api, token);
    env.DB = outageD1(db);
    const up = await upgrade(api, ticket);
    assert.equal(up.status, 101, 'memory fallback upgrades on the minting isolate');
    const replay = await upgrade(api, ticket);
    assert.equal(replay.status, 503, 'fallback is single-use; second use is honest 503, not 401');
    assert.equal((await replay.json()).code, 'TICKET_STORAGE_DOWN');
  } finally { db.raw.close(); }
});

test('F23: D1 outage at redeem — other isolates answer 503, never 401', async () => {
  const db = makeD1();
  try {
    const a = await f23Isolate(db);
    const token = await userToken(a.api, 'f23-c@luno-test.local');
    const ticket = await issue(a.api, token);
    const b = await f23Isolate(outageD1(db));
    const up = await upgrade(b.api, ticket);
    assert.equal(up.status, 503, 'no memory copy elsewhere: 503, not misleading 401');
    assert.equal((await up.json()).code, 'TICKET_STORAGE_DOWN');
  } finally { db.raw.close(); }
});

test('F23: D1 outage at issuance mints nothing half-alive', async () => {
  const db = makeD1();
  try {
    const { api, env } = await f23Isolate(db);
    const token = await userToken(api, 'f23-d@luno-test.local');
    env.DB = outageD1(db);
    const r = await api('ws-ticket', 'POST', null, token);
    assert.equal(r.status, 503, 'issuance fails cleanly instead of a memory-only ticket');
    assert.equal((await r.json()).code, 'TICKET_STORAGE_DOWN');
    // After recovery there is no half-ticket to replay anywhere.
    env.DB = db;
    const again = await api('ws-ticket', 'POST', null, token);
    assert.equal(again.status, 200, 'recovery issues normally');
  } finally { db.raw.close(); }
});

test('F23: every money-adjacent cap lives in one block', async () => {
  const src = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  const lines = src.split('\n');
  const at = (name) => {
    const found = [];
    lines.forEach((l, i) => {
      if (new RegExp(`^const ${name} = `).test(l)) found.push(i + 1);
    });
    return found;
  };
  // H2 daily quotas, T1 metered guards, L-09 bot budgets: one declaration
  // each, all inside the caps block at the top of the file.
  for (const name of [
    'QUOTA_UPLOADS_PER_DAY', 'QUOTA_UPLOAD_BYTES_PER_DAY', 'QUOTA_ROOMS_PER_DAY',
    'TRANSLATE_MAX_CHARS', 'TRANSLATE_PER_MINUTE', 'TRANSLATE_CHARS_PER_DAY',
    'STT_MAX_B64', 'STT_PER_MINUTE',
    'BOT_DAILY_REQUESTS', 'BOT_DAILY_TOKENS',
  ]) {
    const decls = at(name);
    assert.equal(decls.length, 1, `${name} declared exactly once`);
    assert.ok(decls[0] < 130, `${name} lives in the top caps block (line ${decls[0]})`);
  }
});
