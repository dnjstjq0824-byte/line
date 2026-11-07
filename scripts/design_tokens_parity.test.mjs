import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
