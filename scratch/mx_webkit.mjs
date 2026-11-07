// WebKit iPhone reproduction: home void + chat-room input dock + bottom nav overlap.
import { webkit, devices } from '@playwright/test';
const BASE = process.env.CAPTURE_BASE || 'http://127.0.0.1:8898';
const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'ko-KR', storageState: '.capture-state.json' });
const page = await ctx.newPage();
await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.mobile-nav-item', { timeout: 25000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'screenshots/phase3/wk_home_iphone.png' });
// what occupies the top 260px?
const top = await page.evaluate(() => {
  const els = [];
  const q = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return 'none';
    return el.tagName + '.' + String(el.className && el.className.baseVal === undefined ? el.className : '').split(' ').slice(0, 3).join('.');
  };
  for (const y of [20, 80, 140, 200, 260]) els.push(`y${y}=${q(190, y)}`);
  const scroller = document.querySelector('.pc-pane-body, main');
  return { els, scrollY: window.scrollY, innerH: window.innerHeight, bodyH: document.body.scrollHeight };
});
console.log('home top:', JSON.stringify(top));
// open first chat room, inspect bottom dock
await page.goto(`${BASE}/chats`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.mobile-nav-item', { timeout: 25000 });
await page.waitForTimeout(1000);
const items = page.locator('.pc-chat-item, .chat-row, [class*="chat-item"]');
console.log('chat rows:', await items.count());
if (await items.count()) {
  await items.first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'screenshots/phase3/wk_room_iphone.png' });
  const dock = await page.evaluate(() => {
    const cands = ['.pc-chat-input-dock', '.chat-input', 'footer', 'form'];
    const found = {};
    for (const s of cands) {
      const el = document.querySelector(s);
      if (el) { const r = el.getBoundingClientRect(); found[s] = { y: Math.round(r.y), h: Math.round(r.height), bottom: Math.round(r.bottom), innerH: window.innerHeight }; }
    }
    return found;
  });
  console.log('dock:', JSON.stringify(dock));
}
await browser.close();
