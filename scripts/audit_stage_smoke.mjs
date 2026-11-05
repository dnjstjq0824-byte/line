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
} finally {
  fs.mkdirSync('docs/audit-20261105', { recursive: true });
  fs.writeFileSync('docs/audit-20261105/security-stage.json', JSON.stringify({ measuredAt: new Date().toISOString(), base: base.origin, scope: 'Isolated local Worker/D1 ownership boundaries; no production mutation', cases }, null, 2));
  console.log(JSON.stringify({ executed: cases.length, pass: cases.filter(value => value.verdict === 'PASS').length, fail: cases.filter(value => value.verdict === 'FAIL').length }));
}
