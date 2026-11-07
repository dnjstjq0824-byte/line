// Every t('key') used by the five consoles must exist in both locales,
// and both locales must define the same key set (no silent fallback gaps).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const CONSOLES = ['admin', 'partner', 'developer', 'creator', 'ads'];

function dictKeys(locale) {
  const src = readFileSync(new URL('../apps/shared/console-i18n.ts', import.meta.url), 'utf8');
  const block = locale === 'ko'
    ? src.split('const en:')[0]
    : src.split('const en:')[1].split('\n}\n\nconst CONSOLE_DICT')[0];
  return new Set([...block.matchAll(/^  '([^']+)':/gm)].map((m) => m[1]));
}

test('console i18n: ko/en key sets match', () => {
  const ko = dictKeys('ko'), en = dictKeys('en');
  assert.deepEqual([...ko].sort(), [...en].sort(), 'ko/en key mismatch');
  assert.ok(ko.size > 150, `dict too small: ${ko.size}`);
});

test('console i18n: every used key exists', () => {
  const ko = dictKeys('ko');
  const missing = [];
  for (const c of CONSOLES) {
    const src = readFileSync(new URL(`../apps/${c}-console/src/App.vue`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/\bt\('([^']+)'/g)) {
      if (!ko.has(m[1])) missing.push(`${c}:${m[1]}`);
    }
  }
  assert.deepEqual(missing, [], `missing keys: ${missing.join(', ')}`);
});
