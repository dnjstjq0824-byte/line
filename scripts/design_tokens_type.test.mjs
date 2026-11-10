import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// §7-2/§7-3 static contract: typography + bubble-grouping tokens exist in the
// canonical CSS file and are actually referenced by the app styles and the
// message template (burst lead/tail wiring).
const tokens = await readFile(new URL('../apps/user-web/src/styles/design-tokens.css', import.meta.url), 'utf8');
const appCss = await readFile(new URL('../apps/user-web/src/App.vue', import.meta.url), 'utf8');
const view = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');

test('§7-2 typography tokens exist with exact values', () => {
  for (const [name, value] of [
    ['--text-title-size', '1rem'],
    ['--text-title-weight', '600'],
    ['--text-title-leading', '1.35'],
    ['--text-list-name-size', '0.9375rem'],
    ['--text-list-name-weight', '600'],
    ['--text-list-name-leading', '1.4'],
    ['--text-bubble-size', '0.9375rem'],
    ['--text-bubble-weight', '400'],
    ['--text-bubble-leading', '1.48'],
    ['--text-input-size', '1rem'],
    ['--text-sub-size', '0.8125rem'],
    ['--text-sub-weight', '400'],
    ['--text-stamp-size', '0.6875rem'],
    ['--text-stamp-weight', '500'],
    ['--text-stamp-leading', '1.2'],
  ]) {
    assert.ok(tokens.includes(`${name}: ${value}`), `${name} must be ${value}`);
  }
  assert.ok(tokens.includes(`--font-sans: 'Pretendard Variable', Pretendard,`), 'Pretendard-first stack');
  assert.ok(tokens.includes('font-variant-numeric: tabular-nums'), 'tabular-nums utility');
});

test('§7-3 grouping tokens exist with exact values', () => {
  for (const [name, value] of [
    ['--bubble-gap-inner', '3px'],
    ['--bubble-gap-break', '12px'],
    ['--bubble-avatar-size', '36px'],
    ['--bubble-continued-indent', '44px'],
    ['--bubble-max-mobile', '76%'],
    ['--bubble-max-desktop', '520px'],
  ]) {
    assert.ok(tokens.includes(`${name}: ${value}`), `${name} must be ${value}`);
  }
});

test('§7-2 scale is applied to list, header, composer and stamps', () => {
  for (const cls of ['.chat-row-title', '.friend-item-name']) {
    assert.ok(appCss.includes(cls), `${cls} rule exists`);
  }
  assert.ok(appCss.includes('var(--text-list-name-size'), 'list names use the token');
  assert.ok(appCss.includes('var(--text-title-size'), 'header title uses the token');
  assert.ok(appCss.includes('-webkit-line-clamp: 2'), 'preview clamps to 2 lines');
  assert.ok(appCss.includes('.pc-textarea-form textarea'), 'composer rule exists');
  const composer = appCss.slice(appCss.indexOf('.pc-textarea-form textarea'));
  assert.ok(composer.slice(0, 400).includes('var(--text-input-size, 1rem)'), 'composer is fixed 16px');
  for (const cls of ['.chat-row-time', '.chat-unread-pill', '.pc-timestamp', '.pc-read-receipt', '.timer-active']) {
    const at = appCss.indexOf(cls);
    assert.ok(at >= 0, `${cls} rule exists`);
    assert.ok(appCss.slice(at, at + 600).includes('tabular-nums'), `${cls} uses tabular-nums`);
  }
});

test('§7-3 bubble tails, widths and burst wiring are applied', () => {
  const mine = appCss.indexOf('.pc-msg-row.mine .pc-speech-bubble');
  assert.ok(appCss.slice(mine, mine + 500).includes('18px) var(--radius-bubble, 18px) var(--radius-bubble-tail, 4px)'), 'mine tail 18/18/4/18');
  const theirs = appCss.indexOf('.pc-msg-row.other .pc-speech-bubble');
  assert.ok(appCss.slice(theirs, theirs + 500).includes('4px) var(--radius-bubble, 18px) var(--radius-bubble, 18px) var(--radius-bubble, 18px)'), 'theirs tail 4/18/18/18');
  assert.ok(appCss.includes('var(--bubble-max-mobile'), 'mobile max width applied');
  assert.ok(appCss.includes('var(--bubble-max-desktop'), 'desktop max width applied');
  assert.ok(appCss.includes('.pc-msg-row.group-inner'), 'group-inner spacing rule exists');
  assert.ok(appCss.includes('.pc-continued-indent'), 'continued-indent rule exists');
  for (const fn of ['function isSameBurst', 'function isGroupLead', 'function isGroupTail']) {
    assert.ok(view.includes(fn), `MessengerView defines ${fn}`);
  }
  assert.ok(view.includes(`'group-inner': !isGroupLead(msg, index)`), 'rows carry group-inner');
  assert.ok(view.includes('isGroupLead(msg, index)" class="pc-avatar'), 'avatar only on lead');
  assert.ok(view.includes('v-if="isGroupTail(msg, index)" class="pc-msg-meta"'), 'meta only on tail');
});
