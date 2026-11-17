// A4 (F30 web): the settings window files support tickets (category, body,
// submit) and lists my tickets with their answers.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const settings = await readFile(new URL('../apps/user-web/src/components/SettingsModal.vue', import.meta.url), 'utf8');
const i18n = await readFile(new URL('../apps/user-web/src/luno-i18n.ts', import.meta.url), 'utf8');

test('settings files and lists support tickets through the server contract', () => {
  assert.ok(settings.includes("'/api/v1/support/tickets', 'POST'"), 'POST files the ticket');
  assert.ok(settings.includes("'/api/v1/support/tickets', 'GET'"), 'GET lists my tickets');
  assert.ok(settings.includes('fetchSupportTickets()'), 'mount loads my tickets');
  assert.ok(settings.includes('void fetchSupportTickets()'), 'mount does not block on tickets');
});

test('support form pins category, body and submit', () => {
  assert.ok(settings.includes('v-model="supportCategory"'), 'category select bound');
  assert.ok(settings.includes('v-model="supportBody"'), 'body field bound');
  assert.ok(settings.includes('@click="submitSupportTicket"'), 'submit wired');
  assert.ok(settings.includes('supportCategoryOptions'), 'all five server categories offered');
  for (const cat of ['account', 'chat', 'payment', 'bug', 'other']) {
    assert.ok(settings.includes(`value: '${cat}'`), `category ${cat} offered`);
  }
});

test('support list renders status and the admin answer', () => {
  assert.ok(settings.includes('v-for="tk in supportTickets"'), 'tickets rendered');
  assert.ok(settings.includes('tk.answer'), 'answer shown');
  assert.ok(settings.includes("t('supportStateAnswered')"), 'answered state labeled');
  assert.ok(settings.includes("t('supportStateOpen')"), 'open state labeled');
});

test('support strings exist in all four locales', () => {
  const keys = [
    'supportTitle', 'supportCategory', 'supportBodyPh', 'supportSubmit',
    'supportDoneNote', 'supportHistoryTitle', 'supportHistoryEmpty',
    'supportStateOpen', 'supportStateAnswered',
    'supportCatAccount', 'supportCatChat', 'supportCatPayment',
    'supportCatBug', 'supportCatOther',
  ];
  for (const key of keys) {
    assert.equal((i18n.match(new RegExp(key, 'g')) || []).length, 4, `${key} in ko/en/th/ja`);
  }
});
