// capture_room.mjs — THROWAWAY 6-3 evidence: chat-room screenshots.
// Spins up a local Go backend (throwaway sqlite), seeds two users + a direct
// room with messages, logs in through the real UI, captures #/chats/<id>.
// Usage: node scratch/capture_room.mjs <outprefix>
// Writes screenshots/<outprefix>_mobile_390.png etc. Deletes its own db.
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const OUT_PREFIX = process.argv[2] || 'room_after';
const API_PORT = 18923;
const WEB_PORT = 8902;
const BASE = `http://127.0.0.1:${WEB_PORT}`;
const API = `http://127.0.0.1:${API_PORT}`;
const DIST = 'mobile/flutter_app/build/web';
const OUT = 'screenshots';
const DB = join(tmpdir(), `capture_room_${Date.now()}.db`);
mkdirSync(OUT, { recursive: true });

const GOBIN = join(tmpdir(), 'capture-room-backend.exe');
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
let browser = null;
async function cleanup(code) {
  try { go.kill(); } catch {}
  try { if (server) server.close(); } catch {}
  await browser?.close().catch(() => {});
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    try { rmSync(DB + suffix); } catch {}
  }
  process.exit(code);
}
process.on('uncaughtException', (e) => { console.error('FATAL ' + (e && e.message)); cleanup(1); });

async function waitForApi() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${API}/healthz`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('go backend did not start');
}
await waitForApi();
console.log('go backend up');

async function api(method, path, token, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

const CONSENT = { terms: '2026-11-15.1', privacy: '2026-11-15.1' };
const A = await api('POST', '/api/v1/auth/register', null, { email: 'rooma@local.test', password: 'CapturePass#2026!', display_name: '나', handle: 'room_a', birthdate: '1990-01-01', consent: CONSENT });
const B = await api('POST', '/api/v1/auth/register', null, { email: 'roomb@local.test', password: 'CapturePass#2026!', display_name: '김친구', handle: 'room_b', birthdate: '1990-01-01', consent: CONSENT });
const loginA = await api('POST', '/api/v1/auth/login', null, { email: 'rooma@local.test', password: 'CapturePass#2026!' });
const loginB = await api('POST', '/api/v1/auth/login', null, { email: 'roomb@local.test', password: 'CapturePass#2026!' });
const idB = B.id || B.user?.id || loginB.user?.id || loginB.id;
if (!idB) throw new Error('no B id: ' + JSON.stringify(B).slice(0, 200));
await api('POST', '/api/v1/friends', loginA.access_token, { friend_id: idB });
const conv = await api('POST', '/api/v1/conversations', loginA.access_token, { kind: 'direct', member_ids: [idB] });
const CID = conv.id;
console.log('room', CID);
let n = 0;
async function say(token, body) {
  n += 1;
  await api('POST', `/api/v1/conversations/${CID}/messages`, token, { client_id: `capture-${String(n).padStart(4, '0')}`, kind: 'text', body });
}
await say(loginA.access_token, '안녕하세요');
await say(loginB.access_token, '안녕하세요! 반갑습니다');
await say(loginB.access_token, '새 대화방 디자인이 어떤가요? 아바타가 둥근 네모로 바뀌고 시간이 말풍선 옆으로 갔대요');
await say(loginA.access_token, '확인했습니다. 날짜 표시도 연해졌네요');
// B reads everything so A's bubbles carry a read count.
await api('POST', `/api/v1/conversations/${CID}/read`, loginB.access_token, { sequence: 4 });

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

browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
page.on('pageerror', (e) => errors.push('page: ' + String(e).slice(0, 160)));
page.on('response', (r) => { if (r.status() === 404) errors.push('404: ' + r.url().slice(0, 160)); });
await page.goto(`${BASE}/#/login`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await page.keyboard.press('Tab');
await page.waitForTimeout(500);
await page.keyboard.type('rooma@local.test', { delay: 20 });
await page.keyboard.press('Tab');
await page.waitForTimeout(500);
await page.keyboard.type('CapturePass#2026!', { delay: 20 });
await page.keyboard.press('Enter');
await page.waitForURL('**#/home', { timeout: 25000 });
console.log('app login ok');
await page.goto(`${BASE}/#/chats/${CID}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/${OUT_PREFIX}_mobile_390.png` });
await page.setViewportSize({ width: 768, height: 1024 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/${OUT_PREFIX}_tablet_768.png` });
console.log(`captured ${OUT_PREFIX}; page errors=${errors.length}`);
for (const e of errors.slice(0, 8)) console.log('  ' + e);
await cleanup(0);
