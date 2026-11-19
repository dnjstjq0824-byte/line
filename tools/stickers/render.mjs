import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const catalog = JSON.parse(readFileSync(join(root, 'apps', 'user-web', 'public', 'stickers', 'catalog.json'), 'utf8'));
const outDir = join(root, 'apps', 'user-web', 'public', 'stickers');
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 500, height: 500 } });
let n = 0;
for (const cat of catalog.categories) {
  for (const item of cat.items) {
    const svg = readFileSync(join(root, 'assets', 'stickers', 'svg', `${item.id}.svg`), 'utf8')
      .replace('width="400" height="400"', 'width="480" height="480"');
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await page.locator('svg').screenshot({ path: join(outDir, `${item.id}.png`), omitBackground: true });
    n++;
  }
  console.log('rendered', cat.id);
}
await browser.close();
console.log(`png: ${n} files -> apps/user-web/public/stickers/png`);
