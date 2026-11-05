import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const origin = 'http://127.0.0.1:8798';
const file = '.vscode/phase1-role-session.json';
const mode = process.argv[2] || 'setup';
async function api(path, token, method = 'GET', body, expected = 200) {
  const response = await fetch(origin + '/api/v1/' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, expected, path); return response.json();
}
if (mode === 'setup') {
  const email = `ordinary-admin-${randomUUID()}@example.test`, password = 'Audit#' + randomUUID();
  await api('auth/register', null, 'POST', { email, password, display_name: 'Isolated role HTTP audit' }, 201);
  const session = await api('auth/login', null, 'POST', { email, password });
  assert.equal(session.role, 'user');
  await api('partner/accounts/oa-notice/bot-rules', session.access_token, 'GET', undefined, 403);
  fs.writeFileSync(file, JSON.stringify({ token: session.access_token }));
  console.log('PASS: fresh ordinary account with admin in email denied management access');
} else if (mode === 'after-restart') {
  const { token } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const me = await api('me', token); assert.equal(me.role, 'user');
  await api('partner/accounts/oa-notice/bot-rules', token, 'GET', undefined, 403);
  fs.writeFileSync('docs/audit-20261105/phase1-role-http.json', JSON.stringify({ measuredAt: new Date().toISOString(), environment: origin, productionMutations: 0, cases: [{ id: 'P0-ROLE-HTTP-RESTART', prerequisites: ['New local D1 only', 'Worker process stopped and restarted between setup and assertion'], steps: ['Register ordinary account containing admin in email', 'Verify denial', 'Restart local Worker', 'Reuse session and read profile', 'Call account management route'], expected: 'Persisted session remains user, management 403', actual: 'user and 403', verdict: 'PASS' }] }, null, 2));
  fs.unlinkSync(file);
  console.log('PASS: actual workerd restart preserves ordinary role and denies privileged access');
} else if (mode === 'apps') {
  const sessions = [];
  for (let i = 0; i < 2; i++) {
    const credentials = { email: `isolated-app-${randomUUID()}@example.test`, password: 'Audit#' + randomUUID(), display_name: 'Isolated app owner' };
    await api('auth/register', null, 'POST', credentials, 201);
    sessions.push(await api('auth/login', null, 'POST', credentials));
  }
  const app = await api('developer/apps', sessions[0].access_token, 'POST', { name: 'Private HTTP app' }, 201);
  assert.ok(app.client_secret); assert.equal(app.client_secret_hash, undefined);
  const mine = await api('developer/apps', sessions[0].access_token);
  assert.ok(mine.apps.some(value => value.id === app.id));
  assert.ok(mine.apps.every(value => !value.client_secret && !value.client_secret_hash));
  const other = await api('developer/apps', sessions[1].access_token);
  assert.equal(other.apps.some(value => value.id === app.id), false);
  await api(`developer/apps/${app.id}/webhooks`, sessions[1].access_token, 'POST', { endpoint_url: 'https://example.test/webhook' }, 403);
  await api(`developer/apps/${app.id}/webhooks`, sessions[0].access_token, 'POST', { endpoint_url: 'https://example.test/webhook' }, 503);
  fs.writeFileSync('docs/audit-20261105/phase1-app-http.json', JSON.stringify({ measuredAt: new Date().toISOString(), environment: origin, productionMutations: 0, cases: [{ id: 'P0-APP-HTTP-OWNERSHIP', prerequisites: ['Two newly registered isolated accounts', 'Actual local Worker/D1'], steps: ['Create owner app', 'List as owner and as outsider', 'Attempt webhook configuration as outsider and owner'], expected: 'Only owner sees app, no list exposes credentials, outsider 403, unimplemented persistence 503', actual: 'Expected checks passed', verdict: 'PASS' }], caveat: 'App records remain isolate-local; this proves the current ownership boundary, not durable app registration or provider delivery.' }, null, 2));
  console.log('PASS: actual HTTP owner isolation, one-time secret and fail-closed webhook configuration');
} else throw new Error('Unknown mode');
