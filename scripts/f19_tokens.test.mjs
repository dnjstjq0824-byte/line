// Stage 10 (F19): web tokens — refresh travels as HttpOnly/Secure/
// SameSite cookie (session cookie without "stay signed in"), access lives
// in memory only (legacy localStorage rows purge), cookie refresh rejects
// non-XHR posts (CSRF), and served HTML carries CSP + frame-ancestors +
// Referrer-Policy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { makeD1 , F24_CONSENT } from './test_helpers.mjs';

const require = createRequire(import.meta.url);

let f19Serial = 0;
async function f19Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?f19=${++f19Serial}`);
  const env = { DB: db, ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null, headers = {}) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    }), env);
  return { api };
}

const PW = 'Str0ng!Passw0rd';

async function registerLogin(api, email, extra = {}) {
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
  assert.equal(reg.status, 201);
  const s = await api('auth/login', 'POST', { email, password: PW, ...extra });
  assert.equal(s.status, 200);
  return s;
}

test('F19: login cookie flags + remember-me lifetime', async () => {
  const db = makeD1();
  try {
    const { api } = await f19Isolate(db);
    const s = await registerLogin(api, 'f19-a@luno-test.local');
    const cookie = s.headers.get('set-cookie') || '';
    assert.ok(cookie.startsWith('luno_refresh=cf-refresh-'), 'refresh cookie set');
    // Parse attributes the way a browser would: every pair stands alone.
    const attrs = Object.fromEntries(
      cookie.split(';').slice(1).map((p) => {
        const i = p.indexOf('=');
        return i < 0 ? [p.trim().toLowerCase(), true] : [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim()];
      }));
    assert.ok(attrs.httponly, 'httpOnly');
    assert.ok(attrs.secure, 'secure on https');
    assert.equal(attrs.samesite, 'Strict', 'same-site strict');
    assert.equal(attrs.path, '/', 'root path');
    assert.equal(attrs['max-age'], '2592000', 'persistent by default');
    const s2 = await registerLogin(api, 'f19-b@luno-test.local', { remember: false });
    const c2 = s2.headers.get('set-cookie') || '';
    assert.ok(c2.startsWith('luno_refresh=cf-refresh-'), 'cookie still set');
    assert.ok(!c2.includes('Max-Age'), 'no Max-Age without remember (session cookie)');
  } finally { db.raw.close(); }
});

test('F19: cookie refresh rejects cross-site form posts, body tokens unaffected', async () => {
  const db = makeD1();
  try {
    const { api } = await f19Isolate(db);
    const s = await registerLogin(api, 'f19-c@luno-test.local');
    const cookie = (s.headers.get('set-cookie') || '').split(';')[0];
    const sess = await s.json();
    // Form-encoded post riding the cookie: forged-looking, rejected.
    const forged = await api('auth/refresh', 'POST', 'x=1', null, { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.equal(forged.status, 403, 'cookie + form post refused');
    // JSON post riding the cookie: genuine XHR, rotates.
    const ok = await api('auth/refresh', 'POST', { remember: false }, null, { Cookie: cookie });
    assert.equal(ok.status, 200, 'cookie + JSON rotates');
    assert.ok(!(ok.headers.get('set-cookie') || '').includes('Max-Age'), 'rotation keeps session lifetime');
    // Native body-token path skips the content-type gate entirely.
    const s2 = await registerLogin(api, 'f19-d@luno-test.local');
    const rt = (await s2.json()).refresh_token;
    const native = await api('auth/refresh', 'POST', `{"refresh_token":${JSON.stringify(rt)}}`, null, { 'Content-Type': 'text/plain' });
    assert.equal(native.status, 200, 'body token refresh unaffected');
    assert.ok(sess.refresh_token, 'body token still issued for native clients');
  } finally { db.raw.close(); }
});

test('F19: served HTML carries CSP, frame-ancestors and referrer policy', async () => {
  const db = makeD1();
  try {
    const mod = await import(`./cf_worker.js?f19h=${++f19Serial}`);
    const html = '<!doctype html><html><head><title>t</title></head><body>x</body></html>';
    const env = {
      DB: db,
      ASSETS: { fetch: async () => new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) },
    };
    // '/' itself redirects to the visitor's language page (/ko, /en, ...);
    // the page those land on is what must carry the headers.
    const res = await mod.default.fetch(new Request('https://localhost/ko', { method: 'GET' }), env);
    assert.equal(res.status, 200);
    const csp = res.headers.get('content-security-policy') || '';
    assert.ok(csp.includes("frame-ancestors 'none'"), 'no framing');
    assert.ok(csp.includes("script-src 'self'"), 'scripts from self');
    assert.ok(csp.includes("style-src 'self' 'unsafe-inline'"), 'inline styles allowed');
    assert.ok(csp.includes('connect-src'), 'connect bounded');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.ok((res.headers.get('strict-transport-security') || '').includes('max-age'), 'HSTS kept');
    // API payloads keep the strict policy.
    const { api } = await f19Isolate(db);
    await api('auth/register', 'POST', { ...F24_CONSENT, email: 'f19-e@luno-test.local', password: PW, display_name: 'e' });
    const me = await api('me', 'GET', null, (await (await api('auth/login', 'POST', { email: 'f19-e@luno-test.local', password: PW })).json()).access_token);
    assert.equal(me.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'");
  } finally { db.raw.close(); }
});

test('F19: static assets ship matching headers via _headers', async () => {
  const { headersFileText, HTML_CSP } = require('./security_headers.cjs');
  const text = headersFileText();
  assert.ok(text.startsWith('/*\n'), 'blanket rule covers SPA routes');
  assert.ok(text.includes(`Content-Security-Policy: ${HTML_CSP}`), 'CSP pinned');
  assert.ok(text.includes("frame-ancestors 'none'"), 'no framing');
  assert.ok(text.includes('Referrer-Policy: strict-origin-when-cross-origin'), 'referrer pinned');
  assert.ok(text.includes('X-Frame-Options: DENY'), 'legacy framing block');
  // Worker fallback and _headers must say the same thing.
  const worker = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  assert.ok(worker.includes(HTML_CSP), 'worker HTML CSP identical');
  const build = await readFile(new URL('./build_cf.js', import.meta.url), 'utf8');
  assert.ok(build.includes('writeHeadersFile(distRoot)'), 'build writes _headers');
});

test('F19: every login route sets the refresh cookie', async () => {
  const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  // Password login is covered live above; the other three share the helper.
  assert.ok(source.includes("refreshCookie(pre, request, body.remember === false ? null : 30 * 86400)"), 'passkey sets cookie');
  assert.ok(source.includes("refreshCookie(phoneRefresh, request, body.remember === false ? null : 30 * 86400)"), 'phone sets cookie');
  assert.ok(source.includes("refreshCookie(qrRefresh, request, body.remember === false ? null : 30 * 86400)"), 'qr sets cookie');
});

async function webFiles(dir, out = []) {
  for (const e of await readdir(new URL(dir, import.meta.url), { withFileTypes: true })) {
    const sub = `${dir}${e.name}`;
    if (e.isDirectory()) await webFiles(`${sub}/`, out);
    else if (/\.(ts|vue)$/.test(e.name)) out.push(sub);
  }
  return out;
}

test('F19: no web source persists tokens to storage', async () => {
  const files = [];
  for (const app of ['user-web', 'admin-console', 'partner-console', 'developer-console', 'creator-console', 'ads-console']) {
    await webFiles(`../apps/${app}/src/`, files);
  }
  assert.ok(files.length > 20, `scanned web sources (${files.length})`);
  const offenders = [];
  for (const f of files) {
    const src = await readFile(new URL(f, import.meta.url), 'utf8');
    if (src.includes("setItem('luno.auth_token'") || src.includes('getItem(\'luno.auth_token\'')) {
      offenders.push(f);
    }
  }
  assert.deepEqual(offenders, [], 'token reads/writes must be gone');
  const session = await readFile(new URL('../apps/user-web/src/store/session.ts', import.meta.url), 'utf8');
  assert.ok(session.includes("removeItem(LEGACY_TOKEN_KEY)"), 'legacy rows still purged');
  assert.ok(session.includes('ensureSession'), 'silent-refresh resume exists');
  assert.ok(session.includes('remember: readRemember()'), 'rotation keeps lifetime');
  const router = await readFile(new URL('../apps/user-web/src/router.ts', import.meta.url), 'utf8');
  assert.ok(router.includes('await ensureSession()'), 'guard resumes via cookie');
  const view = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
  assert.ok(view.includes('await ensureSession()'), 'boot resumes via cookie');
  assert.ok(!view.includes('readStoredToken'), 'no stored-token boot');
  const auth = await readFile(new URL('../apps/user-web/src/views/AuthView.vue', import.meta.url), 'utf8');
  assert.ok(auth.includes('remember: autoLoginCheck.value'), 'login tells lifetime');
});
