import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const base = new URL(process.argv[2] || 'http://127.0.0.1:8797');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.protocol !== 'http:') throw new Error('This isolated-data acceptance script only runs on local HTTP hosts');
const cases = [];
async function api(path, token, method = 'GET', body, expected = 200) {
  const response = await fetch(new URL(path, base), { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  cases.push({ id: `SEC-STAGE-${cases.length + 1}`, purpose: `${method} ${path} returns ${expected}`, prerequisites: ['Dedicated local Worker and local D1 only'], steps: ['Send real HTTP request with the current isolated account', 'Check the returned status'], expected, actual: response.status, verdict: response.status === expected ? 'PASS' : 'FAIL' });
  assert.equal(response.status, expected, `${method} ${path}`); return data;
}
try {
  const ready = await api('/readyz'); assert.equal(ready.checks.database, 'healthy');
  const users = [];
  for (let i = 0; i < 2; i++) {
    const email = `audit-${randomUUID()}@example.test`, password = 'Audit#' + randomUUID();
    await api('/api/v1/auth/register', null, 'POST', { email, password, display_name: `Isolated audit ${i}` }, 201);
    users.push(await api('/api/v1/auth/login', null, 'POST', { email, password }));
  }
  const org = await api('/api/v1/partner/organizations', users[0].access_token, 'POST', { name: 'Isolated ownership audit' }, 201);
  const own = await api('/api/v1/partner/organizations', users[0].access_token);
  const other = await api('/api/v1/partner/organizations', users[1].access_token);
  assert.ok(own.organizations.some(value => value.id === org.id)); assert.equal(other.organizations.some(value => value.id === org.id), false);
  for (const [path, method, body] of [
    ['/api/v1/partner/accounts/oa-notice/bot-rules', 'GET'],
    ['/api/v1/partner/accounts/oa-notice/bot-rules', 'POST', { keywords: ['unauthorized'], reply: 'must not be saved' }],
    ['/api/v1/partner/accounts/oa-notice/rich-menus', 'GET'],
    ['/api/v1/partner/accounts/oa-notice/tickets', 'GET'],
  ]) await api(path, users[1].access_token, method, body, 403);
  await api('/api/v1/partner/accounts/oa-notice/bot-rules', null, 'GET', undefined, 401);
  for (const path of ['push-tokens/test', 'ai/stt', 'checkout', 'creator/settlements/request', 'developer/apps/unknown/webhooks/test']) {
    const result = await api('/api/v1/' + path, users[1].access_token, 'POST', { amount: 10000, mock_text: 'not a transcript' }, 503);
    assert.equal(result.delivered, undefined); assert.equal(result.dispatched, undefined); assert.equal(result.transcript, undefined);
  }
  await api('/api/v1/users/never-registered/keys', users[1].access_token, 'GET', undefined, 404);
  const sockets = [];
  try {
    const me = await api('/api/v1/me', users[1].access_token);
    const conversation = await api('/api/v1/conversations', users[0].access_token, 'POST', { member_ids: [me.user?.id || me.id], kind: 'direct' }, 201);
    async function connect() {
      const { ticket } = await api('/api/v1/ws-ticket', users[1].access_token, 'POST', {});
      const url = new URL('/api/v1/ws', base); url.protocol = 'ws:'; url.searchParams.set('ticket', ticket);
      const ws = new WebSocket(url), events = [];
      sockets.push(ws);
      ws.addEventListener('message', event => events.push(JSON.parse(event.data)));
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 5000);
        ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
        ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket upgrade failed')); }, { once: true });
      });
      return { ws, events };
    }
    const devices = [await connect(), await connect()];
    const client_id = randomUUID();
    const sent = await api(`/api/v1/conversations/${conversation.id}/messages`, users[0].access_token, 'POST', { body: 'Real multi-device delivery', client_id }, 201);
    const duplicate = await api(`/api/v1/conversations/${conversation.id}/messages`, users[0].access_token, 'POST', { body: 'Real multi-device delivery', client_id });
    assert.equal(duplicate.duplicate, true);
    await new Promise(resolve => setTimeout(resolve, 500));
    for (const device of devices) assert.equal(device.events.filter(event => event.type === 'message.created' && event.message.id === sent.message.id).length, 1);
    cases.push({ id: 'RT-MULTI-DEVICE', purpose: 'Actual Durable Object hub delivers once to each of two connected devices', prerequisites: ['Local workerd, D1 and USER_HUB binding'], steps: ['Open two ticket-authenticated sockets', 'Send and retry one client_id', 'Count matching received frames'], expected: 'One frame per device, retry marked duplicate', actual: 'One frame per device, duplicate=true', verdict: 'PASS' });
    devices[0].ws.close();
    const missed = await api(`/api/v1/conversations/${conversation.id}/messages`, users[0].access_token, 'POST', { body: 'Offline recovery', client_id: randomUUID() }, 201);
    await connect();
    const sync = await api(`/api/v1/conversations/${conversation.id}/sync?since_sequence=${sent.message.sequence}`, users[1].access_token);
    assert.deepEqual(sync.delta_messages.map(value => value.id), [missed.message.id]);
    cases.push({ id: 'RT-RECONNECT-SYNC', purpose: 'Disconnected device recovers the later message using since_sequence', prerequisites: ['Same isolated conversation'], steps: ['Close socket', 'Send next message', 'Reconnect with fresh ticket', 'Fetch delta after acknowledged sequence'], expected: [missed.message.id], actual: sync.delta_messages.map(value => value.id), verdict: 'PASS' });
    if (process.env.LUNO_AUDIT_LONG_SYNC === '1') {
      for (let i = 0; i < 501; i++) await api(`/api/v1/conversations/${conversation.id}/messages`, users[0].access_token, 'POST', { body: `Recovery batch ${i}`, client_id: randomUUID() }, 201);
      const first = await api(`/api/v1/conversations/${conversation.id}/sync?since_sequence=0`, users[1].access_token);
      const second = await api(`/api/v1/conversations/${conversation.id}/sync?since_sequence=${first.latest_sequence}`, users[1].access_token);
      const recovered = [...first.delta_messages, ...second.delta_messages];
      assert.equal(first.has_more, true); assert.equal(first.delta_messages.length, 500);
      assert.equal(second.has_more, false); assert.equal(recovered.length, 503);
      assert.equal(new Set(recovered.map(value => value.id)).size, 503);
      assert.deepEqual(recovered.map(value => value.sequence), Array.from({ length: 503 }, (_, i) => i + 1));
      cases.push({ id: 'RT-LONG-SYNC', purpose: 'D1 delta recovery crosses the 500-item page boundary without missing or duplicating items', prerequisites: ['503 durable messages in an isolated local conversation'], steps: ['Create 501 additional messages', 'Fetch first page since zero', 'Fetch remaining page using returned cursor'], expected: '503 unique messages, contiguous sequences 1..503', actual: '503 unique messages, contiguous sequences 1..503', verdict: 'PASS' });
    }
  } finally { for (const ws of sockets) ws.close(); }
} finally {
  fs.mkdirSync('docs/audit-20261105', { recursive: true });
  fs.writeFileSync('docs/audit-20261105/security-stage.json', JSON.stringify({ measuredAt: new Date().toISOString(), base: base.origin, scope: 'Isolated local Worker/D1 ownership boundaries; no production mutation', cases }, null, 2));
  console.log(JSON.stringify({ executed: cases.length, pass: cases.filter(value => value.verdict === 'PASS').length, fail: cases.filter(value => value.verdict === 'FAIL').length }));
}
