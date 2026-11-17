// A7 (F29 console + sheets): the web report modal offers all seven
// categories; the admin console pins the severe new categories on top and
// carries an instant-blind form wired to the hide/unhide endpoints.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const view = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
const i18n = await readFile(new URL('../apps/user-web/src/luno-i18n.ts', import.meta.url), 'utf8');
const consoleApp = await readFile(new URL('../apps/admin-console/src/App.vue', import.meta.url), 'utf8');
const consoleI18n = await readFile(new URL('../apps/shared/console-i18n.ts', import.meta.url), 'utf8');
const F29_NEW = ['illegal_filming', 'child_exploitation', 'violence'];

test('web report modal offers every server category', () => {
  for (const cat of ['spam', 'abuse', 'harassment', ...F29_NEW, 'other']) {
    assert.ok(view.includes(`<option value="${cat}">`), `option ${cat} present`);
  }
  assert.ok(view.includes('category: reportCategory.value'), 'selected category posted');
});

test('web report category labels exist in all four locales', () => {
  for (const key of ['reportCatIllegalFilming', 'reportCatChildExploitation', 'reportCatViolence']) {
    assert.equal((i18n.match(new RegExp(key, 'g')) || []).length, 4, `${key} in ko/en/th/ja`);
  }
});

test('console pins severe reports on top with an instant-blind form', () => {
  assert.ok(consoleApp.includes('sortedReports'), 'severe-first ordering');
  for (const cat of F29_NEW) {
    assert.ok(consoleApp.includes(`'${cat}'`), `severe set pins ${cat}`);
  }
  assert.ok(consoleApp.includes('v-for="r in sortedReports"'), 'list renders the ordering');
  assert.ok(consoleApp.includes("'/api/v1/admin/moderation/hide'"), 'hide wired');
  assert.ok(consoleApp.includes("'/api/v1/admin/moderation/unhide'"), 'unhide wired');
  for (const t of ['message', 'feed_post', 'community_post', 'attachment']) {
    assert.ok(consoleApp.includes(t), `hide target ${t} offered`);
  }
});

test('console blind strings exist in ko and en', () => {
  for (const key of ['admin.hideTitle', 'admin.hideType', 'admin.hideTargetPh', 'admin.hideReasonPh', 'admin.hideNow', 'admin.unhideNow', 'admin.hideDone', 'admin.unhideDone']) {
    assert.equal((consoleI18n.match(new RegExp(`'${key}'`, 'g')) || []).length, 2, `${key} in ko/en`);
  }
});
