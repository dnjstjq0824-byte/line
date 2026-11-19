// Image sticker (LUNO200) pure rules: id convention, file URLs, titles.
// Annotation-free on purpose so the node suite can import it directly.
// Stateful catalog loading lives in sticker_catalog.ts. Mobile mirrors
// these rules in lib/util/stickers.dart.
export const IMAGE_STICKER_PREFIX = 'luno-';

export function isImageStickerId(id = '') {
  return typeof id === 'string' && id.startsWith(IMAGE_STICKER_PREFIX) && /^[a-z0-9-]+$/.test(id);
}

export function stickerImagePath(id = '') {
  return `/stickers/${id}.png`;
}

export function categoryTitle(cat = { ko: '', en: '' }, locale = '') {
  if (!cat) return '';
  if (locale === 'ko') return cat.ko || cat.en || '';
  return cat.en || cat.ko || '';
}
