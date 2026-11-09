// Store catalog parsing shared by web surfaces. Annotation-free on purpose
// so the node suite can import this file verbatim (see scripts/shop.test.mjs).
// Both backend shapes parse: Go rows carry description+status, worker packs
// carry stickers[]+owned. Misshapen entries are skipped. The default keeps
// the parameter `any` (a [] or null default would infer never[]/null under
// strict tsc); the Array.isArray guard still normalizes every input.
export function parseStorePacks(packs = JSON.parse('[]')) {
  if (!Array.isArray(packs)) return [];
  const out = [];
  for (const p of packs) {
    if (!p || typeof p !== 'object') continue;
    if (typeof p.id !== 'string' || !p.id) continue;
    if (typeof p.title !== 'string' || !p.title) continue;
    const stickers = [];
    if (Array.isArray(p.stickers)) {
      for (const s of p.stickers) {
        if (typeof s === 'string') stickers.push(s);
      }
    }
    out.push({
      id: p.id,
      title: p.title,
      description: typeof p.description === 'string' ? p.description : '',
      priceMinor: typeof p.price_minor === 'number' ? Math.trunc(p.price_minor) : 0,
      currency: typeof p.currency === 'string' && p.currency ? p.currency : 'KRW',
      owned: typeof p.owned === 'boolean' ? p.owned : null,
      stickers,
    });
  }
  return out;
}
