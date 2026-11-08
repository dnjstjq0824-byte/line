// Cross-isolate realtime delivery.
//
// activeSockets inside cf_worker.js is a per-isolate Map: before the UserSocketHub
// Durable Object existed, a message written by the isolate serving the sender simply
// never reached a recipient whose socket was held by a different isolate. The
// recipient saw it only on their next fetch. wsTickets had the same problem one step
// earlier -- a ticket minted on one isolate could not be redeemed on another, so the
// upgrade returned 401.
//
// These tests drive the real exported UserSocketHub class (not a stand-in for it)
// through a fake Durable Object namespace that is shared between isolates, which is
// how a real namespace behaves: one global set of objects addressed by name.
//
// A fresh module instance (?iso=N) is a different isolate: empty in-memory state,
// seeing only what D1 and the shared hub namespace carry between them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const BASE = 'https://localhost';
const ALICE_CONVERSATION = '00000000-0000-0000-0000-000000000010';

// --- Cloudflare runtime shims ----------------------------------------------
// A 101 response carries no body in undici, so keep the status observable.
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

// Every server-side socket records what was sent to it.
function makeSocketPair() {
  const server = {
    sent: [],
    closed: null,
    send(data) {
      if (this.closed) throw new Error('socket is closed');
      this.sent.push(JSON.parse(data));
    },
    close(code, reason) { this.closed = { code, reason }; },
    accept() {},
    addEventListener() {},
  };
  return { client: { isClient: true }, server };
}
const allPairs = [];
globalThis.WebSocketPair = class {
  constructor() {
    const { client, server } = makeSocketPair();
    allPairs.push({ client, server });
    this[0] = client;
    this[1] = server;
  }
};

// --- D1 emulator (node:sqlite speaks the same dialect) ---------------------
function makeD1() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, display_name TEXT, bio TEXT, status_message TEXT, created_at TEXT, updated_at TEXT);
            CREATE TABLE friends (user_id TEXT, friend_id TEXT);
            CREATE TABLE wallets (user_id TEXT PRIMARY KEY, balance INTEGER, updated_at TEXT);`);
  return {
    prepare(sql) {
      let params = [];
      const st = {
        bind(...p) { params = p; return st; },
        async run() { const r = raw.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
        async all() { return { results: raw.prepare(sql).all(...params).map(r => ({ ...r })) }; },
        async first() { const r = raw.prepare(sql).get(...params); return r ? { ...r } : null; },
      };
      return st;
    },
  };
}

// --- Fake Durable Object namespace over the real UserSocketHub -------------
function makeState() {
  const sockets = [];
  return {
    sockets,
    acceptWebSocket(ws) { sockets.push(ws); },
    getWebSockets() { return sockets.filter(ws => !ws.closed); },
  };
}

function makeHubNamespace(UserSocketHub) {
  const objects = new Map(); // name -> { instance, state }
  return {
    objects,
    idFromName(name) { return { name: String(name) }; },
    get(id) {
      if (!objects.has(id.name)) {
        const state = makeState();
        objects.set(id.name, { instance: new UserSocketHub(state, {}), state });
      }
      const { instance } = objects.get(id.name);
      return { fetch: (url, init) => instance.fetch(new Request(url, init)) };
    },
    // Everything delivered to a given user's devices, across every isolate.
    deliveredTo(userId) {
      const entry = objects.get(String(userId));
      if (!entry) return [];
      return entry.state.sockets.flatMap(ws => ws.sent);
    },
    socketsOf(userId) {
      const entry = objects.get(String(userId));
      return entry ? entry.state.sockets : [];
    },
  };
}

// --- Harness ---------------------------------------------------------------
let isoCounter = 0;
async function isolate({ db, hub, extraEnv = {} } = {}) {
  const mod = await import(`./cf_worker.js?rt=${++isoCounter}`);
  const env = {
    ALLOW_LOCAL_DEMO: 'true',
    ...(db ? { DB: db } : {}),
    ...(hub ? { USER_HUB: hub } : {}),
    ...extraEnv,
  };
  // waitUntil must be awaited by the test, or fan-out would race the assertions.
  const pending = [];
  const ctx = { waitUntil: p => pending.push(p) };

  const api = (path, method = 'GET', body = null, token = null, headers = {}) =>
    mod.default.fetch(new Request(`${BASE}/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      ...(body === null ? {} : { body: JSON.stringify(body) }),
    }), env, ctx);

  return {
    mod,
    api,
    settle: async () => { while (pending.length) await pending.shift(); },
    async login(email, password) {
      const res = await api('auth/login', 'POST', { email, password });
      assert.equal(res.status, 200, `login failed for ${email}`);
      return (await res.json()).access_token;
    },
    async connect(token) {
      const t = await api('ws-ticket', 'POST', null, token);
      assert.equal(t.status, 200, 'ws-ticket should be issued');
      const { ticket } = await t.json();
      const up = await api(`ws?ticket=${encodeURIComponent(ticket)}`, 'GET', null, null, { Upgrade: 'websocket' });
      return { ticket, status: up.status };
    },
  };
}

const CREDS = {
  alice: ['alice@luno-test.local', 'Alice#Rotated$48wT'],
  bob: ['bob@luno-test.local', 'Bob#Rotated$31qR'],
  outsider: ['user@luno.local', 'LunoUser#2026!'],
};

// ===========================================================================

test('UserSocketHub accepts a socket, pushes to every device, and answers ping', async () => {
  const probe = await isolate();
  const { UserSocketHub } = probe.mod;
  assert.equal(typeof UserSocketHub, 'function', 'the worker must export UserSocketHub');

  const state = makeState();
  const hub = new UserSocketHub(state, {});

  // Two devices for one user.
  const first = await hub.fetch(new Request('https://user-hub.internal/connect', { headers: { Upgrade: 'websocket' } }));
  const second = await hub.fetch(new Request('https://user-hub.internal/connect', { headers: { Upgrade: 'websocket' } }));
  assert.equal(first.status, 101);
  assert.equal(second.status, 101);
  assert.equal(state.getWebSockets().length, 2, 'both devices should be held open');

  const pushed = await hub.fetch(new Request('https://user-hub.internal/push', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'message.created', body: 'hello' }),
  }));
  assert.equal(pushed.status, 200);
  assert.equal((await pushed.json()).delivered, 2, 'both devices should receive it');
  for (const ws of state.getWebSockets()) {
    assert.deepEqual(ws.sent.at(-1), { type: 'message.created', body: 'hello' });
  }

  // The ping/pong contract the previous in-isolate handler offered must survive.
  const [ws] = state.getWebSockets();
  hub.webSocketMessage(ws, JSON.stringify({ type: 'ping' }));
  assert.deepEqual(ws.sent.at(-1), { type: 'pong' }, 'ping must still be answered with pong');

  // Malformed frames must not throw.
  hub.webSocketMessage(ws, 'not json');
  hub.webSocketMessage(ws, JSON.stringify({ type: 'unknown' }));

  // A rejected upgrade and an unknown path.
  assert.equal((await hub.fetch(new Request('https://user-hub.internal/connect'))).status, 426);
  assert.equal((await hub.fetch(new Request('https://user-hub.internal/nope'))).status, 404);
});

test('a push to a hub with no connected device is not an error', async () => {
  const probe = await isolate();
  const hub = new probe.mod.UserSocketHub(makeState(), {});
  const res = await hub.fetch(new Request('https://user-hub.internal/push', {
    method: 'POST', body: JSON.stringify({ type: 'noop' }),
  }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).delivered, 0);
});

test('a message reaches a recipient whose socket is held by a DIFFERENT isolate', async () => {
  // The whole point. The sender is served by isolate A; the recipient's socket
  // lives on isolate B. Before the hub existed, B's socket received nothing.
  const db = makeD1();
  const probe = await isolate({ db });
  const hub = makeHubNamespace(probe.mod.UserSocketHub);

  const isolateA = await isolate({ db, hub });
  const isolateB = await isolate({ db, hub });

  const aliceOnA = await isolateA.login(...CREDS.alice);
  const bobOnB = await isolateB.login(...CREDS.bob);

  // Bob connects through isolate B.
  const connected = await isolateB.connect(bobOnB);
  assert.equal(connected.status, 101, 'the upgrade should be handed to the hub');
  assert.ok(hub.socketsOf('00000000-0000-0000-0000-000000000004').length > 0 ||
            hub.objects.size > 0, 'the hub should now hold a socket');

  const before = hub.objects.size;
  assert.ok(before > 0, 'connecting must create a hub object for the user');

  // Alice sends through isolate A.
  const sent = await isolateA.api(`conversations/${ALICE_CONVERSATION}/messages`, 'POST', { body: 'across isolates' }, aliceOnA);
  assert.equal(sent.status, 201, 'the message should be accepted');
  await isolateA.settle();

  // Find Bob's hub object by looking for the delivery.
  const everything = Array.from(hub.objects.entries()).flatMap(([userId, entry]) =>
    entry.state.sockets.flatMap(ws => ws.sent.map(event => ({ userId, event }))));
  const delivered = everything.filter(x => x.event?.message?.body === 'across isolates');

  assert.ok(delivered.length > 0,
    'the recipient on another isolate received nothing: cross-isolate fan-out is not working');

  // ...and it went to a conversation member, not to anyone else.
  const members = new Set([
    '00000000-0000-0000-0000-000000000003', // alice
    '00000000-0000-0000-0000-000000000004', // bob
  ]);
  for (const { userId } of delivered) {
    assert.ok(members.has(userId), `delivered to a non-member: ${userId}`);
  }
});

test('fan-out targets conversation members only, never an outsider', async () => {
  const db = makeD1();
  const probe = await isolate({ db });
  const hub = makeHubNamespace(probe.mod.UserSocketHub);
  const node = await isolate({ db, hub });

  const alice = await node.login(...CREDS.alice);
  const outsider = await node.login(...CREDS.outsider);

  // The outsider connects, so a hub object exists for them and silence is meaningful.
  const outsiderConn = await node.connect(outsider);
  assert.equal(outsiderConn.status, 101);
  const outsiderId = '00000000-0000-0000-0000-000000000002';
  const outsiderBefore = hub.deliveredTo(outsiderId).length;

  const sent = await node.api(`conversations/${ALICE_CONVERSATION}/messages`, 'POST', { body: 'members only' }, alice);
  assert.equal(sent.status, 201);
  await node.settle();

  const outsiderAfter = hub.deliveredTo(outsiderId);
  const leaked = outsiderAfter.slice(outsiderBefore).filter(e => e?.message?.body === 'members only');
  assert.deepEqual(leaked, [], 'a private message was pushed to a non-member');
});

test('a ws-ticket minted on one isolate can be redeemed on another', async () => {
  // wsTickets is per-isolate. Without D1 persistence the upgrade on a second
  // isolate returned 401, so WebSocket connects failed intermittently in production.
  const db = makeD1();
  const probe = await isolate({ db });
  const hub = makeHubNamespace(probe.mod.UserSocketHub);

  const minting = await isolate({ db, hub });
  const upgrading = await isolate({ db, hub });

  const token = await minting.login(...CREDS.alice);
  const res = await minting.api('ws-ticket', 'POST', null, token);
  assert.equal(res.status, 200);
  const { ticket } = await res.json();

  const up = await upgrading.api(`ws?ticket=${encodeURIComponent(ticket)}`, 'GET', null, null, { Upgrade: 'websocket' });
  assert.equal(up.status, 101, 'a ticket must be redeemable on an isolate that did not mint it');

  // Still one use only, on any isolate.
  const replayElsewhere = await upgrading.api(`ws?ticket=${encodeURIComponent(ticket)}`, 'GET', null, null, { Upgrade: 'websocket' });
  assert.equal(replayElsewhere.status, 401, 'a redeemed ticket must not work twice');
  const replayOnMinter = await minting.api(`ws?ticket=${encodeURIComponent(ticket)}`, 'GET', null, null, { Upgrade: 'websocket' });
  assert.equal(replayOnMinter.status, 401, 'a redeemed ticket must not work on the minting isolate either');

  // A ticket nobody minted is still refused.
  const forged = await upgrading.api('ws?ticket=not-a-real-ticket', 'GET', null, null, { Upgrade: 'websocket' });
  assert.equal(forged.status, 401);
});

test('without the USER_HUB binding the worker still serves sockets per-isolate', async () => {
  // Deployments that have not enabled Durable Objects must keep working.
  const db = makeD1();
  const node = await isolate({ db });
  const token = await node.login(...CREDS.alice);
  const connected = await node.connect(token);
  assert.equal(connected.status, 101, 'the in-isolate upgrade path must still work');

  const sent = await node.api(`conversations/${ALICE_CONVERSATION}/messages`, 'POST', { body: 'local only' }, token);
  assert.equal(sent.status, 201);
  await node.settle();

  const locally = allPairs.flatMap(p => p.server.sent).filter(e => e?.message?.body === 'local only');
  assert.ok(locally.length > 0, 'the per-isolate delivery path regressed');
});
