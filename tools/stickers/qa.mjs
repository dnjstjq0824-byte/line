import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { CATS } from './recipes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(tmpdir(), 'luno-stickers');
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
for (const cat of CATS) {
  let cells = '';
  for (let i = 1; i <= 25; i++) {
    const id = `luno-${cat.id}-${String(i).padStart(3, '0')}`;
    const svg = readFileSync(join(root, 'assets', 'stickers', 'svg', `${id}.svg`), 'utf8')
      .replace('width="400" height="400"', 'width="200" height="200"');
    cells += `<div style="text-align:center"><div style="font:11px sans-serif;color:#555">${id}</div>${svg}</div>`;
  }
  const html = `<html><body style="margin:0;background:#fff"><h2 style="font-family:sans-serif">${cat.id}</h2><div style="display:grid;grid-template-columns:repeat(5,220px)">${cells}</div></body></html>`;
  const p = join(dir, `qa-${cat.id}.html`);
  writeFileSync(p, html);
  const page = await browser.newPage({ viewport: { width: 1120, height: 1400 } });
  await page.goto('file:///' + p.replace(/\\/g, '/'));
  await page.screenshot({ path: join(dir, `qa-${cat.id}.png`) });
  await page.close();
  console.log('qa', cat.id);
}
await browser.close();
