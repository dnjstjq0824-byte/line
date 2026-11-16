import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

// F25 (A1): web accessibility pins for the five A1 screens — login, chat
// list, room, friends, more. The runtime axe run is scripts/axe_scan.mjs
// (needs wrangler dev + playwright); this file pins the fixes statically so
// `node --test "scripts/*.test.mjs"` guards them on every run.
const root = new URL('../', import.meta.url);
const read = (rel) => readFile(new URL(rel, root), 'utf8');

const axeHarness = await read('scripts/axe_scan.mjs');
const css = await read('apps/user-web/src/styles/luno-v2.css');
const i18n = await read('apps/user-web/src/luno-i18n.ts');
const auth = await read('apps/user-web/src/views/AuthView.vue');
const messenger = await read('apps/user-web/src/views/MessengerView.vue');
const chatList = await read('apps/user-web/src/components/ChatList.vue');
const friends = await read('apps/user-web/src/components/FriendPanel.vue');
const room = await read('apps/user-web/src/components/MessagePane.vue');
const settings = await read('apps/user-web/src/components/SettingsModal.vue');
const approval = await read('apps/user-web/src/components/ApprovalBox.vue');
const groupSettings = await read('apps/user-web/src/components/GroupSettingsModal.vue');
const appShell = await read('apps/user-web/src/App.vue');

test('axe harness scans all five A1 screens', () => {
  for (const name of ['login', 'chats', 'room', 'friends', 'more']) {
    assert.ok(axeHarness.includes(`scan(page, '${name}'`), `axe_scan.mjs must scan '${name}'`);
  }
});

// Every icon-only button (no runtime text) must expose an accessible name
// via aria-label. Buttons with real text (literals or {{ t() }}) pass.
const SYMBOL_ONLY = /^[✕↓⏺⏹️🔖📑−□›\uFE0F\s]*$/;
function iconButtonsWithoutLabel(src, file) {
  const bad = [];
  for (const m of src.matchAll(/<button\b([\s\S]*?)>([\s\S]*?)<\/button>/g)) {
    const [full, open, inner] = m;
    if (open.includes('aria-label') || open.includes('aria-labelledby')) continue;
    if (inner.includes('{{')) continue; // runtime text label
    const text = inner.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, '').trim();
    if (text === '' || SYMBOL_ONLY.test(text)) bad.push(full.slice(0, 120));
  }
  assert.deepEqual(bad, [], `${file}: icon-only buttons without aria-label`);
}

test('icon-only buttons carry aria-label on every A1 screen file', () => {
  iconButtonsWithoutLabel(auth, 'AuthView.vue');
  iconButtonsWithoutLabel(messenger, 'MessengerView.vue');
  iconButtonsWithoutLabel(chatList, 'ChatList.vue');
  iconButtonsWithoutLabel(friends, 'FriendPanel.vue');
  iconButtonsWithoutLabel(room, 'MessagePane.vue');
  iconButtonsWithoutLabel(settings, 'SettingsModal.vue');
  iconButtonsWithoutLabel(approval, 'ApprovalBox.vue');
  iconButtonsWithoutLabel(groupSettings, 'GroupSettingsModal.vue');
  iconButtonsWithoutLabel(appShell, 'App.vue');
});

test('login inputs expose labels, not placeholders alone', () => {
  for (const key of ['emailPlaceholder', 'namePlaceholder', 'passwordPlaceholder']) {
    assert.ok(auth.includes(`:aria-label="t('${key}')`), `AuthView input needs :aria-label t('${key}')`);
  }
});

test('new messages are announced through an aria-live region', () => {
  assert.ok(room.includes('aria-live="polite"'), 'MessagePane needs aria-live="polite"');
  assert.ok(room.includes('role="status"'), 'MessagePane needs role="status" live region');
  assert.ok(room.includes('latestLiveText'), 'MessagePane needs the live-region text source');
  assert.ok(room.includes('class="sr-only"'), 'live region and room heading must be screen-reader-only styled');
});

test('skip links and focus order are keyboard reachable', () => {
  assert.ok(auth.includes('lx-skip-link'), 'AuthView needs a skip link');
  assert.ok(messenger.includes('lx-skip-link'), 'MessengerView needs a skip link');
  assert.ok(auth.includes('lxSkipToMain') && messenger.includes('lxSkipToMain'), 'skip links use the lxSkipToMain phrase');
  assert.ok(chatList.includes('@keydown.space'), 'chat rows must respond to Space as well as Enter');
  assert.ok(friends.includes('@keydown.space'), 'friend rows must respond to Space as well as Enter');
});

test('skip phrase exists in all four locales', () => {
  for (const s of ['본문으로 건너뛰기', 'Skip to main content', 'ข้ามไปยังเนื้อหาหลัก', 'メインコンテンツへスキップ']) {
    assert.ok(i18n.includes(s), `luno-i18n.ts must include "${s}"`);
  }
});

test('a11y shell styles exist and no hardcoded English label remains', () => {
  assert.ok(css.includes('.sr-only'), 'luno-v2.css must define .sr-only');
  assert.ok(css.includes('.lx-skip-link'), 'luno-v2.css must define .lx-skip-link');
  assert.ok(css.includes(':focus-visible'), 'luno-v2.css must keep a visible focus style');
  assert.ok(!room.includes('aria-label="Target language"'), 'translate select must use the localized label');
});
