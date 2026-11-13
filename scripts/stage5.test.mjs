// Stage 5 (M1/M2/C1/C2/C3/C4/H1/H2/H3/H4): clients and hardening.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeD1 } from './test_helpers.mjs';

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
