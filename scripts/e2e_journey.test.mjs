// E2E journey against a real local Go backend (throwaway sqlite).
// register -> login -> conversation -> message -> friend -> wallet
// charge/send -> account delete. Skips cleanly when the Go toolchain is
// absent (e.g. web CI), so `node --test` stays green everywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

let goAvailable = true;
try {
  execFileSync('go', ['version'], { stdio: 'ignore' });
} catch {
  goAvailable = false;
}

const PORT = 18925;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitForApi() {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('go backend did not start');
}

test('E2E: full messenger journey on the Go backend', { skip: !goAvailable }, async () => {
  const DB = join(tmpdir(), `e2e_journey_${Date.now()}.db`);
  const GOBIN = join(tmpdir(), 'e2e-backend.exe');
  try { rmSync(GOBIN); } catch {}
  execFileSync('go', ['build', '-o', GOBIN, './cmd/server'], { cwd: 'backend', stdio: 'ignore' });
  const go = spawn(GOBIN, [], {
    env: {
      ...process.env,
      DATABASE_URL: 'sqlite://' + DB.replace(/\\/g, '/'),
      JWT_SECRET: 'e2e-only-secret-0123456789abcdef',
      PORT: String(PORT),
    },
    stdio: 'ignore',
  });
  try {
    await waitForApi();
    const api = async (path, method = 'GET', body = null, token = null) => {
      const r = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === null ? undefined : JSON.stringify(body),
      });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    };

    // 1. register + login two users
    const pw = 'E2eJourney#2026!';
    for (const [email, name] of [['e2e-a@local.test', 'E2E A'], ['e2e-b@local.test', 'E2E B']]) {
      const reg = await api('/api/v1/auth/register', 'POST', { email, password: pw, display_name: name });
      assert.equal(reg.status, 201, `register ${email}`);
    }
    const la = await api('/api/v1/auth/login', 'POST', { email: 'e2e-a@local.test', password: pw });
    const lb = await api('/api/v1/auth/login', 'POST', { email: 'e2e-b@local.test', password: pw });
    assert.equal(la.status, 200);
    assert.equal(lb.status, 200);
    const ta = la.json.access_token, tb = lb.json.access_token;

    // 2. friend add first: only friends can start direct conversations (403 otherwise)
    const fr = await api('/api/v1/friends', 'POST', { friend_id: lb.json.user_id }, ta);
    assert.ok([200, 201].includes(fr.status), `add friend: ${fr.status}`);
    const fl = await api('/api/v1/friends', 'GET', null, ta);
    assert.equal(fl.status, 200);
    assert.ok((fl.json.friends || []).length >= 1, 'friend listed');

    // 3. direct conversation + message round-trip
    const conv = await api('/api/v1/conversations', 'POST', { kind: 'direct', member_ids: [lb.json.user_id], title: 'E2E chat' }, ta);
    assert.equal(conv.status, 201);
    const cid = conv.json.id;
    const sent = await api(`/api/v1/conversations/${cid}/messages`, 'POST', { client_id: `e2e-${Date.now()}`, kind: 'text', body: 'hello e2e' }, ta);
    assert.equal(sent.status, 201);
    const msgs = await api(`/api/v1/conversations/${cid}/messages`, 'GET', null, tb);
    assert.equal(msgs.status, 200);
    assert.ok(msgs.json.messages.some((m) => m.body === 'hello e2e'), 'bob sees the message');

    // 4. wallet: fresh wallets start at 0, money-in fails closed without a
    // provider (no SIM flag in this env), and overdraft is rejected.
    const w0 = await api('/api/v1/wallet', 'GET', null, ta);
    assert.equal(w0.json.balance, 0);
    const ch = await api('/api/v1/wallet/charge', 'POST', { amount: 50000 }, ta);
    assert.equal(ch.status, 503, 'charge fails closed without a provider');
    assert.match(ch.json.error || '', /verified provider integration required/);
    const sd = await api('/api/v1/wallet/send', 'POST', { to_user_id: lb.json.user_id, amount: 25000, note: 'e2e', conversation_id: cid }, ta);
    assert.equal(sd.status, 400, 'overdraft rejected');

    // 5. account delete kills the login
    const del = await api('/api/v1/me', 'DELETE', { password: pw }, ta);
    assert.equal(del.status, 200);
    assert.equal((await api('/api/v1/auth/login', 'POST', { email: 'e2e-a@local.test', password: pw })).status, 401);
  } finally {
    go.kill();
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      try { rmSync(DB + suffix); } catch {}
    }
  }
});
