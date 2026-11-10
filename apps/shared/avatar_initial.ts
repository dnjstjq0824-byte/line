// Avatar initials shared by web surfaces (see scripts/avatar_initial.test.mjs).
// Splits by code point: '.slice(0, 1)' splits UTF-16 units and turns an
// emoji-leading name into a lone surrogate ('�').
// Annotation-free on purpose so the node suite can import it verbatim; the
// JSON.parse defaults keep the inferred types loose for vue-tsc (see shop.ts).
export function initialOf(name = JSON.parse('""'), fallback = JSON.parse('""')) {
  const s = typeof name === 'string' ? name : '';
  const fb = typeof fallback === 'string' ? fallback : '';
  if (!s) return fb;
  const first = Array.from(s)[0];
  return typeof first === 'string' && first ? first : fb;
}
