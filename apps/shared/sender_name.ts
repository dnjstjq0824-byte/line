// Group sender-name resolution shared by web surfaces. Annotation-free on
// purpose so the node suite can import this file verbatim (see
// scripts/group_sender.test.mjs). The server ships sender_name on every
// message; the members list is the fallback for backends without it.
export function senderDisplayName(msg = JSON.parse('{}'), members = JSON.parse('[]')) {
  if (msg && typeof msg === 'object') {
    if (typeof msg.sender_name === 'string' && msg.sender_name) return msg.sender_name;
    const id = msg.sender_id;
    if (typeof id === 'string' && id && Array.isArray(members)) {
      for (const m of members) {
        if (m && typeof m === 'object' && m.id === id && typeof m.display_name === 'string' && m.display_name) return m.display_name;
      }
    }
  }
  return '';
}
