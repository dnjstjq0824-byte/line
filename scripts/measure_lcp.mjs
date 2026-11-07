// measure_lcp.mjs — lab LCP evidence for the user-web SPA.
// Serves dist_cf locally (SPA fallback, like Cloudflare) and records the
// Largest Contentful Paint via PerformanceObserver on the auth route, plus
// total transfer bytes. Unthrottled lab numbers: a ceiling check, not a
// field-data substitute. Writes screenshots/perf/lcp.json.
// Usage: npm run build:apps (or node scripts/build_cf.js) first, then:
//   node scripts/measure_lcp.mjs
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname, normalize } from 'node:path';
import { chromium } from '@playwright/test';

const PORT = 8905;
const BASE = `http://127.0.0.1:${PORT}`;
const DIST = 'dist_cf';
const OUT = 'screenshots/perf';
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = join(DIST, path);
  try {
    if (existsSync(file) && statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      return void res.end(readFileSync(file));
    }
    if (!extname(path)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return void res.end(readFileSync(join(DIST, 'index.html')));
    }
  } catch {}
  res.writeHead(404);
  res.end('not found');
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch();
const results = [];
for (const [device, width, height, mobile] of [['pc', 1440, 900, false], ['mobile', 390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, locale: 'ko-KR' });
  const page = await ctx.newPage();
  let bytes = 0;
  page.on('response', async (r) => {
    try { const b = await r.body(); bytes += b.length; } catch {}
  });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.btn-demo-pill', { timeout: 25000 });
  const lcp = await page.evaluate(() => new Promise((resolve) => {
    let last = 0;
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) last = e.startTime;
    });
    po.observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(() => { po.disconnect(); resolve(Math.round(last)); }, 3000);
  }));
  results.push({ device, width, route: '/', lcp_ms: lcp, transfer_bytes: bytes });
  console.log(`${device} ${width}: LCP=${lcp}ms transfer=${bytes}B`);
  await ctx.close();
}
await browser.close();
server.close();
writeFileSync(`${OUT}/lcp.json`, JSON.stringify({ measured_at: new Date().toISOString(), target_ms: 2500, results }, null, 1));
const worst = Math.max(...results.map((r) => r.lcp_ms));
console.log(worst <= 2500 ? 'LCP PASS (lab, unthrottled)' : 'LCP FAIL (lab, unthrottled)');
process.exit(worst <= 2500 ? 0 : 1);
