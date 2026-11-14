// ux_size_audit.mjs — UX5 size audit: web 11 screens x 8 sizes x Chrome+WebKit.
// Usage: start the local harness first (npx wrangler dev --port 8791),
// then: node scripts/ux_size_audit.mjs
// Env: UX_AUDIT_BASE (default http://127.0.0.1:8791), UX_AUDIT_QUICK=1 for a
// fast pass (chromium only, 4 widths). Writes screenshots/qa/*.png and
// screenshots/qa/ux_report.json. Exit 0 only when every item is defect-free:
// horizontal overflow, offscreen elements, touch targets under 44px on
// finger widths (<700, C1 scope), inputs under 16px, broken images, load
// failures (Tab 1 §6.2 criteria). Pointer-dense icon chrome at >=700 is a
// documented UX5 exception, not an audit failure (see measure()).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, webkit } from '@playwright/test';

const BASE = process.env.UX_AUDIT_BASE || 'http://127.0.0.1:8791';
const OUT = 'screenshots/qa';
mkdirSync(OUT, { recursive: true });
const QUICK = process.env.UX_AUDIT_QUICK === '1';

async function api(path, method = 'GET', body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json };
}

// ---- seed: audit user + one friend + one Keep message (best effort) ----
const creds = { email: 'ux5audit@example.com', handle: 'ux5audit', password: 'Ux5audit!234567890', display_name: 'UX5 Audit' };
let r = await api('/api/v1/auth/register', 'POST', creds);
if (!r.json?.access_token) r = await api('/api/v1/auth/login', 'POST', { email: creds.email, password: creds.password });
const token = r.json?.access_token;
if (!token) { console.error('seed login failed', r.status); process.exit(2); }
try {
  const b = { email: 'ux5friend@example.com', handle: 'ux5friend', password: 'Ux5fr!nd234567890', display_name: 'UX5 Friend' };
  await api('/api/v1/auth/register', 'POST', b);
  await api('/api/v1/friends', 'POST', { handle: b.handle }, token);
  const convs = await api('/api/v1/conversations', 'GET', null, token);
  const list = convs.json?.conversations || [];
  if (list[0]?.id) {
    await api(`/api/v1/conversations/${list[0].id}/messages`, 'POST',
      { body: 'UX5 검수 메시지 — 일레븐 화면 사이즈 감사 기준 확인용입니다.' }, token);
  }
  console.log('seed ok');
} catch (e) { console.log('seed partial:', String(e).slice(0, 120)); }

const SIZES = QUICK
  ? [['mobile', 390, 844], ['tablet_portrait', 768, 1024], ['tablet_landscape', 1024, 768], ['pc', 1440, 900]]
  : [['compact', 360, 780], ['mobile', 390, 844], ['mobile', 412, 915],
     ['tablet_portrait', 768, 1024], ['tablet_landscape', 1024, 768],
     ['pc', 1280, 800], ['pc', 1440, 900], ['pc', 1920, 1080]];
const BROWSERS = QUICK ? [['chromium', chromium]] : [['chromium', chromium], ['webkit', webkit]];

// 11 screens: list, room, home, friend, news, calls, wallet, voom, openchat,
// shop, settings. Settings opens as a modal over /home.
const SCREENS = ['chats', 'room', 'home', 'friend', 'news', 'calls', 'wallet', 'voom', 'openchat', 'shop', 'settings'];

async function ready(page) {
  // Single app root: rail and floating nav coexist in the DOM (one hidden
  // by CSS), so a grouped selector trips Playwright strict mode.
  await page.waitForSelector('.luno-desktop-app', { timeout: 25000 });
}

async function openScreen(page, name) {
  if (name === 'room') {
    await page.goto(`${BASE}/chats`, { waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.waitForTimeout(1000);
    const row = page.locator('.pc-chat-item-row').first();
    if (await row.count()) { await row.click(); await page.waitForTimeout(900); }
    return;
  }
  if (name === 'friend') {
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.waitForTimeout(1000);
    const row = page.locator('.pc-friend-item-row', { hasText: 'UX5 Friend' }).first();
    if (await row.count()) { await row.click(); await page.waitForTimeout(900); }
    return;
  }
  if (name === 'settings') {
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.waitForTimeout(1000);
    const railBtns = page.locator('.pc-rail-bottom .pc-rail-btn.small');
    let opened = false;
    for (let i = 0; i < await railBtns.count(); i++) {
      const btn = railBtns.nth(i);
      if (!await btn.isVisible()) continue;
      const title = await btn.getAttribute('title');
      if (title && /설정|Setting/.test(title)) { await btn.click(); opened = true; break; }
    }
    if (!opened) {
      // Finger widths have no rail: FriendPanel's theme tile emits settings.
      const alt = page.locator('.home-service-item', { hasText: '테마' }).first();
      if (await alt.count()) { await alt.click(); opened = true; }
    }
    await page.waitForTimeout(700);
    return;
  }
  await page.goto(`${BASE}/${name}`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await page.waitForTimeout(1000);
}

async function measure(page) {
  return page.evaluate(() => {
    const describe = (el) => {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const cls = (el.className?.baseVal ?? el.className ?? '').toString().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
      const text = (el.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${tag}${id}${cls ? '.' + cls : ''}${text ? ` "${text}"` : ''}`;
    };
    const vw = window.innerWidth, vh = window.innerHeight;
    const de = document.documentElement;
    const skipInput = (el) => el.tagName === 'INPUT' && ['checkbox', 'radio', 'hidden', 'file'].includes(el.type);
    const visible = (el) => {
      const b = el.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) return null;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse') return null;
      if (parseFloat(s.opacity) === 0) return null;
      return b;
    };
    const out = {
      scrollX: de.scrollWidth > de.clientWidth + 1,
      scrollW: de.scrollWidth, clientW: de.clientWidth,
      offscreen: [], smallTouch: [], smallInput: [], brokenImg: [],
    };
    const push = (arr, el, extra) => {
      if (arr.length < 12) arr.push(`${describe(el)}${extra}`);
    };
    // Offscreen = pushed past the left/right edge. Content below the fold
    // is normal scrolling, never a defect. Content scrolled out of sight
    // inside a visible horizontal scroller (tab bars, bubble toolbar) is
    // reachable by swipe, not clipped, so it is skipped.
    const inWorkingScroller = (el) => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if (s.overflowX === 'auto' || s.overflowX === 'scroll') {
          const b = p.getBoundingClientRect();
          if (b.left >= -1 && b.right <= vw + 1) return true;
        }
        p = p.parentElement;
      }
      return false;
    };
    for (const el of document.querySelectorAll('body *')) {
      const b = visible(el);
      if (!b) continue;
      if (b.right > vw + 1 || b.left < -1) {
        if (inWorkingScroller(el)) continue;
        push(out.offscreen, el, ` right=${Math.round(b.right)} left=${Math.round(b.left)}`);
      }
    }
    // Touch 44px is enforced on finger widths (<700, compact/mobile) where
    // C1 scoped it. At >=700 the icon rail/headers are pointer-dense chrome
    // (76px rail cannot hold fourteen 44px buttons); those stay documented
    // exceptions in the UX5 report, not audit failures.
    if (vw < 700) {
      for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], label:has(input, select, textarea)')) {
        const b = visible(el);
        if (!b) continue;
        if (el.disabled) continue;
        if (skipInput(el)) continue;
        if (Math.min(b.width, b.height) < 44) push(out.smallTouch, el, ` ${Math.round(b.width)}x${Math.round(b.height)}`);
      }
    }
    for (const el of document.querySelectorAll('input, textarea, select')) {
      if (!visible(el)) continue;
      if (skipInput(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) push(out.smallInput, el, ` ${fs}px`);
    }
    for (const el of document.querySelectorAll('img')) {
      if (el.complete && el.naturalWidth === 0 && (el.src || '').slice(0, 5) !== 'data:') {
        push(out.brokenImg, el, ` src=${(el.currentSrc || el.src).slice(0, 100)}`);
      }
    }
    return out;
  });
}

const report = [];
let defects = 0;
for (const [browserName, launcher] of BROWSERS) {
  const browser = await launcher.launch();
  for (const [device, width, height] of SIZES) {
    for (const screen of SCREENS) {
      const ctx = await browser.newContext({ viewport: { width, height }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
      await ctx.addInitScript((t) => localStorage.setItem('luno.auth_token', t), token);
      const page = await ctx.newPage();
      const loads = [];
      page.on('console', (m) => { if (m.type() === 'error') loads.push('console: ' + m.text().slice(0, 160)); });
      page.on('pageerror', (e) => loads.push('page: ' + String(e).slice(0, 160)));
      page.on('response', (res) => { if (res.status() >= 400) loads.push(`http${res.status()}: ${res.url().replace(BASE, '').slice(0, 120)}`); });
      const entry = { browser: browserName, device, width, height, screen, file: '', ok: true };
      try {
        await openScreen(page, screen);
        await page.waitForTimeout(600);
        const m = await measure(page);
        const file = `${browserName}_${screen}_${width}x${height}.png`;
        await page.screenshot({ path: `${OUT}/${file}` });
        Object.assign(entry, { file, ...m, loads });
        const bad = m.scrollX || m.offscreen.length || m.smallTouch.length || m.smallInput.length || m.brokenImg.length || loads.length;
        if (bad) { entry.ok = false; defects++; }
        console.log(`${bad ? 'FAIL' : 'ok'} ${browserName} ${screen} ${width}x${height}` +
          ` scrollX=${m.scrollX} off=${m.offscreen.length} touch=${m.smallTouch.length}` +
          ` input=${m.smallInput.length} img=${m.brokenImg.length} load=${loads.length}`);
      } catch (e) {
        entry.ok = false;
        entry.error = String(e).slice(0, 200);
        defects++;
        console.log(`FAIL ${browserName} ${screen} ${width}x${height} ${entry.error}`);
      }
      report.push(entry);
      await ctx.close();
    }
  }
  await browser.close();
}
const summary = { base: BASE, runs: report.length, defects, at: new Date().toISOString() };
writeFileSync(`${OUT}/ux_report.json`, JSON.stringify({ summary, report }, null, 2));
console.log(`\n${defects}/${report.length} runs with defects. Report: ${OUT}/ux_report.json`);
process.exit(defects ? 1 : 0);
