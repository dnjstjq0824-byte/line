// Audit P0-7: launch is 100% free — money UI hides until payments are
// enabled, and the terms no longer list wallet transfers as provided.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const messenger = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
const pane = await readFile(new URL('../apps/user-web/src/components/MessagePane.vue', import.meta.url), 'utf8');
const nav = await readFile(new URL('../mobile/flutter_app/lib/nav.dart', import.meta.url), 'utf8');
const more = await readFile(new URL('../mobile/flutter_app/lib/pages/more.dart', import.meta.url), 'utf8');
const apps = await readFile(new URL('../mobile/flutter_app/lib/pages/apps.dart', import.meta.url), 'utf8');
const rail = await readFile(new URL('../mobile/flutter_app/lib/design/responsive.dart', import.meta.url), 'utf8');
const home = await readFile(new URL('../mobile/flutter_app/lib/pages/home.dart', import.meta.url), 'utf8');
const chatRoom = await readFile(new URL('../mobile/flutter_app/lib/pages/chat_room.dart', import.meta.url), 'utf8');

test('P0-7: web hides the wallet entry and money buttons while off', () => {
  assert.ok(messenger.includes('v-for="item in visibleMoreItems"'), 'more grid uses the filtered list');
  assert.ok(
    messenger.includes("MORE_ITEMS.filter(entry => entry.id !== 'wallet')"),
    'wallet filtered while payments are off'
  );
  assert.ok(
    messenger.includes('<div v-if="!paymentsEnabled" class="lx-scroll">') &&
    messenger.includes("t('mvPaymentsPreparing')"),
    'direct /wallet links land on a preparing panel'
  );
  assert.ok(
    pane.includes('<button v-if="paymentsEnabled" class="attach-panel-item" @click="emit(\'send-money\')'),
    'attach-panel send-money gated'
  );
});

test('P0-7: app hides wallet entries while off', () => {
  assert.ok(nav.includes('secondaryFor({required bool payments})'), 'nav helper exists');
  assert.ok(nav.includes("secondary.where((d) => d.route != '/wallet')"), 'helper drops /wallet');
  for (const [label, src] of [['more.dart', more], ['apps.dart', apps]]) {
    assert.ok(src.includes('secondaryFor(payments:'), `${label} filters destinations`);
  }
  assert.ok(rail.includes('railFor(payments: payments)'), 'tablet rail filters');
  assert.ok(rail.includes('secondaryFor(payments: payments)'), 'console rail filters');
  assert.ok(
    home.includes('if (session.paymentsEnabled)') && home.includes("route: '/wallet'"),
    'home service button gated'
  );
  assert.ok(
    chatRoom.includes('if (session.paymentsEnabled)') && chatRoom.includes("value: 'pay'"),
    'in-chat send menu gated'
  );
});

test('P0-7: terms no longer offer wallet transfers; version tracks the worker', async () => {
  const worker = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
  const m = /const LEGAL_VERSIONS = \{ terms: '([^']+)', privacy: '([^']+)' \};/.exec(worker);
  assert.ok(m, 'worker pins legal versions');
  const terms = await readFile(new URL('../apps/user-web/public/legal/terms.html', import.meta.url), 'utf8');
  assert.ok(!terms.includes('지갑 간 송금'), 'ko terms drop wallet transfers from services');
  assert.ok(terms.includes('1차 출시 범위에서 제공되지 않으며'), 'ko terms state the free scope');
  for (const file of ['terms.html', 'terms.en.html', 'terms.ja.html', 'terms.th.html']) {
    const html = await readFile(new URL(`../apps/user-web/public/legal/${file}`, import.meta.url), 'utf8');
    assert.ok(html.includes(m[1]), `${file} header tracks worker terms ${m[1]}`);
  }
});
