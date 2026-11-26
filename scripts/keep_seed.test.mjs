// 2026-11-26 UX sweep: the Keep memo seed a new account sees. It used to
// carry a developer note ("<base>/ 프로덕션 점검 완료") dated 2026-08-01, so
// every new user found an "Aug 1" memo they never wrote. The seed now
// welcomes the user, links the PC login and is dated by the account itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { F24_CONSENT, makeD1 } from './test_helpers.mjs';

let serial = 0;
async function isolate(db) {
  const mod = await import(`./cf_worker.js?keepseed=${++serial}`);
  const env = db ? { DB: db } : {};
  return (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
}

async function keepMessages(db) {
  const api = await isolate(db);
  const email = `keep-seed-${serial}@luno-test.local`;
  const before = Date.now();
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: 'Str0ng!Passw0rd', display_name: 'keep' });
  assert.equal(reg.status, 201);
  const id = (await reg.json()).id;
  const token = (await (await api('auth/login', 'POST', { email, password: 'Str0ng!Passw0rd' })).json()).access_token;
  const res = await (await api(`conversations/conv-keep-${id}/messages?limit=10`, 'GET', null, token)).json();
  return { before, messages: res.messages };
}

for (const [label, mkDb] of [['memory', () => null], ['D1', () => makeD1()]]) {
  test(`Keep seed (${label}): no developer note, dated by the account`, async () => {
    const db = mkDb();
    try {
      const { before, messages } = await keepMessages(db);
      assert.equal(messages.length, 2);
      const text = JSON.stringify(messages);
      assert.ok(!text.includes('점검'), 'no internal check note');
      assert.ok(messages.some((m) => /\/login$/.test(String(m.body))), 'links the PC login');
      for (const m of messages) {
        const at = Date.parse(m.created_at);
        assert.ok(!Number.isNaN(at), 'ISO time');
        // users.created_at may come from SQLite datetime('now') (whole
        // seconds, UTC, no zone marker): read as UTC it lands within a few
        // seconds of the signup, never hours away (the old local-time bug).
        assert.ok(Math.abs(at - before) < 60_000, `seed time ${m.created_at} follows signup`);
      }
    } finally {
      if (db) db.raw.close();
    }
  });
}
