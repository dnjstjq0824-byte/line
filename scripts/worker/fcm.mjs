// Worker module: FCM pure helpers (P2 monolith split). The OAuth token cache,
// delivery and provider registration stay in cf_worker.js (per-isolate).

function fcmServiceAccount(env) {
  const raw = env && env.FCM_SERVICE_ACCOUNT_JSON;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const sa = JSON.parse(raw);
    if (sa && typeof sa.client_email === 'string' && typeof sa.private_key === 'string' && typeof sa.project_id === 'string') return sa;
  } catch { /* malformed secret: treat as unconfigured */ }
  return null;
}
function fcmB64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fcmTokenGone(status, data) {
  if (status === 404) return true;
  const details = (data && data.error && Array.isArray(data.error.details)) ? data.error.details : [];
  // Only UNREGISTERED: INVALID_ARGUMENT can also mean a malformed message,
  // and deleting every token on our own bug would silently kill push.
  return details.some((d) => d && d.errorCode === 'UNREGISTERED');
}

// Build 18: no "notification" block, so Android hands the push to the app,
// which shows the full-screen incoming-call screen (accept / decline) or, for
// call_end, removes it. A ring that arrives late is useless: short TTL.
function fcmCallMessage(token, event) {
  const ring = event.kind === 'call';
  const data = {
    kind: ring ? 'call' : 'call_end',
    conversation_id: String(event.conversation_id || ''),
    call_id: String(event.call_id || ''),
    sent_at: String(Date.now()),
  };
  if (ring) {
    data.call_kind = String(event.call_kind || 'voice');
    data.caller_name = String(event.title || 'LUNO').slice(0, 100);
    data.ring_token = String(event.ring_token || '');
  }
  return { token, data, android: { priority: 'high', ttl: ring ? '45s' : '60s' } };
}

export { fcmServiceAccount, fcmB64url, fcmTokenGone, fcmCallMessage };
