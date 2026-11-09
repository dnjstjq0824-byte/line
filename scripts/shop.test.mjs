import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = await readFile(new URL('../apps/shared/shop.ts', import.meta.url), 'utf8');
const shop = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('shop parser reads the Go row shape', () => {
  const packs = shop.parseStorePacks([{ id: 'g1', title: 'Cute', description: 'd', price_minor: 2500, currency: 'KRW', status: 'published' }]);
  assert.equal(packs.length, 1);
  assert.deepEqual(packs[0], { id: 'g1', title: 'Cute', description: 'd', priceMinor: 2500, currency: 'KRW', owned: null, stickers: [] });
});

test('shop parser reads the worker pack shape', () => {
  const packs = shop.parseStorePacks([{ id: 'basic', title: 'Basic', price_minor: 0, stickers: ['a', 1], owned: true, currency: 'KRW' }]);
  assert.deepEqual(packs[0], { id: 'basic', title: 'Basic', description: '', priceMinor: 0, currency: 'KRW', owned: true, stickers: ['a'] });
});

test('shop parser skips misshapen rows and defaults safely', () => {
  const packs = shop.parseStorePacks([{ id: '', title: 'x' }, { id: 'a' }, 'junk', { id: 'ok', title: 'Ok', price_minor: 'free', currency: '' }]);
  assert.equal(packs.length, 1);
  assert.equal(packs[0].priceMinor, 0);
  assert.equal(packs[0].currency, 'KRW');
  assert.deepEqual(shop.parseStorePacks(null), []);
  assert.deepEqual(shop.parseStorePacks({}), []);
});

