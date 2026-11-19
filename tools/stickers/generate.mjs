// Assembles the 200 SVG masters + catalog.json. Validates every recipe key
// (unknown part names fail the build, not silently fall back).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose, BODIES, EYES, MOUTHS, BROWS, BLUSH, ARMS, FEET, PROPS, FX, FX2 } from './parts.mjs';
import { CATS, RECIPES } from './recipes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TABLES = { c: BODIES, e: EYES, m: MOUTHS, b: BROWS, bl: BLUSH, a: ARMS, f: FEET, p: PROPS, fx: FX, x2: FX2 };
const FULL = { c: 'char', e: 'eyes', m: 'mouth', b: 'brows', bl: 'blush', a: 'arms', f: 'feet', p: 'prop', fx: 'fx', x2: 'fx2' };
const OPTIONAL = new Set(['b', 'bl', 'a', 'f', 'p', 'fx', 'x2']);

const svgDir = join(root, 'assets', 'stickers', 'svg');
const outDir = join(root, 'apps', 'user-web', 'public', 'stickers');
mkdirSync(svgDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const catalog = { version: 1, pack: 'luno200', count: 0, categories: [] };
for (const cat of CATS) {
  const list = RECIPES[cat.id];
  if (!list || list.length !== 25) throw new Error(`category ${cat.id}: need exactly 25, have ${list ? list.length : 0}`);
  const items = [];
  list.forEach((r, i) => {
    for (const [short, table] of Object.entries(TABLES)) {
      const v = r[short];
      if (v === undefined) {
        if (!OPTIONAL.has(short)) throw new Error(`${cat.id}[${i}]: missing required key ${short}`);
        continue;
      }
      if (!(v in table)) throw new Error(`${cat.id}[${i}]: unknown ${short}=${v}`);
    }
    if (r.captionPos !== undefined && r.captionPos !== 'top' && r.captionPos !== 'bottom') {
      throw new Error(`${cat.id}[${i}]: bad captionPos ${r.captionPos}`);
    }
    const full = {};
    for (const [short, name] of Object.entries(FULL)) full[name] = r[short];
    full.caption = r.t;
    full.captionPos = r.captionPos;
    full.captionBg = r.tb;
    full.pose = r.pose;
    full.propDx = r.propDx;
    full.propDy = r.propDy;
    const id = `luno-${cat.id}-${String(i + 1).padStart(3, '0')}`;
    const svg = compose(full);
    writeFileSync(join(svgDir, `${id}.svg`), svg);
    items.push({ id, char: r.c, label: r.t || '', file: `${id}.png` });
  });
  catalog.categories.push({ id: cat.id, ko: cat.ko, en: cat.en, items });
}
catalog.count = catalog.categories.reduce((n, c) => n + c.items.length, 0);
if (catalog.count !== 200) throw new Error(`need exactly 200, have ${catalog.count}`);
writeFileSync(join(outDir, 'catalog.json'), JSON.stringify(catalog, null, 1));
console.log(`masters: ${catalog.count} svg -> assets/stickers/svg, catalog.json written`);
