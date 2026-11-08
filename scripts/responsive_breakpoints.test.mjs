import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Responsive standard (docs/RESPONSIVE_STANDARD.md): web + app share one
// breakpoint scale. Layout flips only at 700 (phone/tablet) and 1100
// (tablet/desktop). 480 is small-phone refinement, 1000 is an inner
// tablet-narrow refinement. Anything else (notably 768) reopens the
// 701-768 conflict zone where phone and tablet rules fought.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'user-web', 'src');

async function cssFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await cssFiles(p));
    else if (e.name.endsWith('.css') || e.name.endsWith('.vue')) out.push(p);
  }
  return out;
}

const files = await cssFiles(root);
const hits = [];
for (const f of files) {
  const text = await readFile(f, 'utf8');
  for (const m of text.matchAll(/\(\s*(min|max)-width\s*:\s*(\d+)px\s*\)/g)) {
    hits.push({ file: f, kind: m[1], px: Number(m[2]) });
  }
}

test('web layout breakpoints use only the standard scale', () => {
  const allowedMax = new Set([480, 700, 1000, 1100]);
  const allowedMin = new Set([701]);
  const bad = hits.filter(h =>
    (h.kind === 'max' && !allowedMax.has(h.px)) ||
    (h.kind === 'min' && !allowedMin.has(h.px)));
  assert.deepEqual(bad, [], `non-standard breakpoints: ${JSON.stringify(bad.slice(0, 8))}`);
});

test('no 768px media query remains in user-web', async () => {
  const offenders = [];
  for (const f of files) {
    const text = await readFile(f, 'utf8');
    if (/\(\s*(min|max)-width\s*:\s*768px\s*\)/.test(text)) offenders.push(f);
  }
  assert.deepEqual(offenders, []);
});

test('flutter breakpoints match the shared standard', async () => {
  const dart = await readFile(new URL('../mobile/flutter_app/lib/design/responsive.dart', import.meta.url), 'utf8');
  assert.ok(dart.includes('compactMax = 400'), 'compactMax 400');
  assert.ok(dart.includes('mobileMax = 700'), 'mobileMax 700');
  assert.ok(dart.includes('tabletMax = 1100'), 'tabletMax 1100');
});

test('luno-theme.css does not import itself', async () => {
  const css = await readFile(join(root, 'luno-theme.css'), 'utf8');
  assert.ok(!css.includes("@import './luno-theme.css'"), 'self-import removed');
});
