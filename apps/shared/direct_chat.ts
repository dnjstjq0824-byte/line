// 1:1 room reuse shared by web surfaces. Annotation-free on purpose so the
// node suite can import this file verbatim (see scripts/direct_chat.test.mjs).
// Mirrors the worker's findDirect: kind 'direct' with exactly the two members.
export function findDirectChatId(chats = JSON.parse('[]'), myId = '', peerId = '') {
  if (!Array.isArray(chats)) return null;
  if (typeof myId !== 'string' || !myId) return null;
  if (typeof peerId !== 'string' || !peerId) return null;
  for (const c of chats) {
    if (!c || typeof c !== 'object') continue;
    if (c.kind !== 'direct') continue;
    if (typeof c.id !== 'string' || !c.id) continue;
    if (!Array.isArray(c.members)) continue;
    const ids = [];
    for (const m of c.members) {
      if (typeof m === 'string') ids.push(m);
      else if (m && typeof m === 'object' && typeof m.id === 'string') ids.push(m.id);
    }
    if (ids.length === 2 && ids.includes(myId) && ids.includes(peerId)) return c.id;
  }
  return null;
}
