import fs from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const base = 'https://luno-messenger.dnjstjqppk.workers.dev', cases = [];
let token;
async function probe(path, expected = 200, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  cases.push({ id: `PROD-SMOKE-${cases.length + 1}`, purpose: `${method} ${path}`, prerequisites: ['Approved production smoke; no business-data mutation'], steps: ['Send the documented request and verify status'], expected, actual: response.status, verdict: response.status === expected ? 'PASS' : 'FAIL' });
  assert.equal(response.status, expected, `${method} ${path}`);
  return response;
}
try {
  const version = await (await probe('/api/v1/version')).json();
  const localHash = createHash('sha256').update(fs.readFileSync('scripts/cf_worker.js')).digest('hex');
  assert.equal(version.worker_source_sha256, localHash, 'Deployed worker must match the reviewed local worker source');
  const readiness = await (await probe('/readyz')).json(); assert.equal(readiness.checks.schema, 'ready');
  for (const path of ['/', '/admin/', '/partner/', '/developer/', '/creator/', '/ads/']) await probe(path);
  await probe('/api/v1/partner/accounts/oa-notice/bot-rules', 401);
  if (process.env.LUNO_SMOKE_EMAIL && process.env.LUNO_SMOKE_PASSWORD) {
    const session = await (await probe('/api/v1/auth/login', 200, 'POST', { email: process.env.LUNO_SMOKE_EMAIL, password: process.env.LUNO_SMOKE_PASSWORD, device_name: 'LUNO read-only authorization smoke', platform: 'web' })).json();
    token = session.access_token; assert.ok(token);
    const me = await (await probe('/api/v1/me')).json(); assert.notEqual(me.role, 'admin', 'Use a non-admin smoke account');
    for (const path of ['bot-rules', 'rich-menus', 'tickets']) await probe('/api/v1/partner/accounts/oa-notice/' + path, 403);
    await probe('/api/v1/creator/settlements', 503);
    await probe('/api/v1/users/never-registered/keys', 404);
  }
} finally {
  if (token) await probe('/api/v1/auth/logout', 200, 'POST', {});
  fs.mkdirSync('docs/audit-20261105', { recursive: true });
  fs.writeFileSync('docs/audit-20261105/production-smoke.json', JSON.stringify({ measuredAt: new Date().toISOString(), scope: 'Public entry/readiness/source identity; optional non-admin management GET denial. Only authentication-session lifecycle writes; no business-data or schema mutation.', cases }, null, 2));
  console.log(JSON.stringify({ executed: cases.length, pass: cases.filter(value => value.verdict === 'PASS').length, fail: cases.filter(value => value.verdict === 'FAIL').length }));
}
