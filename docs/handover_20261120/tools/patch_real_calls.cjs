// usage: node patch_real_calls.cjs <repoDir>
// Build 18 server side of "real calls":
// - call signals are stored in D1 so a callee whose app was closed can replay
//   the caller's offer / ICE after the push woke it up
// - GET calls/incoming: the ringing call waiting for me (cold start pickup)
// - GET calls/:id/signals: the stored signals from the other side
// - POST calls/:id/ring-decline: decline from the lock-screen notification
//   (no session in that background isolate; a per-call ring token instead)
// - FCM call pushes are data-only (the app draws the full-screen ring UI);
//   a call_end push clears the ring on devices that are not connected
const fs = require('fs');
const path = require('path');
const file = path.join(process.argv[2], 'scripts/cf_worker.js');
let s = fs.readFileSync(file, 'utf8');
const crlf = s.includes('\r\n');
if (crlf) s = s.replace(/\r\n/g, '\n');

function once(anchor, replacement, label) {
  const i = s.indexOf(anchor);
  if (i < 0) throw new Error(`anchor not found: ${label}`);
  if (s.indexOf(anchor, i + 1) >= 0) throw new Error(`anchor not unique: ${label}`);
  s = s.slice(0, i) + replacement + s.slice(i + anchor.length);
}
if (s.includes('luno_call_signals')) throw new Error('already patched');

// 1. schema
once("    connected_at TEXT, ended_at TEXT, result TEXT)`,\n",
  "    connected_at TEXT, ended_at TEXT, result TEXT)`,\n" +
  "  // Build 18: signals kept until the call ends, so a callee woken by a push\n" +
  "  // (socket closed while the offer went out) can replay them.\n" +
  "  `CREATE TABLE IF NOT EXISTS luno_call_signals (\n" +
  "    id INTEGER PRIMARY KEY AUTOINCREMENT, call_id TEXT NOT NULL, from_user_id TEXT NOT NULL,\n" +
  "    signal_type TEXT NOT NULL, sdp TEXT, candidate TEXT, created_at TEXT NOT NULL)`,\n" +
  "  `CREATE INDEX IF NOT EXISTS idx_call_signals_call ON luno_call_signals(call_id, id)`,\n" +
  "  // Build 18: lets the lock-screen \"decline\" button end a ringing call\n" +
  "  // without a session (the notification's background isolate has none).\n" +
  "  `CREATE TABLE IF NOT EXISTS luno_call_ring_tokens (\n" +
  "    call_id TEXT PRIMARY KEY, token TEXT NOT NULL, created_at TEXT NOT NULL)`,\n",
  'schema');

// 2. helpers next to saveCallSession
once('async function hydrateDurableConversations(userId) {',
`// Build 18: a ring older than this is stale (the caller's own no-answer
// timer ends it at 45 s; this also covers a caller whose app died).
const CALL_RING_WINDOW_MS = 60 * 1000;
const CALL_SIGNAL_CAP = 300;
async function storeCallSignal(callId, fromUserId, body) {
  const db = dbOf();
  if (!db) return;
  const type = String(body.signal_type || '');
  if (!['offer', 'answer', 'ice-candidate'].includes(type)) return;
  await ensureSchema();
  const count = await db.prepare('SELECT COUNT(*) AS n FROM luno_call_signals WHERE call_id = ?').bind(callId).first().catch(() => null);
  if (count && Number(count.n) >= CALL_SIGNAL_CAP) return;
  const cand = body.candidate === undefined || body.candidate === null ? null
    : (typeof body.candidate === 'string' ? body.candidate : JSON.stringify(body.candidate));
  await db.prepare('INSERT INTO luno_call_signals (call_id, from_user_id, signal_type, sdp, candidate, created_at) VALUES (?,?,?,?,?,?)')
    .bind(callId, fromUserId, type, typeof body.sdp === 'string' ? body.sdp.slice(0, 20000) : null, cand ? cand.slice(0, 4000) : null, now()).run().catch(() => null);
}
async function forgetCallScratch(callId) {
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  await db.prepare('DELETE FROM luno_call_signals WHERE call_id = ?').bind(callId).run().catch(() => null);
  await db.prepare('DELETE FROM luno_call_ring_tokens WHERE call_id = ?').bind(callId).run().catch(() => null);
  // Leftovers from calls that never reached an end state.
  const stale = new Date(Date.now() - 3600 * 1000).toISOString();
  await db.prepare('DELETE FROM luno_call_signals WHERE created_at < ?').bind(stale).run().catch(() => null);
  await db.prepare('DELETE FROM luno_call_ring_tokens WHERE created_at < ?').bind(stale).run().catch(() => null);
}
async function issueRingToken(callId) {
  const token = (uid() + uid()).replace(/-/g, '');
  const db = dbOf();
  if (db) {
    await ensureSchema();
    await db.prepare('INSERT OR REPLACE INTO luno_call_ring_tokens (call_id, token, created_at) VALUES (?,?,?)').bind(callId, token, now()).run().catch(() => null);
  }
  return token;
}
async function ringTokenMatches(callId, token) {
  const db = dbOf();
  if (!db || typeof token !== 'string' || token.length < 32) return false;
  await ensureSchema();
  const row = await db.prepare('SELECT token FROM luno_call_ring_tokens WHERE call_id = ?').bind(callId).first().catch(() => null);
  if (!row || typeof row.token !== 'string' || row.token.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= row.token.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
// Ends a call once: ledger row, call_status bubble, live state event, and the
// push that clears the ring on devices that never connected.
async function endCallSession(call, requested, actorId) {
  call.ended_at = now();
  call.state = 'ended';
  const duration = call.connected_at ? Math.round((Date.parse(call.ended_at) - Date.parse(call.connected_at)) / 1000) : 0;
  call.result = call.connected_at ? 'completed' : (requested === 'declined' ? 'declined' : (call.initiated_by === actorId ? 'canceled' : 'missed'));
  await saveCallSession(call);
  if (dbOf()) {
    await ensureSchema();
    await dbOf().prepare('INSERT OR IGNORE INTO call_logs (id, conversation_id, caller_id, kind, started_at, ended_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(call.id, call.conversation_id, call.initiated_by, call.kind, call.started_at, call.ended_at, call.result).run();
  }
  // A-5/A-14: the server mints the call_status bubble itself (clients are
  // forbidden from forging system kinds). Shape matches the /calls ledger.
  // D5: persisted so the call ledger survives new isolates.
  const durText = Math.floor(duration / 60) + ':' + String(duration % 60).padStart(2, '0');
  await pushPersistent(call.conversation_id, call.initiated_by, { kind: 'call_status', body: (call.kind === 'video' ? '영상통화' : '음성통화') + (duration > 0 ? ' ' + durText : ''), metadata: { call_id: call.id, call_type: call.kind, call_kind: call.kind, duration: durText, call_status: call.result, status: call.result } });
  broadcast({ type: 'call.state', call_id: call.id, conversation_id: call.conversation_id, state: 'ended', result: call.result });
  await announceCallEnd(call);
  await forgetCallScratch(call.id);
  return { result: call.result, duration };
}
async function announceCallEnd(call) {
  const conv = conversations.get(call.conversation_id) || await hydrateDurableConversation(call.conversation_id).catch(() => null);
  if (!conv) return;
  await notify(notifyEnv(), conv.members, { kind: 'call_end', conversation_id: call.conversation_id, call_id: call.id, sender_id: null }).catch(() => null);
}
async function hydrateDurableConversations(userId) {`, 'helpers');

// 3. call create: ring token in the invite and in the push
once(`    callSessions.set(call.id, call);
    await saveCallSession(call);
    const peerId = conv.members.find(x => x !== myId);`,
`    callSessions.set(call.id, call);
    await saveCallSession(call);
    const ringToken = await issueRingToken(call.id);
    const peerId = conv.members.find(x => x !== myId);`, 'create token');
once(`      has_video: call.kind === 'video',
      callkit: {`,
`      has_video: call.kind === 'video',
      ring_token: ringToken,
      callkit: {`, 'ringing payload');
once(`      body: call.kind === 'video' ? '영상 전화가 왔습니다' : '음성 전화가 왔습니다',
    });`,
`      body: call.kind === 'video' ? '영상 전화가 왔습니다' : '음성 전화가 왔습니다',
      call_id: call.id,
      call_kind: call.kind,
      ring_token: ringToken,
    });`, 'call notify');

// 4. state route: connected clears other devices' ring; end via helper
once(`      broadcast({ type: 'call.state', call_id: call.id, conversation_id: call.conversation_id, state: 'connected' });
      return json({ status: 'connected' });
    }`,
`      broadcast({ type: 'call.state', call_id: call.id, conversation_id: call.conversation_id, state: 'connected' });
      // Build 18: the callee's other devices stop ringing.
      await announceCallEnd(call);
      return json({ status: 'connected' });
    }`, 'connected');
{
  const start = s.indexOf(`    call.ended_at = now();\n    call.state = 'ended';\n    const duration = call.connected_at ?`);
  const endAnchor = `    return json({ status: 'ended', result: call.result, duration });\n  }\n`;
  const end = s.indexOf(endAnchor, start);
  if (start < 0 || end < 0) throw new Error('state end block not found');
  s = s.slice(0, start) +
`    const ended = await endCallSession(call, b.state, myId);
    return json({ status: 'ended', result: ended.result, duration: ended.duration });
  }
  // Build 18: the signals the other side sent (replayed by a callee whose
  // socket was closed when they went out). Membership is checked upstream.
  if ((m = p.match(/^calls\\/([\\w-]+)\\/signals$/)) && method === 'GET') {
    const db = dbOf();
    if (!db) return json({ signals: [] });
    await ensureSchema();
    const after = Number(url.searchParams.get('after') || 0) || 0;
    const { results } = await db.prepare('SELECT id, signal_type, sdp, candidate, from_user_id FROM luno_call_signals WHERE call_id = ? AND from_user_id != ? AND id > ? ORDER BY id LIMIT 300')
      .bind(m[1], myId, after).all().catch(() => ({ results: [] }));
    return json({ signals: (results || []).map(r => ({ id: r.id, call_id: m[1], signal_type: r.signal_type, sdp: r.sdp || undefined, candidate: r.candidate || undefined, from_user_id: r.from_user_id })) });
  }
  // Build 18: the call ringing for me right now (a cold-started app asks this
  // after the push woke it; the invite went out while its socket was closed).
  if (p === 'calls/incoming' && method === 'GET') {
    const db = dbOf();
    let call = null;
    const since = new Date(Date.now() - CALL_RING_WINDOW_MS).toISOString();
    if (db) {
      await ensureSchema();
      const row = await db.prepare("SELECT s.* FROM luno_call_sessions s JOIN luno_conversation_members m ON m.conversation_id = s.conversation_id WHERE m.user_id = ? AND s.state = 'ringing' AND s.ended_at IS NULL AND s.initiated_by IS NOT NULL AND s.initiated_by != ? AND s.started_at > ? ORDER BY s.started_at DESC LIMIT 1")
        .bind(myId, myId, since).first().catch(() => null);
      if (row) call = { id: row.id, conversation_id: row.conversation_id, kind: row.kind, initiated_by: row.initiated_by, started_at: row.started_at };
    }
    if (!call) {
      for (const c of callSessions.values()) {
        if (c.state !== 'ringing' || c.ended_at || !c.initiated_by || c.initiated_by === myId || !(c.started_at > since)) continue;
        if (!(conversations.get(c.conversation_id)?.members || []).includes(myId)) continue;
        call = c;
        break;
      }
    }
    if (!call) return json({ call: null });
    await hydrateUsersByIds([call.initiated_by]);
    const caller = usersById.get(call.initiated_by) || {};
    const tok = db ? await db.prepare('SELECT token FROM luno_call_ring_tokens WHERE call_id = ?').bind(call.id).first().catch(() => null) : null;
    return json({ call: {
      type: 'call.ringing', call_id: call.id, conversation_id: call.conversation_id, initiated_by: call.initiated_by,
      caller_name: caller.display_name || '', caller_handle: caller.handle || '', kind: call.kind || 'voice',
      has_video: call.kind === 'video', started_at: call.started_at, ...(tok ? { ring_token: tok.token } : {}),
    } });
  }
` + s.slice(end + endAnchor.length);
}

// 5. calls/incoming bypasses the per-call membership gate (it has no id)
once(`if (callPath && !['ice-servers', 'group'].includes(callPath[1])) {`,
  `if (callPath && !['ice-servers', 'group', 'incoming'].includes(callPath[1])) {`, 'gate');

// 6. store signals as they are relayed
once(`          // N2-L: relay ICE candidates too (web and app both trickle here);
          // without this only offer/answer SDP ever arrived.
          candidate: body.candidate
        });
        return json({ status: 'signaled' });`,
`          // N2-L: relay ICE candidates too (web and app both trickle here);
          // without this only offer/answer SDP ever arrived.
          candidate: body.candidate
        });
        await storeCallSignal(callSigMatch[1], authUser.id, body);
        return json({ status: 'signaled' });`, 'store signal');

// 7. lock-screen decline, before the auth gate
once(`      // Versioned profile/room photo URLs load without a bearer token.`,
`      // Build 18: "decline" on the lock-screen ring. The notification's
      // background isolate has no session; the per-call ring token (sent
      // only to the room's members) stands in for it, and only for this.
      const ringDecline = p.match(/^calls\\/([\\w-]+)\\/ring-decline$/);
      if (ringDecline && request.method === 'POST') {
        if (!await rateLimit('rl:ringdecline:' + (request.headers.get('CF-Connecting-IP') || 'unknown'), 30)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
        const body = await request.json().catch(() => ({}));
        if (!await ringTokenMatches(ringDecline[1], body.token)) return json({ error: 'call not found' }, 404);
        const call = await loadCallSession(ringDecline[1]);
        if (!call) return json({ error: 'call not found' }, 404);
        if (call.ended_at || call.state !== 'ringing') return json({ status: call.state });
        const conv = conversations.get(call.conversation_id) || await hydrateDurableConversation(call.conversation_id).catch(() => null);
        const callee = (conv?.members || []).find(x => x !== call.initiated_by) || '';
        const ended = await endCallSession(call, 'declined', callee);
        return json({ status: 'ended', result: ended.result });
      }

      // Versioned profile/room photo URLs load without a bearer token.`, 'ring decline');

// 8. FCM: calls are data-only (the app draws the ring), call_end clears it
once(`    const preview = prefsOf(row.user_id).notification_preview !== false;
    const message = {
      token: row.token,`,
`    const preview = prefsOf(row.user_id).notification_preview !== false;
    const message = (event.kind === 'call' || event.kind === 'call_end') ? fcmCallMessage(row.token, event) : {
      token: row.token,`, 'fcm message');
once(`registerPushProvider('fcm', async (env, targets, event) => {`,
`// Build 18: no "notification" block, so Android hands the push to the app,
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
registerPushProvider('fcm', async (env, targets, event) => {`, 'fcm call message');
once(`registerPushProvider('log', async (env, targets, event) => {
  const db = dbOf();
  if (!db) return;`,
`registerPushProvider('log', async (env, targets, event) => {
  if (event.kind === 'call_end') return; // a dismissal, not a notification
  const db = dbOf();
  if (!db) return;`, 'log skip');

if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(file, s);
console.log('patched', file);
