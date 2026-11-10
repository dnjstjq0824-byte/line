// Day-aware conversation-row time shared by web surfaces (see
// scripts/read_time.test.mjs). Mirrors mobile listTime: clock time today, a
// caller-supplied "yesterday" word, then calendar dates. Unparseable input
// renders '' so the caller omits the time instead of misleading.
// Annotation-free on purpose so the node suite can import it verbatim.
export function listRowTime(iso = '', opts = JSON.parse('{}')) {
  if (typeof iso !== 'string' || !iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const o = opts && typeof opts === 'object' ? opts : {};
  const tag = typeof o.tag === 'string' && o.tag ? o.tag : 'ko-KR';
  const yesterday = typeof o.yesterday === 'string' ? o.yesterday : '';
  const nowMs = typeof o.nowMs === 'number' && Number.isFinite(o.nowMs) ? o.nowMs : Date.now();
  const now = new Date(nowMs);
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (day === today) {
    return new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit' }).format(at);
  }
  if (day === today - 86400000) return yesterday;
  if (at.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(tag, { month: 'numeric', day: 'numeric' }).format(at);
  }
  return new Intl.DateTimeFormat(tag, { year: 'numeric', month: 'numeric', day: 'numeric' }).format(at);
}
