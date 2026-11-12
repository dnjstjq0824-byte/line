import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Regression guard for real-device mobile Safari/Chrome: bottom-anchored UI
// (floating nav capsule, chat input dock) must clear the browser toolbar and
// the iPhone home indicator via env(safe-area-inset-bottom). Emulators report
// zero insets, so this is asserted statically against the CSS cascade.
const v2 = await readFile(new URL('../apps/user-web/src/styles/luno-v2.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../apps/user-web/src/App.vue', import.meta.url), 'utf8');
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

const mobile700 = mediaBody(v2, 'max-width:700px');

test('mobile (<=700px) floating nav clears the Safari toolbar (safe-area bottom)', () => {
  const bottom = effectiveBottom(ruleBodies(mobile700, '.luno-mobile-floating-nav'));
  assert.ok(bottom, 'expected a bottom declaration for .luno-mobile-floating-nav in the <=700px block');
  assert.ok(
    bottom.includes('env(safe-area-inset-bottom)'),
    `nav bottom must include env(safe-area-inset-bottom), got: ${bottom}`,
  );
  // FX-01 supersedes the 100vh-100dvh term: position:fixed already anchors
  // to the visual viewport (toolbar excluded), so the extra term pushed the
  // nav a toolbar-height above the bottom on real iPhones (6 captures).
  assert.ok(
    !bottom.includes('100dvh'),
    `nav bottom must not double-count the toolbar, got: ${bottom}`,
  );
});

test('mobile (<=700px) chat input dock keeps its safe-area padding (no shorthand clobber)', () => {
  // Global rules apply first, then the <=700px block, in source order.
  const bodies = [...ruleBodies(v2.split('@media')[0], '.pc-chat-input-dock'), ...ruleBodies(mobile700, '.pc-chat-input-dock')];
  const bottom = effectivePaddingBottom(bodies);
  assert.ok(bottom, 'expected a padding declaration for .pc-chat-input-dock');
  assert.ok(
    bottom.includes('env(safe-area-inset-bottom)'),
    `dock padding-bottom must include env(safe-area-inset-bottom), got: ${bottom}`,
  );
});

test('App.vue mobile nav base also respects the safe-area inset', () => {
  const base700 = mediaBody(app, 'max-width: 700px');
  const bottom = effectiveBottom(ruleBodies(base700, '.luno-mobile-floating-nav'));
  assert.ok(bottom, 'expected a bottom declaration for .luno-mobile-floating-nav in the <=700px block');
  assert.ok(
    bottom.includes('env(safe-area-inset-bottom)'),
    `App.vue nav bottom must include env(safe-area-inset-bottom), got: ${bottom}`,
  );
  // FX-01: same double-count removal as the v2 rule above.
  assert.ok(
    !bottom.includes('100dvh'),
    `App.vue nav bottom must not double-count the toolbar, got: ${bottom}`,
  );
});

test('mobile chat room sizes to the dynamic viewport so the send dock stays visible', () => {
  const base700 = mediaBody(app, 'max-width: 700px');
  const height = effectiveHeight(ruleBodies(base700, '.pc-chat-viewport'));
  assert.ok(height, 'expected a height declaration for .pc-chat-viewport in the <=700px block');
  assert.ok(
    height.includes('100dvh'),
    `chat viewport height must resolve to 100dvh (visible area above the toolbar), got: ${height}`,
  );
});

test('viewport meta keeps viewport-fit=cover (safe-area insets are zero without it)', () => {
  assert.ok(index.includes('viewport-fit=cover'), 'index.html viewport meta must keep viewport-fit=cover');
});

