// A8 (F27): one public base address. The worker derives CORS, standalone
// hosts and absolute self-links from env PUBLIC_BASE_URL (default: the
// current production host, kept in exactly one constant); static SEO files
// carry a token the build stamps; the app has no server address outside
// its API_URL default.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { F24_CONSENT } from './test_helpers.mjs';

const require = createRequire(import.meta.url);
const HOST = 'luno-messenger.dnjstjqppk.workers.dev';
const BASE = `https://${HOST}`;
const TOKEN = '__LUNO_PUBLIC_BASE__';

let f27Serial = 0;
async function f27Fetch(host, path, { method = 'GET', body = null, token = null, origin = null, env = {} } = {}) {
  const mod = await import(`./cf_worker.js?f27=${++f27Serial}`);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  return mod.default.fetch(new Request(`https://${host}/api/v1/${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  }), env);
}

async function registerLogin(email, env = {}) {
  const mod = await import(`./cf_worker.js?f27=${++f27Serial}`);
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  assert.equal((await api('auth/register', 'POST', { ...F24_CONSENT, email, password: 'Str0ng!Passw0rd', display_name: email.split('@')[0] })).status, 201);
  const s = await api('auth/login', 'POST', { email, password: 'Str0ng!Passw0rd' });
  assert.equal(s.status, 200);
  const sess = await s.json();
  return { api, token: sess.access_token, userId: sess.user_id };
}

test('F27: the production host lives in exactly one worker constant', () => {
  const src = readFileSync(new URL('./cf_worker.js', import.meta.url), 'utf8');
  assert.equal((src.match(/luno-messenger\.dnjstjqppk\.workers\.dev/g) || []).length, 1);
  assert.ok(src.includes(`const DEFAULT_PUBLIC_BASE_URL = '${BASE}'`));
  assert.ok(src.includes('PUBLIC_BASE_URL'), 'env override read');
});

test('F27: CORS allows the base origin without an explicit list', async () => {
  const dflt = await f27Fetch('localhost', 'version', { origin: BASE, env: {} });
  assert.equal(dflt.headers.get('Access-Control-Allow-Origin'), BASE);
  const evil = await f27Fetch('localhost', 'version', { origin: 'https://evil.test', env: {} });
  assert.equal(evil.headers.get('Access-Control-Allow-Origin'), null);
  const over = await f27Fetch('localhost', 'version', { origin: 'https://example.com', env: { PUBLIC_BASE_URL: 'https://example.com' } });
  assert.equal(over.headers.get('Access-Control-Allow-Origin'), 'https://example.com');
  const stale = await f27Fetch('localhost', 'version', { origin: BASE, env: { PUBLIC_BASE_URL: 'https://example.com' } });
  assert.equal(stale.headers.get('Access-Control-Allow-Origin'), null, 'override moves the trust');
});

test('F27: standalone hosts stay explicit opt-in, base or not', async () => {
  // The hostname gate fails closed: even the configured base never opens a
  // host by itself (cf_worker.test.mjs pins the same contract).
  assert.equal((await f27Fetch(HOST, 'version', { env: {} })).status, 503);
  assert.equal((await f27Fetch('example.com', 'version', { env: { PUBLIC_BASE_URL: 'https://example.com' } })).status, 503);
  assert.equal((await f27Fetch(HOST, 'version', { env: { STANDALONE_HOSTS: HOST } })).status, 200, 'naming still opens');
});

test('F27: seeds link the configured base', async () => {
  const d = await registerLogin('f27-seed@luno-test.local');
  const convs = await (await d.api('conversations', 'GET', null, d.token)).json();
  const keep = convs.conversations.find((c) => c.id === `conv-keep-${d.userId}`);
  assert.ok(keep, 'keep room seeded');
  const msgs = await (await d.api(`conversations/${keep.id}/messages?limit=10`, 'GET', null, d.token)).json();
  assert.ok(msgs.messages.some((m) => String(m.body).startsWith(`${BASE}/`)), 'keep seed uses the default base');

  const o = await registerLogin('f27-oseed@luno-test.local', { PUBLIC_BASE_URL: 'https://example.com' });
  const oconvs = await (await o.api('conversations', 'GET', null, o.token)).json();
  const okeep = oconvs.conversations.find((c) => c.id === `conv-keep-${o.userId}`);
  const omsgs = await (await o.api(`conversations/${okeep.id}/messages?limit=10`, 'GET', null, o.token)).json();
  assert.ok(omsgs.messages.some((m) => String(m.body).startsWith('https://example.com/')), 'keep seed follows the override');
  assert.ok(!JSON.stringify(omsgs.messages).includes(HOST), 'no default leak under override');
});

test('F27: partner richmenu default links the configured base', async () => {
  for (const [email, env, want] of [
    ['f27-rich@luno-test.local', {}, BASE],
    ['f27-orich@luno-test.local', { PUBLIC_BASE_URL: 'https://example.com' }, 'https://example.com'],
  ]) {
    const db = (await import('./test_helpers.mjs')).makeD1();
    try {
      const mod = await import(`./cf_worker.js?f27=${++f27Serial}`);
      const api = (path, method = 'GET', body = null, token = null) =>
        mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
          method,
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: body === null ? undefined : JSON.stringify(body),
        }), { DB: db, DURABLE_BUSINESS: 'true', ...env });
      assert.equal((await api('auth/register', 'POST', { ...F24_CONSENT, email, password: 'Str0ng!Passw0rd', display_name: 'rich' })).status, 201);
      const s = await (await api('auth/login', 'POST', { email, password: 'Str0ng!Passw0rd' })).json();
      const org = await (await api('partner/organizations', 'POST', { name: 'Acme', country: 'KR' }, s.access_token)).json();
      const acc = await (await api(`partner/organizations/${org.id}/accounts`, 'POST', { name: 'Care' }, s.access_token)).json();
      const menu = await (await api(`partner/accounts/${acc.id}/rich-menus`, 'GET', null, s.access_token)).json();
      assert.ok(JSON.stringify(menu.rich_menu).includes(want), `default menu links ${want}`);
    } finally { db.raw.close(); }
  }
});

test('F27: static files carry the base token, not the host', () => {
  for (const f of ['../apps/user-web/index.html', '../apps/user-web/public/robots.txt', '../apps/user-web/public/sitemap.xml', '../apps/partner-console/src/App.vue']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!src.includes(HOST), `${f} has no hardcoded host`);
    assert.ok(src.includes(TOKEN), `${f} carries the token`);
  }
  const build = readFileSync(new URL('./build_cf.js', import.meta.url), 'utf8');
  assert.ok(build.includes('public_base_stamp'), 'build stamps the token');
  assert.ok(build.includes('PUBLIC_BASE_URL'), 'build reads the env override');
});

test('F27: the stamp replaces tokens from env or the worker default', () => {
  const { stampPublicBase, defaultBaseFromWorker } = require('./public_base_stamp.cjs');
  assert.equal(defaultBaseFromWorker(fileURLToPath(new URL('./cf_worker.js', import.meta.url))), BASE);
  const dir = mkdtempSync(join(tmpdir(), 'f27-'));
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, 'index.html'), `<link href="${TOKEN}/x">`);
  writeFileSync(join(dir, 'sub', 's.xml'), `<loc>${TOKEN}/</loc><loc>${TOKEN}/y</loc>`);
  writeFileSync(join(dir, 'bin.bin'), Buffer.from([0, 1, 2, 3]));
  const r = stampPublicBase(dir, 'https://example.com/');
  assert.equal(r.base, 'https://example.com');
  assert.equal(r.files, 2);
  assert.equal(r.hits, 3);
  assert.ok(readFileSync(join(dir, 'index.html'), 'utf8').includes('https://example.com/x'));
  assert.ok(!readFileSync(join(dir, 'sub', 's.xml'), 'utf8').includes(TOKEN));
});

test('F27: the app has no server address outside its API_URL default', () => {
  const hits = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.dart')) continue;
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/https?:\/\/[A-Za-z0-9]/);
        if (m) hits.push(`${p}: ${line.trim().slice(0, 100)}`);
      }
    }
  };
  walk(fileURLToPath(new URL('../mobile/flutter_app/lib', import.meta.url)));
  assert.equal(hits.length, 1, `one hardcoded URL allowed, got: ${hits.join(' | ')}`);
  assert.ok(hits[0].includes('legacy_tokens.dart') && hits[0].includes('defaultApiBase'));
  const legacy = readFileSync(new URL('../mobile/flutter_app/lib/legacy_tokens.dart', import.meta.url), 'utf8');
  assert.ok(legacy.includes("String.fromEnvironment('API_URL'"), 'build-time override kept');
});
