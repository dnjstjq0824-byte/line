// LUNO API client for one bot token. Outbound HTTPS only.
export class LunoError extends Error {
  constructor(status, code, message) {
    super(message || `HTTP ${status}`);
    this.status = status;
    this.code = code || '';
  }
}

export class LunoClient {
  constructor({ baseUrl, token, fetchImpl = fetch, timeoutMs = 20000 }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(method, path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetch(`${this.baseUrl}/${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      throw new LunoError(0, 'NETWORK', String((error && error.message) || error));
    } finally {
      clearTimeout(timer);
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) throw new LunoError(res.status, data && data.code, (data && data.error) || `HTTP ${res.status}`);
    return data;
  }

  // presence: { state:'ready'|'busy', detail, queue, version }
  async claim(presence) {
    const data = await this.request('POST', 'bot/jobs/claim', { presence });
    return data && data.job ? data.job : null;
  }

  complete(jobId, status, extra = {}) {
    return this.request('POST', `bot/jobs/${jobId}/complete`, { status, usage: { requests: 1, tokens: 0 }, ...extra });
  }

  // clientId makes a retried post idempotent (server dedups per sender).
  async post(roomId, { kind = 'text', body, replyTo, clientId }) {
    const data = await this.request('POST', `conversations/${roomId}/messages`, {
      kind, body, ...(replyTo ? { reply_to: replyTo } : {}), ...(clientId ? { client_id: clientId } : {}),
    });
    return (data && (data.id || (data.message && data.message.id))) || '';
  }
}
