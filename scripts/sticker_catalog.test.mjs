// LUNO200 image stickers: the catalog is complete and every entry has a
// real SVG master plus a 480px PNG next to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(root, 'apps', 'user-web', 'public', 'stickers', 'catalog.json'), 'utf8'));
const CHARS = new Set(['lumi', 'nori', 'poko', 'luno', 'comet', 'astro']);

test('sticker catalog holds 200 entries in 8 categories of 25', () => {
  assert.equal(catalog.pack, 'luno200');
  assert.equal(catalog.count, 200);
  assert.equal(catalog.categories.length, 8);
  const ids = [];
  for (const c of catalog.categories) {
    assert.equal(c.items.length, 25, `category ${c.id}`);
    assert.ok(c.ko && c.en, `category ${c.id} titles`);
    for (const [i, it] of c.items.entries()) {
      assert.equal(it.id, `luno-${c.id}-${String(i + 1).padStart(3, '0')}`);
      assert.ok(CHARS.has(it.char), `${it.id} char`);
      assert.ok(it.label && it.label.length <= 12, `${it.id} label`);
      assert.equal(it.file, `${it.id}.png`);
      ids.push(it.id);
    }
  }
  assert.equal(new Set(ids).size, 200, 'ids unique');
});

function pngSize(path) {
  const b = readFileSync(path);
  assert.deepEqual([...b.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${path} magic`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

test('every catalog entry ships an SVG master and a 480px PNG', () => {
  for (const c of catalog.categories) {
    for (const it of c.items) {
      const svgPath = join(root, 'assets', 'stickers', 'svg', `${it.id}.svg`);
      const pngPath = join(root, 'apps', 'user-web', 'public', 'stickers', `${it.id}.png`);
      assert.ok(existsSync(svgPath), `missing ${svgPath}`);
      const svg = readFileSync(svgPath, 'utf8');
      assert.ok(svg.startsWith('<svg viewBox="0 0 400 400"'), `${it.id} canvas`);
      assert.ok(existsSync(pngPath), `missing ${pngPath}`);
      const { w, h, bytes } = pngSize(pngPath);
      assert.deepEqual([w, h], [480, 480], `${it.id} size`);
      assert.ok(bytes > 2000, `${it.id} non-trivial (${bytes}B)`);
    }
  }
  const shipped = new Set(readdirSync(join(root, 'apps', 'user-web', 'public', 'stickers')));
  assert.equal(shipped.size, 201, '200 png + catalog.json, nothing else');
});
