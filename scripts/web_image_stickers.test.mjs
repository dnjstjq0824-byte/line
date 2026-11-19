// Web image stickers: the shared contract behaves, and the client wires it
// into bubbles plus the picker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shared = await import('../apps/shared/stickers.ts');
const pane = readFileSync(new URL('../apps/user-web/src/components/MessagePane.vue', import.meta.url), 'utf8');
const view = readFileSync(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../apps/user-web/src/App.vue', import.meta.url), 'utf8');
const loader = readFileSync(new URL('../apps/shared/sticker_catalog.ts', import.meta.url), 'utf8');

test('sticker ids accept the catalog shape and reject traversal', () => {
  assert.equal(shared.IMAGE_STICKER_PREFIX, 'luno-');
  assert.ok(shared.isImageStickerId('luno-joy-003'));
  for (const bad of ['', 'lumi_hello', 'LUNO-joy-003', 'luno-../x', 'luno-a/b', 'luno- joy', ' xluno-joy-003', null, 42]) {
    assert.equal(shared.isImageStickerId(bad), false, JSON.stringify(bad));
  }
  assert.equal(shared.stickerImagePath('luno-joy-003'), '/stickers/luno-joy-003.png');
});

test('category titles fall back across locales', () => {
  const cat = { ko: '인사', en: 'Greetings' };
  assert.equal(shared.categoryTitle(cat, 'ko'), '인사');
  assert.equal(shared.categoryTitle(cat, 'en'), 'Greetings');
  assert.equal(shared.categoryTitle(cat, 'th'), 'Greetings');
  assert.equal(shared.categoryTitle(cat, 'ja'), 'Greetings');
  assert.equal(shared.categoryTitle({ ko: '인사', en: '' }, 'en'), '인사');
  assert.equal(shared.categoryTitle(null, 'ko'), '');
});

test('every catalog id is a valid image sticker id', async () => {
  const catalog = JSON.parse(readFileSync(new URL('../apps/user-web/public/stickers/catalog.json', import.meta.url), 'utf8'));
  let n = 0;
  for (const c of catalog.categories) {
    for (const it of c.items) {
      assert.ok(shared.isImageStickerId(it.id), it.id);
      n++;
    }
  }
  assert.equal(n, 200);
});

test('message bubbles render image stickers with an error fallback', () => {
  assert.ok(pane.includes('isImgSticker(msg)'), 'image branch guard');
  assert.ok(pane.includes('stickerImgSrc(msg)'), 'src helper');
  assert.ok(pane.includes('stickerImgFailed[msg.id]'), 'failed images fall through');
  assert.ok(pane.includes('bubble-sticker-img'), 'bubble class');
  assert.ok(appCss.includes('.bubble-sticker-img img'), 'bubble css');
  assert.ok(appCss.includes('.sticker-img-mini'), 'picker thumb css');
});

test('the picker loads the catalog and sends picked ids', () => {
  assert.ok(pane.includes('loadStickerCatalog()'), 'lazy catalog load');
  assert.ok(pane.includes('imgCatItems'), 'category grid');
  assert.ok(pane.includes("emit('sticker', st.id)"), 'pick sends the id');
  assert.ok(view.includes('imageStickerChar(stickerId)'), 'sent character resolved');
  assert.ok(loader.includes('/stickers/catalog.json'), 'loader url');
  assert.ok(loader.includes('inflightCatalog'), 'singleflight fetch');
});
