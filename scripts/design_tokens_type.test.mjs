import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// §7-2/§7-3 static contract: typography + bubble-grouping tokens exist in the
// canonical CSS file and are actually referenced by the app styles and the
// message template (burst lead/tail wiring).
// UX1: design-tokens.css merged into styles/luno-v2.css (sole skin file).
const tokens = await readFile(new URL('../apps/user-web/src/styles/luno-v2.css', import.meta.url), 'utf8');
const appCss = await readFile(new URL('../apps/user-web/src/App.vue', import.meta.url), 'utf8');
const view = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
const pane = await readFile(new URL('../apps/user-web/src/components/MessagePane.vue', import.meta.url), 'utf8');
const format = await readFile(new URL('../apps/user-web/src/messenger-format.ts', import.meta.url), 'utf8');
const burst = await readFile(new URL('../apps/user-web/src/composables/useBurstGroups.ts', import.meta.url), 'utf8');

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
  assert.ok(tokens.includes('font-variant-numeric: tabular-nums'), 'tabular digits are used for times and counts');
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
  // The messenger shell (lx-*, end of luno-v2.css) carries the scale now.
  const rule = (sel) => {
    const m = new RegExp(`(^|\\n)${sel.replace(/[.]/g, '\\.')} \\{`).exec(tokens);
    assert.ok(m, `${sel} rule exists`);
    const at = m.index;
    return tokens.slice(at, tokens.indexOf('}', at));
  };
  assert.ok(rule('.lx-row-name').includes('var(--text-list-name-size'), 'list names use the token');
  assert.ok(rule('.lx-room-name-text').includes('var(--text-title-size'), 'room title uses the token');
  assert.ok(rule('.lx-composer-input').includes('var(--text-input-size, 1rem)'), 'composer is fixed 16px');
  assert.ok(rule('.lx-row-time').includes('tabular-nums'), 'list times use tabular digits');
  assert.ok(rule('.lx-badge').includes('tabular-nums'), 'unread badges use tabular digits');
  // Message stamps keep their pre-shell rules in App.vue.
  for (const cls of ['.pc-timestamp', '.pc-read-receipt']) {
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
  // P2 split: burst helpers live in messenger-format/useBurstGroups; the view wires them.
  assert.ok(format.includes('function isSameBurst'), 'messenger-format defines function isSameBurst');
  for (const fn of ['function isGroupLead', 'function isGroupTail']) {
    assert.ok(burst.includes(fn), `useBurstGroups defines ${fn}`);
  }
  assert.ok(view.includes('useBurstGroups(messages)'), 'view wires burst grouping to its messages');
  assert.ok(pane.includes(`'group-inner': !isGroupLead(msg, index)`), 'rows carry group-inner');
  assert.ok(pane.includes('isGroupLead(msg, index)" class="pc-avatar'), 'avatar only on lead');
  assert.ok(pane.includes('v-if="isGroupTail(msg, index)" class="pc-msg-meta"'), 'meta only on tail');
});
