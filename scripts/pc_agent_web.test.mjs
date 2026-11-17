// A12 (web PC workroom): bot rooms show the runner presence line above the
// composer plus five command chips that send through the normal send path,
// mirroring mobile PcAgentBar.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const bar = await readFile(new URL('../apps/user-web/src/components/PcAgentBar.vue', import.meta.url), 'utf8').catch(() => '');
const pane = await readFile(new URL('../apps/user-web/src/components/MessagePane.vue', import.meta.url), 'utf8');
const view = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
const i18n = await readFile(new URL('../apps/user-web/src/luno-i18n.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../apps/user-web/src/styles/luno-v2.css', import.meta.url), 'utf8');

test('agent bar polls room bots and renders five command chips', () => {
  assert.ok(bar.length > 0, 'PcAgentBar.vue exists');
  assert.ok(bar.includes('conversations/${cid}/bots'), 'status API pinned');
  assert.ok(bar.includes('commands_allowed'), 'chip gate pinned');
  assert.ok(bar.includes('20000'), '20s poll like the app');
  for (const cmd of ['/status', '/git', '/check', '/continue', '/auto off']) {
    assert.ok(bar.includes(`'${cmd}'`), `chip ${cmd} present`);
  }
  assert.ok(bar.includes("emit('command'"), 'chips emit through the send path');
});

test('agent bar mirrors presence states and details', () => {
  for (const key of ['pcAgentReady', 'pcAgentBusy', 'pcAgentOffline', 'pcAgentQueue', 'pcAgentLastSeen']) {
    assert.ok(bar.includes(`t('${key}')`), `presence ${key} rendered`);
  }
  assert.ok(bar.includes('v-if="botsFor === conversationId && bots.length"') || bar.includes('v-if="bots.length'), 'bot rooms only');
});

test('message pane embeds the bar above the composer', () => {
  assert.ok(pane.includes('PcAgentBar'), 'pane imports the bar');
  assert.ok(pane.includes(':conversation-id="selectedChatId"'), 'bar tracks the open room');
  assert.ok(pane.includes('@command="emit(\'send-command\'') || pane.includes('@command="emit("send-command"'), 'commands bubble to the view');
  const barAt = pane.indexOf('<PcAgentBar');
  const formAt = pane.indexOf('<form class="lx-composer"');
  assert.ok(barAt > 0 && formAt > barAt, 'bar sits above the composer');
});

test('view sends bar commands through the normal path', () => {
  assert.ok(view.includes('@send-command="sendCommand"'), 'view handles bar commands');
  assert.ok(view.includes('function sendCommand'), 'sendCommand fills the draft and sends');
});

test('agent strings exist in all four locales', () => {
  for (const key of ['pcAgentReady', 'pcAgentBusy', 'pcAgentOffline', 'pcAgentLastSeen', 'pcAgentQueue', 'pcQuickStatus', 'pcQuickGit', 'pcQuickCheck', 'pcQuickContinue', 'pcQuickAutoOff']) {
    assert.equal((i18n.match(new RegExp(key, 'g')) || []).length, 4, `${key} in ko/en/th/ja`);
  }
});

test('agent bar styles live in the lx shell only', () => {
  for (const cls of ['lx-pcagent-bar', 'lx-pcagent-row', 'lx-pcagent-dot', 'lx-pcagent-chips', 'lx-pcagent-chip']) {
    assert.ok(css.includes(`.${cls}`), `${cls} styled`);
  }
  assert.ok(!bar.includes('<style'), 'no per-component style block');
});
