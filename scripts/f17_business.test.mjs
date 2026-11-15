// Stage 10 (F17): partner/developer/creator/ads consoles on D1 behind
// DURABLE_BUSINESS — orgs, accounts, tickets, campaigns, coupons,
// rich menus, bot rules, dev apps, webhooks (https-only, internal-block,
// signed test delivery), miniapps, creator profiles/items, advertisers,
// ad groups. Memory mode keeps working; webhooks stay 503 without D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeD1 } from './test_helpers.mjs';

let f17Serial = 0;
async function f17Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f17=${++f17Serial}`);
  const env = { DB: db, DURABLE_BUSINESS: 'true', ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api };
}

const PW = 'Str0ng!Passw0rd';

async function registerLogin(api, email) {
  const reg = await api('auth/register', 'POST', { email, password: PW, display_name: email.split('@')[0] });
  assert.equal(reg.status, 201);
  const s = await api('auth/login', 'POST', { email, password: PW });
  assert.equal(s.status, 200);
  const sess = await s.json();
  return { ...(await reg.json()), token: sess.access_token };
}

test('F17: partner data survives restart', async () => {
  const db = makeD1();
  try {
    const { api } = await f17Isolate(db);
    const u = await registerLogin(api, 'f17-p@luno-test.local');
    const org = await (await api('partner/organizations', 'POST', { name: 'Acme', country: 'KR' }, u.token)).json();
    const acc = await (await api(`partner/organizations/${org.id}/accounts`, 'POST', { name: 'Acme Care' }, u.token)).json();
    assert.equal((await api(`partner/accounts/${acc.id}/tickets`, 'POST', { contact_id: 'c1', priority: 'urgent', internal_note: 'vip angry' }, u.token)).status, 201);
    assert.equal((await api(`partner/accounts/${acc.id}/campaigns`, 'POST', { name: 'Sale', message_template: { text: 'hi' } }, u.token)).status, 201);
    assert.equal((await api(`partner/accounts/${acc.id}/coupons`, 'POST', { code: 'SAVE10', max_redemptions: 5 }, u.token)).status, 201);
    assert.equal((await api(`partner/accounts/${acc.id}/rich-menus`, 'POST', { title: 'Menu', layout: 'grid_1x3', tiles: [{ id: 't1', label: 'A', icon: 'x', action: { type: 'message', text: 'a' } }] }, u.token)).status, 201);
    const rule = await (await api(`partner/accounts/${acc.id}/bot-rules`, 'POST', { keywords: ['hello'], reply: 'hi there' }, u.token)).json();
    // Cold isolate: every console read comes back from D1.
    const cold = await f17Isolate(db);
    const s = await (await cold.api('auth/login', 'POST', { email: 'f17-p@luno-test.local', password: PW })).json();
    const t = s.access_token;
    assert.ok(((await (await cold.api('partner/organizations', 'GET', null, t)).json()).organizations).some((o) => o.id === org.id), 'org cold');
    assert.ok(((await (await cold.api(`partner/organizations/${org.id}/accounts`, 'GET', null, t)).json()).accounts).some((a) => a.id === acc.id), 'account cold');
    const tickets = (await (await cold.api(`partner/accounts/${acc.id}/tickets`, 'GET', null, t)).json()).tickets;
    assert.equal(tickets[0].internal_note, 'vip angry', 'ticket cold');
    assert.equal(tickets[0].priority, 'urgent');
    const camps = (await (await cold.api(`partner/accounts/${acc.id}/campaigns`, 'GET', null, t)).json()).campaigns;
    assert.equal(camps[0].name, 'Sale', 'campaign cold');
    const coupons = (await (await cold.api(`partner/accounts/${acc.id}/coupons`, 'GET', null, t)).json()).coupons;
    assert.equal(coupons[0].code, 'SAVE10', 'coupon cold');
    assert.equal((await (await cold.api(`partner/accounts/${acc.id}/rich-menus`, 'GET', null, t)).json()).rich_menu.title, 'Menu', 'menu cold');
    assert.ok(((await (await cold.api(`partner/accounts/${acc.id}/bot-rules`, 'GET', null, t)).json()).rules).some((r) => r.id === rule.rule.id), 'rule cold');
    assert.equal((await cold.api(`partner/accounts/${acc.id}/bot-rules/${rule.rule.id}`, 'DELETE', null, t)).status, 200);
    assert.equal(((await (await cold.api(`partner/accounts/${acc.id}/bot-rules`, 'GET', null, t)).json()).rules).length, 0, 'rule deleted');
  } finally { db.raw.close(); }
});

test('F17: partner ownership holds on cold isolates', async () => {
  const db = makeD1();
  try {
    const { api } = await f17Isolate(db);
    const owner = await registerLogin(api, 'f17-own@luno-test.local');
    const other = await registerLogin(api, 'f17-out@luno-test.local');
    const org = await (await api('partner/organizations', 'POST', { name: 'Mine' }, owner.token)).json();
    const accs = await (await api(`partner/organizations/${org.id}/accounts`, 'GET', null, owner.token)).json();
    const aid = accs.accounts[0].id;
    assert.equal((await api(`partner/organizations/${org.id}/accounts`, 'GET', null, other.token)).status, 403, 'org accounts owner-only');
    const cold = await f17Isolate(db);
    const s = await (await cold.api('auth/login', 'POST', { email: 'f17-out@luno-test.local', password: PW })).json();
    assert.equal((await cold.api(`partner/accounts/${aid}/tickets`, 'GET', null, s.access_token)).status, 403, 'tickets owner-only cold');
    assert.equal((await cold.api(`partner/accounts/${aid}/rich-menus`, 'GET', null, s.access_token)).status, 403, 'menu owner-only cold');
    assert.equal((await cold.api(`partner/accounts/${aid}/bot-rules`, 'POST', { keywords: ['x'], reply: 'y' }, s.access_token)).status, 403, 'rules owner-only cold');
  } finally { db.raw.close(); }
});

test('F17: dev orgs, apps, webhooks and miniapps persist', async () => {
  const db = makeD1();
  try {
    const { api } = await f17Isolate(db);
    const u = await registerLogin(api, 'f17-d@luno-test.local');
    const o = await (await api('developer/organizations', 'POST', { name: 'Bots Inc' }, u.token)).json();
    const app = await (await api(`developer/organizations/${o.id}/apps`, 'POST', { name: 'Greeter' }, u.token)).json();
    assert.ok(app.client_secret_once && app.client_secret_once.length > 10, 'secret shown once');
    assert.equal(app.client_secret_hash, undefined, 'hash never leaves');
    const hook = await (await api(`developer/apps/${app.id}/webhooks`, 'POST', { endpoint_url: 'https://example.invalid/hook' }, u.token)).json();
    assert.ok(hook.signing_secret_once, 'signing secret once');
    assert.equal((await api(`developer/apps/${app.id}/webhooks`, 'POST', { endpoint_url: 'http://example.invalid/hook' }, u.token)).status, 400, 'https only');
    assert.equal((await api(`developer/apps/${app.id}/webhooks`, 'POST', { endpoint_url: 'https://127.0.0.1/hook' }, u.token)).status, 400, 'internal blocked');
    assert.equal((await api(`developer/apps/${app.id}/miniapps`, 'POST', { origin: 'https://mini.example.invalid', manifest: { name: 'Mini', version: '1.0.0' } }, u.token)).status, 201);
    // Legacy owner-scoped apps ride the same table.
    const legacy = await (await api('developer/apps', 'POST', { name: 'Legacy' }, u.token)).json();
    assert.ok(legacy.client_secret, 'legacy secret once');
    const cold = await f17Isolate(db);
    const s = await (await cold.api('auth/login', 'POST', { email: 'f17-d@luno-test.local', password: PW })).json();
    const t = s.access_token;
    assert.ok(((await (await cold.api('developer/organizations', 'GET', null, t)).json()).organizations).some((x) => x.id === o.id), 'org cold');
    const apps = (await (await cold.api(`developer/organizations/${o.id}/apps`, 'GET', null, t)).json()).apps;
    assert.equal(apps.length, 1, 'org app cold');
    assert.equal(apps[0].client_secret_hash, undefined, 'list hides secrets');
    assert.ok(((await (await cold.api('developer/apps', 'GET', null, t)).json()).apps).some((x) => x.id === legacy.id), 'legacy cold');
    assert.equal(((await (await cold.api(`developer/apps/${app.id}/miniapps`, 'GET', null, t)).json()).miniapps).length, 1, 'miniapp cold');
  } finally { db.raw.close(); }
});

test('F17: webhook test keeps the pinned 503s and fails closed', async () => {
  const db = makeD1();
  try {
    const { api } = await f17Isolate(db);
    const u = await registerLogin(api, 'f17-w@luno-test.local');
    const unk = await api('developer/apps/nope/webhooks/test', 'POST', {}, u.token);
    assert.equal(unk.status, 503, 'unknown app stays 503');
    const ub = await unk.json();
    assert.equal(ub.code, 'WEBHOOK_DELIVERY_NOT_CONFIGURED');
    assert.equal(ub.delivered, undefined, 'no delivered field on 503');
    const o = await (await api('developer/organizations', 'POST', { name: 'W' }, u.token)).json();
    const app = await (await api(`developer/organizations/${o.id}/apps`, 'POST', { name: 'WApp' }, u.token)).json();
    assert.equal((await api(`developer/apps/${app.id}/webhooks/test`, 'POST', {}, u.token)).status, 503, 'unconfigured stays 503');
    await api(`developer/apps/${app.id}/webhooks`, 'POST', { endpoint_url: 'https://example.invalid/hook' }, u.token);
    const res = await api(`developer/apps/${app.id}/webhooks/test`, 'POST', {}, u.token);
    // .invalid never resolves: the attempt must fail closed, never hang.
    assert.equal(res.status, 503, 'undeliverable fails closed');
    const body = await res.json();
    assert.equal(body.code, 'WEBHOOK_DELIVERY_FAILED');
    assert.equal(body.delivered, undefined, 'no delivered field on failure');
  } finally { db.raw.close(); }
});

test('F17: creator and ads data survives restart', async () => {
  const db = makeD1();
  try {
    const { api } = await f17Isolate(db);
    const c = await registerLogin(api, 'f17-c@luno-test.local');
    assert.equal((await api('creator/profile', 'POST', { display_name: 'Sticker Star' }, c.token)).status, 200);
    const pack = await (await api('creator/packs', 'POST', { title: 'Cute', price_minor: 0 }, c.token)).json();
    assert.equal((await api(`creator/packs/${pack.id}/stickers`, 'POST', { object_key: 's/1.png', kind: 'static', ordinal: 1 }, c.token)).status, 201);
    const a = await registerLogin(api, 'f17-a@luno-test.local');
    const adv = await (await api('ads/advertisers', 'POST', { organization_id: 'org-1', name: 'Acme Ads' }, a.token)).json();
    const camp = await (await api('ads/campaigns', 'POST', { name: 'Launch', daily_budget_minor: 5000 }, a.token)).json();
    assert.equal((await api(`ads/campaigns/${camp.id}/groups`, 'POST', { name: 'KR-20s', targeting: { geo: 'KR' }, bid_minor: 100 }, a.token)).status, 201);
    const cold = await f17Isolate(db);
    const sc = await (await cold.api('auth/login', 'POST', { email: 'f17-c@luno-test.local', password: PW })).json();
    const sa = await (await cold.api('auth/login', 'POST', { email: 'f17-a@luno-test.local', password: PW })).json();
    assert.equal((await (await cold.api('creator/profile', 'GET', null, sc.access_token)).json()).display_name, 'Sticker Star', 'profile cold');
    assert.equal(((await (await cold.api(`creator/packs/${pack.id}/stickers`, 'GET', null, sc.access_token)).json()).stickers).length, 1, 'sticker cold');
    assert.ok(((await (await cold.api('ads/advertisers', 'GET', null, sa.access_token)).json()).advertisers).some((x) => x.id === adv.id), 'advertiser cold');
    assert.equal(((await (await cold.api(`ads/campaigns/${camp.id}/groups`, 'GET', null, sa.access_token)).json()).groups).length, 1, 'group cold');
  } finally { db.raw.close(); }
});

test('F17: memory mode keeps working, webhooks stay 503', async () => {
  const mod = await import(`./cf_worker.js?f17mem=${++f17Serial}`);
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), {});
  const reg = await api('auth/register', 'POST', { email: 'f17-m@luno-test.local', password: PW, display_name: 'm' });
  assert.equal(reg.status, 201);
  const s = await (await api('auth/login', 'POST', { email: 'f17-m@luno-test.local', password: PW })).json();
  const t = s.access_token;
  const org = await (await api('partner/organizations', 'POST', { name: 'Mem' }, t)).json();
  assert.ok(((await (await api('partner/organizations', 'GET', null, t)).json()).organizations).some((o) => o.id === org.id), 'orgs in memory');
  const app = await (await api('developer/apps', 'POST', { name: 'MemApp' }, t)).json();
  assert.equal((await api(`developer/apps/${app.id}/webhooks`, 'POST', { endpoint_url: 'https://example.invalid/hook' }, t)).status, 503, 'webhooks need durable storage');
});

test('F17: webhook delivery signs with HMAC and the consoles match the routes', async () => {
  const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  assert.ok(source.includes("headers: { 'Content-Type': 'application/json', 'X-Luno-Event': 'luno.webhook_test', 'X-Luno-Signature': signature }"), 'signed test delivery');
  assert.ok(source.includes('sha256=') && source.includes('hmacSha256Hex'), 'HMAC-SHA256 signature');
  for (const [console, paths] of [
    ['partner', ['partner/organizations', 'organizations/${id}/accounts', 'accounts/${selectedAccount.value}/tickets', 'accounts/${selectedAccount.value}/campaigns', 'accounts/${selectedAccount.value}/coupons', 'accounts/${selectedAccount.value}/rich-menus', 'accounts/${selectedAccount.value}/bot-rules']],
    ['developer', ['developer/organizations', 'organizations/${id}/apps', 'apps/${selectedAppID.value}/webhooks', 'apps/${selectedAppID.value}/miniapps']],
    ['creator', ['creator/profile', 'creator/packs', 'packs/${selectedPackID.value}/stickers']],
    ['ads', ['ads/advertisers', 'ads/campaigns', 'campaigns/${selectedCamp.value}/groups']],
  ]) {
    const view = await readFile(new URL(`../apps/${console}-console/src/App.vue`, import.meta.url), 'utf8');
    for (const p of paths) assert.ok(view.includes(p), `${console} calls ${p}`);
  }
});
