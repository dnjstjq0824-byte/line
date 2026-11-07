import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from '@playwright/test';
const DIST = 'mobile/flutter_app/build/web';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
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
await new Promise((r) => server.listen(8902, '127.0.0.1', r));
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto('http://127.0.0.1:8902/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
const dump = await page.evaluate(() => ({
  inputs: [...document.querySelectorAll('input,textarea')].map((e) => (e.getAttribute('aria-label') || e.type || e.tagName) + '@' + Math.round(e.getBoundingClientRect().y)),
  buttons: [...document.querySelectorAll('button,[role=button]')].slice(0, 12).map((e) => (e.textContent || '').trim().slice(0, 24) + '@' + Math.round(e.getBoundingClientRect().y)),
  glass: !!document.querySelector('flt-glass-pane'),
}));
console.log(JSON.stringify(dump, null, 1));
await page.screenshot({ path: 'screenshots/app_probe.png' });
await browser.close();
server.close();
