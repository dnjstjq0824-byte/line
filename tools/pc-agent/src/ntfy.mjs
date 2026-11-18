// Minimal ntfy client (S6): content-free one-liners for completion, failure,
// approval-waiting and PC recovery. Default off; never throws.
export const NTFY_BASE_URL = 'https://ntfy.sh';
export async function ntfyPing({ topic, body, fetchImpl = fetch, baseUrl = NTFY_BASE_URL }) {
  if (!topic) return { sent: false };
  try {
    const res = await fetchImpl(`${baseUrl}/${encodeURIComponent(topic)}`, { method: 'POST', body });
    return { sent: !!(res && res.ok) };
  } catch {
    return { sent: false };
  }
}
