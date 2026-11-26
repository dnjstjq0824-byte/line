// QA Acceptance Suite for Multilingual Landing Geo-IP Routing, Deep-Link
// Isolation, .well-known App Verification, SEO & Subdomain Architecture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, F24_CONSENT } from './test_helpers.mjs';
import {
  buildPrefLangCookie,
  readPrefLangFromCookie,
  classifyHost,
  rootDomainForCookie,
} from '../apps/shared/locale.config.ts';

let serial = 0;
async function loadWorker() {
  return import(`./cf_worker.js?edgeroute=${++serial}`);
}

const PROD_HOSTS = 'lunotalk.com,www.lunotalk.com,web.lunotalk.com,api.lunotalk.com,ws.lunotalk.com,cdn.lunotalk.com';
const PROD_ORIGINS = 'https://lunotalk.com,https://www.lunotalk.com,https://web.lunotalk.com,https://api.lunotalk.com';

// QA #1 & #2: Geo-IP root & subpath redirects (KR -> ko, JP -> ja, TW/HK -> zh-tw, US/unknown -> en)
test('QA #1/#2: Geo-IP redirects bare root and unprefixed pages while preserving subpath & query', async () => {
  const mod = await loadWorker();
  const env = { STANDALONE_HOSTS: PROD_HOSTS };
  const get = (path, headers = {}) =>
    mod.default.fetch(new Request(`https://lunotalk.com${path}`, { headers }), env);

  const kr = await get('/', { 'CF-IPCountry': 'KR' });
  assert.equal(kr.status, 302);
  assert.equal(kr.headers.get('location'), '/ko');
  assert.equal(kr.headers.get('cache-control'), 'no-store');
  assert.match(kr.headers.get('vary') || '', /Cookie/);

  const jp = await get('/', { 'CF-IPCountry': 'JP' });
  assert.equal(jp.status, 302);
  assert.equal(jp.headers.get('location'), '/ja');

  const tw = await get('/', { 'CF-IPCountry': 'TW' });
  assert.equal(tw.status, 302);
  assert.equal(tw.headers.get('location'), '/zh-tw');

  const hk = await get('/', { 'CF-IPCountry': 'HK' });
  assert.equal(hk.status, 302);
  assert.equal(hk.headers.get('location'), '/zh-tw');

  const us = await get('/', { 'CF-IPCountry': 'US' });
  assert.equal(us.status, 302);
  assert.equal(us.headers.get('location'), '/en');

  // Unknown country (XX / T1) falls back to Accept-Language, then en.
  const xx = await get('/', { 'CF-IPCountry': 'XX', 'Accept-Language': 'ja-JP,ja;q=0.9' });
  assert.equal(xx.status, 302);
  assert.equal(xx.headers.get('location'), '/ja');

  const t1 = await get('/', { 'CF-IPCountry': 'T1', 'Accept-Language': 'zz-ZZ' });
  assert.equal(t1.status, 302);
  assert.equal(t1.headers.get('location'), '/en');

  // Unprefixed store/legal page preserves subpath & query string.
  const krPrivacy = await get('/privacy?src=play', { 'CF-IPCountry': 'KR' });
  assert.equal(krPrivacy.status, 302);
  assert.equal(krPrivacy.headers.get('location'), '/ko/privacy?src=play');

  // Local dev MOCK_GEO_COUNTRY works on localhost.
  const localKr = await mod.default.fetch(
    new Request('http://localhost:8787/privacy'),
    { MOCK_GEO_COUNTRY: 'KR' },
  );
  assert.equal(localKr.status, 302);
  assert.equal(localKr.headers.get('location'), '/ko/privacy');

  // www.{domain} consolidates via 301 to apex.
  const www = await mod.default.fetch(new Request('https://www.lunotalk.com/en/privacy?x=1'), env);
  assert.equal(www.status, 301);
  assert.equal(www.headers.get('location'), 'https://lunotalk.com/en/privacy?x=1');
});

// QA #3: Explicit /{lang} URL respected (KR IP on /en/privacy stays 200 OK English) + uppercase 301 normalization
test('QA #3: explicit /{lang} URLs are respected regardless of IP/cookie; uppercase normalizes 301', async () => {
  const mod = await loadWorker();
  const env = { STANDALONE_HOSTS: PROD_HOSTS };

  const enPrivacy = await mod.default.fetch(
    new Request('https://lunotalk.com/en/privacy', {
      headers: { 'CF-IPCountry': 'KR', Cookie: 'pref_lang=ko' },
    }),
    env,
  );
  assert.equal(enPrivacy.status, 200);
  const html = await enPrivacy.text();
  assert.match(html, /<html lang="en">/);
  assert.match(html, /rel="canonical" href="https:\/\/lunotalk\.com\/en\/privacy"/);
  assert.match(html, /hreflang="x-default" href="https:\/\/lunotalk\.com\/en\/privacy"/);
  assert.match(html, /hreflang="ko" href="https:\/\/lunotalk\.com\/ko\/privacy"/);
  assert.match(html, /Privacy Policy/);

  // Store-required fixed URLs return 200 OK for US reviewer IP.
  for (const path of ['/en/privacy', '/ko/privacy', '/en/terms', '/ko/terms', '/en/support', '/ko/support', '/en/account-deletion', '/ko/account-deletion']) {
    const r = await mod.default.fetch(
      new Request(`https://lunotalk.com${path}`, { headers: { 'CF-IPCountry': 'US' } }),
      env,
    );
    assert.equal(r.status, 200, `${path} must return 200 OK`);
  }

  // Uppercase language prefix normalizes to lowercase via 301.
  const upper = await mod.default.fetch(
    new Request('https://lunotalk.com/KO/privacy?ref=1', { headers: { 'CF-IPCountry': 'US' } }),
    env,
  );
  assert.equal(upper.status, 301);
  assert.equal(upper.headers.get('location'), '/ko/privacy?ref=1');
});

// QA #4: .well-known zero-redirect 200 OK JSON (AASA + assetlinks)
test('QA #4: .well-known files return direct 200 OK JSON with zero redirects', async () => {
  const mod = await loadWorker();
  const env = { STANDALONE_HOSTS: PROD_HOSTS, APPLE_TEAM_ID: 'ABC1234567' };

  const aasa = await mod.default.fetch(
    new Request('https://lunotalk.com/.well-known/apple-app-site-association', {
      headers: { 'CF-IPCountry': 'KR' },
    }),
    env,
  );
  assert.equal(aasa.status, 200);
  assert.match(aasa.headers.get('content-type') || '', /application\/json/);
  assert.equal(aasa.headers.get('cache-control'), 'public, max-age=3600');
  const aasaBody = await aasa.json();
  assert.deepEqual(aasaBody.applinks.details[0].appIDs, ['ABC1234567.com.lunotalk.messenger']);
  const comps = aasaBody.applinks.details[0].components;
  assert.ok(comps.some((c) => c['/'] === '/invite/*' && !c.exclude));
  assert.ok(comps.some((c) => c['/'] === '/@*' && !c.exclude));
  assert.ok(comps.some((c) => c['/'] === '/ko/*' && c.exclude === true));
  assert.ok(comps.some((c) => c['/'] === '/en/*' && c.exclude === true));
  assert.ok(comps.some((c) => c['/'] === '/ja/*' && c.exclude === true));
  assert.ok(comps.some((c) => c['/'] === '/zh-tw/*' && c.exclude === true));

  const assetlinks = await mod.default.fetch(
    new Request('https://lunotalk.com/.well-known/assetlinks.json', {
      headers: { 'CF-IPCountry': 'KR' },
    }),
    env,
  );
  assert.equal(assetlinks.status, 200);
  assert.match(assetlinks.headers.get('content-type') || '', /application\/json/);
  assert.equal(assetlinks.headers.get('cache-control'), 'public, max-age=3600');
  const [entry] = await assetlinks.json();
  assert.equal(entry.target.package_name, 'com.lunotalk.messenger');
  assert.ok(entry.target.sha256_cert_fingerprints.length >= 1);
});

// QA #5 & #6: Deep-link isolation (/invite/*, /@*), dynamic OG, X-Robots-Tag: noindex, nofollow
test('QA #5/#6: deep links never redirect to /{lang}, emit X-Robots-Tag noindex and dynamic OG', async () => {
  const db = makeD1();
  try {
    const mod = await loadWorker();
    const env = { DB: db, STANDALONE_HOSTS: PROD_HOSTS, DURABLE_CONVERSATIONS: 'true' };

    // Create two users & a group invite in D1 to verify dynamic SSR metadata.
    const reg = await mod.default.fetch(new Request('https://localhost/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...F24_CONSENT, email: 'qa-invite@luno-test.local', password: 'Str0ng!Passw0rd', display_name: 'Mina Park', handle: 'mina_park' }),
    }), env);
    assert.equal(reg.status, 201);
    const reg2 = await mod.default.fetch(new Request('https://localhost/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...F24_CONSENT, email: 'qa-invite2@luno-test.local', password: 'Str0ng!Passw0rd', display_name: 'Joon Kim', handle: 'joon_kim' }),
    }), env);
    assert.equal(reg2.status, 201);
    const u2 = await reg2.json();
    const login = await (await mod.default.fetch(new Request('https://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'qa-invite@luno-test.local', password: 'Str0ng!Passw0rd' }),
    }), env)).json();
    const groupRes = await mod.default.fetch(new Request('https://localhost/api/v1/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.access_token}` },
      body: JSON.stringify({ kind: 'group', title: 'Seoul Design Team', member_ids: [u2.user_id || u2.id] }),
    }), env);
    assert.equal(groupRes.status, 201);
    const group = await groupRes.json();
    const invRes = await mod.default.fetch(new Request(`https://localhost/api/v1/conversations/${group.id}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.access_token}` },
      body: JSON.stringify({ expires_in_hours: 24 }),
    }), env);
    assert.equal(invRes.status, 201);
    const inv = await invRes.json();
    assert.ok(inv.token, 'invite token issued');

    // Korean IP requesting /invite/<code>: stays 200 OK at original URL (NEVER /ko/invite/...).
    const inviteRes = await mod.default.fetch(
      new Request(`https://lunotalk.com/invite/${inv.token}`, {
        headers: { 'CF-IPCountry': 'KR', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0)' },
      }),
      env,
    );
    assert.equal(inviteRes.status, 200);
    assert.equal(inviteRes.headers.get('location'), null);
    assert.equal(inviteRes.headers.get('x-robots-tag'), 'noindex, nofollow');
    const inviteHtml = await inviteRes.text();
    assert.match(inviteHtml, /<meta name="robots" content="noindex, nofollow"/);
    assert.match(inviteHtml, /property="og:title" content="Seoul Design Team"/);
    assert.match(inviteHtml, /https:\/\/web\.lunotalk\.com\/invite\//);
    assert.match(inviteHtml, /LUNO 대화방 초대/);

    // Arbitrary invite code (unmatched) still returns safe SSR fallback with noindex.
    const genericInv = await mod.default.fetch(
      new Request('https://lunotalk.com/invite/TEST123', {
        headers: { 'CF-IPCountry': 'KR', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' },
      }),
      env,
    );
    assert.equal(genericInv.status, 200);
    assert.equal(genericInv.headers.get('x-robots-tag'), 'noindex, nofollow');
    const genHtml = await genericInv.text();
    assert.match(genHtml, /data-platform="ios"/);
    assert.match(genHtml, /TEST123/);

    // Profile deep link /@mina_park stays 200 OK with dynamic display name OG.
    const profRes = await mod.default.fetch(
      new Request('https://lunotalk.com/@mina_park', {
        headers: { 'CF-IPCountry': 'JP', 'Accept-Language': 'ja' },
      }),
      env,
    );
    assert.equal(profRes.status, 200);
    assert.equal(profRes.headers.get('x-robots-tag'), 'noindex, nofollow');
    const profHtml = await profRes.text();
    assert.match(profHtml, /property="og:title" content="Mina Park"/);
    assert.match(profHtml, /LUNO プロフィール/);
  } finally {
    db.raw.close();
  }
});

// QA #7: Landing <-> Web App language sync via Domain=.{domain} pref_lang cookie
test('QA #7: pref_lang cookie shares across apex and web subdomain and overrides Geo-IP', async () => {
  const cookie = buildPrefLangCookie('en', 'lunotalk.com', true);
  assert.equal(cookie, 'pref_lang=en; Domain=.lunotalk.com; Path=/; Max-Age=31536000; SameSite=Lax; Secure');
  assert.equal(rootDomainForCookie('web.lunotalk.com'), '.lunotalk.com');
  assert.equal(rootDomainForCookie('localhost'), '');
  assert.equal(readPrefLangFromCookie('foo=1; pref_lang=ja; luno_lang=ko'), 'ja');
  assert.deepEqual(classifyHost('web.lunotalk.com'), { role: 'web', apexDomain: 'lunotalk.com' });

  const mod = await loadWorker();
  const res = await mod.default.fetch(
    new Request('https://lunotalk.com/', {
      headers: { 'CF-IPCountry': 'KR', Cookie: 'pref_lang=en' },
    }),
    { STANDALONE_HOSTS: PROD_HOSTS },
  );
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/en');
});

// QA #8: Subdomain security, CORS with credentials, robots.txt, and ws.{domain}/v1/connect ticket auth
test('QA #8: web -> api CORS + credentials, ws.{domain}/v1/connect ticket auth, and robots.txt rules', async () => {
  const db = makeD1();
  try {
    const mod = await loadWorker();
    const env = { DB: db, STANDALONE_HOSTS: PROD_HOSTS, ALLOWED_ORIGINS: PROD_ORIGINS };

    // web.lunotalk.com -> api.lunotalk.com/v1/version passes strict CORS with credentials.
    const apiRes = await mod.default.fetch(
      new Request('https://api.lunotalk.com/v1/version', {
        headers: { Origin: 'https://web.lunotalk.com', 'Accept-Language': 'ko-KR,ko;q=0.9' },
      }),
      env,
    );
    assert.equal(apiRes.status, 200);
    assert.equal(apiRes.headers.get('access-control-allow-origin'), 'https://web.lunotalk.com');
    assert.equal(apiRes.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(apiRes.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(apiRes.headers.get('content-language'), 'ko');

    // Untrusted origin gets no ACAO header (never '*').
    const evilRes = await mod.default.fetch(
      new Request('https://api.lunotalk.com/v1/version', {
        headers: { Origin: 'https://evil.example' },
      }),
      env,
    );
    assert.equal(evilRes.headers.get('access-control-allow-origin'), null);

    // Register + login + mint ws-ticket on api.lunotalk.com/v1/* (refresh cookie has Domain=.lunotalk.com).
    const reg = await mod.default.fetch(new Request('https://api.lunotalk.com/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://web.lunotalk.com' },
      body: JSON.stringify({ ...F24_CONSENT, email: 'qa-sub@luno-test.local', password: 'Str0ng!Passw0rd', display_name: 'Sub User' }),
    }), env);
    assert.equal(reg.status, 201);
    const loginRes = await mod.default.fetch(new Request('https://api.lunotalk.com/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://web.lunotalk.com' },
      body: JSON.stringify({ email: 'qa-sub@luno-test.local', password: 'Str0ng!Passw0rd' }),
    }), env);
    assert.equal(loginRes.status, 200);
    assert.match(loginRes.headers.get('set-cookie') || '', /Domain=\.lunotalk\.com/);
    const login = await loginRes.json();

    const tickRes = await mod.default.fetch(new Request('https://api.lunotalk.com/v1/ws-ticket', {
      method: 'POST',
      headers: { Authorization: `Bearer ${login.access_token}`, Origin: 'https://web.lunotalk.com' },
    }), env);
    assert.equal(tickRes.status, 200);
    const { ticket } = await tickRes.json();
    assert.ok(ticket && ticket.startsWith('wst-'));

    // ws.lunotalk.com/v1/connect rejects non-upgrade (426) and bad ticket (401).
    const noUpg = await mod.default.fetch(new Request(`https://ws.lunotalk.com/v1/connect?ticket=${ticket}`), env);
    assert.equal(noUpg.status, 426);
    const badTick = await mod.default.fetch(
      new Request('https://ws.lunotalk.com/v1/connect?ticket=bad-ticket', { headers: { Upgrade: 'websocket' } }),
      env,
    );
    assert.equal(badTick.status, 401);

    // web.lunotalk.com root does NOT Geo-IP redirect to /ko (SPA stays at / with noindex).
    const assetsEnv = {
      ...env,
      ASSETS: { fetch: async () => new Response('<html>spa</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }) },
    };
    const webRoot = await mod.default.fetch(
      new Request('https://web.lunotalk.com/', { headers: { 'CF-IPCountry': 'KR' } }),
      assetsEnv,
    );
    assert.equal(webRoot.status, 200);
    assert.equal(webRoot.headers.get('x-robots-tag'), 'noindex, nofollow');

    // robots.txt allows localized landings and disallows /invite/ & /join/; web subdomain disallows all.
    const robots = await (await mod.default.fetch(new Request('https://lunotalk.com/robots.txt'), env)).text();
    assert.match(robots, /Allow: \/ko\//);
    assert.match(robots, /Allow: \/en\//);
    assert.match(robots, /Allow: \/ja\//);
    assert.match(robots, /Allow: \/zh-tw\//);
    assert.match(robots, /Disallow: \/invite\//);
    assert.match(robots, /Disallow: \/join\//);
    assert.match(robots, /Sitemap: https:\/\/lunotalk\.com\/sitemap\.xml/);

    const webRobots = await (await mod.default.fetch(new Request('https://web.lunotalk.com/robots.txt'), env)).text();
    assert.match(webRobots, /Disallow: \/\n/);

    // sitemap.xml & llms.txt return 200 OK.
    const sitemap = await mod.default.fetch(new Request('https://lunotalk.com/sitemap.xml'), env);
    assert.equal(sitemap.status, 200);
    assert.match(await sitemap.text(), /https:\/\/lunotalk\.com\/en\/account-deletion/);
    const llms = await mod.default.fetch(new Request('https://lunotalk.com/llms.txt'), env);
    assert.equal(llms.status, 200);
  } finally {
    db.raw.close();
  }
});
