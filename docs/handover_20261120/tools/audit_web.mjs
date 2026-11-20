// Web stability audit: phone + PC, home -> login -> every messenger pane.
// usage: node audit_web.mjs <baseUrl> <outDir>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('C:/Users/dnjst/Desktop/project/line/package.json');
const { chromium, webkit, devices } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const OUT = process.argv[3] || '.';
fs.mkdirSync(OUT, { recursive: true });
const PW = 'Str0ng!Passw0rd';
const stamp = Date.now().toString(36);

async function api(p, method = 'GET', body, token) {
  const r = await fetch(`${BASE}/api/v1/${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${text.slice(0, 200)}`);
  return json;
}

async function seed() {
  const legal = await api('legal');
  const consent = { terms: legal.terms_version, privacy: legal.privacy_version };
  const mk = async (tag, name) => {
    const email = `audit-${tag}-${stamp}@luno-test.local`;
    const reg = await api('auth/register', 'POST', { email, password: PW, display_name: name, handle: `au${tag}${stamp}`.slice(0, 20), birthdate: '1990-01-01', consent });
    const login = await api('auth/login', 'POST', { email, password: PW });
    return { id: reg.id, email, token: login.access_token, handle: `au${tag}${stamp}`.slice(0, 20) };
  };
  const a = await mk('a', '김루노');
  const b = await mk('b', 'Somchai');
  await api('friends', 'POST', { handle: b.handle }, a.token).catch((e) => console.log('friend add:', e.message));
  await api('friends', 'POST', { handle: a.handle }, b.token).catch(() => {});
  const room = await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token);
  const long = 'https://example.com/' + 'verylongpathwithoutanybreaks'.repeat(6);
  for (const [who, body] of [[b, '안녕하세요! 내일 시간 괜찮아요?'], [a, '좋아요, 3시에 영상통화 해요 😊'], [b, long], [a, '긴 메시지 줄바꿈 확인 '.repeat(12)]]) {
    await api(`conversations/${room.id}/messages`, 'POST', { client_id: `au-${Math.random()}`, kind: 'text', body }, who.token);
  }
  return { a, b, room };
}

const METRICS = () => {
  const vw = window.innerWidth;
  const de = document.documentElement;
  const visible = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const inHScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  const desc = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).trim().split(/\s+/).slice(0, 3).join('.')} [${Math.round(el.getBoundingClientRect().left)}..${Math.round(el.getBoundingClientRect().right)}]`;
  const overflow = [...document.querySelectorAll('body *')].filter((el) => visible(el) && !inHScroller(el)).filter((el) => { const r = el.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; }).slice(0, 8).map(desc);
  const smallInputs = [...document.querySelectorAll('input, textarea, select')].filter((i) => visible(i) && !['checkbox', 'radio', 'file', 'hidden', 'range'].includes(i.type) && parseFloat(getComputedStyle(i).fontSize) < 16).map((i) => `${desc(i)} ${getComputedStyle(i).fontSize}`);
  window.scrollTo(200, 200);
  const moved = { x: window.scrollX, y: window.scrollY };
  window.scrollTo(0, 0);
  return {
    vw, docScrollW: de.scrollWidth, docScrollH: de.scrollHeight, vh: window.innerHeight,
    htmlOverscroll: getComputedStyle(de).overscrollBehaviorY, bodyOverscroll: getComputedStyle(document.body).overscrollBehaviorY,
    viewport: document.querySelector('meta[name=viewport]')?.getAttribute('content') || '',
    pageMoved: moved, overflow, smallInputs, rendered: (document.getElementById('app')?.innerText || '').trim().length > 0,
  };
};

const issues = [];
function check(label, m) {
  const bad = [];
  if (!m.rendered) bad.push('page rendered nothing (blank)');
  if (m.docScrollW > m.vw + 1) bad.push(`document wider than screen (${m.docScrollW} > ${m.vw})`);
  if (m.pageMoved.x !== 0 || m.pageMoved.y !== 0) bad.push(`document scrolls (${m.pageMoved.x},${m.pageMoved.y})`);
  if (m.htmlOverscroll !== undefined && m.htmlOverscroll !== '' && m.htmlOverscroll !== 'none') bad.push(`html overscroll-behavior ${m.htmlOverscroll}`);
  if (m.overflow.length) bad.push(`elements past screen edge: ${m.overflow.join(' | ')}`);
  if (m.smallInputs.length) bad.push(`inputs < 16px: ${m.smallInputs.join(' | ')}`);
  if (bad.length) issues.push({ label, bad });
  console.log(`${bad.length ? 'FAIL' : 'ok  '} ${label}${bad.length ? '\n      ' + bad.join('\n      ') : ''}`);
}

async function shot(page, name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

async function run(engine, deviceName, device, user, room) {
  const browser = await engine.launch();
  const ctx = await browser.newContext({ ...device, locale: 'ko-KR', bypassCSP: BASE.startsWith('http://') });
  const page = await ctx.newPage();
  if (BASE.startsWith('http://')) {
    // Local http only: production HSTS/CSP upgrade would send WebKit to https.
    await page.route('**/*', async (route) => {
      const resp = await route.fetch().catch(() => null);
      if (!resp) return route.abort();
      const headers = { ...resp.headers() };
      delete headers['strict-transport-security'];
      delete headers['content-security-policy'];
      await route.fulfill({ response: resp, headers });
    });
  }
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const tag = deviceName.replace(/\W+/g, '-');

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await shot(page, `${tag}-01-home`);
  check(`${deviceName} home`, await page.evaluate(METRICS));
  // scroll the homepage container to the bottom
  await page.evaluate(() => { const s = document.querySelector('[data-testid=home-page]'); if (s) s.scrollTop = s.scrollHeight; });
  await shot(page, `${tag}-02-home-bottom`);
  check(`${deviceName} home bottom`, await page.evaluate(METRICS));

  for (const l of ['ko', 'ja', 'ar', 'de', 'zh-tw']) {
    await page.goto(BASE + '/' + l, { waitUntil: 'networkidle' });
    await shot(page, tag + '-01-home-' + l);
    check(deviceName + ' home /' + l, await page.evaluate(METRICS));
  }
  await page.goto(BASE + '/ko', { waitUntil: 'networkidle' });
  await page.click('[data-testid=home-pc]');
  await page.waitForURL(/\/login/);
  await page.waitForTimeout(500);
  await shot(page, `${tag}-03-login`);
  check(`${deviceName} login`, await page.evaluate(METRICS));

  // email login (QR is the default tab on PC layouts: switch if needed)
  const emailTab = page.locator('button, a').filter({ hasText: /이메일|E-?mail/i }).first();
  if (await emailTab.count()) { await emailTab.click().catch(() => {}); await page.waitForTimeout(300); }
  await page.locator('input[type=email], input[autocomplete=username], input[name=email]').first().fill(user.email);
  await page.locator('input[type=password]').first().fill(PW);
  await shot(page, `${tag}-04-login-filled`);
  check(`${deviceName} login filled`, await page.evaluate(METRICS));
  await page.locator('input[type=password]').first().press('Enter');
  await page.waitForURL(/\/chats/, { timeout: 15000 });
  await page.waitForTimeout(1200);
  await shot(page, `${tag}-05-chats`);
  check(`${deviceName} chats`, await page.evaluate(METRICS));

  for (const nav of ['home', 'news', 'calls', 'voom', 'openchat', 'wallet', 'shop']) {
    await page.goto(`${BASE}/${nav}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await shot(page, `${tag}-06-${nav}`);
    check(`${deviceName} /${nav}`, await page.evaluate(METRICS));
  }

  await page.goto(`${BASE}/chats`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const row = page.locator('.lx-row').filter({ hasText: 'Somchai' }).first();
  if (await row.count()) {
    await row.click();
    await page.waitForTimeout(1200);
    await shot(page, `${tag}-07-room`);
    check(`${deviceName} room`, await page.evaluate(METRICS));
    const composer = page.locator('textarea').first();
    if (await composer.count()) {
      await composer.click();
      await page.waitForTimeout(300);
      check(`${deviceName} room composer focused`, await page.evaluate(METRICS));
    }
  } else {
    issues.push({ label: `${deviceName} room`, bad: ['direct chat row not found'] });
  }

  // Every visible button that opens a popup in the room header / composer:
  // click, measure, screenshot, close with Escape.
  const popupButtons = await page.locator('header button, .lx-room-head button, .pc-composer button, .composer button').all();
  let i = 0;
  for (const btn of popupButtons.slice(0, 14)) {
    if (!(await btn.isVisible().catch(() => false))) continue;
    const label = (await btn.getAttribute('aria-label')) || (await btn.getAttribute('title')) || (await btn.innerText().catch(() => '')) || `button${i}`;
    if (/back|뒤로|전화|통화|call|video/i.test(label)) continue;
    await btn.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(500);
    const open = await page.locator('.modal-backdrop, .fx-modal-backdrop, .pc-modal-backdrop, [role=dialog], [role=menu]').count();
    if (open) {
      await shot(page, `${tag}-08-popup-${String(i).padStart(2, '0')}`);
      check(`${deviceName} popup "${label.trim().slice(0, 30)}"`, await page.evaluate(METRICS));
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(250);
    if (await page.locator('.modal-backdrop').count()) await page.locator('.modal-backdrop').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.waitForTimeout(250);
    i++;
  }

  if (errors.length) issues.push({ label: `${deviceName} page errors`, bad: errors.slice(0, 5) });
  await browser.close();
}

const { a, room } = await seed();
const targets = [
  [webkit, 'iPhone 13', devices['iPhone 13']],
  [chromium, 'Pixel 7', devices['Pixel 7']],
  [chromium, 'Galaxy S9+', devices['Galaxy S9+']],
  [chromium, 'PC 1440', { viewport: { width: 1440, height: 900 } }],
  [chromium, 'PC 1024', { viewport: { width: 1024, height: 700 } }],
];
const only = process.env.ONLY;
for (const [engine, name, dev] of targets) {
  if (only && !name.includes(only)) continue;
  console.log(`\n=== ${name}`);
  try { await run(engine, name, dev, a, room); } catch (e) { issues.push({ label: `${name} crashed`, bad: [String(e).slice(0, 300)] }); console.log('CRASH', String(e).slice(0, 300)); }
}
fs.writeFileSync(path.join(OUT, 'issues.json'), JSON.stringify(issues, null, 2));
console.log(`\n${issues.length} issue group(s)`);
