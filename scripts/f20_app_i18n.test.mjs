// Stage 10 (F20): app locales — the four ARBs carry identical key sets
// with consistent placeholders and no empty values; no hardcoded UI
// string survives in lib/ outside l10n (native picker names in
// app_l10n.dart are the documented exception); every ARB key is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const APP = new URL('../mobile/flutter_app/', import.meta.url);

async function arb(locale) {
  return JSON.parse(await readFile(new URL(`lib/l10n/app_${locale}.arb`, APP), 'utf8'));
}

test('F20: the four ARBs share one key set with consistent placeholders', async () => {
  const dicts = {};
  for (const loc of ['ko', 'en', 'th', 'ja']) dicts[loc] = await arb(loc);
  const keys = (d) => Object.keys(d).filter((k) => !k.startsWith('@')).sort();
  const base = keys(dicts.ko);
  assert.ok(base.length > 500, `substantial catalog (${base.length})`);
  for (const loc of ['en', 'th', 'ja']) {
    assert.deepEqual(keys(dicts[loc]), base, `${loc} key set matches ko`);
  }
  for (const key of base) {
    for (const loc of ['ko', 'en', 'th', 'ja']) {
      assert.ok(dicts[loc][key] && dicts[loc][key].length > 0, `${key}.${loc} non-empty`);
    }
    const ph = [...(dicts.ko[key].matchAll(/\{(\w+)\}/g))].map((m) => m[1]).sort();
    for (const loc of ['en', 'th', 'ja']) {
      const other = [...(dicts[loc][key].matchAll(/\{(\w+)\}/g))].map((m) => m[1]).sort();
      assert.deepEqual(other, ph, `${key}.${loc} placeholders match`);
    }
  }
});

async function dartFiles(dir, out = []) {
  for (const e of await readdir(new URL(dir, APP), { withFileTypes: true })) {
    const sub = `${dir}${e.name}`;
    if (e.isDirectory()) {
      if (sub === 'lib/l10n') continue;
      await dartFiles(`${sub}/`, out);
    } else if (e.name.endsWith('.dart')) out.push(sub);
  }
  return out;
}

// Hangul (all blocks) + Thai + Hiragana/Katakana + CJK Unified.
const CJK = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3\u0E00-\u0E7F\u3040-\u30FF\u4E00-\u9FFF]/;

test('F20: no hardcoded UI string survives outside l10n', async () => {
  const files = await dartFiles('lib/');
  assert.ok(files.length > 60, `scanned lib (${files.length})`);
  const offenders = [];
  for (const f of files) {
    // Native picker names are locale-independent by design (한국어 shows
    // even in the English UI), so they live in code, not in the ARBs.
    if (f === 'lib/util/app_l10n.dart') continue;
    const src = await readFile(new URL(f, APP), 'utf8');
    for (const [i, line] of src.split('\n').entries()) {
      const code = line.includes('://') ? line : line.split('//')[0];
      if (CJK.test(code)) offenders.push(`${f}:${i + 1}: ${code.trim().slice(0, 100)}`);
    }
  }
  assert.deepEqual(offenders, [], `hardcoded strings:\n${offenders.join('\n')}`);
});

test('F20: every ARB key is referenced', async () => {
  const ko = await arb('ko');
  const keys = Object.keys(ko).filter((k) => !k.startsWith('@'));
  const libFiles = await dartFiles('lib/');
  const testFiles = await dartFiles('test/');
  const hay = [];
  for (const f of [...libFiles, ...testFiles]) {
    if (f === 'lib/util/app_l10n.dart') continue;
    hay.push(await readFile(new URL(f, APP), 'utf8'));
  }
  const src = hay.join('\n');
  const dead = keys.filter((k) => !src.includes(`.${k}`) && !src.includes(`'${k}'`));
  assert.deepEqual(dead, [], `dead keys: ${dead.join(', ')}`);
});
