import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

// Item 11: screen flexibility — every clipping the audit caught on 1920px
// plus the narrow-width breaks found by the responsive probe. Each rule
// below is pinned so a restyle cannot silently reintroduce the clip.
const css = await readFile(new URL('../apps/user-web/src/App.vue', import.meta.url), 'utf8');
const messengerView = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
const messagePane = await readFile(new URL('../apps/user-web/src/components/MessagePane.vue', import.meta.url), 'utf8');
const v2 = await readFile(new URL('../apps/user-web/src/styles/luno-v2.css', import.meta.url), 'utf8');
const shell = v2; // the lx-* shell rules live at the end of the single skin (UX1)

test('rail nav scrolls internally instead of pushing actions off-screen', () => {
  assert.match(css, /\.pc-rail-top \{\s*flex: 1 1 auto;\s*min-height: 0;\s*overflow-y: auto;/);
  assert.match(css, /\.pc-rail-bottom \{\s*flex-shrink: 0;/);
});

test('translate pill never squeezes or wraps its label', () => {
  assert.match(css, /\.ai-translate-tool-pill \{\s*display: flex;\s*align-items: center;\s*flex-shrink: 0;/);
  assert.match(css, /\.ai-translate-tool-pill span \{\s*white-space: nowrap;/);
});

test('service names show in full instead of one-char ellipsis', () => {
  // FX-11 supersedes the 2-line clamp: card titles render complete.
  assert.ok(!/\.svc-names strong \{[^}]*-webkit-line-clamp/.test(css));
  assert.match(css, /\.svc-names strong \{[^}]*display: block;/);
  assert.match(css, /\.svc-status-pill \{[^}]*flex-shrink: 0;/);
  assert.match(css, /\.svc-status-pill \{[^}]*max-width: 110px;/);
  assert.match(css, /\.ecosystem-cards-grid \{[^}]*minmax\(300px, 1fr\)/);
});

test('sticker picker overlays above the dock instead of squeezing in-flow', () => {
  assert.match(css, /\.sticker-picker-popover \{[^}]*position: absolute; bottom: 100%;/);
});

test('phone tab bar: four named destinations plus More, sharing the width evenly', () => {
  // The shell replaced the floating capsule with a full-width tab bar.
  const nav = messengerView.split('const PRIMARY_NAV')[1].split('= [')[1].split(/\r?\n\]/)[0];
  assert.equal((nav.match(/\{ nav: '/g) || []).length, 4, 'four primary destinations');
  const tabbar = messengerView.split('<nav class="lx-tabbar"')[1].split('</nav>')[0];
  assert.ok(tabbar.includes('v-for="item in PRIMARY_NAV"'), 'tabs come from PRIMARY_NAV');
  assert.ok(tabbar.includes("t('lxMore')"), 'More is the fifth tab');
  assert.match(shell, /\.lx-tab \{[^}]*flex: 1;[^}]*min-width: 0;/);
  assert.match(shell, /\.lx-tabbar \{[^}]*position: fixed;[^}]*display: flex;/);
});

test('message rows cannot slide content under the avatar', () => {
  assert.match(css, /\.pc-msg-bubble-group \{\s*display: flex;\s*flex-direction: column;\s*min-width: 0;/);
});

test('C1: chat header stays one line with translate/theme/calendar in the menu', () => {
  assert.match(v2, /\.pc-chat-topbar\{[^}]*flex-wrap:nowrap/);
  assert.match(v2, /\.chat-header-title\{[^}]*text-overflow:ellipsis;white-space:nowrap/);
  assert.ok(messagePane.includes('chat-topbar-menu'), 'more menu exists');
  const actionsBlock = messagePane.split('<div class="lx-room-actions">')[1].split('chat-topbar-menu-wrap')[0];
  assert.match(shell, /\.lx-room-name-text \{[^}]*text-overflow: ellipsis; white-space: nowrap;/);
  assert.ok(!actionsBlock.includes('ai-translate-tool-pill'), 'translate pill moved into the menu');
  assert.ok(!actionsBlock.includes('cycle-wallpaper'), 'wallpaper moved into the menu');
});

test('C1: composer attachments collapse into the + panel (all nine kept)', () => {
  assert.ok(messagePane.includes('attach-panel-popover'), 'attach panel exists');
  const items = messagePane.match(/attach-panel-item"/g) || [];
  assert.equal(items.length, 9, 'all nine attach actions kept');
  for (const key of ['mvAttachSticker', 'mvAttachPhoto', 'mvAttachFile', 'mvMakePoll', 'mvAddEvent', 'mvLocationShare', 'mvShareContact', 'mvCapture', 'mvSend']) {
    assert.ok(messagePane.includes(key), `panel labels ${key}`);
  }
});

test('C1: chat touch targets meet 44px and bubbles cap at 70% on mobile', () => {
  for (const sel of ['.btn-chat-action', '.btn-tool-icon', '.btn-mobile-back']) {
    assert.match(v2, new RegExp(sel.replace(/\./g, '\\.') + '\\{[^}]*min-width:44px'));
  }
  assert.match(v2, /\.pc-msg-row\{max-width:70%/);
  assert.match(v2, /\.pc-msg-row \.pc-speech-bubble\{max-width:70%/);
});
