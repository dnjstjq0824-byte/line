// capture_app.mjs — Flutter app (web build) screenshot evidence.
// Spins up a local Go backend (throwaway sqlite) + static server, registers a
// capture account via API, logs in through the real UI, and captures routes
// via hash navigation. Writes screenshots/app/*.png + manifest.json.
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const API_PORT = 18923;
const WEB_PORT = 8902;
const BASE = `http://127.0.0.1:${WEB_PORT}`;
const DIST = 'mobile/flutter_app/build/web';
const OUT = 'screenshots/app';
const DB = join(tmpdir(), `capture_app_${Date.now()}.db`);
mkdirSync(OUT, { recursive: true });

// ---- Go backend (prebuilt binary: fast start, clean kill) ----
const GOBIN = join(tmpdir(), 'capture-backend.exe');
try { rmSync(GOBIN); } catch {}
execFileSync('go', ['build', '-o', GOBIN, './cmd/server'], { cwd: 'backend', stdio: 'inherit' });
const go = spawn(GOBIN, [], {
  env: {
    ...process.env,
    DATABASE_URL: 'sqlite://' + DB.replace(/\\/g, '/'),
    JWT_SECRET: 'capture-only-secret-0123456789abcdef',
    PUSH_TOKEN_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
    PORT: String(API_PORT),
    ALLOWED_ORIGINS: `http://127.0.0.1:${WEB_PORT}`,
  },
  stdio: 'ignore',
});
let server = null;
process.on('uncaughtException', (e) => {
  console.error('FATAL ' + (e && e.message));
  try { go.kill(); } catch {}
  try { if (server) server.close(); } catch {}
  process.exit(1);
});
async function waitForApi() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${API_PORT}/healthz`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('go backend did not start');
}
await waitForApi();
console.log('go backend up');

// ---- register capture account ----
const EMAIL = 'capture@local.test';
const PASS = 'CapturePass#2026!';
{
  const r = await fetch(`http://127.0.0.1:${API_PORT}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS, display_name: 'Capture' }),
  });
  if (!r.ok) throw new Error('register failed: ' + r.status);
  console.log('capture account registered');
}

// ---- static server (WASM needs COOP/COEP) ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf' };
server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(DIST, path);
  try {
    if (existsSync(file) && statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
      return void res.end(readFileSync(file));
    }
    const idx = join(file, 'index.html');
    if (existsSync(idx)) {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
      return void res.end(readFileSync(idx));
    }
  } catch {}
  res.writeHead(404);
  res.end('nf');
});
await new Promise((r) => server.listen(WEB_PORT, '127.0.0.1', r));

const manifest = [];
const browser = await chromium.launch();
function watch(page, bucket) {
  page.on('console', (m) => { if (m.type() === 'error') bucket.push('console: ' + m.text().slice(0, 200)); });
  page.on('pageerror', (e) => bucket.push('page: ' + String(e).slice(0, 200)));
}
async function shot(page, bucket, name, device, width, height) {
  const file = `${name}_${device}_${width}.png`;
  try {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${file}` });
    const m = await page.evaluate(() => ({
      scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    manifest.push({ file, page: name, device, width, ok: true, url: new URL(page.url()).hash || '/', ...m, errors: [...bucket] });
    console.log(`${file} url=${new URL(page.url()).hash || '/'} scrollX=${m.scrollX} errors=${bucket.length}`);
  } catch (e) {
    manifest.push({ file, page: name, device, width, ok: false, error: String(e).slice(0, 200) });
    console.log(`${file} FAILED ${String(e).slice(0, 120)}`);
  }
  bucket.length = 0;
}

// ---- login (unauthenticated) ----
for (const [device, width, height] of [['mobile', 390, 844], ['tablet', 768, 1024], ['tablet_landscape', 1024, 768]]) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const bucket = [];
  watch(page, bucket);
  await page.goto(`${BASE}/#/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10000);
  await shot(page, bucket, 'login', device, width, height);
  await ctx.close();
}

// ---- UI login + authed routes (one context, resized) ----
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const bucket = [];
  watch(page, bucket);
  await page.goto(`${BASE}/#/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10000);
  // Zero-coordinate login (verified by probe): first Tab lands on the
  // email field, second Tab on the password field, Enter submits.
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  await page.keyboard.type(EMAIL, { delay: 20 });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  await page.keyboard.type(PASS, { delay: 20 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/_debug_after_submit.png` });
  console.log('after-submit url=' + page.url());
  await page.waitForURL('**#/home', { timeout: 25000 });
  console.log('app login ok');
  for (const [device, width, height] of [['mobile', 390, 844], ['tablet', 768, 1024], ['tablet_landscape', 1024, 768]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(800);
    for (const route of ['home', 'chats', 'profile', 'calls', 'keep', 'wallet', 'settings', 'news', 'search', 'privacy']) {
      await page.goto(`${BASE}/#/${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await shot(page, bucket, route, device, width, height);
    }
  }
  await ctx.close();
}

writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
await browser.close();
server.close();
go.kill();
for (const suffix of ['', '-journal', '-wal', '-shm']) {
  try { rmSync(DB + suffix); } catch {}
}
const bad = manifest.filter((m) => !m.ok || m.scrollX || m.errors.length);
console.log(`shots=${manifest.length} clean=${manifest.length - bad.length} flagged=${bad.length}`);
