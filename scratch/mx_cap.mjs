// Mobile/tablet x locale matrix capture vs hybrid backend.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const BASE = process.env.CAPTURE_BASE || 'http://127.0.0.1:8899';
const OUT = 'screenshots/phase3';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
// fresh demo login state (hybrid backend)
{
  const lctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
  const lp = await lctx.newPage();
  await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await lp.locator('.btn-demo-pill').first().waitFor({ timeout: 25000 });
  await lp.locator('.btn-demo-pill').first().click();
  await lp.waitForSelector('body:has(.pc-rail-btn,.mobile-nav-item,.luno-mobile-floating-nav)', { timeout: 25000 });
  await lctx.storageState({ path: '.capture-state.json' });
  await lctx.close();
  console.log('state saved');
}
const manifest = [];
for (const loc of ['th', 'en']) {
  for (const vp of [{ w: 390, tag: 'mobile' }, { w: 768, tag: 'tablet' }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: 844 }, locale: loc === 'th' ? 'th-TH' : 'en-US', storageState: '.capture-state.json' });
    await ctx.addInitScript((l) => localStorage.setItem('luno.locale', l), loc);
    const page = await ctx.newPage();
    const bucket = [];
    page.on('pageerror', (e) => bucket.push('page: ' + String(e).slice(0, 120)));
    for (const route of ['chats', 'home', 'news', 'calls', 'wallet']) {
      await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
      try { await page.waitForSelector('body:has(.pc-rail-btn,.mobile-nav-item,.luno-mobile-floating-nav)', { timeout: 25000 }); } catch {}
      await page.waitForTimeout(900);
      const file = `${route}_${loc}_${vp.tag}_${vp.w}.png`;
      await page.screenshot({ path: `${OUT}/${file}` });
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const over = [];
        document.querySelectorAll('body *').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && (r.right > window.innerWidth + 2 || r.left < -2)) {
            const label = (el.className && el.className.baseVal === undefined ? String(el.className).split(' ').slice(0, 2).join('.') : '') || el.tagName;
            if (over.length < 8) over.push(`${label}:l=${Math.round(r.left)}r=${Math.round(r.right)}`);
          }
        });
        return { scrollX: de.scrollWidth > de.clientWidth + 1, over };
      });
      manifest.push({ file, ...m, errors: [...bucket] });
      console.log(`${file} scrollX=${m.scrollX} over=${m.over.length} errors=${bucket.length}`);
      bucket.length = 0;
    }
    await ctx.close();
  }
}
writeFileSync(`${OUT}/matrix_manifest.json`, JSON.stringify(manifest, null, 1));
await browser.close();
