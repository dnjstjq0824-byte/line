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
  assert.match(shell, /\.lx-rail \{[^}]*min-height: 0;[^}]*overflow-y: auto;/);
  assert.match(shell, /\.lx-rail-foot \{ margin-top: auto;/);
});

test('translate pill never squeezes or wraps its label', () => {
  assert.match(css, /\.ai-translate-tool-pill \{\s*display: flex;\s*align-items: center;\s*flex-shrink: 0;/);
  assert.match(css, /\.ai-translate-tool-pill span \{\s*white-space: nowrap;/);
});


test('sticker picker overlays above the dock instead of squeezing in-flow', () => {
  assert.match(css, /\.sticker-picker-popover \{[^}]*position: absolute; bottom: 100%;/);
});

test('phone tab bar: four named destinations plus More, sharing the width evenly', async () => {
  // The shell replaced the floating capsule with a full-width tab bar.
  const { readFile } = await import('node:fs/promises');
  const tab = await readFile(new URL('../apps/user-web/src/components/PhoneTabBar.vue', import.meta.url), 'utf8');
  const nav = messengerView.split('const PRIMARY_NAV')[1].split('= [')[1].split(/\r?\n\]/)[0];
  assert.equal((nav.match(/\{ nav: '/g) || []).length, 4, 'four primary destinations');
  const tabbar = tab.split('<nav class="lx-tabbar"')[1].split('</nav>')[0];
  assert.ok(tabbar.includes('v-for="item in primaryNav"'), 'tabs come from primaryNav');
  assert.ok(tabbar.includes("t('lxMore')"), 'More is the fifth tab');
  assert.ok(messengerView.includes('<PhoneTabBar'), 'view renders the tab bar');
  assert.match(shell, /\.lx-tab \{[^}]*flex: 1;[^}]*min-width: 0;/);
  assert.match(shell, /\.lx-tabbar \{[^}]*position: fixed;[^}]*display: flex;/);
});

test('message rows cannot slide content under the avatar', () => {
  assert.match(css, /\.pc-msg-bubble-group \{\s*display: flex;\s*flex-direction: column;\s*min-width: 0;/);
});

test('C1: chat header stays one line with translate/theme/calendar in the menu', () => {
  assert.match(shell, /\.lx-room-head \{[^}]*display: flex;[^}]*height: 60px;/);
  assert.match(shell, /\.lx-room-name-text \{[^}]*text-overflow: ellipsis; white-space: nowrap;/);
  assert.ok(messagePane.includes('chat-topbar-menu'), 'more menu exists');
  const actionsBlock = messagePane.split('<div class="lx-room-actions">')[1].split('chat-topbar-menu-wrap')[0];
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

test('C1: phone touch targets meet 44px and bubbles get most of the width', () => {
  const phone = shell.slice(shell.indexOf('@media (max-width: 699px)'));
  assert.match(phone, /\.lx-icon-btn \{ width: 44px; height: 44px; \}/);
  assert.match(phone, /\.lx-send \{ width: 44px; height: 44px;/);
  assert.match(phone, /\.lx-room \.pc-msg-row \{ max-width: 88% !important; \}/);
  assert.match(phone, /\.lx-room \.pc-msg-row \.pc-speech-bubble \{ max-width: 100% !important; \}/);
});
