import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Parity between the canonical token file, the Vue CSS variables, and the
// Flutter Harbor tokens. design_v3.test.mjs owns the base palette contract;
// this file owns the Phase 1 extensions (status colors, shadows, type scale).
const tokens = JSON.parse(await readFile(new URL('../apps/shared/design-v3.tokens.json', import.meta.url), 'utf8'));
const css = await readFile(new URL('../apps/shared/design-v3.css', import.meta.url), 'utf8');
const dart = await readFile(new URL('../mobile/flutter_app/lib/design/v3.dart', import.meta.url), 'utf8');

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function ratio(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

test('status colors exist in tokens, CSS and Dart with identical values', () => {
  for (const theme of ['light', 'dark']) {
    for (const key of ['success', 'warning', 'info']) {
      const hex = tokens[theme][key];
      assert.match(hex, /^#[0-9a-f]{6}$/, `${theme}.${key} must be lowercase hex`);
      assert.ok(css.includes(`--ln-${key}:${hex};`), `css --ln-${key} (${theme})`);
      const dartHex = '0xFF' + hex.slice(1).toUpperCase();
      assert.ok(dart.includes(`Color(${dartHex})`), `dart ${key} (${theme})`);
    }
  }
});

test('status colors meet AA contrast on their theme surface', () => {
  for (const theme of ['light', 'dark']) {
    for (const key of ['success', 'warning', 'info']) {
      const r = ratio(tokens[theme][key], tokens[theme].surface);
      assert.ok(r >= 4.5, `${theme}.${key}/surface: ${r.toFixed(2)}`);
    }
  }
});

test('shadows and type scale exist in tokens, CSS and Dart', () => {
  for (const theme of ['light', 'dark']) {
    for (const size of ['sm', 'md']) {
      const shadow = tokens.shadows[theme][size];
      assert.ok(css.includes(size === 'sm' ? `--ln-shadow-sm:${shadow};` : `--ln-shadow:${shadow};`), `css shadow ${theme}.${size}`);
    }
  }
  // Dart shadow geometry + colors mirror the light/dark pairs.
  for (const [dartName, want] of [['sm', '0x1F12211E'], ['md', '0x1412211E'], ['smDark', '0x55000000'], ['mdDark', '0x40000000']]) {
    assert.ok(dart.includes(`Color(${want})`), `dart shadow ${dartName}`);
  }
  for (const [name, px] of Object.entries(tokens.typePx)) {
    assert.ok(css.includes(`--ln-fs-${name}:${px}px`), `css type ${name}`);
    assert.ok(dart.includes(`static const ${name} = ${px}.0;`), `dart type ${name}`);
  }
});

test('UX4: HarborLayout rail/list mirror the token file', () => {
  assert.ok(dart.includes(`static const railWidth = ${tokens.layout.railPx}.0;`), 'dart railWidth');
  assert.ok(dart.includes(`static const listWidth = ${tokens.layout.listPx}.0;`), 'dart listWidth');
});

test('UX4: spec-value sizes use v3 constants, never raw literals', async () => {
  const lib = join(dirname(fileURLToPath(import.meta.url)), '..', 'mobile', 'flutter_app', 'lib');
  async function darts(dir) {
    const out = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) out.push(...await darts(p));
      else if (e.name.endsWith('.dart')) out.push(p);
    }
    return out;
  }
  // design/v3.dart holds the definitions; luno_design_v2.dart is dead
  // legacy (no imports anywhere) and keeps its own scale untouched.
  const skip = new Set(['design/v3.dart', 'luno_design_v2.dart']);
  const offenders = [];
  for (const f of await darts(lib)) {
    const rel = f.slice(lib.length + 1).replace(/\\/g, '/');
    if (skip.has(rel)) continue;
    const text = await readFile(f, 'utf8');
    for (const m of text.matchAll(/fontSize:\s*(22|17|15|12|11)(?![\d.])/g)) {
      offenders.push(`${rel}: fontSize ${m[1]}`);
    }
    for (const m of text.matchAll(/Radius\.circular\((10|14|12|22|999)(?![\d.])/g)) {
      offenders.push(`${rel}: radius ${m[1]}`);
    }
  }
  assert.deepEqual(offenders, []);
});
