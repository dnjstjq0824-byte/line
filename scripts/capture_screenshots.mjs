// capture_screenshots.mjs — Phase 3 responsive evidence.
// Usage: build dist_cf with VITE_API_URL, then:
//   node scripts/capture_screenshots.mjs
// The script serves dist_cf itself (with SPA fallback) and writes
// screenshots/phase3/*.png + manifest.json with a horizontal-scroll check,
// route URL, and console/page errors per shot. Kept in repo for re-runs.
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname, normalize } from 'node:path';
import { chromium } from '@playwright/test';

const PORT = 8901;
const BASE = process.env.CAPTURE_BASE || `http://127.0.0.1:${PORT}`;
const DIST = process.env.CAPTURE_DIST || 'dist_cf';
const OUT = 'screenshots/phase3';
mkdirSync(OUT, { recursive: true });

// Static server with SPA fallback (mirrors the Cloudflare single-page-app
// handling): real files first, then <dir>/index.html, then root index.html
// for extensionless routes, else 404.
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function serve(req, res) {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = join(DIST, path);
  const send = (p) => {
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(readFileSync(p));
  };
  try {
    if (existsSync(file) && statSync(file).isFile()) return send(file);
    const idx = join(file, 'index.html');
    if (existsSync(idx)) return send(idx);
    if (!extname(path)) return send(join(DIST, 'index.html'));
  } catch {}
  res.writeHead(404);
  res.end('not found');
}
const server = createServer(serve);
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
const manifest = [];
const browser = await chromium.launch();
const NAV = 'body:has(.pc-rail-btn, .mobile-nav-item, .luno-mobile-floating-nav)';

function watch(page, bucket) {
  page.on('console', (m) => {
    if (m.type() === 'error') bucket.push('console: ' + m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => bucket.push('page: ' + String(e).slice(0, 200)));
}

async function shot(page, bucket, name, device, width, height) {
  const file = `${name}_${device}_${width}.png`;
  try {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${file}` });
    const m = await page.evaluate(() => ({
      scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    manifest.push({ file, page: name, device, width, ok: true, url: new URL(page.url()).pathname, ...m, errors: [...bucket] });
    console.log(`${file} scrollX=${m.scrollX} errors=${bucket.length}`);
  } catch (e) {
    manifest.push({ file, page: name, device, width, ok: false, error: String(e).slice(0, 200) });
    console.log(`${file} FAILED ${String(e).slice(0, 120)}`);
  }
  bucket.length = 0;
}

// ---- auth (logged out) ----
{
  const ctx = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const page = await ctx.newPage();
  const bucket = [];
  watch(page, bucket);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.btn-demo-pill', { timeout: 25000 });
  await shot(page, bucket, 'auth', 'pc', 1440, 900);
  await shot(page, bucket, 'auth', 'tablet', 768, 1024);
  await shot(page, bucket, 'auth', 'mobile', 390, 844);
  await shot(page, bucket, 'auth', 'mobile', 360, 740);
  // Demo login for the authed state.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click('.btn-demo-pill >> nth=0');
  await page.waitForSelector(NAV, { timeout: 25000 });
  await ctx.storageState({ path: '.capture-state.json' });
  await ctx.close();
  // English-locale regression shot for the auth i18n conversion.
  const ctxEn = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'Asia/Seoul' });
  const pageEn = await ctxEn.newPage();
  const bucketEn = [];
  watch(pageEn, bucketEn);
  await pageEn.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await pageEn.waitForSelector('.btn-demo-pill', { timeout: 25000 });
  await shot(pageEn, bucketEn, 'auth_en', 'pc', 1440, 900);
  await ctxEn.close();
}

// ---- authed screens ----
const DESKTOP = [['pc', 1440, 900], ['pc', 1280, 800], ['tablet_landscape', 1024, 768]];
const MOBILE = [['tablet', 768, 1024], ['mobile', 390, 844], ['mobile', 360, 740]];
for (const [device, width, height] of [...DESKTOP, ...MOBILE]) {
  const ctx = await browser.newContext({
    viewport: { width, height }, locale: 'ko-KR', timezoneId: 'Asia/Seoul', storageState: '.capture-state.json',
  });
  const page = await ctx.newPage();
  const bucket = [];
  watch(page, bucket);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForSelector(NAV, { timeout: 25000 });
  } catch { /* still capture; manifest records the state */ }
  const wide = width >= 768;
  await shot(page, bucket, 'chats', device, width, height);
  if (wide) {
    for (const [title, name] of [['친구', 'friends'], ['뉴스 (News)', 'news'], ['통화 (Calls)', 'calls'], ['지갑 (Wallet)', 'wallet']]) {
      try {
        await page.click(`button[title="${title}"]`, { timeout: 8000 });
        await page.waitForTimeout(700);
      } catch { /* keep going; shot shows current state */ }
      await shot(page, bucket, name, device, width, height);
    }
    try {
      const btn = page.locator('button[title="설정"]:visible').first();
      await btn.scrollIntoViewIfNeeded({ timeout: 8000 });
      await btn.click({ timeout: 8000 });
      await page.waitForSelector('.modal-backdrop', { timeout: 6000 });
    } catch (e) { console.log(`settings@${width} click issue: ${String(e).split('\n')[0].slice(0, 160)}`); }
    await shot(page, bucket, 'settings', device, width, height);
    await page.keyboard.press('Escape');
    try {
      await page.locator('button[title="친구 추가"]:visible').first().click({ timeout: 8000 });
      await page.waitForTimeout(700);
    } catch (e) { console.log(`addfriend@${width} click issue: ${String(e).split('\n')[0].slice(0, 160)}`); }
    await shot(page, bucket, 'addfriend', device, width, height);
    await page.keyboard.press('Escape');
  } else {
    try {
      await page.locator('.mobile-nav-item', { hasText: '지갑' }).click({ timeout: 8000 });
      await page.waitForTimeout(700);
    } catch {}
    await shot(page, bucket, 'wallet', device, width, height);
  }
  await ctx.close();
}

// ---- router deep links (authed) ----
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul', storageState: '.capture-state.json',
  });
  const page = await ctx.newPage();
  const bucket = [];
  watch(page, bucket);
  await page.goto(`${BASE}/wallet`, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForSelector(NAV, { timeout: 25000 });
  } catch {}
  await shot(page, bucket, 'deeplink_wallet', 'pc', 1440, 900);
  await page.goto(`${BASE}/bogus-xyz`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await shot(page, bucket, 'deeplink_bogus', 'pc', 1440, 900);
  await ctx.close();
}

// ---- console login screens ----
for (const app of ['admin', 'partner', 'developer', 'creator', 'ads']) {
  for (const [device, width, height] of [['pc', 1440, 900], ['mobile', 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, locale: 'ko-KR' });
    const page = await ctx.newPage();
    const bucket = [];
    watch(page, bucket);
    await page.goto(`${BASE}/${app}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await shot(page, bucket, `${app}_login`, device, width, height);
    await ctx.close();
  }
}

writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
await browser.close();
server.close();
const bad = manifest.filter((m) => !m.ok || m.scrollX || m.errors.length);
console.log(`shots=${manifest.length} clean=${manifest.length - bad.length} flagged=${bad.length}`);
