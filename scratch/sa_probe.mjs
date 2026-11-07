// Probe: engine must parse max()+env() bottom declarations (env=0 in emulation).
import { chromium, webkit } from '@playwright/test';
const BASE = 'http://127.0.0.1:8898';
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: '.capture-state.json' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector('.luno-mobile-floating-nav', { timeout: 20000 }); } catch {}
  const r = await page.evaluate(() => {
    const nav = document.querySelector('.luno-mobile-floating-nav');
    if (!nav) return { found: false };
    return { found: true, bottom: getComputedStyle(nav).bottom, display: getComputedStyle(nav).display };
  });
  console.log(name, JSON.stringify(r));
  await browser.close();
}
