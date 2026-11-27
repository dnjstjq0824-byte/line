// Build 27 dialog system: every popup on a .modal-backdrop shares one
// behaviour (v-dialog: Escape, focus trap/return, scroll lock), opens and
// closes through <Transition name="ln-modal">, and keeps its actions wired.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../apps/user-web/src/', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

test('every modal backdrop uses the shared v-dialog behaviour', async () => {
  const files = [
    ...(await readdir(new URL('components/', root))).map((f) => `components/${f}`),
    ...(await readdir(new URL('views/', root))).map((f) => `views/${f}`),
  ].filter((f) => f.endsWith('.vue'));
  const missing = [];
  for (const f of files) {
    const src = await read(f);
    for (const m of src.matchAll(/<div[^>]*class="(?:modal-backdrop|fx-modal-backdrop)[^"]*"[^>]*>/g)) {
      if (!m[0].includes('v-dialog=')) missing.push(`${f}: ${m[0].slice(0, 80)}`);
    }
    if (/v-dialog=/.test(src)) assert.match(src, /import \{ vDialog \} from '\.\.\/directives\/dialog'/, `${f} imports vDialog`);
  }
  assert.deepEqual(missing, []);
});

test('the directive closes only the topmost dialog and restores focus', async () => {
  const src = await read('directives/dialog.ts');
  assert.match(src, /stack\[stack\.length - 1\] !== el/, 'Escape is handled by the top dialog only');
  assert.match(src, /event\.isComposing/, 'IME composition (Korean/Japanese input) is not treated as Escape');
  assert.match(src, /stopPropagation\(\)/, 'Escape does not leak to the global handler');
  assert.match(src, /returnFocus/, 'focus returns to the opener');
  assert.match(src, /ln-dialog-open/, 'page scroll is locked while open');
  assert.match(src, /\(pointer: fine\)/, 'text fields auto-focus only with a fine pointer (no surprise keyboard on phones)');
});

test('messenger dialogs open and close through the ln-modal transition', async () => {
  const src = await read('views/MessengerView.vue');
  const tags = [...src.matchAll(/^(\s*)<((?:\w+Modal)|ApprovalBox)\s*$/gm)].map((m) => m[2]).filter((n) => !['CallModal', 'GroupCallModal'].includes(n));
  assert.ok(tags.length >= 20, `found ${tags.length} dialogs`);
  for (const tag of tags) {
    assert.match(src, new RegExp(`<Transition name="ln-modal">\\s*<${tag}\\b`), `${tag} is wrapped in <Transition name="ln-modal">`);
  }
});

test('the skin carries the dialog system: tokens, bottom sheet, motion, reduced motion', async () => {
  const css = await read('styles/luno-v2.css');
  for (const token of ['--ln-brand-line: #06c755', '--ln-brand-kakao: #fee500', '--ln-brand-kakao-ink: #191919', '--ln-dialog-radius: var(--ln-sheet-radius']) {
    assert.ok(css.includes(token), token);
  }
  assert.match(css, /env\(safe-area-inset-bottom\)/, 'sheet respects the home indicator');
  assert.match(css, /\.ln-modal-enter-active/, 'open motion');
  assert.match(css, /\.ln-modal-leave-active/, 'close motion');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.ln-modal-enter-active/, 'reduced motion turns the transition off');
});

test('add-friend quick options are real buttons wired to QR and invite sharing', async () => {
  const modal = await read('components/AddFriendModal.vue');
  assert.match(modal, /<button type="button" class="quick-opt-item" @click="emit\('openQr'\)">/);
  assert.match(modal, /<button type="button" class="quick-opt-item" @click="emit\('shareInvite'\)">/);
  const view = await read('views/MessengerView.vue');
  assert.match(view, /@open-qr="showAddFriendModal = false; showQrModal = true"/);
  assert.match(view, /@share-invite="shareInviteLink"/);
  assert.match(view, /\/@\$\{encodeURIComponent\(handle\)\}/, 'invite link points at the /@handle deep link');
});

test('send-money "+1만" chips add to the amount instead of replacing it', async () => {
  const src = await read('components/SendMoneyModal.vue');
  assert.match(src, /sendAmount\.value = \(Number\(sendAmount\.value\) \|\| 0\) \+ step/);
  assert.doesNotMatch(src, /@click="sendAmount = \d+"/);
});

test('modal titles carry no decorative emoji in any locale', async () => {
  const i18n = await read('luno-i18n.ts');
  const keys = ['mvNewConvo', 'mvKeepTitle', 'mvMyQr', 'mvChargeTitle', 'mvGroupTitle', 'mvEventTitle', 'mvOpenChatTitle', 'mvPwChangeTitle', 'mvPollTitle', 'mvSendMoneyTitle', 'mvStoryTitle', 'mvVoomTitle'];
  const bad = [];
  for (const k of keys) {
    for (const m of i18n.matchAll(new RegExp(String.raw`\n    ${k}: '([^']*)'`, 'g'))) {
      if (/^\p{Extended_Pictographic}/u.test(m[1])) bad.push(`${k}: ${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});
