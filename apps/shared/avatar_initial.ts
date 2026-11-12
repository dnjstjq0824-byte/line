// Avatar initials shared by web surfaces (see scripts/avatar_initial.test.mjs).
// Splits by code point: '.slice(0, 1)' splits UTF-16 units and turns an
// emoji-leading name into a lone surrogate ('�').
// Annotation-free on purpose so the node suite can import it verbatim; the
// JSON.parse defaults keep the inferred types loose for vue-tsc (see shop.ts).
export function initialOf(name = JSON.parse('""'), fallback = JSON.parse('""')) {
  const s = typeof name === 'string' ? name : '';
  const fb = typeof fallback === 'string' ? fallback : '';
  if (!s) return fb;
  // FX-10: skip blanks; a lone surrogate, control/format char, or combining
  // mark would render as a broken glyph, so fall through to the fallback.
  for (const ch of Array.from(s.trimStart())) {
    const cp = ch.codePointAt(0) || 0;
    if (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f)) continue;
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    if (cp === 0xfeff || (cp >= 0x200b && cp <= 0x200f)) continue;
    if (cp >= 0x300 && cp <= 0x36f) continue;
    if (/\s/.test(ch)) continue;
    return ch;
  }
  return fb;
}
