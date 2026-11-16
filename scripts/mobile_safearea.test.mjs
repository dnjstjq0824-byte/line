import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Regression guard for real-device mobile Safari/Chrome: bottom-anchored UI
// (phone tab bar, chat composer) must clear the browser toolbar and
// the iPhone home indicator via env(safe-area-inset-bottom). Emulators report
// zero insets, so this is asserted statically against the CSS cascade.
const v2 = await readFile(new URL('../apps/user-web/src/styles/luno-v2.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../apps/user-web/index.html', import.meta.url), 'utf8');

// Extract the body of the first @media block whose query contains `needle`,
// honouring balanced braces (flat rules only, no nested @media inside).
function mediaBody(src, needle) {
  // Concatenate EVERY @media block whose query contains `needle`: files may
  // repeat the same breakpoint in several blocks (App.vue does).
  const parts = [];
  let from = 0;
  while (true) {
    const i = src.indexOf('@media', from);
    if (i < 0) break;
    const open = src.indexOf('{', i);
    const query = src.slice(i, open);
    // Balance-scan from the opening brace.
    let depth = 0, end = -1;
    for (let p = open; p < src.length; p++) {
      if (src[p] === '{') depth++;
      else if (src[p] === '}') { depth--; if (depth === 0) { end = p; break; } }
    }
    assert.ok(end > open, `unbalanced @media block for ${query}`);
    if (query.includes(needle)) parts.push(src.slice(open + 1, end));
    from = end + 1;
  }
  assert.ok(parts.length > 0, `missing @media containing ${needle}`);
  return parts.join('\n');
}

// All declaration bodies for rules whose selector list ends with `sel`
// (exact class match), in source order.
function ruleBodies(src, sel) {
  const out = [];
  const re = new RegExp(`([^{}]*?${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\s*\\{([^}]*)\\}`, 'g');
  let m;
  while ((m = re.exec(src))) {
    // Skip selectors where sel is followed by more selector text (e.g. descendants
    // matched via a longer alternative); the char before `{` must end the selector.
    out.push(m[2]);
  }
  return out;
}

// Effective `bottom`-family value after the cascade: later declarations win;
// the `padding` shorthand resets `padding-bottom`.
function effectivePaddingBottom(bodies) {
  let bottom = null;
  for (const body of bodies) {
    for (const decl of body.split(';')) {
      const [prop, ...rest] = decl.split(':');
      if (!prop || rest.length === 0) continue;
      const value = rest.join(':').replace(/!important/g, '').trim();
      if (prop.trim() === 'padding-bottom') bottom = value;
      else if (prop.trim() === 'padding') {
        const parts = value.split(/\s+/).filter(Boolean);
        bottom = parts.length === 1 ? parts[0]
          : parts.length === 2 ? parts[0]
          : parts.length === 3 ? parts[2]
          : parts[2];
      }
    }
  }
  return bottom;
}

function effectiveBottom(bodies) {
  let bottom = null;
  for (const body of bodies) {
    for (const decl of body.split(';')) {
      const [prop, ...rest] = decl.split(':');
      if (!prop || rest.length === 0) continue;
      if (prop.trim() === 'bottom') bottom = rest.join(':').replace(/!important/g, '').trim();
    }
  }
  return bottom;
}

function effectiveHeight(bodies) {
  let height = null;
  for (const body of bodies) {
    for (const decl of body.split(';')) {
      const [prop, ...rest] = decl.split(':');
      if (!prop || rest.length === 0) continue;
      if (prop.trim() === 'height') height = rest.join(':').replace(/!important/g, '').trim();
    }
  }
  return height;
}

// The messenger shell (lx-*) lives at the end of luno-v2.css; its phone
// block is written `@media (max-width: 699px)`.
const shellPhone = mediaBody(v2, '(max-width: 699px)');
const shellBase = v2.slice(v2.indexOf('LUNO messenger shell (lx-*)'));

test('phone tab bar clears the home indicator (safe-area bottom)', () => {
  const bodies = ruleBodies(shellPhone, '.lx-tabbar');
  const bottom = effectivePaddingBottom(bodies);
  assert.ok(bottom, 'expected a padding declaration for .lx-tabbar in the phone block');
  assert.ok(bottom.includes('env(safe-area-inset-bottom)'), `tab bar padding-bottom must include env(safe-area-inset-bottom), got: ${bottom}`);
  assert.ok(!bottom.includes('100dvh'), `tab bar must not double-count the toolbar, got: ${bottom}`);
  assert.equal(effectiveBottom(bodies), '0', 'tab bar is pinned to the bottom edge');
});

test('phone composer keeps its safe-area padding (no shorthand clobber)', () => {
  const bodies = [...ruleBodies(shellBase.split('@media')[0], '.lx-composer-dock'), ...ruleBodies(shellPhone, '.lx-composer-dock')];
  const bottom = effectivePaddingBottom(bodies);
  assert.ok(bottom, 'expected a padding declaration for .lx-composer-dock');
  assert.ok(bottom.includes('env(safe-area-inset-bottom)'), `composer padding-bottom must include env(safe-area-inset-bottom), got: ${bottom}`);
});

test('shell sizes to the dynamic viewport with a 100vh fallback', () => {
  const bodies = ruleBodies(shellBase.split('@media')[0], '.lx-shell');
  assert.equal(effectiveHeight(bodies), '100dvh', 'last height wins: dynamic viewport');
  assert.ok(bodies.join(';').includes('height: 100vh'), 'older browsers get 100vh first');
});

test('an open room follows the visible area while the keyboard is up', () => {
  assert.equal(effectiveHeight(ruleBodies(shellPhone, '.keyboard-open .lx-shell.is-detail .lx-main')), 'var(--lx-vv-h, 100dvh)');
});

test('viewport meta keeps viewport-fit=cover (safe-area insets are zero without it)', () => {
  assert.ok(index.includes('viewport-fit=cover'), 'index.html viewport meta must keep viewport-fit=cover');
});
