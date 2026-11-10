import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

// Item 11: screen flexibility — every clipping the audit caught on 1920px
// plus the narrow-width breaks found by the responsive probe. Each rule
// below is pinned so a restyle cannot silently reintroduce the clip.
const css = await readFile(new URL('../apps/user-web/src/App.vue', import.meta.url), 'utf8');

test('rail nav scrolls internally instead of pushing actions off-screen', () => {
  assert.match(css, /\.pc-rail-top \{\s*flex: 1 1 auto;\s*min-height: 0;\s*overflow-y: auto;/);
  assert.match(css, /\.pc-rail-bottom \{\s*flex-shrink: 0;/);
});

test('translate pill never squeezes or wraps its label', () => {
  assert.match(css, /\.ai-translate-tool-pill \{\s*display: flex;\s*align-items: center;\s*flex-shrink: 0;/);
  assert.match(css, /\.ai-translate-tool-pill span \{\s*white-space: nowrap;/);
});

test('service names wrap to two lines instead of one-char ellipsis', () => {
  assert.match(css, /\.svc-names strong \{[^}]*-webkit-line-clamp: 2;/);
  assert.match(css, /\.svc-status-pill \{[^}]*flex-shrink: 0;/);
  assert.match(css, /\.svc-status-pill \{[^}]*max-width: 110px;/);
  assert.match(css, /\.ecosystem-cards-grid \{[^}]*minmax\(300px, 1fr\)/);
});

test('sticker picker overlays above the dock instead of squeezing in-flow', () => {
  assert.match(css, /\.sticker-picker-popover \{[^}]*position: absolute; bottom: 100%;/);
});

test('mobile capsule fits six tabs without edge clipping', () => {
  assert.match(css, /\.mobile-nav-item \{[^}]*padding: 6px 12px;[^}]*flex-shrink: 0;/);
  assert.match(css, /\.luno-mobile-floating-nav \{[^}]*overflow-x: auto;/);
});

test('message rows cannot slide content under the avatar', () => {
  assert.match(css, /\.pc-msg-bubble-group \{\s*display: flex;\s*flex-direction: column;\s*min-width: 0;/);
});
