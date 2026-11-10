import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const env = { ADMIN_INITIAL_PASSWORD: 'Partner#Admin1', DEMO_INITIAL_PASSWORD: 'Partner#Demo12' };
async function api(path, token, method = 'GET', body) {
  return worker.fetch(new Request('http://localhost/api/v1/' + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
}
async function login(email, password) { return (await (await api('auth/login', null, 'POST', { email, password })).json()).access_token; }
async function signup(email, handle) {
  const reg = await api('auth/register', null, 'POST', { email, password: 'Str0ng!Passw0rd', display_name: handle, handle });
  assert.equal(reg.status, 201);
  return login(email, 'Str0ng!Passw0rd');
}
test('customers cannot read or mutate official-account management data', async () => {
  const user = await login('user@luno.local', 'Partner#Demo12');
  for (const [path, method, body] of [
    ['partner/accounts/oa-notice/rich-menus', 'GET'],
    ['partner/accounts/oa-notice/rich-menus', 'POST', { title: 'forged' }],
    ['partner/accounts/oa-notice/bot-rules', 'GET'],
    ['partner/accounts/oa-notice/bot-rules', 'POST', { keywords: ['forged'], reply: 'forged' }],
    ['partner/accounts/oa-notice/bot-rules/unknown', 'DELETE'],
    ['partner/accounts/oa-notice/tickets', 'GET'],
  ]) assert.equal((await api(path, user, method, body)).status, 403, `${method} ${path}`);
});
test('organization listing excludes other owners and seeded admin retains management access', async () => {
  const owner = await signup('partner-owner@luno-test.local', 'partnerowner');
  const outsider = await signup('partner-outsider@luno-test.local', 'partneroutsider');
  const created = await (await api('partner/organizations', owner, 'POST', { name: 'Ownership test organization' })).json();
  const own = await (await api('partner/organizations', owner)).json();
  const other = await (await api('partner/organizations', outsider)).json();
  assert.ok(own.organizations.some(org => org.id === created.id));
  assert.equal(other.organizations.some(org => org.id === created.id), false);
  const admin = await login('admin@luno.local', 'Partner#Admin1');
  assert.equal((await api('partner/accounts/oa-notice/bot-rules', admin)).status, 200);
});
test('unconfigured external services cannot claim delivery, transcription or payment success', async () => {
  const user = await login('user@luno.local', 'Partner#Demo12');
  for (const path of ['push-tokens/test', 'ai/stt', 'checkout', 'creator/settlements/request', 'developer/apps/unknown/webhooks/test']) {
    const response = await api(path, user, 'POST', { amount: 10000, mock_text: 'not a transcript' });
    assert.equal(response.status, 503, path);
    const body = await response.json();
    for (const field of ['dispatched', 'delivered', 'transcript', 'checkout_url', 'payout_amount']) assert.equal(body[field], undefined, `${path}: ${field}`);
  }
  assert.equal((await api('users/never-registered/keys', user)).status, 404);
});
