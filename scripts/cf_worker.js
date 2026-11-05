/**
 * Cloudflare Worker Edge Gateway & Backend for LINE Messenger Monorepo.
 * Serves static assets for frontend apps and handles full /api/v1 suite directly at the edge.
 * Supports native Cloudflare WebSocketPair real-time broadcasting and multi-console workflows.
 */

// In-memory edge state for the Worker isolate
const users = new Map();
const sessions = new Map();
const revokedTokens = new Set();
let CURRENT_ENV = null;
let CURRENT_CTX = null;
const AUTH_CTX = new WeakMap();
const qrChallenges = new Map();
const phoneVerificationCodes = new Map();
const friendships = new Map();
const conversations = new Map();
const messages = new Map();
const callSessions = new Map();
const storeOrders = new Map();
const pinnedMessages = new Map();
const polls = new Map();
const pollVotes = new Map();
const albums = new Map();
const savedMessages = new Map();
const communityRooms = new Map();
const communityPosts = new Map();
const partnerOrgs = new Map();
const partnerAccounts = new Map();
const partnerTickets = new Map();
const partnerCampaigns = new Map();
const devOrgs = new Map();
const devApps = new Map();
const devWebhooks = new Map();
const devMiniApps = new Map();
const creatorProfiles = new Map();
const creatorPacks = new Map();
const creatorItems = new Map();
const adsAdvertisers = new Map();
const adsCampaigns = new Map();
const adsGroups = new Map();
const auditLogs = [];
const activeSockets = new Map();
const wsTickets = new Map();

// Extended messenger state (friends meta, chat meta, reactions, timeline, wallet, shop ...)
const usersById = new Map();
const userPrefs = new Map();
const friendMeta = new Map();
const chatMeta = new Map();
const readCursors = new Map();
const hiddenMsgs = new Map();
const reactionStore = new Map();
const noteStore = new Map();
const eventStore = new Map();
const timelinePosts = [];
const voomPosts = [];
const storyStore = [];
const wallets = new Map();
const ownedPacks = new Map();
const ownedThemes = new Map();
const officialAccounts = new Map();
const followedOfficial = new Map();
const roomMembers = new Map();
const attachmentStore = new Map();
const adminReports = [];
const MAX_ATTACHMENT_B64 = 2_000_000;
const MAX_BODY = 20000;

// Unstamped placeholder for local runs and tests. scripts/build_cf.js never edits
// this file: it writes a stamped copy to dist_worker/cf_worker.js, which is what
// wrangler.jsonc deploys, so a deploy no longer leaves the source tree dirty.
const BUILD_INFO = {
  "commit": "0000000000000000000000000000000000000000",
  "short_commit": "0000000",
  "worker_version": "v2.0.0-remediated",
  "build_time": "1970-01-01T00:00:00.000Z",
  "env": "development",
  "brand": "LUNO",
  "status": "ok"
};

const STICKER_CATALOG = [
  { id: 'basic', title: '기본 이모티콘', price_minor: 0, stickers: ['😀', '😂', '😍', '😭', '😡', '👍', '🙏', '🎉', '😴', '🤔', '🥳', '😎'] },
  { id: 'pack-1', title: '포근한 동물 친구들', price_minor: 2500, stickers: ['🐻', '🐰', '🐥', '🐱', '🐶', '🦊', '🐼', '🐨', '🐸', '🦁', '🐯', '🐷'] },
  { id: 'pack-2', title: '맛있는 하루', price_minor: 2500, stickers: ['🍕', '🍔', '🍣', '🍜', '🍰', '☕', '🍺', '🍓', '🍙', '🌮', '🍩', '🥐'] },
  { id: 'pack-3', title: '우주 탐험대', price_minor: 3500, stickers: ['🚀', '🌙', '⭐', '🪐', '👽', '🛸', '☄️', '🌍', '🔭', '🌌', '🌠', '🧑‍🚀'] }
];
const THEME_CATALOG = [
  { id: 'mint', title: '민트 브리즈', price_minor: 0 },
  { id: 'ocean', title: '오션 블루', price_minor: 0 },
  { id: 'sunset', title: '선셋 글로우', price_minor: 1500 },
  { id: 'sakura', title: '사쿠라 핑크', price_minor: 1500 },
  { id: 'midnight', title: '미드나잇', price_minor: 0 }
];
const DEFAULT_PREFS = {
  theme: 'mint', dark_mode: false, language: 'ko', font_size: 'medium',
  show_read_receipts: true, searchable_by_id: true, searchable_by_email: false,
  allow_friend_requests: true, notifications: true, notification_preview: true,
  letter_sealing: false, wallpaper: 'default'
};

function now() { return new Date().toISOString(); }
function uid() { return crypto.randomUUID(); }

// ======================================================================
// Durable persistence layer (Cloudflare D1)
// Source of truth for sessions, user-generated messages, read cursors,
// attachments and the security audit trail. In-memory Maps are only a
// per-isolate cache; every read path re-hydrates from D1 first.
// Raw access tokens are never stored: only their SHA-256 digest.
// ======================================================================
const SESSION_TTL_MS = 86400 * 1000;
const LUNO_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS luno_sessions (
    token_hash TEXT PRIMARY KEY, session_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT,
    device_name TEXT, platform TEXT, ip TEXT, created_at TEXT NOT NULL, last_seen_at TEXT,
    revoked_at TEXT, revoked_by TEXT)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_luno_sessions_sid ON luno_sessions(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_sessions_user ON luno_sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS luno_messages (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL, client_id TEXT,
    sequence INTEGER NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', metadata TEXT,
    reply_to TEXT, created_at TEXT NOT NULL, unsent INTEGER NOT NULL DEFAULT 0, edited_at TEXT)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_luno_messages_seq ON luno_messages(conversation_id, sequence)`,
  `CREATE TABLE IF NOT EXISTS luno_read_cursors (
    conversation_id TEXT NOT NULL, user_id TEXT NOT NULL, sequence INTEGER NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY (conversation_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS luno_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, action TEXT NOT NULL, target TEXT, detail TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_ws_tickets (
    ticket TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_ws_tickets_exp ON luno_ws_tickets(expires_at)`,
  `CREATE TABLE IF NOT EXISTS luno_attachments (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL,
    mime TEXT NOT NULL, size INTEGER NOT NULL, b64 TEXT NOT NULL, created_at TEXT NOT NULL)`
];
let schemaReady = null;
function dbOf() { return CURRENT_ENV && CURRENT_ENV.DB ? CURRENT_ENV.DB : null; }
async function ensureSchema() {
  const db = dbOf();
  if (!db) return false;
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const sql of LUNO_SCHEMA) await db.prepare(sql).run();
      return true;
    })().catch(err => { schemaReady = null; throw err; });
  }
  return schemaReady;
}
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function parsePbkdf2(stored) {
  if (typeof stored !== 'string' || !stored.startsWith('pbkdf2$')) return null;
  const [, salt, hash] = stored.split('$');
  return salt && hash ? { salt, hash } : null;
}
function clientInfo(request) {
  const ua = request.headers.get('User-Agent') || '';
  const cf = request.cf || {};
  const ip = request.headers.get('CF-Connecting-IP') || '';
  let platform = 'Unknown';
  if (/Android/i.test(ua)) platform = 'Android';
  else if (/iPhone|iPad|iOS/i.test(ua)) platform = 'iOS';
  else if (/Windows/i.test(ua)) platform = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) platform = 'macOS';
  else if (/Linux/i.test(ua)) platform = 'Linux';
  const agent = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : /dart|okhttp/i.test(ua) ? 'LUNO App' : 'API client';
  const location = [cf.country, cf.region, cf.city].filter(Boolean).join(' ') || '알 수 없음';
  return { ip: ip || '알 수 없음', location, platform, device_name: `${platform} · ${agent}` };
}
// ---------- Realtime tickets ----------
async function persistWsTicket(ticket, userId, expiresAt) {
  const db = dbOf();
  if (!db) return false;
  await ensureSchema();
  await db.prepare('INSERT INTO luno_ws_tickets (ticket, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(ticket, userId, expiresAt, now()).run();
  // Opportunistic cleanup; expired rows are never redeemable anyway.
  await db.prepare('DELETE FROM luno_ws_tickets WHERE expires_at <= ?').bind(Date.now()).run().catch(() => {});
  return true;
}

// Returns the granted user id, or null. One use only: the row is deleted in the
// same statement that reads it, so two concurrent upgrades cannot both win.
async function redeemWsTicket(ticket) {
  if (!ticket) return null;
  const db = dbOf();
  if (db) {
    // Drop any local copy first so this isolate cannot honour it after the
    // authoritative row is gone.
    wsTickets.delete(ticket);
    await ensureSchema();
    const row = await db
      .prepare('DELETE FROM luno_ws_tickets WHERE ticket = ? AND expires_at > ? RETURNING user_id')
      .bind(ticket, Date.now())
      .first()
      .catch(() => null);
    return row && row.user_id ? row.user_id : null;
  }
  // No database: a single isolate's Map is all there is.
  const local = wsTickets.get(ticket);
  if (!local) return null;
  wsTickets.delete(ticket);
  return local.expiresAt > Date.now() ? local.userId : null;
}

async function persistAudit(actor, action, target, detail) {
  addAudit(actor, action, target);
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  await db.prepare('INSERT INTO luno_audit (actor, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(actor || null, action, target || null, detail ? JSON.stringify(detail) : null, now()).run();
}

// ---------- Sessions ----------
async function createSession(user, request) {
  const token = `cf-token-${user.id}.${crypto.randomUUID()}`;
  const sessionId = crypto.randomUUID();
  const created = now();
  const info = clientInfo(request);
  sessions.set(token, { user_id: user.id, role: user.role, device_id: sessionId, created_at: created, device_name: info.device_name, platform: info.platform, ip: info.ip });
  const db = dbOf();
  if (db) {
    await ensureSchema();
    await db.prepare('INSERT INTO luno_sessions (token_hash, session_id, user_id, role, device_name, platform, ip, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(await sha256Hex(token), sessionId, user.id, user.role || 'user', info.device_name, info.platform, info.ip, created, created).run();
  }
  await recordLoginEvent(user, sessionId, info);
  return { token, deviceId: sessionId };
}
async function findSessionById(sid) {
  const db = dbOf();
  if (db) {
    await ensureSchema();
    const row = await db.prepare('SELECT session_id, user_id, revoked_at FROM luno_sessions WHERE session_id = ?').bind(sid).first();
    return row && !row.revoked_at ? { session_id: row.session_id, user_id: row.user_id } : null;
  }
  for (const s of sessions.values()) if (s.device_id === sid) return { session_id: sid, user_id: s.user_id };
  return null;
}
async function revokeSessionById(sid, by) {
  const db = dbOf();
  if (db) {
    await ensureSchema();
    await db.prepare('UPDATE luno_sessions SET revoked_at = ?, revoked_by = ? WHERE session_id = ? AND revoked_at IS NULL').bind(now(), by, sid).run();
  }
  for (const [tok, s] of Array.from(sessions)) if (s.device_id === sid) { sessions.delete(tok); revokedTokens.add(tok); }
}
async function revokeOtherSessions(userId, keepSid, by) {
  const db = dbOf();
  if (db) {
    await ensureSchema();
    await db.prepare('UPDATE luno_sessions SET revoked_at = ?, revoked_by = ? WHERE user_id = ? AND session_id <> ? AND revoked_at IS NULL').bind(now(), by, userId, keepSid || '').run();
  }
  for (const [tok, s] of Array.from(sessions)) {
    if (s.user_id === userId && s.device_id !== keepSid) { sessions.delete(tok); revokedTokens.add(tok); }
  }
}
async function listSessionsFor(userId, currentSid) {
  const db = dbOf();
  if (db) {
    await ensureSchema();
    const { results } = await db.prepare('SELECT session_id, device_name, platform, ip, created_at, last_seen_at FROM luno_sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 50').bind(userId).all();
    const cutoff = Date.now() - SESSION_TTL_MS;
    return (results || []).filter(r => Date.parse(r.created_at) > cutoff).map(r => ({
      id: r.session_id, device_id: r.session_id, name: r.device_name || '기기', platform: r.platform || '', ip: r.ip || '',
      trusted: false, current: r.session_id === currentSid, created_at: r.created_at, last_seen_at: r.last_seen_at || r.created_at
    }));
  }
  const out = [];
  for (const s of sessions.values()) if (s.user_id === userId) {
    out.push({ id: s.device_id, device_id: s.device_id, name: s.device_name || '기기', platform: s.platform || '', ip: s.ip || '', trusted: false, current: s.device_id === currentSid, created_at: s.created_at || null, last_seen_at: s.created_at || null });
  }
  return out;
}
async function persistPassword(user) {
  const db = dbOf();
  if (!db || !user.pw_hash || !user.pw_salt) return;
  await ensureSchema();
  await db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").bind(`pbkdf2$${user.pw_salt}$${user.pw_hash}`, user.id).run();
}

// ---------- Messages / read state ----------
function rowToMessage(r) {
  let metadata;
  if (r.metadata) { try { metadata = JSON.parse(r.metadata); } catch { metadata = undefined; } }
  const m = {
    id: r.id, conversation_id: r.conversation_id, sender_id: r.sender_id, client_id: r.client_id, sequence: r.sequence,
    kind: r.kind, body: r.body ?? '', reply_to: r.reply_to || undefined, metadata, created_at: r.created_at, persisted: true
  };
  if (r.unsent) m.unsent = true;
  if (r.edited_at) m.edited_at = r.edited_at;
  return m;
}
function applyRows(cid, rows) {
  const conv = conversations.get(cid);
  const keep = (messages.get(cid) || []).filter(m => !m.persisted);
  const list = keep.concat(rows.map(rowToMessage)).sort((a, b) => a.sequence - b.sequence);
  messages.set(cid, list);
  if (conv) {
    const max = list.reduce((a, m) => Math.max(a, m.sequence || 0), 0);
    if (max > (conv.last_sequence || 0)) conv.last_sequence = max;
    const lastAt = list.length ? list[list.length - 1].created_at : null;
    if (lastAt && String(lastAt) > String(conv.updated_at || '')) conv.updated_at = lastAt;
  }
}
async function hydrateConversation(cid) {
  const db = dbOf();
  if (!db || !cid) return;
  await ensureSchema();
  const { results } = await db.prepare('SELECT * FROM luno_messages WHERE conversation_id = ? ORDER BY sequence DESC LIMIT 500').bind(cid).all();
  applyRows(cid, (results || []).reverse());
}
async function hydrateCursors(userId) {
  const db = dbOf();
  if (!db || !userId) return;
  await ensureSchema();
  const { results } = await db.prepare('SELECT conversation_id, sequence FROM luno_read_cursors WHERE user_id = ?').bind(userId).all();
  for (const r of results || []) {
    const key = `${r.conversation_id}:${userId}`;
    if (r.sequence > (readCursors.get(key) || 0)) readCursors.set(key, r.sequence);
  }
}
async function hydrateUserConversations(userId) {
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  const cids = Array.from(conversations.values()).filter(c => c.members.includes(userId)).map(c => c.id);
  if (cids.length) {
    const ph = cids.map(() => '?').join(',');
    const { results } = await db.prepare(
      `SELECT * FROM (SELECT m.*, ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY sequence DESC) AS rn FROM luno_messages m WHERE conversation_id IN (${ph})) WHERE rn <= 200 ORDER BY conversation_id, sequence`
    ).bind(...cids).all();
    const byConv = new Map();
    for (const r of results || []) { if (!byConv.has(r.conversation_id)) byConv.set(r.conversation_id, []); byConv.get(r.conversation_id).push(r); }
    for (const cid of cids) applyRows(cid, byConv.get(cid) || []);
  }
  await hydrateCursors(userId);
}
async function persistCursor(cid, userId, seq) {
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  await db.prepare('INSERT INTO luno_read_cursors (conversation_id, user_id, sequence, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(conversation_id, user_id) DO UPDATE SET sequence = MAX(sequence, excluded.sequence), updated_at = excluded.updated_at')
    .bind(cid, userId, seq, now()).run();
}
async function persistMessageUpdate(msg) {
  const db = dbOf();
  if (!db || !msg.persisted) return;
  await ensureSchema();
  await db.prepare('UPDATE luno_messages SET body = ?, metadata = ?, unsent = ?, edited_at = ? WHERE id = ?')
    .bind(msg.body ?? '', msg.metadata ? JSON.stringify(msg.metadata) : null, msg.unsent ? 1 : 0, msg.edited_at || null, msg.id).run();
}
// Append a message durably. The (conversation_id, sequence) unique index arbitrates
// concurrent writers on different isolates; on a collision we re-hydrate and retry.
async function pushPersistent(cid, senderId, fields) {
  const db = dbOf();
  if (!db) return pushMessage(cid, senderId, fields);
  for (let attempt = 0; attempt < 5; attempt++) {
    await hydrateConversation(cid);
    const msg = pushMessage(cid, senderId, fields, true);
    try {
      await db.prepare('INSERT INTO luno_messages (id, conversation_id, sender_id, client_id, sequence, kind, body, metadata, reply_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(msg.id, cid, senderId, msg.client_id || null, msg.sequence, msg.kind, msg.body ?? '', msg.metadata ? JSON.stringify(msg.metadata) : null, msg.reply_to || null, msg.created_at).run();
    } catch (err) {
      messages.set(cid, (messages.get(cid) || []).filter(m => m.id !== msg.id));
      const conv = conversations.get(cid);
      if (conv) conv.last_sequence = msg.sequence - 1;
      if (attempt < 4 && /UNIQUE|constraint/i.test(String(err && err.message))) continue;
      throw err;
    }
    msg.persisted = true;
    broadcast({ type: 'message.created', conversation_id: cid, message: msg });
    return msg;
  }
}
// A security notice exists only because a real login happened (never on read).
async function recordLoginEvent(user, sessionId, info) {
  if (!user || !user.id || officialAccounts.has(user.id)) return;
  ensureDefaultConversationsForUser(user.id);
  const cid = `conv-oa-notice-${user.id}`;
  await pushPersistent(cid, 'oa-notice', {
    kind: 'security_notice', body: '로그인 성공',
    metadata: { session_id: sessionId, ip: info.ip, location: info.location, device: info.device_name, platform: info.platform }
  });
  const real = (messages.get(cid) || []).filter(m => m.kind === 'security_notice' && m.metadata && m.metadata.session_id);
  if (real.length > 5) {
    const drop = new Set(real.slice(0, real.length - 5).map(m => m.id));
    messages.set(cid, (messages.get(cid) || []).filter(m => !drop.has(m.id)));
    const db = dbOf();
    if (db) for (const id of drop) await db.prepare('DELETE FROM luno_messages WHERE id = ?').bind(id).run();
  }
}

// ---------- Attachments ----------
async function persistAttachment(att) {
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  await db.prepare('INSERT INTO luno_attachments (id, conversation_id, owner_id, name, mime, size, b64, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(att.id, att.conversation_id, att.owner, att.name, att.mime, att.size, att.b64, now()).run();
}
async function loadAttachment(id) {
  if (!id) return null;
  const hit = attachmentStore.get(id);
  if (hit) return hit;
  const db = dbOf();
  if (!db) return null;
  await ensureSchema();
  const r = await db.prepare('SELECT * FROM luno_attachments WHERE id = ?').bind(String(id)).first();
  if (!r) return null;
  const att = { id: r.id, owner: r.owner_id, conversation_id: r.conversation_id, name: r.name, mime: r.mime, size: r.size, b64: r.b64 };
  attachmentStore.set(att.id, att);
  return att;
}

// ---------- LUNO editorial SAMPLE content (G-4: explicitly labelled, not real press) ----------
const NEWS_SAMPLE = [
  {
    "id": "news-hero-01",
    "title": "단독 \"SKY 학벌 중시하는 서울, 삶의 질은 세계 113위\"",
    "press": "LUNO 에디토리얼(샘플)",
    "category": "경제",
    "published_at": "2026-10-31T08:50:00.000Z",
    "image_url": "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80",
    "summary": "서울의 글로벌 경쟁력과 정주 여건을 종합 평가한 결과, 교육열과 학벌 지표 대비 삶의 질 지수는 113위로 나타났다...",
    "content": "서울의 글로벌 경쟁력과 삶의 질을 다각도로 분석한 글로벌 도시 지수 보고서에 따르면, 한국 수도권의 높은 교육열과 고학력 집중도에도 불구하고 주거비 부담, 근로 시간, 통근 거리 등의 영향으로 삶의 질 순위는 113위에 머문 것으로 조사되었습니다. 전문가들은 지속 가능한 도시 발전을 위해 주거 안정과 문화 공간 확충이 시급하다고 지적했습니다.",
    "sample": true
  },
  {
    "id": "news-hero-02",
    "title": "[샘플] 뉴스 카드 예시 2",
    "press": "LUNO 에디토리얼(샘플)",
    "category": "IT/과학",
    "published_at": "2026-10-31T08:42:00.000Z",
    "image_url": "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80",
    "summary": "화면 구성을 확인하기 위한 샘플 콘텐츠입니다.",
    "content": "이 항목은 LUNO 뉴스 탭의 레이아웃 확인용 샘플이며, 실제 보도 내용이 아닙니다.",
    "sample": true
  },
  {
    "id": "news-hero-03",
    "title": "미 연준 금리 동결 시사… 아시아 증시 일제히 강세 출발",
    "press": "LUNO 에디토리얼(샘플)",
    "category": "경제",
    "published_at": "2026-10-31T08:28:00.000Z",
    "image_url": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop&q=80",
    "summary": "글로벌 인플레이션 둔화 지표가 확인되면서 코스피와 나스닥 선물 지수가 동반 상승세를 기록 중이다...",
    "content": "주요국 물가 상승률이 안정권에 접어들면서 기술주와 반도체 섹터를 중심으로 외국인 매수세가 유입되고 있습니다.",
    "sample": true
  },
  {
    "id": "news-hero-04",
    "title": "K-콘텐츠 글로벌 열풍 지속… 신작 드라마 아시아 12개국 1위",
    "press": "LUNO 에디토리얼(샘플)",
    "category": "엔터",
    "published_at": "2026-10-31T08:15:00.000Z",
    "image_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80",
    "summary": "주말 첫 방송을 시작한 한국 드라마가 일본, 태국, 대만 등 아시아 주요 OTT 차트 정상을 석권했다...",
    "content": "탄탄한 각본과 배우들의 열연이 어우러진 신작 드라마가 글로벌 팬들의 호평 속에 기록적인 시청 시간을 달성하고 있습니다.",
    "sample": true
  },
  {
    "id": "news-hero-05",
    "title": "[샘플] 뉴스 카드 예시 5",
    "press": "LUNO 에디토리얼(샘플)",
    "category": "글로벌",
    "published_at": "2026-10-31T08:00:00.000Z",
    "image_url": "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80",
    "summary": "화면 구성을 확인하기 위한 샘플 콘텐츠입니다.",
    "content": "이 항목은 LUNO 뉴스 탭의 레이아웃 확인용 샘플이며, 실제 보도 내용이 아닙니다.",
    "sample": true
  },
  {
    "id": "news-pop-01",
    "rank": 1,
    "title": "시청자 콱 물었다...시청률 '12.9%' 인기→종영 20년 만에 다시 부활한 韓 드라마",
    "press": "LUNO 에디토리얼(샘플)",
    "category": "엔터",
    "published_at": "2026-10-31T08:35:00.000Z",
    "image_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80",
    "summary": "20년 만에 리메이크된 명작 드라마가 첫 방송부터 두 자릿수 시청률을 기록하며 화제의 중심에 섰다...",
    "content": "20년 전 안방극장을 뜨겁게 달궜던 명작 드라마가 현대적 감각으로 재해석되어 돌아왔습니다. 첫 방송부터 최고 시청률 12.9%를 돌파하며 OTT 플랫폼과 방송가에서 뜨거운 반응을 이끌어내고 있습니다.",
    "sample": true
  },
  {
    "id": "news-pop-02",
    "rank": 2,
    "title": "[샘플] 뉴스 카드 예시 7",
    "press": "LUNO 에디토리얼(샘플)",
    "category": "엔터",
    "published_at": "2026-10-31T08:20:00.000Z",
    "image_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80",
    "summary": "화면 구성을 확인하기 위한 샘플 콘텐츠입니다.",
    "content": "이 항목은 LUNO 뉴스 탭의 레이아웃 확인용 샘플이며, 실제 보도 내용이 아닙니다.",
    "sample": true
  },
  {
    "id": "news-pop-03",
    "rank": 3,
    "title": "[샘플] 뉴스 카드 예시 8",
    "press": "LUNO 에디토리얼(샘플)",
    "category": "IT/과학",
    "published_at": "2026-10-31T08:00:00.000Z",
    "image_url": "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=300&auto=format&fit=crop&q=80",
    "summary": "화면 구성을 확인하기 위한 샘플 콘텐츠입니다.",
    "content": "이 항목은 LUNO 뉴스 탭의 레이아웃 확인용 샘플이며, 실제 보도 내용이 아닙니다.",
    "sample": true
  },
  {
    "id": "news-pop-04",
    "rank": 4,
    "title": "한국은행 \"연내 디지털 화폐(CBDC) 실거래 테스트 본격화\"",
    "press": "LUNO 에디토리얼(샘플)",
    "category": "경제",
    "published_at": "2026-10-31T07:00:00.000Z",
    "image_url": "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=300&auto=format&fit=crop&q=80",
    "summary": "중앙은행 디지털화폐(CBDC) 실증 실험이 일반 시민과 상점을 대상으로 확대 진행된다...",
    "content": "한국은행은 디지털 금융 혁신을 가속화하기 위해 주요 시중은행 및 핀테크 플랫폼과 연계한 CBDC 실거래 테스트를 연내 착수한다고 밝혔습니다.",
    "sample": true
  }
];


async function pbkdf2(password, saltHex) {
  try {
    const salt = Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16)));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 1000 }, key, 256);
    return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}
async function setPassword(user, password) {
  user.raw_password = password;
  user.password = password;
  try {
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
    user.pw_salt = salt;
    user.pw_hash = await pbkdf2(password, salt);
  } catch {
    // fallback
  }
}
async function checkPassword(user, password) {
  if (!user || typeof password !== 'string') return false;
  const REVOKED_LEGACY_PASSWORDS = new Set(['LineAdmin#2026!', 'LineUser#2026!', 'Admin#2026!', 'User#2026!']);
  if (REVOKED_LEGACY_PASSWORDS.has(password)) return false;
  if (user.password && user.password === password) return true;
  if (user.raw_password && user.raw_password === password) return true;
  if (user.pw_hash && (user.pw_hash === password || user.pw_hash === 'sha256:' + password)) return true;
  if (user.password_hash && (user.password_hash === password || user.password_hash === 'sha256:' + password)) return true;
  if (user.pw_hash && user.pw_salt) {
    const hash = await pbkdf2(password, user.pw_salt);
    if (hash && hash === user.pw_hash) return true;
  }
  return false;
}
async function hashPendingPasswords() {
  for (const u of users.values()) {
    if (u.password && !u.pw_hash) {
      await setPassword(u, u.password);
    }
  }
}

function publicUser(u) {
  if (!u) return null;
  const o = officialAccounts.get(u);
  if (o) return { id: o.id, display_name: o.name, handle: o.handle, bio: o.description, official: true, avatar_color: o.color };
  return {
    id: u.id, display_name: u.display_name, handle: u.handle, bio: u.bio || '',
    status_message: u.status_message || '', avatar_color: u.avatar_color || '#06c755',
    birthday: u.birthday || '', avatar_url: u.avatar_url || ''
  };
}
function userBrief(id) {
  if (officialAccounts.has(id)) return publicUser(id);
  return publicUser(usersById.get(id));
}
function prefsOf(userId) {
  if (!userPrefs.has(userId)) userPrefs.set(userId, { ...DEFAULT_PREFS });
  return userPrefs.get(userId);
}
function walletOf(userId) {
  if (!wallets.has(userId)) wallets.set(userId, { balance: 50000, tx: [] });
  return wallets.get(userId);
}
function packsOf(userId) {
  if (!ownedPacks.has(userId)) ownedPacks.set(userId, new Set(['basic']));
  return ownedPacks.get(userId);
}
function themesOf(userId) {
  if (!ownedThemes.has(userId)) ownedThemes.set(userId, new Set(THEME_CATALOG.filter(t => t.price_minor === 0).map(t => t.id)));
  return ownedThemes.get(userId);
}
function fMeta(me, friend) {
  const k = `${me}:${friend}`;
  if (!friendMeta.has(k)) friendMeta.set(k, { favorite: false, hidden: false, blocked: false, nickname: '' });
  return friendMeta.get(k);
}
function cMeta(cid, userId) {
  const k = `${cid}:${userId}`;
  if (!chatMeta.has(k)) chatMeta.set(k, { pinned: false, muted: false, hidden: false });
  return chatMeta.get(k);
}
function isFriend(a, b) { return friendships.has(`${a}:${b}`); }
function friendIds(userId) {
  const out = [];
  for (const key of friendships.keys()) {
    const [a, b] = key.split(':');
    if (a === userId) out.push(b);
  }
  return out;
}
function reactionCounts(mid) {
  const r = reactionStore.get(mid);
  const out = {};
  if (r) for (const [emoji, set] of r) if (set.size) out[emoji] = set.size;
  return out;
}
function decorateMessage(msg, viewerId, cid) {
  const conv = conversations.get(cid);
  const cursorSeqs = (conv ? conv.members : []).filter(m => m !== msg.sender_id && !officialAccounts.has(m))
    .map(m => readCursors.get(`${cid}:${m}`) || 0);
  const out = { ...msg, reactions: reactionCounts(msg.id), read_count: cursorSeqs.filter(s => s >= msg.sequence).length };
  const mine = [];
  const r = reactionStore.get(msg.id);
  if (r) for (const [emoji, set] of r) if (set.has(viewerId)) mine.push(emoji);
  out.my_reactions = mine;
  if (msg.reply_to) {
    const orig = (messages.get(cid) || []).find(m => m.id === msg.reply_to);
    if (orig) out.reply_preview = { sender_id: orig.sender_id, kind: orig.kind, body: orig.unsent ? '' : String(orig.body).slice(0, 80), unsent: !!orig.unsent };
  }
  return out;
}
function unreadFor(cid, userId) {
  const cursor = readCursors.get(`${cid}:${userId}`) || 0;
  return (messages.get(cid) || []).filter(m => m.sequence > cursor && m.sender_id !== userId && !m.unsent && m.kind !== 'system').length;
}
function mentionedIn(cid, userId) {
  const cursor = readCursors.get(`${cid}:${userId}`) || 0;
  return (messages.get(cid) || []).some(m => m.sequence > cursor && m.sender_id !== userId && !m.unsent &&
    (m.metadata?.mentions || []).some(x => x === userId || x === 'all'));
}
function pushMessage(cid, senderId, fields, deferBroadcast = false) {
  const conv = conversations.get(cid);
  conv.last_sequence = (conv.last_sequence || 0) + 1;
  conv.updated_at = now();
  const msg = {
    id: uid(), conversation_id: cid, sender_id: senderId, client_id: fields.client_id || uid(),
    sequence: conv.last_sequence, kind: fields.kind || 'text', body: fields.body ?? '',
    reply_to: fields.reply_to || undefined, metadata: fields.metadata || undefined, created_at: now()
  };
  const list = messages.get(cid) || [];
  list.push(msg);
  messages.set(cid, list);
  if (!officialAccounts.has(senderId)) readCursors.set(`${cid}:${senderId}`, msg.sequence);
  if (!deferBroadcast) broadcast({ type: 'message.created', conversation_id: cid, message: msg });
  return msg;
}
function systemMessage(cid, body) {
  return pushMessage(cid, 'system', { kind: 'system', body });
}
function chatSummary(conv, viewerId) {
  const list = messages.get(conv.id) || [];
  const last = list.filter(m => !(hiddenMsgs.get(viewerId)?.has(m.id))).at(-1);
  const meta = cMeta(conv.id, viewerId);
  const memberBriefs = conv.members.map(userBrief).filter(Boolean);
  let title = conv.title;
  if (conv.kind === 'direct') {
    const other = conv.members.find(m => m !== viewerId);
    const o = userBrief(other);
    if (o) title = fMeta(viewerId, other).nickname || o.display_name;
  }
  return {
    id: conv.id, kind: conv.kind, title, last_sequence: conv.last_sequence || 0,
    unread_count: unreadFor(conv.id, viewerId), mentioned: mentionedIn(conv.id, viewerId),
    updated_at: conv.updated_at, owner_id: conv.owner_id || null, notice: conv.notice || '',
    pinned: meta.pinned, muted: meta.muted, hidden: meta.hidden, badge_n: !!conv.badge_n,
    member_count: conv.members.length, members: memberBriefs, official: !!conv.official,
    last_message: last ? { id: last.id, kind: last.kind, body: last.unsent ? '' : String(last.body).slice(0, 120), unsent: !!last.unsent, sender_id: last.sender_id, created_at: last.created_at } : null
  };
}
function botReply(text, account) {
  const t = String(text || '').toLowerCase();
  if (/안녕|hello|hi\b/.test(t)) return `안녕하세요! ${account.name} 공식계정입니다. 👋 '도움말'이라고 입력해 보세요.`;
  if (/도움|help/.test(t)) return '사용 가능한 명령: 안녕, 날씨, 쿠폰, 공지, 도움말';
  if (/날씨|weather/.test(t)) return '오늘 서울은 맑음 ☀️ 최고 21°C / 최저 12°C 입니다.';
  if (/쿠폰|coupon/.test(t)) return '🎟️ 신규 친구 10% 할인 쿠폰: WELCOME10';
  if (/공지|notice/.test(t)) return '📢 이번 주 업데이트: 타임라인·VOOM·Pay 기능이 추가되었습니다.';
  return '메시지를 받았습니다. 자세한 안내는 "도움말"을 입력해 주세요.';
}
function seedExtras() {
  const alice = users.get('alice@line-test.local');
  const bob = users.get('bob@line-test.local');
  const demo = users.get('user@line.local');
  const colors = { 'admin@line.local': '#6366f1', 'user@line.local': '#06c755', 'alice@line-test.local': '#f97316', 'bob@line-test.local': '#0ea5e9' };
  const status = { 'admin@line.local': '운영 중 🛠️', 'user@line.local': '오늘도 좋은 하루 ☀️', 'alice@line-test.local': '커피 한 잔의 여유 ☕', 'bob@line-test.local': '코딩 중... 💻' };
  for (const [email, u] of users) {
    u.avatar_color = colors[email] || '#06c755';
    u.status_message = status[email] || '';
    usersById.set(u.id, u);
  }
  friendships.set(`${demo.id}:${alice.id}`, true);
  friendships.set(`${alice.id}:${demo.id}`, true);
  friendships.set(`${demo.id}:${bob.id}`, true);
  friendships.set(`${bob.id}:${demo.id}`, true);
  alice.birthday = new Date().toISOString().slice(5, 10);

  for (const [id, name, handle, description, color] of [
    ['oa-notice', 'LUNO 공식 안내', '@luno_notice', 'LUNO 서비스 소식과 업데이트를 전해드립니다.', '#315BCD'],
    ['oa-weather', '날씨 알리미', '@weather', '매일 아침 날씨를 알려드립니다.', '#0ea5e9'],
    ['oa-deals', '오늘의 특가', '@deals', '친구 전용 쿠폰과 특가 소식', '#f43f5e']
  ]) officialAccounts.set(id, { id, name, handle, description, color });

  const bg = ['linear-gradient(135deg,#06c755,#0ea5e9)', 'linear-gradient(135deg,#f97316,#f43f5e)', 'linear-gradient(135deg,#6366f1,#ec4899)', 'linear-gradient(135deg,#14b8a6,#84cc16)'];
  timelinePosts.push(
    { id: uid(), author_id: alice.id, body: '오늘 한강 노을이 너무 예뻐요 🌇', bg: bg[1], visibility: 'friends', created_at: now(), likes: [bob.id], comments: [] },
    { id: uid(), author_id: bob.id, body: '새 프로젝트 배포 완료! 🚀', bg: bg[0], visibility: 'friends', created_at: now(), likes: [], comments: [] }
  );
  storyStore.push(
    { id: uid(), author_id: alice.id, body: '☕ 카페 투어', bg: bg[1], created_at: now(), viewers: [] },
    { id: uid(), author_id: bob.id, body: '🏃 러닝 5km', bg: bg[3], created_at: now(), viewers: [] }
  );
  [
    ['고양이의 하루 🐱', '🐱', alice.id], ['주말 브런치 레시피 🍳', '🍳', bob.id], ['한강 러닝 vlog 🏃', '🏃', alice.id],
    ['코딩 ASMR ⌨️', '⌨️', bob.id], ['도쿄 야경 🌃', '🌃', alice.id], ['홈카페 라떼아트 ☕', '☕', bob.id]
  ].forEach(([title, emoji, author], i) => voomPosts.push({
    id: uid(), title, emoji, author_id: author, bg: bg[i % bg.length], likes: i * 3, liked_by: [], comments: [], created_at: now()
  }));
  noteStore.set('00000000-0000-0000-0000-000000000010', []);
  eventStore.set('00000000-0000-0000-0000-000000000010', []);
  const conv = conversations.get('00000000-0000-0000-0000-000000000010');
  conv.owner_id = alice.id;
  readCursors.set(`${conv.id}:${alice.id}`, 1);
}

const featureFlags = [
  { key: 'e2ee_letter_sealing', enabled: true, description: 'Signal Letter-Sealing End-to-End Encryption' },
  { key: 'webrtc_group_calling', enabled: true, description: 'Multi-party Voice & Video Calling' },
  { key: 'ai_smart_replies', enabled: true, description: 'AI-assisted quick responses' },
  { key: 'openchat_live_streaming', enabled: true, description: 'Public community voice stages' }
];

// =====================================================================
// Cross-isolate realtime delivery
//
// activeSockets below is a per-isolate Map, so it can only ever reach clients
// that happen to be served by this same isolate. A UserSocketHub Durable
// Object -- one per user id -- owns that user's sockets instead, so a write on
// any isolate reaches every device of every recipient.
//
// Both paths are kept. With no USER_HUB binding (local tests, or a deployment
// that has not enabled Durable Objects) the hub calls are no-ops and the
// previous per-isolate behaviour stands unchanged. With the binding present the
// /ws upgrade is handed to the hub, so activeSockets stays empty in this
// isolate and there is no double delivery.
// =====================================================================
function hubBinding() {
  return CURRENT_ENV && CURRENT_ENV.USER_HUB ? CURRENT_ENV.USER_HUB : null;
}

async function hubDeliver(userIds, payload) {
  const hub = hubBinding();
  if (!hub) return 0;
  const unique = Array.from(new Set(Array.from(userIds || []).filter(Boolean)));
  if (!unique.length) return 0;
  const body = JSON.stringify(payload);
  const results = await Promise.all(unique.map(async userId => {
    try {
      const stub = hub.get(hub.idFromName(String(userId)));
      const res = await stub.fetch('https://user-hub.internal/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });
      return res && res.ok ? 1 : 0;
    } catch (err) {
      // A hub that cannot be reached must never fail the write that triggered it:
      // the message is already committed and will be picked up by the next fetch.
      console.error('[LUNO hub push failed]', userId, err && err.message ? err.message : err);
      return 0;
    }
  }));
  return results.reduce((a, b) => a + b, 0);
}

// Every call site is synchronous fire-and-forget. Keep that contract and let the
// runtime finish the delivery after the response has been returned.
function hubFanOut(userIds, payload) {
  if (!hubBinding()) return;
  const task = hubDeliver(userIds, payload);
  if (CURRENT_CTX && typeof CURRENT_CTX.waitUntil === 'function') CURRENT_CTX.waitUntil(task);
  else task.catch(() => {});
}

// The recipients of a broadcast: conversation members, or the members of a
// public community room.
function broadcastRecipients(payload) {
  const conversationId = payload.conversation_id || callSessions.get(payload.call_id)?.conversation_id;
  const conversation = conversations.get(conversationId);
  if (conversation) return conversation.members || [];
  if (payload.room_id && communityRooms.get(payload.room_id)?.visibility === 'public') {
    return Array.from((roomMembers.get(payload.room_id) || new Map()).keys());
  }
  return [];
}

function notifyUser(userId, payload) {
  hubFanOut([userId], payload);
  const msg = JSON.stringify(payload);
  for (const [ws, socketUserId] of activeSockets) {
    if (socketUserId !== userId) continue;
    try {
      ws.send(msg);
    } catch {
      activeSockets.delete(ws);
    }
  }
}

function broadcast(payload) {
  hubFanOut(broadcastRecipients(payload), payload);
  const msg = JSON.stringify(payload);
  const conversationId = payload.conversation_id || callSessions.get(payload.call_id)?.conversation_id;
  const conversation = conversations.get(conversationId);
  const publicRoom = payload.room_id && communityRooms.get(payload.room_id)?.visibility === 'public';
  if (!conversation && !publicRoom) return;
  for (const [ws, userId] of activeSockets) {
    if (conversation && !conversation.members.includes(userId)) continue;
    try {
      ws.send(msg);
    } catch {
      activeSockets.delete(ws);
    }
  }
}

// Helper: Seed default accounts and base data if empty
function ensureSeed(env) {
  if (users.size > 0) return;
  const seedPassword = (name, fallback) => {
    const configured = env && env[name];
    return typeof configured === 'string' && configured.length > 0 ? configured : fallback;
  };

  const seeds = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@line.local',
      password: seedPassword('ADMIN_INITIAL_PASSWORD', 'LunoAdmin#RotatedEdge$99xK'),
      display_name: 'System Administrator',
      role: 'admin',
      handle: 'admin',
      bio: 'Cloudflare Edge Master Admin'
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      email: 'user@line.local',
      password: seedPassword('DEMO_INITIAL_PASSWORD', 'LunoUser#Rotated$72mP'),
      display_name: 'LUNO Demo User',
      role: 'user',
      handle: 'luno_user',
      bio: 'LUNO Global Messenger User'
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      email: 'alice@line-test.local',
      password: 'Alice#Rotated$48wT',
      display_name: 'Alice Kim',
      role: 'user',
      handle: 'alice_kim',
      bio: 'Alice in Cloudflare'
    },
    {
      id: '00000000-0000-0000-0000-000000000004',
      email: 'bob@line-test.local',
      password: 'Bob#Rotated$31qR',
      display_name: 'Bob Lee',
      role: 'user',
      handle: 'bob_lee',
      bio: 'Bob in Cloudflare'
    }
  ];

  for (const s of seeds) {
    users.set(s.email.toLowerCase(), s);
    usersById.set(s.id, s);
  }

  // Pre-seed friendship between Alice and Bob
  const alice = users.get('alice@line-test.local');
  const bob = users.get('bob@line-test.local');
  friendships.set(`${alice.id}:${bob.id}`, true);
  friendships.set(`${bob.id}:${alice.id}`, true);

  // Pre-seed default direct conversation
  const convId = '00000000-0000-0000-0000-000000000010';
  conversations.set(convId, {
    id: convId,
    kind: 'direct',
    title: 'Alice & Bob',
    members: [alice.id, bob.id],
    last_sequence: 1,
    updated_at: new Date().toISOString()
  });
  messages.set(convId, [
    {
      id: '00000000-0000-0000-0000-000000000100',
      conversation_id: convId,
      sender_id: alice.id,
      client_id: 'welcome-msg-1',
      sequence: 1,
      kind: 'text',
      body: 'Welcome to Cloudflare Global Messenger!',
      created_at: new Date().toISOString()
    }
  ]);

  // Pre-seed OpenChat room
  communityRooms.set('room-1', {
    id: 'room-1',
    name: 'LINE Global Developer Lounge',
    description: 'Cloudflare Edge OpenChat for engineers and creators',
    visibility: 'public',
    created_at: new Date().toISOString()
  });
  communityPosts.set('room-1', [
    { id: 'post-1', room_id: 'room-1', author_name: 'LineBot', body: 'Welcome to OpenChat on Cloudflare Edge!', created_at: new Date().toISOString() }
  ]);
  seedExtras();
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      ...headers
    }
  });
}

// Authentication is session-backed only: a token is valid iff its digest exists in D1 (or the
// in-memory store when no D1 is bound), has not been revoked and is inside its TTL. The old
// stateless "cf-token-<userId>.*" fallback accepted any forged token and is removed.
async function loadUserFromD1(id) {
  const db = dbOf();
  if (!db) return null;
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!row) return null;
  const hashed = parsePbkdf2(row.password_hash);
  const u = {
    id: row.id, email: row.email,
    password: hashed ? undefined : row.password_hash, pw_hash: hashed ? hashed.hash : undefined, pw_salt: hashed ? hashed.salt : undefined,
    display_name: row.display_name || row.email.split('@')[0], role: row.email.includes('admin') ? 'admin' : 'user',
    bio: row.bio || '', status_message: row.status_message || '', created_at: row.created_at
  };
  users.set(row.email.toLowerCase(), u);
  usersById.set(u.id, u);
  return u;
}
async function getAuthUser(request) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token || revokedTokens.has(token)) return null;
  let session = sessions.get(token);
  const db = dbOf();
  if (db) {
    await ensureSchema();
    const row = await db.prepare('SELECT session_id, user_id, role, created_at, revoked_at FROM luno_sessions WHERE token_hash = ?').bind(await sha256Hex(token)).first();
    if (!row || row.revoked_at || Date.parse(row.created_at) + SESSION_TTL_MS < Date.now()) {
      sessions.delete(token);
      return null;
    }
    session = { ...(session || {}), user_id: row.user_id, role: row.role, device_id: row.session_id, created_at: row.created_at };
    sessions.set(token, session);
  } else if (!session) {
    return null;
  }
  const userId = session.user_id;
  let user = usersById.get(userId) || Array.from(users.values()).find(u => u.id === userId) || null;
  if (!user) user = await loadUserFromD1(userId);
  if (!user || user.state === 'suspended' || user.state === 'deleted') return null;
  AUTH_CTX.set(request, { token, session_id: session.device_id });
  return user;
}

function sendTo(userIds, payload) {
  hubFanOut(userIds, payload);
  const msg = JSON.stringify(payload);
  const set = new Set(userIds);
  for (const [ws, userId] of activeSockets) {
    if (!set.has(userId)) continue;
    try { ws.send(msg); } catch { activeSockets.delete(ws); }
  }
}
async function readJson(request) {
  const text = await request.text().catch(() => '');
  if (text.length > 3_000_000) return {};
  try { const v = JSON.parse(text || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function clip(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function bad(message, status = 400) { return json({ error: message }, status); }
function intIn(v, min, max) {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}
function findDirect(a, b) {
  for (const c of conversations.values()) {
    if (c.kind === 'direct' && c.members.length === 2 && c.members.includes(a) && c.members.includes(b)) return c;
  }
  return null;
}
function createConversation(fields) {
  const c = { id: uid(), last_sequence: 0, updated_at: now(), ...fields };
  conversations.set(c.id, c);
  messages.set(c.id, []);
  return c;
}
function addAudit(actor, action, target) {
  auditLogs.unshift({ id: auditLogs.length + 1, actor_user_id: actor, action, target_id: target, created_at: now() });
}
function pollView(poll, viewerId) {
  const voters = new Set();
  poll.options.forEach(o => o.voters.forEach(v => voters.add(v)));
  return {
    id: poll.id, conversation_id: poll.conversation_id, question: poll.question, multiple: poll.multiple,
    closed: poll.closed, created_by: poll.created_by, created_at: poll.created_at, total_voters: voters.size,
    options: poll.options.map(o => ({ id: o.id, text: o.text, votes: o.voters.size, voted: o.voters.has(viewerId) }))
  };
}
function timelineView(post, viewerId) {
  return {
    id: post.id, author: userBrief(post.author_id), body: post.body, bg: post.bg, visibility: post.visibility,
    created_at: post.created_at, like_count: post.likes.length, liked: post.likes.includes(viewerId),
    comments: post.comments.map(c => ({ ...c, author: userBrief(c.author_id) }))
  };
}
function voomView(v, viewerId) {
  return {
    id: v.id, title: v.title, emoji: v.emoji, bg: v.bg, author: userBrief(v.author_id), created_at: v.created_at,
    like_count: v.likes + v.liked_by.length, liked: v.liked_by.includes(viewerId),
    comments: v.comments.map(c => ({ ...c, author: userBrief(c.author_id) }))
  };
}
const MESSAGE_KINDS = new Set(['text', 'sticker', 'image', 'video', 'voice', 'file', 'location', 'contact', 'pay', 'transfer', 'ciphertext', 'call_status', 'security_notice']);
const pushTokens = new Map();
const deviceKeys = new Map();
const userKeys = new Map();
const groupCallRooms = new Map();
const richMenus = new Map();
const creatorSettlements = new Map();
const REACTIONS = ['❤️', '😍', '😂', '😮', '😢', '👍'];
const INLINE_MIME = /^(image\/(png|jpeg|gif|webp)|audio\/(webm|ogg|mp4|mpeg|wav)|video\/(mp4|webm))$/;

/**
 * Extended LINE-class messenger API. Returns a Response when a route is handled, otherwise null.
 * Membership of /conversations/{id}/* and /calls/{id}/* is enforced by the caller before this runs.
 */

const PEER_USERS = [
  { id: 'peer-k', display_name: 'K 🙏', handle: 'k_pray', email: 'k@luno.local', avatar_color: '#315BCD', status_message: '기도하며 준비 중' },
  { id: 'peer-dodo', display_name: '도천재 도도형님', handle: 'dodo_genius', email: 'dodo@luno.local', avatar_color: '#06c755', status_message: '최고의 개발자' },
  { id: 'peer-daechul', display_name: '이대철', handle: 'daechul_lee', email: 'daechul@luno.local', avatar_color: '#8b5cf6', status_message: '' },
  { id: 'peer-tuk', display_name: 'tuk', handle: 'tuk_official', email: 'tuk@luno.local', avatar_color: '#f59e0b', status_message: 'Online' },
  { id: 'peer-care', display_name: '😸care😸', handle: 'care_cat', email: 'care@luno.local', avatar_color: '#ec4899', status_message: 'Thank you' },
  { id: 'peer-nunsinee', display_name: 'Nunsinee8995', handle: 'nunsinee8995', email: 'nunsinee@luno.local', avatar_color: '#14b8a6', status_message: 'BKK ✨' },
  { id: 'peer-spasdream', display_name: '"Spasdream ✨', handle: 'spasdream', email: 'spasdream@luno.local', avatar_color: '#6366f1', status_message: 'Seoul trip' },
  { id: 'peer-tonggg', display_name: "TONGGG'", handle: 'tonggg', email: 'tonggg@luno.local', avatar_color: '#10b981', status_message: 'Hi there' },
  { id: 'peer-bbiw', display_name: 'B_biw', handle: 'b_biw', email: 'bbiw@luno.local', avatar_color: '#0ea5e9', status_message: 'Sunset lover' },
  { id: 'peer-hyungchul', display_name: '형철♡위', handle: 'hyungchul_wi', email: 'hyungchul@luno.local', avatar_color: '#f43f5e', status_message: '행복하자 ♡' },
  { id: 'peer-breezy', display_name: 'breezy_au', handle: 'breezy_au', email: 'breezy@luno.local', avatar_color: '#84cc16', status_message: 'IG: _breezy_au' },
  { id: 'peer-woralak', display_name: 'Woralak Duethesong', handle: 'woralak_d', email: 'woralak@luno.local', avatar_color: '#06b6d4', status_message: 'Bangkok' },
  { id: 'peer-adhd', display_name: 'ADHD환자', handle: 'adhd_joy', email: 'adhd@luno.local', avatar_color: '#f97316', status_message: 'hahaha' },
  { id: 'peer-suhyun', display_name: '2016217012 박수현', handle: 'suhyun_park', email: 'suhyun@luno.local', avatar_color: '#a855f7', status_message: '졸업 프로젝트 중' },
  { id: 'peer-andrew', display_name: 'andrew', handle: 'andrew_dev', email: 'andrew@luno.local', avatar_color: '#3b82f6', status_message: 'Building products' },
  { id: 'peer-andy', display_name: 'Andy', handle: 'andy_kr', email: 'andy@luno.local', avatar_color: '#0284c7', status_message: 'Coffee first ☕' },
  { id: 'peer-annie', display_name: 'Annie', handle: 'annie_lee', email: 'annie@luno.local', avatar_color: '#e11d48', status_message: 'Have a lovely day' },
  { id: 'peer-apinan', display_name: 'Apinan 🐶', handle: 'iamapinan', email: 'apinan@luno.local', avatar_color: '#4f46e5', status_message: '@iamapinan' }
];

function initPeerUsers() {
  for (const p of PEER_USERS) {
    if (!usersById.has(p.id)) {
      const u = {
        ...p,
        role: 'user',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      };
      users.set(p.email, u);
      usersById.set(p.id, u);
    }
  }
}

function resolveConversationId(cid, userId) {
  if (!cid) return cid;
  if (cid === 'oa-notice' || cid === 'chat-sec-01' || cid === 'oa_notice') {
    return `conv-oa-notice-${userId}`;
  }
  if (cid === 'keep-memo' || cid === 'chat-keep') return `conv-keep-${userId}`;
  if (cid === 'chat-k-01') return `conv-k-${userId}`;
  if (cid === 'chat-dodo-01') return `conv-dodo-${userId}`;
  if (cid === 'chat-daechul-01') return `conv-daechul-${userId}`;
  if (cid === 'chat-tuk-01') return `conv-tuk-${userId}`;
  if (cid === 'chat-care-01') return `conv-care-${userId}`;
  if (cid === 'chat-woralak-01') return `conv-woralak-${userId}`;
  return cid;
}

function ensureDefaultConversationsForUser(userId) {
  if (!userId) return;
  initPeerUsers();

  // Ensure all peer friendships exist for this user
  for (const p of PEER_USERS) {
    friendships.set(`${userId}:${p.id}`, true);
    friendships.set(`${p.id}:${userId}`, true);
  }

  // 0. Keep 메모 (Self-chat memo room)
  const keepCid = `conv-keep-${userId}`;
  if (!conversations.has(keepCid)) {
    conversations.set(keepCid, {
      id: keepCid,
      kind: 'direct',
      title: 'Keep 메모',
      members: [userId],
      last_sequence: 2,
      updated_at: '2026-08-01T11:30:00Z'
    });
    messages.set(keepCid, [
      { id: `m-keep-${userId}-1`, conversation_id: keepCid, sender_id: userId, client_id: 'keep-1', sequence: 1, kind: 'text', body: '나에게 보내는 Keep 메모입니다. 텍스트, 링크, 사진, 파일을 자유롭게 보관하세요.', read_count: 1, created_at: '2026-08-01T11:00:00Z' },
      { id: `m-keep-${userId}-2`, conversation_id: keepCid, sender_id: userId, client_id: 'keep-2', sequence: 2, kind: 'text', body: 'https://line-messenger.dnjstjqppk.workers.dev/ 프로덕션 점검 완료', read_count: 1, created_at: '2026-08-01T11:30:00Z' }
    ]);
  }

  // 1. Official Security Notice Channel
  const secCid = `conv-oa-notice-${userId}`;
  if (!conversations.has(secCid)) {
    conversations.set(secCid, {
      id: secCid,
      kind: 'official',
      title: 'LUNO 보안 알림',
      members: [userId, 'oa-notice'],
      official: true,
      last_sequence: 2,
      unread_count: 2,
      updated_at: new Date().toISOString()
    });
    messages.set(secCid, [
      {
        id: `msg-sec-${userId}-1`,
        conversation_id: secCid,
        sender_id: 'oa-notice',
        client_id: `sec-${userId}-1`,
        sequence: 1,
        kind: 'security_notice',
        body: '로그인 성공',
        metadata: {
          ip: '49.172.105.64',
          location: 'South Korea Seoul Eunpyeong-gu',
          device: 'WINDOWS PC',
          sample: true
        },
        created_at: '2026-08-01T10:00:00Z'
      },
      {
        id: `msg-sec-${userId}-2`,
        conversation_id: secCid,
        sender_id: 'oa-notice',
        client_id: `sec-${userId}-2`,
        sequence: 2,
        kind: 'security_notice',
        body: '로그인 성공',
        metadata: {
          ip: '49.172.105.64',
          location: 'South Korea Seoul Eunpyeong-gu',
          device: 'WINDOWS PC',
          sample: true
        },
        created_at: '2026-08-01T10:59:00Z'
      }
    ]);
  }

  // 2. K 🙏 (Direct Chat with Call Bubbles from Screenshot 1 & 7)
  const kCid = `conv-k-${userId}`;
  if (!conversations.has(kCid)) {
    conversations.set(kCid, {
      id: kCid,
      kind: 'direct',
      title: 'K 🙏',
      members: [userId, 'peer-k'],
      last_sequence: 9,
      updated_at: '2026-10-27T13:55:30Z'
    });
    messages.set(kCid, [
      { id: `m-k-${userId}-1`, conversation_id: kCid, sender_id: userId, client_id: 'k-1', sequence: 1, kind: 'text', body: '이제 탔음', read_count: 1, created_at: '2026-10-23T16:30:00Z' },
      { id: `m-k-${userId}-2`, conversation_id: kCid, sender_id: userId, client_id: 'k-2', sequence: 2, kind: 'text', body: '범계 도착임', read_count: 1, created_at: '2026-10-23T17:15:00Z' },
      { id: `m-k-${userId}-3`, conversation_id: kCid, sender_id: userId, client_id: 'k-3', sequence: 3, kind: 'call_status', body: '음성통화', metadata: { duration: '1:35', call_type: 'voice', call_status: 'completed' }, created_at: '2026-10-23T17:16:00Z' },
      { id: `m-k-${userId}-4`, conversation_id: kCid, sender_id: 'peer-k', client_id: 'k-4', sequence: 4, kind: 'call_status', body: '음성통화', metadata: { duration: '0:29', call_type: 'voice', call_status: 'completed' }, created_at: '2026-10-23T22:23:00Z' },
      { id: `m-k-${userId}-5`, conversation_id: kCid, sender_id: userId, client_id: 'k-5', sequence: 5, kind: 'call_status', body: '취소', metadata: { call_type: 'voice', call_status: 'cancelled' }, created_at: '2026-10-24T20:58:00Z' },
      { id: `m-k-${userId}-6`, conversation_id: kCid, sender_id: 'peer-k', client_id: 'k-6', sequence: 6, kind: 'call_status', body: '부재중 전화', metadata: { call_type: 'voice', call_status: 'missed' }, created_at: '2026-10-24T17:34:00Z' },
      { id: `m-k-${userId}-7`, conversation_id: kCid, sender_id: userId, client_id: 'k-7', sequence: 7, kind: 'call_status', body: '음성통화', metadata: { duration: '9:24', call_type: 'voice', call_status: 'completed' }, created_at: '2026-10-27T17:52:00Z' },
      { id: `m-k-${userId}-8`, conversation_id: kCid, sender_id: 'peer-k', client_id: 'k-8', sequence: 8, kind: 'call_status', body: '부재중 전화', metadata: { call_type: 'voice', call_status: 'missed' }, created_at: '2026-10-27T13:55:00Z' },
      { id: `m-k-${userId}-9`, conversation_id: kCid, sender_id: 'peer-k', client_id: 'k-9', sequence: 9, kind: 'text', body: '바쁘십니까', created_at: '2026-10-27T13:55:30Z' }
    ]);
  }

  // 3. 도천재 도도형님
  const dodoCid = `conv-dodo-${userId}`;
  if (!conversations.has(dodoCid)) {
    conversations.set(dodoCid, {
      id: dodoCid,
      kind: 'direct',
      title: '도천재 도도형님',
      members: [userId, 'peer-dodo'],
      badge_n: true,
      last_sequence: 1,
      updated_at: '2026-10-30T10:00:00Z'
    });
    messages.set(dodoCid, [
      { id: `m-dodo-${userId}-1`, conversation_id: dodoCid, sender_id: 'peer-dodo', client_id: 'dodo-1', sequence: 1, kind: 'text', body: '새 친구와 지금 대화를 시작해보세요!', created_at: '2026-10-30T10:00:00Z' }
    ]);
    readCursors.set(`${dodoCid}:${userId}`, 1);
  }

  // 4. 😸care😸 (Screenshot 1 & 8)
  const careCid = `conv-care-${userId}`;
  if (!conversations.has(careCid)) {
    conversations.set(careCid, {
      id: careCid,
      kind: 'direct',
      title: '😸care😸',
      members: [userId, 'peer-care'],
      last_sequence: 1,
      updated_at: '2026-10-09T14:20:00Z'
    });
    messages.set(careCid, [
      { id: `m-care-${userId}-1`, conversation_id: careCid, sender_id: 'peer-care', client_id: 'care-1', sequence: 1, kind: 'text', body: 'Thank you', created_at: '2026-10-09T14:20:00Z' }
    ]);
  }

  // 5. Nunsinee8995 (Screenshot 1)
  const nunsineeCid = `conv-nunsinee-${userId}`;
  if (!conversations.has(nunsineeCid)) {
    conversations.set(nunsineeCid, {
      id: nunsineeCid,
      kind: 'direct',
      title: 'Nunsinee8995',
      members: [userId, 'peer-nunsinee'],
      last_sequence: 1,
      updated_at: '2026-09-30T15:00:00Z'
    });
    messages.set(nunsineeCid, [
      { id: `m-nunsinee-${userId}-1`, conversation_id: nunsineeCid, sender_id: 'peer-nunsinee', client_id: 'nunsinee-1', sequence: 1, kind: 'text', body: 'Ok', created_at: '2026-09-30T15:00:00Z' }
    ]);
    readCursors.set(`${nunsineeCid}:${userId}`, 1);
  }

  // 6. "Spasdream ✨ (Screenshot 1)
  const spasdreamCid = `conv-spasdream-${userId}`;
  if (!conversations.has(spasdreamCid)) {
    conversations.set(spasdreamCid, {
      id: spasdreamCid,
      kind: 'direct',
      title: '"Spasdream ✨',
      members: [userId, 'peer-spasdream'],
      last_sequence: 1,
      updated_at: '2026-09-29T18:20:00Z'
    });
    messages.set(spasdreamCid, [
      { id: `m-spasdream-${userId}-1`, conversation_id: spasdreamCid, sender_id: 'peer-spasdream', client_id: 'spasdream-1', sequence: 1, kind: 'text', body: 'oppa arrive seoul', created_at: '2026-09-29T18:20:00Z' }
    ]);
    readCursors.set(`${spasdreamCid}:${userId}`, 1);
  }

  // 7. TONGGG' (Screenshot 1)
  const tongggCid = `conv-tonggg-${userId}`;
  if (!conversations.has(tongggCid)) {
    conversations.set(tongggCid, {
      id: tongggCid,
      kind: 'direct',
      title: "TONGGG'",
      members: [userId, 'peer-tonggg'],
      last_sequence: 1,
      updated_at: '2026-09-26T16:10:00Z'
    });
    messages.set(tongggCid, [
      { id: `m-tonggg-${userId}-1`, conversation_id: tongggCid, sender_id: 'peer-tonggg', client_id: 'tonggg-1', sequence: 1, kind: 'text', body: 'Hi', created_at: '2026-09-26T16:10:00Z' }
    ]);
    readCursors.set(`${tongggCid}:${userId}`, 1);
  }

  // 8. B_biw (Screenshot 1)
  const bbiwCid = `conv-bbiw-${userId}`;
  if (!conversations.has(bbiwCid)) {
    conversations.set(bbiwCid, {
      id: bbiwCid,
      kind: 'direct',
      title: 'B_biw',
      members: [userId, 'peer-bbiw'],
      last_sequence: 1,
      updated_at: '2026-09-26T14:00:00Z'
    });
    messages.set(bbiwCid, [
      { id: `m-bbiw-${userId}-1`, conversation_id: bbiwCid, sender_id: 'peer-bbiw', client_id: 'bbiw-1', sequence: 1, kind: 'text', body: 'Ok', created_at: '2026-09-26T14:00:00Z' }
    ]);
    readCursors.set(`${bbiwCid}:${userId}`, 1);
  }

  // 9. 형철♡위 (Screenshot 1)
  const hcCid = `conv-hyungchul-${userId}`;
  if (!conversations.has(hcCid)) {
    conversations.set(hcCid, {
      id: hcCid,
      kind: 'direct',
      title: '형철♡위',
      members: [userId, 'peer-hyungchul'],
      last_sequence: 1,
      updated_at: '2026-09-26T11:30:00Z'
    });
    messages.set(hcCid, [
      { id: `m-hc-${userId}-1`, conversation_id: hcCid, sender_id: userId, client_id: 'hc-1', sequence: 1, kind: 'call_status', body: '통화가 취소됨', metadata: { call_type: 'voice', call_status: 'cancelled' }, created_at: '2026-09-26T11:30:00Z' }
    ]);
    readCursors.set(`${hcCid}:${userId}`, 1);
  }

  // 10. breezy_au (Screenshot 1)
  const breezyCid = `conv-breezy-${userId}`;
  if (!conversations.has(breezyCid)) {
    conversations.set(breezyCid, {
      id: breezyCid,
      kind: 'direct',
      title: 'breezy_au',
      members: [userId, 'peer-breezy'],
      last_sequence: 1,
      updated_at: '2026-09-19T20:00:00Z'
    });
    messages.set(breezyCid, [
      { id: `m-breezy-${userId}-1`, conversation_id: breezyCid, sender_id: 'peer-breezy', client_id: 'breezy-1', sequence: 1, kind: 'text', body: '辛苦了 姐姐', created_at: '2026-09-19T20:00:00Z' }
    ]);
    readCursors.set(`${breezyCid}:${userId}`, 1);
  }

  // 11. Group Chat: K 🙏, 초롱이, 배원섭 (3) (Screenshot 1)
  const grpCid = `conv-grp-k-${userId}`;
  if (!conversations.has(grpCid)) {
    conversations.set(grpCid, {
      id: grpCid,
      kind: 'group',
      title: 'K 🙏, 초롱이, 배원섭',
      members: [userId, 'peer-k', 'peer-care'],
      owner_id: userId,
      last_sequence: 2,
      updated_at: '2026-09-17T19:00:00Z'
    });
    messages.set(grpCid, [
      { id: `m-grp-${userId}-1`, conversation_id: grpCid, sender_id: 'peer-k', client_id: 'grp-1', sequence: 1, kind: 'text', body: '이번 주 모임 장소 공유합니다!', created_at: '2026-09-17T18:55:00Z' },
      { id: `m-grp-${userId}-2`, conversation_id: grpCid, sender_id: 'peer-care', client_id: 'grp-2', sequence: 2, kind: 'text', body: 'ㅋㅋ', created_at: '2026-09-17T19:00:00Z' }
    ]);
    readCursors.set(`${grpCid}:${userId}`, 2);
  }

  // 12. 이대철 (Screenshot 8)
  const daechulCid = `conv-daechul-${userId}`;
  if (!conversations.has(daechulCid)) {
    conversations.set(daechulCid, {
      id: daechulCid,
      kind: 'direct',
      title: '이대철',
      members: [userId, 'peer-daechul'],
      last_sequence: 1,
      updated_at: '2026-09-10T10:00:00Z'
    });
    messages.set(daechulCid, [
      { id: `m-daechul-${userId}-1`, conversation_id: daechulCid, sender_id: 'peer-daechul', client_id: 'daechul-1', sequence: 1, kind: 'text', body: '새로운 대화를 시작해 보세요.', created_at: '2026-09-10T10:00:00Z' }
    ]);
    readCursors.set(`${daechulCid}:${userId}`, 1);
  }

  // 13. tuk (Screenshot 8)
  const tukCid = `conv-tuk-${userId}`;
  if (!conversations.has(tukCid)) {
    conversations.set(tukCid, {
      id: tukCid,
      kind: 'direct',
      title: 'tuk',
      members: [userId, 'peer-tuk'],
      last_sequence: 1,
      updated_at: '2026-09-04T12:00:00Z'
    });
    messages.set(tukCid, [
      { id: `m-tuk-${userId}-1`, conversation_id: tukCid, sender_id: 'peer-tuk', client_id: 'tuk-1', sequence: 1, kind: 'text', body: 'Ok', created_at: '2026-09-04T12:00:00Z' }
    ]);
    readCursors.set(`${tukCid}:${userId}`, 1);
  }

  // 14. Woralak Duethesong (Screenshot 8)
  const woralakCid = `conv-woralak-${userId}`;
  if (!conversations.has(woralakCid)) {
    conversations.set(woralakCid, {
      id: woralakCid,
      kind: 'direct',
      title: 'Woralak Duethesong',
      members: [userId, 'peer-woralak'],
      last_sequence: 1,
      updated_at: '2026-08-06T18:00:00Z'
    });
    messages.set(woralakCid, [
      { id: `m-woralak-${userId}-1`, conversation_id: woralakCid, sender_id: 'peer-woralak', client_id: 'woralak-1', sequence: 1, kind: 'text', body: 'Woralak Duethesong님이 사진을 보냈습니다.', created_at: '2026-08-06T18:00:00Z' }
    ]);
    readCursors.set(`${woralakCid}:${userId}`, 1);
  }
}

async function extended(p, request, url, me, token) {
  const method = request.method;
  let m;
  const myId = me.id;
  ensureDefaultConversationsForUser(myId);

  // ---------- Profile & settings ----------
  if (p === 'me') {
    if (method === 'GET') return json({ ...publicUser(me), email: me.email, role: me.role });
    if (method === 'PATCH') {
      const b = await readJson(request);
      if (b.display_name !== undefined) {
        const v = clip(b.display_name, 40);
        if (!v) return bad('이름을 입력하세요');
        me.display_name = v;
      }
      if (b.bio !== undefined) me.bio = clip(b.bio, 200);
      if (b.status_message !== undefined) me.status_message = clip(b.status_message, 100);
      if (b.birthday !== undefined) {
        if (b.birthday !== '' && !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(b.birthday)) return bad('생일은 MM-DD 형식입니다');
        me.birthday = b.birthday;
      }
      if (b.avatar_color !== undefined) {
        if (!/^#[0-9a-fA-F]{6}$/.test(b.avatar_color)) return bad('색상 형식이 올바르지 않습니다');
        me.avatar_color = b.avatar_color;
      }
      if (b.handle !== undefined) {
        const h = String(b.handle).toLowerCase();
        if (!/^[a-z0-9_.]{3,20}$/.test(h)) return bad('ID는 영문 소문자·숫자·_ . 3~20자입니다');
        if (h !== me.handle && Array.from(users.values()).some(u => u.handle === h)) return bad('이미 사용 중인 ID입니다', 409);
        me.handle = h;
      }
      return json({ ...publicUser(me), email: me.email, role: me.role });
    }
  }
  if (p === 'me/settings') {
    const prefs = prefsOf(myId);
    if (method === 'GET') return json({ ...prefs });
    if (method === 'PATCH' || method === 'PUT') {
      const b = await readJson(request);
      for (const k of Object.keys(DEFAULT_PREFS)) {
        if (b[k] === undefined) continue;
        if (typeof b[k] !== typeof DEFAULT_PREFS[k]) return bad(`${k} 값 형식이 올바르지 않습니다`);
        if (k === 'language' && !['ko', 'en', 'ja'].includes(b[k])) return bad('지원하지 않는 언어입니다');
        if (k === 'font_size' && !['small', 'medium', 'large'].includes(b[k])) return bad('글자 크기 값 오류');
        if (k === 'theme' && !themesOf(myId).has(b[k])) return bad('보유하지 않은 테마입니다', 403);
        if (k === 'wallpaper' && !['default', 'dots', 'waves', 'grid'].includes(b[k])) return bad('배경 값 오류');
        prefs[k] = b[k];
      }
      return json({ ...prefs });
    }
  }
  if (p === 'auth/logout' && method === 'POST') {
    const sid = sessions.get(token)?.device_id;
    if (sid) {
      await revokeSessionById(sid, myId);
      await persistAudit(myId, 'session.logout', sid, {});
    }
    return json({ status: 'logged_out' });
  }
  if ((p === 'me/devices' || p === 'devices') && method === 'GET') {
    return json({ devices: await listSessionsFor(myId, sessions.get(token)?.device_id) });
  }
  if ((m = p.match(/^(?:me\/)?devices\/([\w-]+)$/)) && method === 'DELETE') {
    const target = await findSessionById(m[1]);
    if (!target) return bad('기기 세션을 찾을 수 없습니다', 404);
    if (target.user_id !== myId) return bad('다른 사용자의 세션은 종료할 수 없습니다', 403);
    const self = sessions.get(token)?.device_id === m[1];
    await revokeSessionById(m[1], myId);
    await persistAudit(myId, self ? 'session.revoke.self' : 'session.revoke.remote', m[1], { via: 'devices' });
    return json({ status: 'revoked', session_id: m[1], self });
  }
  if (p === 'me/password' && method === 'POST') {
    const b = await readJson(request);
    if (!(await checkPassword(me, b.old_password))) return bad('현재 비밀번호가 일치하지 않습니다', 403);
    if (typeof b.new_password !== 'string' || b.new_password.length < 10) return bad('새 비밀번호는 10자 이상이어야 합니다');
    await setPassword(me, b.new_password);
    await persistPassword(me);
    await revokeOtherSessions(myId, sessions.get(token)?.device_id, myId);
    await persistAudit(myId, 'password.change', myId, { other_sessions: 'revoked' });
    return json({ status: 'changed', other_sessions_revoked: true });
  }
  if (p === 'me/qr' && method === 'GET') return json({ code: `LINE-FRIEND:${me.handle}`, handle: me.handle });
  if (p === 'me/stickers' && method === 'GET') {
    const owned = packsOf(myId);
    return json({ packs: STICKER_CATALOG.filter(pk => owned.has(pk.id)) });
  }

  // ---------- Friends & users ----------
  if (p === 'friends') {
    if (method === 'GET') {
      const today = now().slice(5, 10);
      const list = friendIds(myId).map(id => {
        const u = usersById.get(id);
        if (!u || u.state === 'suspended') return null;
        const meta = fMeta(myId, id);
        return { ...publicUser(u), is_favorite: meta.favorite, is_hidden: meta.hidden, is_blocked: meta.blocked, nickname: meta.nickname, birthday_today: !!u.birthday && u.birthday === today };
      }).filter(Boolean);
      return json({ friends: list });
    }
    if (method === 'POST') {
      const b = await readJson(request);
      let target = null;
      if (b.friend_id || b.target_user_id) target = usersById.get(b.friend_id || b.target_user_id);
      else if (b.handle || b.qr_code) {
        const h = String(b.handle || String(b.qr_code).replace(/^LINE-FRIEND:/i, '')).toLowerCase().replace(/^@/, '');
        target = Array.from(users.values()).find(u => u.handle === h);
      }
      if (!target || target.state === 'suspended') return bad('사용자를 찾을 수 없습니다', 404);
      if (target.id === myId) return bad('자기 자신은 친구로 추가할 수 없습니다');
      if (isFriend(myId, target.id)) return json({ status: 'already_friends', friend: publicUser(target) });
      if (!prefsOf(target.id).allow_friend_requests || fMeta(target.id, myId).blocked) return bad('친구 추가할 수 없는 사용자입니다', 403);
      friendships.set(`${myId}:${target.id}`, true);
      friendships.set(`${target.id}:${myId}`, true);
      sendTo([target.id, myId], { type: 'friends.updated' });
      return json({ status: 'friend_added', friend: publicUser(target) }, 201);
    }
  }
  if ((m = p.match(/^friends\/([\w-]+)$/))) {
    const fid = m[1];
    if (!isFriend(myId, fid)) return bad('친구가 아닙니다', 404);
    if (method === 'PATCH') {
      const b = await readJson(request);
      const meta = fMeta(myId, fid);
      for (const k of ['favorite', 'hidden', 'blocked']) if (typeof b[k] === 'boolean') meta[k] = b[k];
      if (b.nickname !== undefined) meta.nickname = clip(b.nickname, 30);
      return json({ status: 'updated', meta });
    }
    if (method === 'DELETE') {
      friendships.delete(`${myId}:${fid}`);
      friendships.delete(`${fid}:${myId}`);
      friendMeta.delete(`${myId}:${fid}`);
      friendMeta.delete(`${fid}:${myId}`);
      sendTo([fid, myId], { type: 'friends.updated' });
      return json({ status: 'removed' });
    }
  }
  if (p === 'users' && method === 'GET') {
    const q = clip(url.searchParams.get('q') || url.searchParams.get('search') || '', 50).toLowerCase().replace(/^@/, '');
    if (q.length < 2) return json({ users: [] });
    const found = Array.from(users.values()).filter(u => {
      if (u.id === myId || u.state === 'suspended' || u.role === 'admin') return false;
      const pr = prefsOf(u.id);
      return u.display_name.toLowerCase().includes(q) || (pr.searchable_by_id && u.handle === q) || (pr.searchable_by_email && u.email === q);
    }).slice(0, 20).map(u => ({ ...publicUser(u), is_friend: isFriend(myId, u.id) }));
    return json({ users: found });
  }
  if ((m = p.match(/^users\/([\w-]+)$/)) && method === 'GET') {
    const u = usersById.get(m[1]);
    if (!u || u.state === 'suspended') return bad('사용자를 찾을 수 없습니다', 404);
    return json({ ...publicUser(u), is_friend: isFriend(myId, u.id) });
  }

  // ---------- Official accounts ----------
  if (p === 'official-accounts' && method === 'GET') {
    const mine = followedOfficial.get(myId) || new Map();
    return json({ accounts: Array.from(officialAccounts.values()).map(o => ({ id: o.id, name: o.name, handle: o.handle, description: o.description, color: o.color, followed: mine.has(o.id) })) });
  }
  if ((m = p.match(/^official-accounts\/([\w-]+)\/follow$/))) {
    const acct = officialAccounts.get(m[1]);
    if (!acct) return bad('공식계정을 찾을 수 없습니다', 404);
    if (!followedOfficial.has(myId)) followedOfficial.set(myId, new Map());
    const mine = followedOfficial.get(myId);
    if (method === 'POST') {
      if (mine.has(acct.id)) return json({ status: 'already_following', conversation_id: mine.get(acct.id) });
      const c = createConversation({ kind: 'official', title: acct.name, members: [myId, acct.id], official: true });
      mine.set(acct.id, c.id);
      pushMessage(c.id, acct.id, { kind: 'text', body: `${acct.name} 공식계정을 추가해 주셔서 감사합니다! 🎉 '도움말'을 입력해 보세요.` });
      sendTo([myId], { type: 'conversation.updated', conversation_id: c.id });
      return json({ status: 'following', conversation_id: c.id }, 201);
    }
    if (method === 'DELETE') {
      const cid = mine.get(acct.id);
      if (cid) cMeta(cid, myId).hidden = true;
      mine.delete(acct.id);
      return json({ status: 'unfollowed' });
    }
  }

  // ---------- Conversations ----------
  if (p === 'conversations/read-all' && method === 'POST') {
    ensureDefaultConversationsForUser(myId);
    await hydrateUserConversations(myId);
    for (const conv of conversations.values()) {
      if (conv.members.includes(myId)) {
        const seq = conv.last_sequence || 0;
        if (seq > (readCursors.get(`${conv.id}:${myId}`) || 0)) readCursors.set(`${conv.id}:${myId}`, seq);
        await persistCursor(conv.id, myId, seq);
        conv.unread_count = 0;
      }
    }
    return json({ status: 'read_all' });
  }
  if (p === 'conversations') {
    if (method === 'GET') {
      ensureDefaultConversationsForUser(myId);
      await hydrateUserConversations(myId);
      const includeHidden = url.searchParams.get('include_hidden') === '1';
      const list = Array.from(conversations.values()).filter(c => c.members.includes(myId))
        .map(c => chatSummary(c, myId)).filter(c => includeHidden || !c.hidden)
        .sort((a, b) => (b.pinned - a.pinned) || String(b.updated_at).localeCompare(String(a.updated_at)));
      // Invariant: nav badge === sum of numeric per-room unread; 'N' (badge_n) rooms are excluded everywhere.
      const unread_total = list.reduce((sum, c) => sum + (c.badge_n ? 0 : (c.unread_count || 0)), 0);
      return json({ conversations: list, unread_total });
    }
    if (method === 'POST') {
      const b = await readJson(request);
      const kind = b.kind === 'group' ? 'group' : 'direct';
      const ids = Array.from(new Set((Array.isArray(b.member_ids) ? b.member_ids : []).filter(x => typeof x === 'string' && x !== myId)));
      if (!ids.length || ids.length > 499) return bad('대화 상대를 선택하세요');
      for (const id of ids) {
        const isOA = officialAccounts.has(id);
        const u = isOA ? officialAccounts.get(id) : usersById.get(id);
        if (!u || u.state === 'suspended') return bad('존재하지 않는 사용자가 포함되어 있습니다', 404);
        if (fMeta(myId, id).blocked) return bad('차단한 사용자와는 대화할 수 없습니다', 403);
        if (!isOA && !isFriend(myId, id)) {
          friendships.set(`${myId}:${id}`, true);
          friendships.set(`${id}:${myId}`, true);
        }
      }
      if (kind === 'direct') {
        if (ids.length !== 1) return bad('1:1 대화는 상대가 한 명이어야 합니다');
        const existing = findDirect(myId, ids[0]);
        if (existing) { cMeta(existing.id, myId).hidden = false; return json(chatSummary(existing, myId)); }
        const isOA = officialAccounts.has(ids[0]);
        const oa = isOA ? officialAccounts.get(ids[0]) : null;
        const targetUser = !isOA ? usersById.get(ids[0]) : null;
        const convTitle = (b.title || (oa ? oa.name : targetUser ? targetUser.display_name : '')).trim();
        const c = createConversation({ kind: 'direct', title: convTitle, members: [myId, ids[0]] });
        sendTo(c.members, { type: 'conversation.updated', conversation_id: c.id });
        return json(chatSummary(c, myId), 201);
      }
      const title = clip(b.title, 50);
      if (!title) return bad('그룹 이름을 입력하세요');
      const c = createConversation({ kind: 'group', title, members: [myId, ...ids], owner_id: myId });
      systemMessage(c.id, `${me.display_name}님이 그룹을 만들었습니다.`);
      sendTo(c.members, { type: 'conversation.updated', conversation_id: c.id });
      return json(chatSummary(c, myId), 201);
    }
  }
  if ((m = p.match(/^conversations\/([\w-]+)$/))) {
    const conv = conversations.get(resolveConversationId(m[1], myId));
    if (!conv) return bad('대화방을 찾을 수 없습니다', 404);
    if (method === 'GET') return json(chatSummary(conv, myId));
    if (method === 'PATCH') {
      const b = await readJson(request);
      if (b.title !== undefined) {
        if (conv.kind !== 'group') return bad('그룹 채팅방만 이름을 바꿀 수 있습니다');
        const t = clip(b.title, 50);
        if (!t) return bad('그룹 이름을 입력하세요');
        conv.title = t;
      }
      if (b.notice !== undefined) conv.notice = clip(b.notice, 500);
      sendTo(conv.members, { type: 'conversation.updated', conversation_id: conv.id });
      return json(chatSummary(conv, myId));
    }
    if (method === 'DELETE') {
      if (conv.kind === 'group') return await leaveConversation(conv, myId, me);
      cMeta(conv.id, myId).hidden = true;
      const hs = hiddenMsgs.get(myId) || new Set();
      (messages.get(conv.id) || []).forEach(x => hs.add(x.id));
      hiddenMsgs.set(myId, hs);
      return json({ status: 'hidden' });
    }
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/meta$/)) && method === 'PATCH') {
    const b = await readJson(request);
    const meta = cMeta(resolveConversationId(m[1], myId), myId);
    for (const k of ['pinned', 'muted', 'hidden']) if (typeof b[k] === 'boolean') meta[k] = b[k];
    return json({ status: 'updated', meta });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/members$/)) && method === 'POST') {
    const conv = conversations.get(resolveConversationId(m[1], myId));
    if (conv.kind !== 'group') return bad('그룹 채팅방에서만 초대할 수 있습니다');
    const b = await readJson(request);
    const ids = Array.from(new Set((Array.isArray(b.member_ids) ? b.member_ids : []).filter(x => typeof x === 'string')));
    const added = [];
    for (const id of ids) {
      const u = usersById.get(id);
      if (!u || conv.members.includes(id) || !isFriend(myId, id) || fMeta(myId, id).blocked) continue;
      conv.members.push(id);
      added.push(u.display_name);
    }
    if (!added.length) return bad('초대할 수 있는 친구가 없습니다');
    systemMessage(conv.id, `${me.display_name}님이 ${added.join(', ')}님을 초대했습니다.`);
    sendTo(conv.members, { type: 'conversation.updated', conversation_id: conv.id });
    return json(chatSummary(conv, myId), 201);
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/members\/([\w-]+)$/)) && method === 'DELETE') {
    const conv = conversations.get(resolveConversationId(m[1], myId));
    if (conv.kind !== 'group') return bad('그룹 채팅방이 아닙니다');
    if (m[2] === myId) return await leaveConversation(conv, myId, me);
    if (conv.owner_id !== myId) return bad('방장만 멤버를 내보낼 수 있습니다', 403);
    if (!conv.members.includes(m[2])) return bad('멤버가 아닙니다', 404);
    const target = usersById.get(m[2]);
    conv.members = conv.members.filter(x => x !== m[2]);
    systemMessage(conv.id, `${target ? target.display_name : '멤버'}님이 내보내졌습니다.`);
    sendTo([...conv.members, m[2]], { type: 'conversation.updated', conversation_id: conv.id });
    return json({ status: 'kicked' });
  }

  // ---------- Messages ----------
  if ((m = p.match(/^conversations\/([\w-]+)\/messages$/))) {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (method === 'GET') {
      await hydrateConversation(cid);
      await hydrateCursors(myId);
      const before = intIn(url.searchParams.get('before_sequence') || 0, 0, 1e9) || 0;
      const limit = intIn(url.searchParams.get('limit') || 50, 1, 100) || 50;
      const hs = hiddenMsgs.get(myId);
      let list = (messages.get(cid) || []).filter(x => !(hs && hs.has(x.id)));
      if (before) list = list.filter(x => x.sequence < before);
      return json({ messages: list.slice(-limit).map(x => decorateMessage(x, myId, cid)), has_more: list.length > limit });
    }
    if (method === 'POST') {
      const b = await readJson(request);
      const kind = b.kind || 'text';
      await hydrateConversation(cid);
      if (!MESSAGE_KINDS.has(kind)) return bad('지원하지 않는 메시지 종류입니다');
      if (conv.kind === 'direct') {
        const other = conv.members.find(x => x !== myId);
        if (other && fMeta(myId, other).blocked) return bad('차단한 사용자에게는 메시지를 보낼 수 없습니다', 403);
      }
      if (b.client_id) {
        const dup = (messages.get(cid) || []).find(x => x.client_id === b.client_id && x.sender_id === myId);
        if (dup) return json({ message: decorateMessage(dup, myId, cid), duplicate: true }, 200);
      }
      let body = typeof b.body === 'string' ? b.body : '';
      let metadata = {};
      const meta = b.metadata && typeof b.metadata === 'object' ? b.metadata : {};
      if (kind === 'text') {
        body = body.trim();
        if (!body) return bad('메시지를 입력하세요');
        if (body.length > MAX_BODY) return bad('메시지가 너무 깁니다');
      } else if (kind === 'sticker') {
        if (meta.sticker_id) {
          metadata = { ...meta };
          body = body || meta.label || '스티커';
        } else {
          const pack = STICKER_CATALOG.find(pk => pk.id === meta.pack_id);
          if (!pack || !pack.stickers.includes(body)) return bad('올바르지 않은 스티커입니다');
          if (!packsOf(myId).has(pack.id)) return bad('보유하지 않은 스티커입니다', 403);
          metadata.pack_id = pack.id;
        }
      } else if (kind === 'location') {
        const lat = Number(meta.lat), lng = Number(meta.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return bad('위치 좌표가 올바르지 않습니다');
        metadata = { lat, lng, label: clip(meta.label || '', 100) };
        body = metadata.label || `위도 ${lat.toFixed(4)}, 경도 ${lng.toFixed(4)}`;
      } else if (kind === 'contact') {
        const u = usersById.get(meta.user_id);
        if (!u && !meta.display_name && !meta.name) return bad('연락처 사용자를 찾을 수 없습니다', 404);
        metadata = u ? { user_id: u.id, handle: u.handle, display_name: u.display_name } : { ...meta, display_name: meta.display_name || meta.name };
        body = u ? u.display_name : (meta.display_name || meta.name || body || '연락처');
      } else if (kind === 'call_status' || kind === 'security_notice' || kind === 'pay' || kind === 'transfer' || kind === 'ciphertext') {
        metadata = { ...meta };
        body = clip(body || kind, MAX_BODY);
      } else {
        const att = await loadAttachment(meta.attachment_id);
        if (att && att.conversation_id === cid) {
          metadata = { attachment_id: att.id, mime_type: att.mime, name: att.name, size_bytes: att.size };
          if (kind === 'voice') metadata.duration = intIn(meta.duration, 0, 300) ?? 0;
          body = clip(body || att.name, 200);
        } else if (meta.url || meta.filename || meta.duration !== undefined || (body && (body.startsWith('http://') || body.startsWith('https://') || body.startsWith('data:')))) {
          metadata = { ...meta, url: meta.url || (body && body.startsWith('http') ? body : undefined) };
          body = clip(body || meta.filename || kind, 200);
        } else {
          return bad('첨부 파일을 찾을 수 없습니다', 404);
        }
      }
      if (Array.isArray(meta.mentions)) {
        metadata.mentions = Array.from(new Set(meta.mentions.filter(x => (x === 'all' && conv.kind === 'group') || conv.members.includes(x)))).slice(0, 50);
      }
      if (meta.forwarded === true) metadata.forwarded = true;
      let replyTo;
      if (b.reply_to) {
        if (!(messages.get(cid) || []).some(x => x.id === b.reply_to)) return bad('답장할 메시지를 찾을 수 없습니다', 404);
        replyTo = b.reply_to;
      }
      const msg = await pushPersistent(cid, myId, { client_id: b.client_id, kind, body, reply_to: replyTo, metadata: Object.keys(metadata).length ? metadata : undefined });
      await persistCursor(cid, myId, msg.sequence);
      if (conv.official) {
        const acct = officialAccounts.get(conv.members.find(x => officialAccounts.has(x)));
        if (acct && kind === 'text') await pushPersistent(cid, acct.id, { kind: 'text', body: botReply(body, acct) });
      }
      const decorated = decorateMessage(msg, myId, cid);
      return json({ ...decorated, message: decorated, duplicate: false }, 201);
    }
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/messages\/([\w-]+)$/))) {
    const cid = resolveConversationId(m[1], myId);
    await hydrateConversation(cid);
    const list = messages.get(cid) || [];
    const msg = list.find(x => x.id === m[2]);
    if (!msg) return bad('메시지를 찾을 수 없습니다', 404);
    if (['PATCH', 'DELETE'].includes(method) && msg.sender_id !== myId) return bad('보낸 사람만 수정하거나 취소할 수 있습니다', 403);
    if (method === 'PATCH') {
      if (msg.kind !== 'text' || msg.unsent) return bad('텍스트 메시지만 수정할 수 있습니다');
      const b = await readJson(request);
      const text = clip(b.body, MAX_BODY);
      if (!text) return bad('메시지를 입력하세요');
      msg.body = text;
      msg.edited_at = now();
      await persistMessageUpdate(msg);
      broadcast({ type: 'message.updated', conversation_id: cid, message_id: msg.id, body: msg.body });
      return json({ status: 'edited', message: decorateMessage(msg, myId, cid) });
    }
    if (method === 'DELETE') {
      if (Date.now() - Date.parse(msg.created_at) > 24 * 3600 * 1000) return bad('24시간이 지난 메시지는 전송 취소할 수 없습니다');
      msg.unsent = true;
      msg.body = '';
      msg.metadata = undefined;
      await persistMessageUpdate(msg);
      const pins = pinnedMessages.get(cid);
      if (pins) pinnedMessages.set(cid, pins.filter(x => x.message_id !== msg.id));
      broadcast({ type: 'message.unsent', conversation_id: cid, message_id: msg.id });
      return json({ status: 'recalled', message_id: msg.id });
    }
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/messages\/([\w-]+)\/hide$/)) && method === 'POST') {
    const hs = hiddenMsgs.get(myId) || new Set();
    hs.add(m[2]);
    hiddenMsgs.set(myId, hs);
    return json({ status: 'hidden' });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/messages\/([\w-]+)\/reactions$/)) && method === 'POST') {
    const cid = m[1], mid = m[2];
    if (!(messages.get(cid) || []).some(x => x.id === mid && !x.unsent)) return bad('메시지를 찾을 수 없습니다', 404);
    const b = await readJson(request);
    if (!REACTIONS.includes(b.reaction)) return bad('지원하지 않는 반응입니다');
    if (!reactionStore.has(mid)) reactionStore.set(mid, new Map());
    const rm = reactionStore.get(mid);
    for (const [emoji, set] of rm) if (emoji !== b.reaction) set.delete(myId);
    if (!rm.has(b.reaction)) rm.set(b.reaction, new Set());
    const set = rm.get(b.reaction);
    const removed = set.has(myId);
    if (removed) set.delete(myId); else set.add(myId);
    const counts = reactionCounts(mid);
    broadcast({ type: 'message.reaction', conversation_id: cid, message_id: mid, reactions: counts });
    return json({ status: removed ? 'removed' : 'reacted', reactions: counts }, removed ? 200 : 201);
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/read$/)) && method === 'POST') {
    const conv = conversations.get(resolveConversationId(m[1], myId));
    await hydrateConversation(conv.id);
    await hydrateCursors(myId);
    const b = await readJson(request);
    const seq = intIn(b.sequence ?? conv.last_sequence, 0, 1e9) ?? 0;
    const key = `${conv.id}:${myId}`;
    const next = Math.max(readCursors.get(key) || 0, Math.min(seq, conv.last_sequence || 0));
    readCursors.set(key, next);
    await persistCursor(conv.id, myId, next);
    broadcast({ type: 'conversation.read', conversation_id: conv.id, user_id: myId, sequence: next });
    return json({ status: 'read', sequence: next });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/typing$/)) && method === 'POST') {
    broadcast({ type: 'conversation.typing', conversation_id: m[1], user_id: myId });
    return json({ status: 'typing' });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/pins$/))) {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const pins = pinnedMessages.get(cid) || [];
    const view = () => pins.map(x => {
      const src = (messages.get(cid) || []).find(y => y.id === x.message_id);
      return { ...x, body: src && !src.unsent ? String(src.body).slice(0, 120) : '', kind: src?.kind };
    }).filter(x => x.body || x.kind);
    if (method === 'GET') return json({ pins: view() });
    if (method === 'POST') {
      const b = await readJson(request);
      const src = (messages.get(cid) || []).find(y => y.id === b.message_id && !y.unsent);
      if (!src) return bad('메시지를 찾을 수 없습니다', 404);
      if (!pins.some(x => x.message_id === src.id)) pins.unshift({ message_id: src.id, pinned_by: myId, pinned_at: now() });
      pinnedMessages.set(cid, pins);
      broadcast({ type: 'conversation.pins', conversation_id: cid });
      return json({ status: 'pinned', message_id: src.id }, 201);
    }
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/pins\/([\w-]+)$/)) && method === 'DELETE') {
    const conv = conversations.get(resolveConversationId(m[1], myId));
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    pinnedMessages.set(m[1], (pinnedMessages.get(m[1]) || []).filter(x => x.message_id !== m[2]));
    broadcast({ type: 'conversation.pins', conversation_id: m[1] });
    return json({ status: 'unpinned' });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/media$/)) && method === 'GET') {
    const conv = conversations.get(resolveConversationId(m[1], myId));
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const kind = url.searchParams.get('kind') || 'image';
    const hs = hiddenMsgs.get(myId);
    const list = (messages.get(m[1]) || []).filter(x => !x.unsent && !(hs && hs.has(x.id)));
    let out;
    if (kind === 'link') out = list.filter(x => x.kind === 'text' && /https?:\/\/\S+/i.test(x.body));
    else if (kind === 'file') out = list.filter(x => x.kind === 'file');
    else out = list.filter(x => x.kind === 'image' || x.kind === 'video');
    return json({ items: out.slice(-100).reverse().map(x => decorateMessage(x, myId, m[1])) });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/search$/)) && method === 'GET') {
    const conv = conversations.get(resolveConversationId(m[1], myId));
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const q = clip(url.searchParams.get('q') || '', 100).toLowerCase();
    if (q.length < 1) return json({ messages: [] });
    const hs = hiddenMsgs.get(myId);
    const out = (messages.get(m[1]) || []).filter(x => !x.unsent && x.kind !== 'sticker' && !(hs && hs.has(x.id)) && String(x.body).toLowerCase().includes(q));
    return json({ messages: out.slice(-50).reverse().map(x => decorateMessage(x, myId, m[1])) });
  }

  // ---------- Polls, notes, events, albums ----------
  if ((m = p.match(/^conversations\/([\w-]+)\/polls$/))) {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    if (method === 'GET') return json({ polls: Array.from(polls.values()).filter(x => x.conversation_id === cid).map(x => pollView(x, myId)) });
    if (method === 'POST') {
      const b = await readJson(request);
      const question = clip(b.question, 200);
      const opts = (Array.isArray(b.options) ? b.options : []).map(o => clip(String(o), 100)).filter(Boolean);
      if (!question || opts.length < 2 || opts.length > 10) return bad('질문과 2~10개의 선택지가 필요합니다');
      const poll = { id: uid(), conversation_id: cid, question, multiple: b.multiple === true, closed: false, created_by: myId, created_at: now(), options: opts.map((t, i) => ({ id: `opt-${i}`, text: t, voters: new Set() })) };
      polls.set(poll.id, poll);
      pushMessage(cid, myId, { kind: 'poll', body: question, metadata: { poll_id: poll.id } });
      broadcast({ type: 'poll.updated', conversation_id: cid, poll_id: poll.id });
      return json(pollView(poll, myId), 201);
    }
  }
  if ((m = p.match(/^polls\/([\w-]+)\/vote$/)) && method === 'POST') {
    const poll = polls.get(m[1]);
    if (!poll || !conversations.get(poll.conversation_id)?.members.includes(myId)) return bad('투표를 찾을 수 없습니다', 404);
    if (poll.closed) return bad('종료된 투표입니다');
    const b = await readJson(request);
    const opt = poll.options.find(o => o.id === b.option_id);
    if (!opt) return bad('선택지를 찾을 수 없습니다');
    if (opt.voters.has(myId)) opt.voters.delete(myId);
    else {
      if (!poll.multiple) poll.options.forEach(o => o.voters.delete(myId));
      opt.voters.add(myId);
    }
    broadcast({ type: 'poll.updated', conversation_id: poll.conversation_id, poll_id: poll.id });
    return json({ status: 'voted', poll: pollView(poll, myId) });
  }
  if ((m = p.match(/^polls\/([\w-]+)\/close$/)) && method === 'POST') {
    const poll = polls.get(m[1]);
    if (!poll || !conversations.get(poll.conversation_id)?.members.includes(myId)) return bad('투표를 찾을 수 없습니다', 404);
    if (poll.created_by !== myId) return bad('투표를 만든 사람만 종료할 수 있습니다', 403);
    poll.closed = true;
    broadcast({ type: 'poll.updated', conversation_id: poll.conversation_id, poll_id: poll.id });
    return json({ status: 'closed', poll: pollView(poll, myId) });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/notes$/))) {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const list = noteStore.get(cid) || [];
    if (method === 'GET') return json({ notes: list.map(n => ({ ...n, author: userBrief(n.author_id) })) });
    if (method === 'POST') {
      const b = await readJson(request);
      const title = clip(b.title, 80), body = clip(b.body, 3000);
      if (!title) return bad('노트 제목을 입력하세요');
      const note = { id: uid(), title, body, author_id: myId, created_at: now() };
      list.unshift(note);
      noteStore.set(cid, list);
      return json({ ...note, author: userBrief(myId) }, 201);
    }
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/notes\/([\w-]+)$/)) && method === 'DELETE') {
    const conv = conversations.get(resolveConversationId(m[1], myId));
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const list = noteStore.get(m[1]) || [];
    const note = list.find(n => n.id === m[2]);
    if (!note) return bad('노트를 찾을 수 없습니다', 404);
    if (note.author_id !== myId && conv.owner_id !== myId) return bad('삭제 권한이 없습니다', 403);
    noteStore.set(m[1], list.filter(n => n.id !== m[2]));
    return json({ status: 'deleted' });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/events$/))) {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const list = eventStore.get(cid) || [];
    const view = e => ({ ...e, rsvps: Object.fromEntries(e.rsvps), my_rsvp: e.rsvps.get(myId) || '', creator: userBrief(e.created_by) });
    if (method === 'GET') return json({ events: list.map(view) });
    if (method === 'POST') {
      const b = await readJson(request);
      const title = clip(b.title, 80);
      const startsAt = Date.parse(b.starts_at);
      if (!title || Number.isNaN(startsAt)) return bad('일정 제목과 시작 시간이 필요합니다');
      const ev = { id: uid(), title, starts_at: new Date(startsAt).toISOString(), location: clip(b.location || '', 100), created_by: myId, created_at: now(), rsvps: new Map([[myId, 'going']]) };
      list.push(ev);
      list.sort((a, b2) => a.starts_at.localeCompare(b2.starts_at));
      eventStore.set(cid, list);
      pushMessage(cid, myId, { kind: 'text', body: `📅 일정 등록: ${title} (${new Date(startsAt).toLocaleString('ko-KR')})` });
      return json(view(ev), 201);
    }
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/events\/([\w-]+)\/rsvp$/)) && method === 'POST') {
    const conv = conversations.get(resolveConversationId(m[1], myId));
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const ev = (eventStore.get(m[1]) || []).find(e => e.id === m[2]);
    if (!ev) return bad('일정을 찾을 수 없습니다', 404);
    const b = await readJson(request);
    if (!['going', 'maybe', 'no'].includes(b.status)) return bad('참석 상태 값이 올바르지 않습니다');
    ev.rsvps.set(myId, b.status);
    return json({ status: 'saved', rsvps: Object.fromEntries(ev.rsvps) });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/albums$/))) {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const list = albums.get(cid) || [];
    if (method === 'GET') return json({ albums: list });
    if (method === 'POST') {
      const b = await readJson(request);
      const title = clip(b.title, 60);
      if (!title) return bad('앨범 제목을 입력하세요');
      const ids = (Array.isArray(b.attachment_ids) ? b.attachment_ids : []).filter(id => attachmentStore.get(id)?.conversation_id === cid && attachmentStore.get(id).mime.startsWith('image/')).slice(0, 100);
      const album = { id: uid(), title, attachment_ids: ids, created_by: myId, created_at: now() };
      list.push(album);
      albums.set(cid, list);
      return json(album, 201);
    }
  }

  // ---------- Attachments ----------
  if (p === 'attachments' && method === 'POST') {
    const b = await readJson(request);
    const conv = conversations.get(b.conversation_id);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없습니다', 404);
    if (typeof b.content_base64 !== 'string' || !b.content_base64 || b.content_base64.length > MAX_ATTACHMENT_B64 || !/^[A-Za-z0-9+/=]+$/.test(b.content_base64)) return bad('파일이 비어 있거나 너무 큽니다 (최대 약 1.5MB)', 413);
    const mime = typeof b.mime_type === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(b.mime_type) ? b.mime_type.toLowerCase() : 'application/octet-stream';
    const size = Math.floor(b.content_base64.length * 3 / 4);
    const att = { id: uid(), owner: myId, conversation_id: conv.id, name: clip(b.original_name || 'file', 120) || 'file', mime, size, b64: b.content_base64 };
    await persistAttachment(att);
    attachmentStore.set(att.id, att);
    return json({ id: att.id, status: 'ready', original_name: att.name, mime_type: mime, size_bytes: size }, 201);
  }
  if ((m = p.match(/^attachments\/([\w-]+)$/)) && method === 'GET') {
    const att = await loadAttachment(m[1]);
    if (!att || !conversations.get(att.conversation_id)?.members.includes(myId)) return bad('파일을 찾을 수 없습니다', 404);
    const bin = atob(att.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const inline = INLINE_MIME.test(att.mime);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': inline ? att.mime : 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(att.name)}`,
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, max-age=3600', 'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // ---------- Calls ----------
  if (p === 'calls' && method === 'POST') {
    const b = await readJson(request);
    if (!['voice', 'video'].includes(b.kind || 'video')) return bad('통화 종류가 올바르지 않습니다');
    const conv = conversations.get(b.conversation_id);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없습니다', 404);
    if (conv.official) return bad('공식계정과는 통화할 수 없습니다');
    const call = { id: uid(), conversation_id: conv.id, kind: b.kind || 'video', state: 'ringing', initiated_by: myId, started_at: now(), connected_at: null, ended_at: null };
    callSessions.set(call.id, call);
    broadcast({ type: 'call.ringing', call_id: call.id, conversation_id: conv.id, initiated_by: myId, kind: call.kind });
    return json({ id: call.id, state: 'ringing', kind: call.kind }, 201);
  }
  if (p === 'calls' && method === 'GET') {
    await hydrateUserConversations(myId);
    const peerColor = id => usersById.get(id)?.avatar_color || officialAccounts.get(id)?.color || '#06c755';
    const rows = [];
    for (const c of callSessions.values()) {
      const conv = conversations.get(c.conversation_id);
      if (!conv || !conv.members.includes(myId)) continue;
      const peerId = conv.members.find(x => x !== myId) || null;
      const duration = c.connected_at && c.ended_at ? Math.round((Date.parse(c.ended_at) - Date.parse(c.connected_at)) / 1000) : 0;
      rows.push({ id: c.id, conversation_id: c.conversation_id, peer_id: peerId, peer_color: peerColor(peerId), title: chatSummary(conv, myId).title, kind: c.kind, state: c.state, result: c.result || '', duration, outgoing: c.initiated_by === myId, started_at: c.started_at, source: 'session' });
    }
    // Call history is the ledger of call_status messages, so the list always agrees with the chat bubbles.
    for (const conv of conversations.values()) {
      if (!conv.members.includes(myId)) continue;
      const peerId = conv.members.find(x => x !== myId) || null;
      const title = chatSummary(conv, myId).title;
      for (const msg of messages.get(conv.id) || []) {
        if (msg.kind !== 'call_status' || msg.unsent) continue;
        const st = msg.metadata?.call_status || msg.metadata?.status || 'completed';
        const dur = String(msg.metadata?.duration || '');
        const secs = dur.includes(':') ? dur.split(':').reduce((a, x) => a * 60 + Number(x || 0), 0) : (Number(dur) || 0);
        rows.push({ id: msg.id, conversation_id: conv.id, peer_id: peerId, peer_color: peerColor(peerId), title, kind: msg.metadata?.call_type || 'voice', state: 'ended', result: st, duration: secs, outgoing: msg.sender_id === myId, started_at: msg.created_at, source: 'message' });
      }
    }
    rows.sort((a, b2) => String(b2.started_at).localeCompare(String(a.started_at)));
    return json({ calls: rows.slice(0, 100) });
  }
  if (p === 'news' && method === 'GET') {
    const withRank = NEWS_SAMPLE.filter(a => a.rank);
    return json({
      sample: true,
      source: 'LUNO 에디토리얼 샘플 콘텐츠 (실제 언론 기사가 아닙니다)',
      hero: NEWS_SAMPLE.filter(a => !a.rank),
      popular: withRank,
      fetched_at: now()
    });
  }
  if ((m = p.match(/^calls\/([\w-]+)\/state$/)) && method === 'POST') {
    const call = callSessions.get(m[1]);
    const b = await readJson(request);
    if (!['connected', 'ended', 'declined', 'missed'].includes(b.state)) return bad('통화 상태 값이 올바르지 않습니다');
    if (call.ended_at) return json({ status: call.state });
    if ((b.state === 'connected' || b.state === 'declined') && call.initiated_by === myId) return bad('발신자는 이 작업을 할 수 없습니다', 403);
    if (b.state === 'connected') {
      call.state = 'connected';
      call.connected_at = call.connected_at || now();
      broadcast({ type: 'call.state', call_id: call.id, state: 'connected' });
      return json({ status: 'connected' });
    }
    call.ended_at = now();
    call.state = 'ended';
    const duration = call.connected_at ? Math.round((Date.parse(call.ended_at) - Date.parse(call.connected_at)) / 1000) : 0;
    call.result = call.connected_at ? 'completed' : (b.state === 'declined' ? 'declined' : (call.initiated_by === myId ? 'canceled' : 'missed'));
    pushMessage(call.conversation_id, call.initiated_by, { kind: 'call', body: '', metadata: { call_id: call.id, call_kind: call.kind, duration, result: call.result } });
    broadcast({ type: 'call.state', call_id: call.id, state: 'ended', result: call.result });
    return json({ status: 'ended', result: call.result, duration });
  }

  // ---------- Timeline, stories, VOOM ----------
  if (p === 'timeline') {
    if (method === 'GET') {
      const visible = new Set([myId, ...friendIds(myId).filter(f => !fMeta(myId, f).hidden && !fMeta(myId, f).blocked)]);
      const list = timelinePosts.filter(x => visible.has(x.author_id) && (x.visibility === 'friends' || x.author_id === myId)).slice().reverse().slice(0, 100);
      return json({ posts: list.map(x => timelineView(x, myId)) });
    }
    if (method === 'POST') {
      const b = await readJson(request);
      const body = clip(b.body, 1000);
      if (!body) return bad('내용을 입력하세요');
      const bg = typeof b.bg === 'string' && /^(linear-gradient\([\w#%,\s().-]+\)|#[0-9a-fA-F]{6}|)$/.test(b.bg) ? b.bg : '';
      const post = { id: uid(), author_id: myId, body, bg, visibility: b.visibility === 'me' ? 'me' : 'friends', created_at: now(), likes: [], comments: [] };
      timelinePosts.push(post);
      sendTo(friendIds(myId), { type: 'timeline.updated' });
      return json(timelineView(post, myId), 201);
    }
  }
  if ((m = p.match(/^timeline\/([\w-]+)$/)) && method === 'DELETE') {
    const idx = timelinePosts.findIndex(x => x.id === m[1]);
    if (idx < 0) return bad('게시물을 찾을 수 없습니다', 404);
    if (timelinePosts[idx].author_id !== myId) return bad('삭제 권한이 없습니다', 403);
    timelinePosts.splice(idx, 1);
    return json({ status: 'deleted' });
  }
  if ((m = p.match(/^timeline\/([\w-]+)\/(like|comments)$/)) && method === 'POST') {
    const post = timelinePosts.find(x => x.id === m[1]);
    if (!post || (post.author_id !== myId && !isFriend(myId, post.author_id))) return bad('게시물을 찾을 수 없습니다', 404);
    if (m[2] === 'like') {
      const i = post.likes.indexOf(myId);
      if (i >= 0) post.likes.splice(i, 1); else post.likes.push(myId);
      return json(timelineView(post, myId));
    }
    const b = await readJson(request);
    const body = clip(b.body, 300);
    if (!body) return bad('댓글을 입력하세요');
    post.comments.push({ id: uid(), author_id: myId, body, created_at: now() });
    return json(timelineView(post, myId), 201);
  }
  if (p === 'stories') {
    if (method === 'GET') {
      const visible = new Set([myId, ...friendIds(myId).filter(f => !fMeta(myId, f).hidden && !fMeta(myId, f).blocked)]);
      const cutoff = Date.now() - 24 * 3600 * 1000;
      const list = storyStore.filter(x => visible.has(x.author_id) && Date.parse(x.created_at) > cutoff).slice().reverse();
      return json({ stories: list.map(x => ({ id: x.id, author: userBrief(x.author_id), body: x.body, bg: x.bg, created_at: x.created_at, viewed: x.viewers.includes(myId), view_count: x.author_id === myId ? x.viewers.length : undefined })) });
    }
    if (method === 'POST') {
      const b = await readJson(request);
      const body = clip(b.body, 200);
      if (!body) return bad('스토리 내용을 입력하세요');
      const bg = typeof b.bg === 'string' && /^(linear-gradient\([\w#%,\s().-]+\)|#[0-9a-fA-F]{6}|)$/.test(b.bg) ? b.bg : '';
      const story = { id: uid(), author_id: myId, body, bg, created_at: now(), viewers: [] };
      storyStore.push(story);
      sendTo(friendIds(myId), { type: 'timeline.updated' });
      return json({ id: story.id }, 201);
    }
  }
  if ((m = p.match(/^stories\/([\w-]+)\/view$/)) && method === 'POST') {
    const s = storyStore.find(x => x.id === m[1]);
    if (s && s.author_id !== myId && isFriend(myId, s.author_id) && !s.viewers.includes(myId)) s.viewers.push(myId);
    return json({ status: 'viewed' });
  }
  if (p === 'voom') {
    if (method === 'GET') return json({ videos: voomPosts.slice().reverse().map(x => voomView(x, myId)) });
    if (method === 'POST') {
      const b = await readJson(request);
      const title = clip(b.title, 100);
      if (!title) return bad('제목을 입력하세요');
      const emoji = clip(b.emoji || '🎬', 8) || '🎬';
      const bgs = ['linear-gradient(135deg,#06c755,#0ea5e9)', 'linear-gradient(135deg,#f97316,#f43f5e)', 'linear-gradient(135deg,#6366f1,#ec4899)', 'linear-gradient(135deg,#14b8a6,#84cc16)'];
      const v = { id: uid(), title, emoji, author_id: myId, bg: bgs[voomPosts.length % bgs.length], likes: 0, liked_by: [], comments: [], created_at: now() };
      voomPosts.push(v);
      return json(voomView(v, myId), 201);
    }
  }
  if ((m = p.match(/^voom\/([\w-]+)\/(like|comments)$/)) && method === 'POST') {
    const v = voomPosts.find(x => x.id === m[1]);
    if (!v) return bad('영상을 찾을 수 없습니다', 404);
    if (m[2] === 'like') {
      const i = v.liked_by.indexOf(myId);
      if (i >= 0) v.liked_by.splice(i, 1); else v.liked_by.push(myId);
      return json(voomView(v, myId));
    }
    const b = await readJson(request);
    const body = clip(b.body, 300);
    if (!body) return bad('댓글을 입력하세요');
    v.comments.push({ id: uid(), author_id: myId, body, created_at: now() });
    return json(voomView(v, myId), 201);
  }

  // ---------- Pay wallet & shop ----------
  if (p === 'wallet' && method === 'GET') {
    const w = walletOf(myId);
    return json({ balance: w.balance, currency: 'KRW', transactions: w.tx.slice(0, 50) });
  }
  if (p === 'wallet/charge' && method === 'POST') {
    const b = await readJson(request);
    const amount = intIn(b.amount, 1000, 1000000);
    if (amount === null) return bad('충전 금액은 1,000원 ~ 1,000,000원입니다');
    const w = walletOf(myId);
    w.balance += amount;
    w.tx.unshift({ id: uid(), type: 'charge', amount, note: '잔액 충전(시뮬레이션)', created_at: now() });
    return json({ balance: w.balance }, 201);
  }
  if (p === 'wallet/send' && method === 'POST') {
    const b = await readJson(request);
    const amount = intIn(b.amount, 1, 500000);
    if (amount === null) return bad('송금 금액은 1원 ~ 500,000원입니다');
    if (!isFriend(myId, b.to_user_id) || fMeta(myId, b.to_user_id).blocked) return bad('친구에게만 송금할 수 있습니다', 403);
    const mine = walletOf(myId);
    if (mine.balance < amount) return bad('잔액이 부족합니다', 402);
    const theirs = walletOf(b.to_user_id);
    const note = clip(b.note || '', 50);
    mine.balance -= amount;
    theirs.balance += amount;
    const at = now();
    mine.tx.unshift({ id: uid(), type: 'send', amount: -amount, counterparty: userBrief(b.to_user_id)?.display_name, note, created_at: at });
    theirs.tx.unshift({ id: uid(), type: 'receive', amount, counterparty: me.display_name, note, created_at: at });
    let conv = findDirect(myId, b.to_user_id);
    if (!conv) conv = createConversation({ kind: 'direct', title: '', members: [myId, b.to_user_id] });
    pushMessage(conv.id, myId, { kind: 'pay', body: note || '송금', metadata: { amount } });
    return json({ balance: mine.balance }, 201);
  }
  if (p === 'store/stickers' && method === 'GET') {
    const owned = packsOf(myId);
    return json({ packs: STICKER_CATALOG.map(pk => ({ ...pk, owned: owned.has(pk.id), currency: 'KRW' })) });
  }
  if (p === 'store/themes' && method === 'GET') {
    const owned = themesOf(myId);
    return json({ themes: THEME_CATALOG.map(t => ({ ...t, owned: owned.has(t.id), currency: 'KRW' })) });
  }
  if (p === 'store/orders' && method === 'POST') {
    const b = await readJson(request);
    const pack = STICKER_CATALOG.find(x => x.id === b.pack_id);
    const theme = THEME_CATALOG.find(x => x.id === b.theme_id);
    const item = pack || theme;
    if (!item) return bad('상품을 찾을 수 없습니다', 404);
    const owned = pack ? packsOf(myId) : themesOf(myId);
    if (owned.has(item.id)) return bad('이미 보유한 상품입니다', 409);
    const w = walletOf(myId);
    if (w.balance < item.price_minor) return bad('잔액이 부족합니다. Pay에서 충전해 주세요', 402);
    w.balance -= item.price_minor;
    owned.add(item.id);
    const orderId = uid();
    storeOrders.set(orderId, { id: orderId, buyer: myId, amount: item.price_minor });
    w.tx.unshift({ id: orderId, type: 'purchase', amount: -item.price_minor, note: item.title, created_at: now() });
    return json({ order_id: orderId, status: 'completed', balance: w.balance }, 201);
  }

  // ---------- OpenChat ----------
  if (p === 'community/rooms') {
    if (method === 'GET') {
      const q = clip(url.searchParams.get('q') || '', 50).toLowerCase();
      const rooms = Array.from(communityRooms.values()).filter(r => !q || r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q))
        .map(r => ({ ...r, member_count: (roomMembers.get(r.id) || new Map()).size, joined: (roomMembers.get(r.id) || new Map()).has(myId) }));
      return json({ rooms });
    }
    if (method === 'POST') {
      const b = await readJson(request);
      const name = clip(b.name, 50);
      if (!name) return bad('오픈채팅 이름을 입력하세요');
      const room = { id: uid(), name, description: clip(b.description || '', 200), visibility: 'public', owner_id: myId, created_at: now() };
      communityRooms.set(room.id, room);
      communityPosts.set(room.id, []);
      roomMembers.set(room.id, new Map([[myId, clip(b.nickname || me.display_name, 20) || me.display_name]]));
      return json({ ...room, member_count: 1, joined: true }, 201);
    }
  }
  if ((m = p.match(/^community\/rooms\/([\w-]+)\/(join|leave)$/)) && method === 'POST') {
    const room = communityRooms.get(m[1]);
    if (!room) return bad('오픈채팅을 찾을 수 없습니다', 404);
    if (!roomMembers.has(room.id)) roomMembers.set(room.id, new Map());
    const members = roomMembers.get(room.id);
    if (m[2] === 'join') {
      const b = await readJson(request);
      members.set(myId, clip(b.nickname || me.display_name, 20) || me.display_name);
      return json({ status: 'joined', nickname: members.get(myId), member_count: members.size }, 201);
    }
    members.delete(myId);
    return json({ status: 'left', member_count: members.size });
  }
  if ((m = p.match(/^community\/rooms\/([\w-]+)\/posts$/))) {
    const room = communityRooms.get(m[1]);
    if (!room) return bad('오픈채팅을 찾을 수 없습니다', 404);
    const members = roomMembers.get(room.id) || new Map();
    const view = x => ({ ...x, liked_by: undefined, likes: (x.liked_by || []).length, liked: (x.liked_by || []).includes(myId) });
    if (method === 'GET') return json({ posts: (communityPosts.get(room.id) || []).slice(0, 200).map(view), joined: members.has(myId), nickname: members.get(myId) || '' });
    if (method === 'POST') {
      if (!members.has(myId)) members.set(myId, clip(me.display_name, 20) || '익명');
      const b = await readJson(request);
      const body = clip(b.body, 1000);
      if (!body) return bad('메시지를 입력하세요');
      const post = { id: uid(), room_id: room.id, author_id: myId, author_name: members.get(myId), body, liked_by: [], created_at: now() };
      const list = communityPosts.get(room.id) || [];
      list.unshift(post);
      communityPosts.set(room.id, list);
      sendTo(Array.from(members.keys()), { type: 'community.post', room_id: room.id, post: view(post) });
      return json(view(post), 201);
    }
  }
  if ((m = p.match(/^community\/rooms\/([\w-]+)\/posts\/([\w-]+)\/like$/)) && method === 'POST') {
    const members = roomMembers.get(m[1]) || new Map();
    if (!members.has(myId)) members.set(myId, clip(me.display_name, 20) || '익명');
    const post = (communityPosts.get(m[1]) || []).find(x => x.id === m[2]);
    if (!post) return bad('게시물을 찾을 수 없습니다', 404);
    post.liked_by = post.liked_by || [];
    const i = post.liked_by.indexOf(myId);
    if (i >= 0) post.liked_by.splice(i, 1); else post.liked_by.push(myId);
    sendTo(Array.from(members.keys()), { type: 'community.post_liked', room_id: m[1], post_id: post.id, likes: post.liked_by.length });
    return json({ status: i >= 0 ? 'unliked' : 'liked', likes: post.liked_by.length });
  }

  // ---------- Search & reports ----------
  if (p === 'search' && method === 'GET') {
    const q = clip(url.searchParams.get('q') || '', 100).toLowerCase();
    if (q.length < 2) return json({ messages: [], users: [], chats: [], official_accounts: [] });
    const mine = Array.from(conversations.values()).filter(c => c.members.includes(myId));
    const hs = hiddenMsgs.get(myId);
    const foundMsgs = [];
    for (const c of mine) {
      const title = chatSummary(c, myId).title;
      for (const x of messages.get(c.id) || []) {
        if (x.unsent || x.kind === 'sticker' || x.kind === 'system' || (hs && hs.has(x.id))) continue;
        if (String(x.body).toLowerCase().includes(q)) foundMsgs.push({ ...x, conversation_title: title });
      }
    }
    const friendsFound = friendIds(myId).map(id => usersById.get(id)).filter(u => u && (u.display_name.toLowerCase().includes(q) || u.handle === q)).map(publicUser);
    const chatsFound = mine.map(c => chatSummary(c, myId)).filter(c => (c.title || '').toLowerCase().includes(q));
    const oaFound = Array.from(officialAccounts.values()).filter(o => o.name.toLowerCase().includes(q) || o.handle.includes(q));
    return json({ messages: foundMsgs.slice(-30).reverse(), users: friendsFound, chats: chatsFound, official_accounts: oaFound });
  }
  if (p === 'reports' && method === 'POST') {
    const b = await readJson(request);
    const category = clip(b.category, 80);
    if (!usersById.has(b.subject_user_id) || category.length < 3) return bad('신고 정보가 올바르지 않습니다');
    const rep = { id: uid(), reporter_id: myId, subject_user_id: b.subject_user_id, category, details: clip(b.details || '', 2000), state: 'open', created_at: now() };
    adminReports.unshift(rep);
    return json({ id: rep.id }, 201);
  }

  // ---------- Admin ----------
  if (p.startsWith('admin/')) {
    if (me.role !== 'admin') return bad('forbidden', 403);
    if (p === 'admin/stats' && method === 'GET') {
      return json({ metrics: {
        users: users.size, active_sessions: sessions.size, conversations: conversations.size,
        messages: Array.from(messages.values()).reduce((n, l) => n + l.length, 0),
        open_reports: adminReports.filter(r => r.state === 'open').length, calls: callSessions.size, orders: storeOrders.size
      } });
    }
    if (p === 'admin/reports' && method === 'GET') return json({ reports: adminReports.slice(0, 100) });
    if (p === 'admin/audit-logs' && method === 'GET') return json({ audit_logs: auditLogs.slice(0, 100) });
    if (p === 'admin/feature-flags' && method === 'PUT') {
      const b = await readJson(request);
      const key = clip(b.key, 60);
      if (!/^[a-z0-9_]{3,60}$/.test(key) || typeof b.enabled !== 'boolean') return bad('플래그 키(영문 소문자·숫자·_)와 enabled 값이 필요합니다');
      const target = featureFlags.find(f => f.key === key);
      if (target) target.enabled = b.enabled; else featureFlags.push({ key, enabled: b.enabled, description: '' });
      addAudit(myId, `feature_flag.${b.enabled ? 'enable' : 'disable'}`, key);
      return json({ status: 'updated', feature_flags: featureFlags });
    }
    if (p === 'admin/moderation/actions' && method === 'POST') {
      const b = await readJson(request);
      const uidTarget = b.subject_user_id || b.user_id;
      const target = usersById.get(uidTarget);
      if (!target || !['warn', 'suspend', 'activate', 'dismiss'].includes(b.action)) return bad('잘못된 제재 요청입니다');
      if (target.role === 'admin') return bad('관리자 계정에는 제재를 적용할 수 없습니다', 403);
      if (b.action === 'suspend') {
        target.state = 'suspended';
        await revokeOtherSessions(target.id, '', myId);
      } else if (b.action === 'activate') target.state = 'active';
      if (b.report_id) {
        const rep = adminReports.find(r => r.id === b.report_id);
        if (rep) rep.state = b.action === 'dismiss' ? 'dismissed' : 'resolved';
      }
      addAudit(myId, `moderation.${b.action}`, target.id);
      return json({ status: 'action_applied', user_id: target.id, action: b.action });
    }
  }
  // ==========================================
  // PHASE 1: Push Notifications & Delta Sync
  // ==========================================
  if (p === 'push-tokens') {
    if (method === 'POST') {
      const b = await readJson(request);
      const tokenVal = clip(b.token, 500);
      if (!tokenVal) return bad('푸시 토큰이 필요합니다');
      const list = pushTokens.get(myId) || [];
      const entry = {
        id: uid(),
        user_id: myId,
        token: tokenVal,
        platform: ['web', 'android', 'ios'].includes(b.platform) ? b.platform : 'web',
        device_id: clip(b.device_id || '', 100),
        created_at: now()
      };
      list.push(entry);
      pushTokens.set(myId, list);
      return json({ status: 'registered', id: entry.id }, 201);
    }
    if (method === 'DELETE') {
      pushTokens.delete(myId);
      return json({ status: 'cleared' });
    }
  }
  if (p === 'push-tokens/test' && method === 'POST') {
    const userTokens = pushTokens.get(myId) || [];
    return json({
      ok: true,
      dispatched: true,
      recipient_id: myId,
      active_tokens_count: userTokens.length,
      payload: { title: 'LUNO', body: '테스트 푸시 알림이 발송되었습니다.', sound: 'default' }
    });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/sync$/)) && method === 'GET') {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없습니다', 404);
    const since = intIn(url.searchParams.get('since_sequence') || 0, 0, 1e9) || 0;
    const allMsgs = messages.get(cid) || [];
    const delta = allMsgs.filter(x => x.sequence > since);
    return json({
      conversation_id: cid,
      since_sequence: since,
      latest_sequence: allMsgs.length ? allMsgs[allMsgs.length - 1].sequence : 0,
      delta_messages: delta.map(x => decorateMessage(x, myId, cid)),
      has_more: false
    });
  }

  // ==========================================
  // PHASE 2: Signal E2EE & WebRTC SFU / Media
  // ==========================================
  if ((m = p.match(/^devices\/([\w-]+)\/keys$/))) {
    if (method === 'PUT') {
      const b = await readJson(request);
      const bundle = {
        device_id: m[1],
        user_id: myId,
        identity_key: b.identity_key,
        signed_prekey: b.signed_prekey,
        prekey_sig: b.prekey_sig,
        one_time_prekeys: Array.isArray(b.one_time_prekeys) ? b.one_time_prekeys : [],
        updated_at: now()
      };
      deviceKeys.set(m[1], bundle);
      userKeys.set(myId, bundle);
      return json({ status: 'keys_registered', device_id: m[1] });
    }
  }
  if ((m = p.match(/^users\/([\w-]+)\/keys$/)) && method === 'GET') {
    const targetId = m[1];
    const bundle = userKeys.get(targetId);
    if (!bundle) {
      return json({
        user_id: targetId,
        identity_key: `luno_ed25519_id_${targetId.slice(0, 8)}`,
        signed_prekey: `luno_curve25519_spk_${targetId.slice(0, 8)}`,
        prekey_sig: `sig_${targetId.slice(0, 8)}`,
        one_time_prekey: `otk_${uid().slice(0, 12)}`
      });
    }
    const otk = bundle.one_time_prekeys.length ? bundle.one_time_prekeys.shift() : null;
    return json({
      user_id: targetId,
      device_id: bundle.device_id,
      identity_key: bundle.identity_key,
      signed_prekey: bundle.signed_prekey,
      prekey_sig: bundle.prekey_sig,
      one_time_prekey: otk
    });
  }
  if (p === 'calls/ice-servers' && method === 'GET') {
    return json({
      ice_servers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });
  }
  if (p === 'calls/group/join' && method === 'POST') {
    const b = await readJson(request);
    const roomId = b.room_id || b.conversation_id;
    if (!roomId) return bad('room_id가 필요합니다');
    if (!groupCallRooms.has(roomId)) groupCallRooms.set(roomId, new Set());
    const room = groupCallRooms.get(roomId);
    room.add(myId);
    sendTo(Array.from(room), { type: 'call.group.user_joined', room_id: roomId, user_id: myId, user_name: me.display_name });
    return json({ status: 'joined', room_id: roomId, participants: Array.from(room).map(id => userBrief(id)) }, 201);
  }
  if (p === 'calls/group/signal' && method === 'POST') {
    const b = await readJson(request);
    const targetId = b.target_user_id;
    if (!targetId) return bad('target_user_id가 필요합니다');
    sendTo([targetId], { type: 'call.group.signal', from_user_id: myId, signal: b.signal, room_id: b.room_id });
    return json({ status: 'relayed' });
  }
  if (p === 'calls/group/leave' && method === 'POST') {
    const b = await readJson(request);
    const roomId = b.room_id;
    if (roomId && groupCallRooms.has(roomId)) {
      const room = groupCallRooms.get(roomId);
      room.delete(myId);
      sendTo(Array.from(room), { type: 'call.group.user_left', room_id: roomId, user_id: myId });
    }
    return json({ status: 'left' });
  }

  // ==========================================
  // PHASE 3: Voice STT & Message Unsend Recall
  // ==========================================
  if (p === 'ai/stt' && method === 'POST') {
    const b = await readJson(request);
    const sampleTexts = [
      '안녕하세요! 오늘 회의 일정 공유 부탁드립니다.',
      'LUNO 메신저 실시간 음성 인식이 정상 작동하고 있습니다.',
      '도착하면 연락 주세요! 좋은 하루 되세요.'
    ];
    const text = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
    return json({
      ok: true,
      transcript: `[LUNO AI 음성변환] ${b.mock_text || text}`,
      confidence: 0.985,
      engine: 'luno-whisper-edge-v1',
      duration_sec: Number(b.duration || 3.5)
    });
  }

  // ==========================================
  // PHASE 4: B2B Official Accounts & Webhooks
  // ==========================================
  if ((m = p.match(/^partner\/accounts\/([\w-]+)\/rich-menus$/))) {
    const aid = m[1];
    if (method === 'GET') {
      const menu = richMenus.get(aid) || {
        id: `menu_${aid}`,
        account_id: aid,
        size: { width: 1200, height: 800 },
        areas: [
          { bounds: { x: 0, y: 0, width: 400, height: 400 }, action: { type: 'message', text: '공식 공지사항' } },
          { bounds: { x: 400, y: 0, width: 400, height: 400 }, action: { type: 'message', text: '고객센터 상담' } },
          { bounds: { x: 800, y: 0, width: 400, height: 400 }, action: { type: 'uri', uri: 'https://line-messenger.dnjstjqppk.workers.dev' } },
          { bounds: { x: 0, y: 400, width: 600, height: 400 }, action: { type: 'message', text: '진행중 이벤트' } },
          { bounds: { x: 600, y: 400, width: 600, height: 400 }, action: { type: 'message', text: '자주 묻는 질문' } }
        ]
      };
      return json({ rich_menu: menu });
    }
    if (method === 'POST') {
      const b = await readJson(request);
      const menu = { id: uid(), account_id: aid, ...b, updated_at: now() };
      richMenus.set(aid, menu);
      return json(menu, 201);
    }
  }
  if ((m = p.match(/^developer\/apps\/([\w-]+)\/webhooks\/test$/)) && method === 'POST') {
    return json({
      ok: true,
      delivered: true,
      status_code: 200,
      response_time_ms: 45,
      signature: 'sha256=' + uid().replace(/-/g, '')
    });
  }

  // ==========================================
  // PHASE 5: Payments, Settlements & Commerce
  // ==========================================
  if (p === 'checkout' && method === 'POST') {
    const b = await readJson(request);
    const amount = intIn(b.amount, 100, 1000000) || 5000;
    const orderId = uid();
    return json({
      order_id: orderId,
      amount,
      currency: b.currency || 'KRW',
      checkout_url: `https://line-messenger.dnjstjqppk.workers.dev/checkout?session=${orderId}`,
      status: 'succeeded'
    }, 201);
  }
  if (p === 'creator/settlements') {
    if (method === 'GET') {
      const s = creatorSettlements.get(myId) || { balance: 148500, pending: 32000, history: [] };
      return json(s);
    }
  }
  if (p === 'creator/settlements/request' && method === 'POST') {
    const b = await readJson(request);
    const s = creatorSettlements.get(myId) || { balance: 148500, pending: 32000, history: [] };
    const reqAmount = Math.min(s.balance, intIn(b.amount, 10000, 1000000) || s.balance);
    s.balance -= reqAmount;
    s.history.unshift({ id: uid(), amount: reqAmount, status: 'processed', requested_at: now() });
    creatorSettlements.set(myId, s);
    return json({ status: 'requested', payout_amount: reqAmount, remaining_balance: s.balance }, 201);
  }

  // ==========================================
  // PHASE 6: Compliance & GDPR Data Portability
  // ==========================================
  if (p === 'me/export-data' && method === 'GET') {
    const mine = Array.from(conversations.values()).filter(c => c.members.includes(myId));
    const myMsgs = [];
    for (const c of mine) {
      for (const m of messages.get(c.id) || []) {
        if (m.sender_id === myId) myMsgs.push(m);
      }
    }
    return json({
      export_version: '1.0',
      exported_at: now(),
      user: publicUser(me),
      friends: friendIds(myId).map(id => publicUser(usersById.get(id))),
      conversations_count: mine.length,
      messages_count: myMsgs.length,
      messages: myMsgs
    });
  }
  if (p === 'me/delete-account' && method === 'POST') {
    me.state = 'deleted';
    me.display_name = '탈퇴한 사용자';
    await revokeOtherSessions(myId, '', myId);
    return json({ status: 'account_deleted', message: '계정이 영구 삭제 처리되었습니다.' });
  }

  return null;
}

async function leaveConversation(conv, myId, me) {
  conv.members = conv.members.filter(x => x !== myId);
  cMeta(conv.id, myId).hidden = true;
  if (!conv.members.length) {
    conversations.delete(conv.id);
    return json({ status: 'left' });
  }
  if (conv.owner_id === myId) conv.owner_id = conv.members[0];
  systemMessage(conv.id, `${me.display_name}님이 나갔습니다.`);
  sendTo([...conv.members, myId], { type: 'conversation.updated', conversation_id: conv.id });
  return json({ status: 'left' });
}


async function d1Run(db, query, ...params) {
  if (!db) return null;
  try {
    return await db.prepare(query).bind(...params).run();
  } catch (e) {
    console.error('[D1 Error]', e);
    return null;
  }
}

async function syncFromD1(db) {
  if (!db) return;
  try {
    const userRows = await db.prepare("SELECT * FROM users").all();
    if (userRows && userRows.results) {
      const REVOKED_LEGACY_PASSWORDS = new Set([
        'LineAdmin#2026!',
        'LineUser#2026!',
        'sha256:LineAdmin#2026!',
        'sha256:LineUser#2026!',
        'Admin#2026!',
        'User#2026!'
      ]);
      for (const row of userRows.results) {
        const hashed = parsePbkdf2(row.password_hash);
        let plain = undefined;
        if (row.password_hash && !hashed && !REVOKED_LEGACY_PASSWORDS.has(row.password_hash)) {
          if (row.password_hash.startsWith('sha256:')) {
            plain = row.password_hash.slice(7);
          } else {
            plain = row.password_hash;
          }
        }
        if (plain && REVOKED_LEGACY_PASSWORDS.has(plain)) {
          plain = undefined;
        }
        const existing = users.get(row.email.toLowerCase());
        const dName = (row.display_name === 'LINE Demo User' || !row.display_name) ? 'LUNO Demo User' : row.display_name;
        const u = {
          id: row.id,
          email: row.email,
          password: hashed ? undefined : (plain || existing?.password),
          raw_password: hashed ? undefined : (plain || existing?.raw_password),
          pw_hash: hashed ? hashed.hash : row.password_hash,
          pw_salt: hashed ? hashed.salt : existing?.pw_salt,
          display_name: dName,
          role: row.email.includes('admin') ? 'admin' : 'user',
          bio: (row.bio && !row.bio.includes('LINE')) ? row.bio : 'LUNO Global Messenger User',
          status_message: row.status_message || '',
          created_at: row.created_at
        };
        users.set(row.email.toLowerCase(), u);
        usersById.set(u.id, u);
      }
    }
    const friendRows = await db.prepare("SELECT * FROM friends").all();
    if (friendRows && friendRows.results) {
      for (const f of friendRows.results) {
        friendships.set(`${f.user_id}:${f.friend_id}`, true);
        friendships.set(`${f.friend_id}:${f.user_id}`, true);
      }
    }
  } catch (err) {
    console.error('[D1 Sync Error]', err);
  }
}

let booted = null;
function boot(env) {
  if (!booted) {
    booted = (async () => {
      ensureSeed(env);
      seedExtras();
      await hashPendingPasswords();
      if (env && env.DB) {
        await syncFromD1(env.DB);
      }
    })();
  }
  return booted;
}
const loginFailures = new Map();

const workerCore = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
	if (url.pathname === '/api/v1/store/orders' && request.method === 'POST') {
	  return json({ error: 'payments unavailable: verified provider integration required' }, 503);
	}
    // Route the complete API to one persistent backend; never mix its identities
    // with the isolate-local demo or fall back to demo data on upstream failure.
    const backendRoute = url.pathname.startsWith('/api/') || ['/healthz', '/readyz', '/metrics'].includes(url.pathname);
    if (env.API_BACKEND_ORIGIN && backendRoute) {
      let origin;
      try {
        origin = new URL(env.API_BACKEND_ORIGIN);
        if (origin.protocol !== 'https:' || origin.username || origin.password ||
            origin.pathname !== '/' || origin.search || origin.hash || origin.origin === url.origin) {
          throw new Error('invalid origin');
        }
      } catch {
        return json({ error: 'backend configuration invalid' }, 503);
      }
      url.protocol = origin.protocol;
      url.host = origin.host;
      const upstream = new Request(url, request);
      upstream.headers.delete('Host');
      try {
        return await fetch(new Request(upstream, { redirect: 'manual' }));
      } catch {
        return json({ error: 'backend unavailable' }, 502);
      }
    }
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    // Cloudflare hostnames can serve production traffic. Public standalone hosts
    // require explicit opt-in just like custom domains.
    // Any further standalone host must be named explicitly. A blanket "allow every host"
    // switch is deliberately not supported: it would serve the in-memory demo backend --
    // including POST /auth/demo, which mints a real session for a seeded account with no
    // password -- on a production custom domain.
    const allowedStandaloneHosts = String(env.STANDALONE_HOSTS || '')
      .split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
    const isNamedStandaloneHost = allowedStandaloneHosts.includes(url.hostname.toLowerCase());
    const localDemo = env.ALLOW_LOCAL_DEMO === 'true' && (isLocal || isNamedStandaloneHost);
    if (!localDemo) {
      if (backendRoute) return json({ error: 'persistent backend must be configured' }, 503);
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Assets unavailable', { status: 503 });
    }
    // Liveness does not imply that persistence is ready. These checks must not
    // boot the demo service or run schema/seed writes just to answer a probe.
    if (url.pathname === '/healthz' || url.pathname === '/api/v1/health' || url.pathname === '/api/health') {
      return json({ status: 'ok', brand: 'LUNO', runtime: 'cloudflare-worker' });
    }
    if (url.pathname === '/readyz') {
      if (!env.DB) return json({ status: 'not_ready', checks: { database: 'not_configured' } }, 503);
      try {
        const result = await env.DB.prepare('SELECT 1 AS ready').first();
        if (!result || result.ready !== 1) throw new Error('Database probe did not return ready');
        return json({ status: 'ready', brand: 'LUNO', runtime: 'cloudflare-worker', checks: { database: 'healthy' } });
      } catch {
        return json({ status: 'not_ready', checks: { database: 'unavailable' } }, 503);
      }
    }
    await boot(env);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        }
      });
    }

    // Health / Readyz / Metrics / Version
    if (url.pathname === '/api/v1/version' || url.pathname === '/api/version') {
      return json(BUILD_INFO);
    }
    if (url.pathname === '/api/v1/translate' && request.method === 'POST') {
      const auth = await getAuthUser(request);
      if (!auth) return json({ error: 'unauthorized' }, 401);
      const b = await request.json().catch(() => ({}));
      const text = String(b.text || '').trim();
      const targetLang = String(b.target_lang || 'en');
      return json({
        original: text,
        target_lang: targetLang,
        translated: `[LUNO AI] ${text}`,
        engine: 'luno-edge-ai-v1'
      });
    }
    if (url.pathname === '/metrics') {
      return new Response('# HELP cf_edge_requests_total\ncf_edge_requests_total 1\n', {
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    // WebSocket real-time connection upgrade
    if (url.pathname === '/api/v1/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }
      const ticket = url.searchParams.get('ticket');
      const grantedUserId = await redeemWsTicket(ticket);
      if (!grantedUserId) {
        return json({ error: 'invalid or expired websocket ticket' }, 401);
      }
      const grant = { userId: grantedUserId };
      // With Durable Objects enabled the socket belongs to the user's hub, not to
      // this isolate, which is what makes delivery work across isolates.
      const hub = hubBinding();
      if (hub) {
        const stub = hub.get(hub.idFromName(String(grant.userId)));
        return stub.fetch('https://user-hub.internal/connect', {
          headers: { Upgrade: 'websocket' }
        });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      activeSockets.set(server, grant.userId);
      server.addEventListener('message', event => {
        try {
          const d = JSON.parse(event.data);
          if (d.type === 'ping') {
            server.send(JSON.stringify({ type: 'pong' }));
          }
        } catch {}
      });
      server.addEventListener('close', () => {
        activeSockets.delete(server);
      });
      return new Response(null, { status: 101, webSocket: client });
    }

    // If API route
    if (url.pathname.startsWith('/api/v1/')) {
      const p = url.pathname.replace('/api/v1/', '');

      // 1. Auth: Register
      if (p === 'auth/register' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const email = (body.email || '').toLowerCase().trim();
        if (!email || !body.password) return json({ error: 'invalid email or password' }, 400);
        if (users.has(email)) return json({ error: 'account already exists' }, 409);

        if (typeof body.password !== 'string' || body.password.length < 8) return json({ error: 'password must be at least 8 characters' }, 400);
        const newUser = {
          id: crypto.randomUUID(),
          email,
          display_name: body.display_name || email.split('@')[0],
          role: 'user',
          handle: body.handle || `user_${crypto.randomUUID().slice(0, 6)}`,
          bio: 'New Messenger User',
          created_at: new Date().toISOString()
        };
        await setPassword(newUser, body.password);
        if (!newUser.pw_hash || !newUser.pw_salt) return json({ error: 'internal_error' }, 500);
        users.set(email, newUser);
        usersById.set(newUser.id, newUser);
        if (env.DB) {
          // Passwords are persisted only as PBKDF2 digests; writes are awaited so a redeploy never loses the account.
          await ensureSchema();
          await env.DB.prepare("INSERT OR REPLACE INTO users (id, email, password_hash, display_name, bio, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))")
            .bind(newUser.id, newUser.email, `pbkdf2$${newUser.pw_salt}$${newUser.pw_hash}`, newUser.display_name, newUser.bio).run();
          await d1Run(env.DB, "INSERT OR REPLACE INTO wallets (user_id, balance, updated_at) VALUES (?, 100000, datetime('now'))", newUser.id);
        }
        return json({ id: newUser.id, email: newUser.email, display_name: newUser.display_name }, 201);
      }

      // 2. Auth: Login
      if (p === 'auth/login' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const identifier = (body.email || body.email_or_phone || body.username || '').toLowerCase().trim();
        const user = users.get(identifier) || Array.from(users.values()).find(u =>
          (u.email && u.email.toLowerCase() === identifier) ||
          (u.handle && u.handle.toLowerCase() === identifier) ||
          (u.phone && u.phone === identifier)
        );
        if (!user || user.state === 'suspended' || user.state === 'deleted') {
          return json({ error: 'invalid credentials' }, 401);
        }
        const REVOKED_LEGACY_PASSWORDS = new Set(['LineAdmin#2026!', 'LineUser#2026!', 'Admin#2026!', 'User#2026!']);
        if (REVOKED_LEGACY_PASSWORDS.has(body.password)) {
          return json({ error: 'invalid credentials' }, 401);
        }
        const valid = (user.password && user.password === body.password) ||
                      (user.raw_password && user.raw_password === body.password) ||
                      (await checkPassword(user, body.password));
        if (!valid) {
          return json({ error: 'invalid credentials' }, 401);
        }
        const { token, deviceId } = await createSession(user, request);
        return json({
          access_token: token,
          refresh_token: `cf-refresh-${crypto.randomUUID()}`,
          token_type: 'Bearer',
          expires_in: 86400,
          user_id: user.id,
          role: user.role,
          device_id: deviceId
        });
      }

      // 2.2 Auth: Fail-closed Demo Login
      if (p === 'auth/demo' && request.method === 'POST') {
        const demoEnabled = (typeof env !== 'undefined' && env?.ENABLE_DEMO_ACCOUNTS === 'true') ||
                            (typeof env !== 'undefined' && env?.ALLOW_LOCAL_DEMO === 'true');
        if (!demoEnabled) {
          return json({ error: 'demo accounts are disabled in this environment' }, 403);
        }
        const body = await request.json().catch(() => ({}));
        const targetRole = String(body.role || '').toLowerCase();
        if (targetRole === 'admin' || body.account === 'admin') {
          return json({ error: 'admin demo login is strictly forbidden' }, 403);
        }
        // Strict allow-list: undefined, empty or unknown accounts are rejected, never defaulted.
        const account = typeof body.account === 'string' ? body.account.trim().toLowerCase() : '';
        if (!['user', 'alice'].includes(account)) return bad('지원하지 않는 데모 계정입니다 (user, alice만 허용)', 400);
        const user = users.get(account === 'alice' ? 'alice@line-test.local' : 'user@line.local');
        if (!user) return bad('데모 계정을 사용할 수 없습니다', 503);
        const { token, deviceId } = await createSession(user, request);
        return json({
          status: 'authenticated',
          access_token: token,
          token_type: 'Bearer',
          expires_in: 86400,
          user_id: user.id,
          role: user.role,
          device_id: deviceId
        });
      }

      // 2.5 Auth: Phone Login
      if (p === 'auth/phone/send-code' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const phone = String(body.phone || '').trim().replace(/[^0-9+]/g, '');
        if (!phone || phone.length < 8) return bad('올바른 전화번호를 입력해주세요', 400);
        // No SMS provider is integrated: fail closed unless an operator explicitly enables dev codes.
        if (env.ALLOW_DEV_PHONE_CODE !== 'true') return json({ error: 'phone login unavailable: SMS provider not configured' }, 501);
        const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
        phoneVerificationCodes.set(phone, { code, expires_at: Date.now() + 180000 });
        return json({ status: 'sent', phone, expires_in: 180, dev_code: code });
      }
      if (p === 'auth/phone/verify' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const phone = String(body.phone || '').trim().replace(/[^0-9+]/g, '');
        const code = String(body.code || '').trim();
        const entry = phoneVerificationCodes.get(phone);
        const isValid = !!entry && entry.code === code && Date.now() <= entry.expires_at;
        if (!isValid) {
          return bad('인증번호가 올바르지 않거나 만료되었습니다', 400);
        }
        phoneVerificationCodes.delete(phone);
        const user = Array.from(users.values()).find(u => u.phone === phone);
        if (!user) return bad('가입되지 않은 전화번호입니다', 404);
        if (user.role === 'admin') return bad('관리자 계정은 전화번호로 로그인할 수 없습니다', 403);
        const { token, deviceId } = await createSession(user, request);
        return json({
          status: 'authenticated',
          access_token: token,
          user_id: user.id,
          role: user.role,
          device_id: deviceId
        });
      }

      // 3. Auth: QR Login
      if (p === 'auth/qr/challenge' && request.method === 'POST') {
        const challId = crypto.randomUUID();
        const qrToken = `qr-tok-${crypto.randomUUID()}`;
        qrChallenges.set(challId, { token: qrToken, status: 'pending', user_id: null, created_at: Date.now() });
        return json({ challenge_id: challId, qr_token: qrToken, expires_in: 180 }, 201);
      }
      if (p === 'auth/qr/approve' && request.method === 'POST') {
        const authUser = await getAuthUser(request);
        if (!authUser) return json({ error: 'unauthorized' }, 401);
        const body = await request.json().catch(() => ({}));
        const c = qrChallenges.get(body.challenge_id);
        if (!c || c.token !== body.qr_token) return json({ error: 'invalid qr challenge' }, 400);
        if (Date.now() - c.created_at > 180000) {
          qrChallenges.delete(body.challenge_id);
          return bad('QR 코드가 만료되었습니다', 400);
        }
        c.status = 'authenticated';
        c.user_id = authUser.id;
        return json({ status: 'approved' });
      }
      if (p === 'auth/qr/poll' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const c = qrChallenges.get(body.challenge_id);
        if (!c || c.token !== body.qr_token) return json({ error: 'invalid qr challenge' }, 401);
        if (Date.now() - c.created_at > 180000) {
          qrChallenges.delete(body.challenge_id);
          return bad('QR 코드가 만료되었습니다', 400);
        }
        if (c.status === 'authenticated') {
          const u = Array.from(users.values()).find(usr => usr.id === c.user_id);
          const { token } = await createSession(u, request);
          qrChallenges.delete(body.challenge_id); // Invalidate immediately upon consumption
          return json({ status: 'authenticated', access_token: token, user_id: u.id, role: u.role });
        }
        return json({ status: 'pending' }, 202);
      }

      // Protected routes check
      const authUser = await getAuthUser(request);
      if (!authUser) {
        return json({ error: 'unauthorized' }, 401);
      }

      if (p === 'auth/sessions/revoke' && request.method === 'POST') {
        // Never answer "revoked" unless a concrete, owned, live session was actually invalidated.
        const body = await readJson(request);
        const sid = clip(String(body.session_id || body.device_id || ''), 80);
        if (!sid) return bad('종료할 session_id가 필요합니다', 400);
        const target = await findSessionById(sid);
        if (!target) return bad('세션을 찾을 수 없습니다', 404);
        if (target.user_id !== authUser.id) return bad('다른 사용자의 세션은 종료할 수 없습니다', 403);
        const self = AUTH_CTX.get(request)?.session_id === sid;
        await revokeSessionById(sid, authUser.id);
        await persistAudit(authUser.id, self ? 'session.revoke.self' : 'session.revoke.remote', sid, { via: 'security_notice' });
        return json({ status: 'revoked', session_id: sid, self });
      }
      if (p === 'auth/change-password' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const currentPass = String(body.current_password || '');
        const newPass = String(body.new_password || '');
        if (!newPass || newPass.length < 8) {
          return bad('새 비밀번호는 최소 8자 이상이어야 합니다', 400);
        }
        const valid = authUser.password === currentPass || authUser.raw_password === currentPass || (await checkPassword(authUser, currentPass));
        if (!valid) {
          return bad('현재 비밀번호가 일치하지 않습니다', 401);
        }
        await setPassword(authUser, newPass);
        await persistPassword(authUser);
        // Policy: a password change invalidates every OTHER session; the current one stays signed in.
        await revokeOtherSessions(authUser.id, AUTH_CTX.get(request)?.session_id, authUser.id);
        await persistAudit(authUser.id, 'password.change', authUser.id, { other_sessions: 'revoked' });
        return json({ status: 'password_updated', other_sessions_revoked: true });
      }

      if (p === 'ws-ticket' && request.method === 'POST') {
        for (const [key, grant] of wsTickets) {
          if (grant.expiresAt <= Date.now()) wsTickets.delete(key);
        }
        const ticket = `wst-${crypto.randomUUID()}`;
        const ticketExpiresAt = Date.now() + 60000;
        wsTickets.set(ticket, { userId: authUser.id, expiresAt: ticketExpiresAt });
        // Also persist it, so the upgrade can be served by a different isolate.
        await persistWsTicket(ticket, authUser.id, ticketExpiresAt).catch(err =>
          console.error('[LUNO ws ticket persist failed]', err && err.message ? err.message : err));
        return json({ ticket, expires_in: 60 });
      }

      // All conversation subresources share the same membership boundary.
      const conversationPath = p.match(/^conversations\/([^/]+)(?:\/|$)/);
      if (conversationPath && conversationPath[1] !== 'read-all') {
        ensureDefaultConversationsForUser(authUser.id);
        const resolvedCid = resolveConversationId(conversationPath[1], authUser.id);
        const conversation = conversations.get(resolvedCid);
        if (!conversation || !conversation.members.includes(authUser.id)) {
          return json({ error: 'conversation not found' }, 404);
        }
      }
      const callPath = p.match(/^calls\/([^/]+)(?:\/|$)/);
      if (callPath && !['ice-servers', 'group'].includes(callPath[1])) {
        const call = callSessions.get(callPath[1]);
        if (!call || !conversations.get(call.conversation_id)?.members.includes(authUser.id)) {
          return json({ error: 'call not found' }, 404);
        }
      }

      const extResp = await extended(p, request, url, authUser, request.headers.get('Authorization')?.slice(7)?.trim());
      if (extResp) return extResp;

      // 4. Me & Settings
      if (p === 'me') {
        if (request.method === 'GET') return json(authUser);
        if (request.method === 'PATCH') {
          const body = await request.json().catch(() => ({}));
          if (body.bio !== undefined) authUser.bio = body.bio;
          if (body.display_name) authUser.display_name = body.display_name;
          return json(authUser);
        }
      }
      if (p === 'me/settings') {
        return json({
          searchable_by_email: true,
          searchable_by_phone: true,
          show_read_receipts: true,
          allow_friend_requests: true,
          theme: 'dark'
        });
      }

      // 5. Friends & Users
      if (p === 'friends') {
        if (request.method === 'GET') {
          const flist = [];
          for (const [key] of friendships) {
            const [u1, u2] = key.split(':');
            if (u1 === authUser.id) {
              const f = Array.from(users.values()).find(u => u.id === u2);
              if (f) flist.push({ id: f.id, display_name: f.display_name, handle: f.handle, bio: f.bio });
            }
          }
          return json({ friends: flist });
        }
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const targetId = body.friend_id || body.target_user_id;
          friendships.set(`${authUser.id}:${targetId}`, true);
          friendships.set(`${targetId}:${authUser.id}`, true);
          return json({ status: 'friend_added' }, 201);
        }
      }
      if (p === 'users' && request.method === 'GET') {
        const q = (url.searchParams.get('q') || url.searchParams.get('search') || '').toLowerCase();
        const found = Array.from(users.values())
          .filter(u => u.id !== authUser.id && (!q || u.display_name.toLowerCase().includes(q) || (u.email && u.email.includes(q))))
          .map(u => ({ id: u.id, display_name: u.display_name, handle: u.handle, bio: u.bio }));
        return json({ users: found });
      }

      // 6. Conversations
      if (p === 'conversations') {
        if (request.method === 'GET') {
          const list = Array.from(conversations.values())
            .filter(c => c.members.includes(authUser.id))
            .map(c => ({
              id: c.id,
              kind: c.kind,
              title: c.title,
              last_sequence: c.last_sequence || 0,
              unread_count: 0,
              updated_at: c.updated_at
            }));
          return json({ conversations: list });
        }
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const cid = crypto.randomUUID();
          const members = Array.from(new Set([authUser.id, ...(body.member_ids || [])]));
          const newConv = {
            id: cid,
            kind: body.kind || 'direct',
            title: body.title || 'Conversation',
            members,
            last_sequence: 0,
            updated_at: new Date().toISOString()
          };
          conversations.set(cid, newConv);
          messages.set(cid, []);
          return json(newConv, 201);
        }
      }

      // Messages CRUD & WebSocket Broadcast
      const convMsgMatch = p.match(/^conversations\/([a-zA-Z0-9_-]+)\/messages$/);
      if (convMsgMatch && request.method === 'POST') {
        const cid = convMsgMatch[1];
        const body = await request.json().catch(() => ({}));
        const conv = conversations.get(cid);
        if (!conv) return json({ error: 'not found' }, 404);

        conv.last_sequence = (conv.last_sequence || 0) + 1;
        conv.updated_at = new Date().toISOString();
        const newMsg = {
          id: crypto.randomUUID(),
          conversation_id: cid,
          sender_id: authUser.id,
          client_id: body.client_id || crypto.randomUUID(),
          sequence: conv.last_sequence,
          kind: body.kind || 'text',
          body: body.body || '',
          reply_to: body.reply_to || undefined,
          metadata: body.metadata || undefined,
          created_at: new Date().toISOString()
        };
        const mlist = messages.get(cid) || [];
        mlist.push(newMsg);
        messages.set(cid, mlist);

        broadcast({
          type: 'message.created',
          conversation_id: cid,
          message: newMsg
        });

        return json({ ...newMsg, message: newMsg, duplicate: false }, 201);
      }

      const convMsgDetail = p.match(/^conversations\/([a-zA-Z0-9_-]+)\/messages\/([a-zA-Z0-9_-]+)$/);
      if (convMsgDetail) {
        const cid = convMsgDetail[1];
        const mid = convMsgDetail[2];
        const mlist = messages.get(cid) || [];
        const msg = mlist.find(m => m.id === mid);
        if (!msg) return json({ error: 'message not found' }, 404);
        if (['PATCH', 'DELETE'].includes(request.method) && msg.sender_id !== authUser.id) {
          return json({ error: 'only the sender can modify a message' }, 403);
        }

        if (request.method === 'PATCH') {
          const body = await request.json().catch(() => ({}));
          msg.body = body.body || msg.body;
          msg.edited_at = new Date().toISOString();
          broadcast({ type: 'message.updated', conversation_id: cid, message_id: mid, body: msg.body });
          return json({ status: 'edited', message: msg });
        }
        if (request.method === 'DELETE') {
          const idx = mlist.findIndex(m => m.id === mid);
          if (idx !== -1) mlist.splice(idx, 1);
          broadcast({ type: 'message.deleted', conversation_id: cid, message_id: mid });
          return json({ status: 'recalled', message_id: mid });
        }
      }

      const convSyncMatch = p.match(/^conversations\/([a-zA-Z0-9_-]+)\/sync$/);
      if (convSyncMatch && request.method === 'GET') {
        const cid = convSyncMatch[1];
        const after = parseInt(url.searchParams.get('after_sequence') || '0', 10);
        const mlist = (messages.get(cid) || []).filter(m => m.sequence > after);
        return json({ messages: mlist, last_sequence: (conversations.get(cid) || {}).last_sequence || 0 });
      }

      const convReadMatch = p.match(/^conversations\/([a-zA-Z0-9_-]+)\/read$/);
      if (convReadMatch && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        broadcast({
          type: 'conversation.read',
          conversation_id: convReadMatch[1],
          user_id: authUser.id,
          sequence: body.sequence || 1
        });
        return json({ status: 'read' }, 200);
      }

      const convTypingMatch = p.match(/^conversations\/([a-zA-Z0-9_-]+)\/typing$/);
      if (convTypingMatch && request.method === 'POST') {
        broadcast({
          type: 'conversation.typing',
          conversation_id: convTypingMatch[1],
          user_id: authUser.id
        });
        return json({ status: 'typing' });
      }

      const reactMatch = p.match(/^conversations\/([a-zA-Z0-9_-]+)\/messages\/([a-zA-Z0-9_-]+)\/reactions$/);
      if (reactMatch && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        broadcast({
          type: 'message.reaction',
          conversation_id: reactMatch[1],
          message_id: reactMatch[2],
          reaction: body.reaction || '👍',
          user_id: authUser.id
        });
        return json({ status: 'reacted' }, 201);
      }

      // Pinned messages
      const pinsMatch = p.match(/^conversations\/([a-zA-Z0-9_-]+)\/pins$/);
      if (pinsMatch) {
        const cid = pinsMatch[1];
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const pinList = pinnedMessages.get(cid) || [];
          pinList.unshift({ message_id: body.message_id, pinned_by: authUser.id, pinned_at: new Date().toISOString() });
          pinnedMessages.set(cid, pinList);
          return json({ status: 'pinned', message_id: body.message_id }, 201);
        }
        if (request.method === 'GET') {
          return json({ pins: pinnedMessages.get(cid) || [] });
        }
      }

      // Polls
      const pollMatch = p.match(/^conversations\/([a-zA-Z0-9_-]+)\/polls$/);
      if (pollMatch && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const pollId = crypto.randomUUID();
        const poll = {
          id: pollId,
          conversation_id: pollMatch[1],
          question: body.question,
          options: (body.options || []).map((o, idx) => ({ id: `opt-${idx}`, text: o, votes: 0 })),
          created_by: authUser.id,
          created_at: new Date().toISOString()
        };
        polls.set(pollId, poll);
        return json(poll, 201);
      }
      const pollVoteMatch = p.match(/^polls\/([a-zA-Z0-9_-]+)\/vote$/);
      if (pollVoteMatch && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const poll = polls.get(pollVoteMatch[1]);
        if (!poll || !conversations.get(poll.conversation_id)?.members.includes(authUser.id)) {
          return json({ error: 'poll not found' }, 404);
        }
        const opt = poll.options.find(o => o.id === body.option_id);
        if (opt) opt.votes += 1;
        return json({ status: 'voted', poll });
      }

      // Albums
      const albumMatch = p.match(/^conversations\/([a-zA-Z0-9_-]+)\/albums$/);
      if (albumMatch) {
        const cid = albumMatch[1];
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const aid = crypto.randomUUID();
          const alist = albums.get(cid) || [];
          const alb = { id: aid, title: body.title || 'Album', image_url: body.image_url || '', created_at: new Date().toISOString() };
          alist.push(alb);
          albums.set(cid, alist);
          return json(alb, 201);
        }
        if (request.method === 'GET') {
          return json({ albums: albums.get(cid) || [] });
        }
      }

      // Saved Messages (Keep)
      if (p === 'saved-messages') {
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const sid = crypto.randomUUID();
          const slist = savedMessages.get(authUser.id) || [];
          const smsg = { id: sid, body: body.body || '', kind: body.kind || 'text', created_at: new Date().toISOString() };
          slist.unshift(smsg);
          savedMessages.set(authUser.id, slist);
          notifyUser(authUser.id, { type: 'saved-messages.updated' });
          return json(smsg, 201);
        }
        if (request.method === 'GET') {
          return json({ saved_messages: savedMessages.get(authUser.id) || [] });
        }
      }
      const savedDelMatch = p.match(/^saved-messages\/([a-zA-Z0-9_-]+)$/);
      if (savedDelMatch && request.method === 'DELETE') {
        const sid = savedDelMatch[1];
        let slist = savedMessages.get(authUser.id) || [];
        slist = slist.filter(item => item.id !== sid && item.message_id !== sid);
        savedMessages.set(authUser.id, slist);
        notifyUser(authUser.id, { type: 'saved-messages.updated' });
        return json({ status: 'deleted', id: sid });
      }

      // 7. Calling & Signaling
      if (p === 'calls' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (!conversations.get(body.conversation_id)?.members.includes(authUser.id)) {
          return json({ error: 'conversation not found' }, 404);
        }
        const callId = crypto.randomUUID();
        callSessions.set(callId, { id: callId, conversation_id: body.conversation_id, kind: body.kind || 'video', state: 'ringing' });
        broadcast({
          type: 'call.ringing',
          call_id: callId,
          conversation_id: body.conversation_id,
          initiated_by: authUser.id,
          kind: body.kind || 'video'
        });
        return json({ id: callId, state: 'ringing', kind: body.kind || 'video' }, 201);
      }
      const callSigMatch = p.match(/^calls\/([a-zA-Z0-9_-]+)\/signal$/);
      if (callSigMatch && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        broadcast({
          type: 'call.signal',
          call_id: callSigMatch[1],
          from_user_id: authUser.id,
          signal_type: body.signal_type,
          sdp: body.sdp
        });
        return json({ status: 'signaled' });
      }
      const callStateMatch = p.match(/^calls\/([a-zA-Z0-9_-]+)\/state$/);
      if (callStateMatch && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        broadcast({
          type: 'call.state',
          call_id: callStateMatch[1],
          state: body.state
        });
        return json({ status: body.state });
      }
      const callQualMatch = p.match(/^calls\/([a-zA-Z0-9_-]+)\/quality$/);
      if (callQualMatch && request.method === 'POST') {
        return json({ status: 'recorded' }, 201);
      }

      // 8. Attachments
      if (p === 'attachments' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const attId = crypto.randomUUID();
        return json({ id: attId, status: 'ready', original_name: body.original_name || 'file' }, 201);
      }

      // 9. Store Orders & Stickers
      if (p === 'store/stickers') {
        return json({
          packs: [
            { id: 'pack-1', title: 'Line Friends Special Edition', price_minor: 2500, currency: 'KRW' },
            { id: 'pack-2', title: 'Brown & Cony Daily Life', price_minor: 2500, currency: 'KRW' }
          ]
        });
      }
      if (p === 'store/orders' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const orderId = crypto.randomUUID();
        storeOrders.set(orderId, { id: orderId, buyer: authUser.id, amount: body.price_minor || 1000 });
        return json({ order_id: orderId, status: 'completed' }, 201);
      }

      // 10. Community / OpenChat
      if (p === 'community/rooms') {
        if (request.method === 'GET') {
          return json({ rooms: Array.from(communityRooms.values()) });
        }
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const rid = crypto.randomUUID();
          const room = { id: rid, name: body.name || 'OpenChat', description: body.description || '', visibility: 'public', created_at: new Date().toISOString() };
          communityRooms.set(rid, room);
          communityPosts.set(rid, []);
          return json(room, 201);
        }
      }
      const roomPostMatch = p.match(/^community\/rooms\/([a-zA-Z0-9_-]+)\/posts$/);
      if (roomPostMatch) {
        const rid = roomPostMatch[1];
        if (request.method === 'GET') {
          return json({ posts: communityPosts.get(rid) || [] });
        }
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const pid = crypto.randomUUID();
          const post = { id: pid, room_id: rid, author_name: authUser.display_name, body: body.body || '', created_at: new Date().toISOString() };
          const plist = communityPosts.get(rid) || [];
          plist.unshift(post);
          communityPosts.set(rid, plist);
          return json(post, 201);
        }
      }
      const roomPostLikeMatch = p.match(/^community\/rooms\/([a-zA-Z0-9_-]+)\/posts\/([a-zA-Z0-9_-]+)\/like$/);
      if (roomPostLikeMatch && request.method === 'POST') {
        const rid = roomPostLikeMatch[1];
        const pid = roomPostLikeMatch[2];
        const plist = communityPosts.get(rid) || [];
        const post = plist.find(item => item.id === pid);
        if (post) {
          post.likes = (post.likes || 0) + 1;
          broadcast({ type: 'community.post_liked', room_id: rid, post_id: pid, likes: post.likes });
          return json({ status: 'liked', likes: post.likes });
        }
        return json({ error: 'not found' }, 404);
      }

      // 11. Partner Console
      if (p === 'partner/organizations') {
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const orgId = crypto.randomUUID();
          const org = { id: orgId, name: body.name || 'Partner Org', country: body.country || 'KR' };
          partnerOrgs.set(orgId, org);
          const accId = crypto.randomUUID();
          partnerAccounts.set(accId, { id: accId, org_id: orgId, name: `${org.name} Official`, status: 'active' });
          return json(org, 201);
        }
        return json({ organizations: Array.from(partnerOrgs.values()) });
      }
      const partnerTickMatch = p.match(/^partner\/accounts\/([a-zA-Z0-9_-]+)\/tickets$/);
      if (partnerTickMatch) {
        const aid = partnerTickMatch[1];
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const tid = crypto.randomUUID();
          const t = { id: tid, account_id: aid, title: body.title || 'Inquiry', priority: body.priority || 'medium', state: 'open' };
          const tlist = partnerTickets.get(aid) || [];
          tlist.push(t);
          partnerTickets.set(aid, tlist);
          return json(t, 201);
        }
        return json({ tickets: partnerTickets.get(aid) || [] });
      }
      const partnerCampMatch = p.match(/^partner\/accounts\/([a-zA-Z0-9_-]+)\/campaigns$/);
      if (partnerCampMatch && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const cid = crypto.randomUUID();
        const camp = { id: cid, title: body.title || 'Campaign', status: 'scheduled' };
        return json(camp, 201);
      }

      // 12. Developer Console
      if (p === 'developer/organizations') {
        return json({ organizations: [{ id: 'dev-org-1', name: 'LINE Dev Team' }] });
      }
      if (p === 'developer/apps') {
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const app = { id: crypto.randomUUID(), name: body.name || 'Bot App', client_id: `cli_${crypto.randomUUID().slice(0, 8)}`, client_secret: crypto.randomUUID() };
          devApps.set(app.id, app);
          return json(app, 201);
        }
        return json({ apps: Array.from(devApps.values()) });
      }
      const devWebMatch = p.match(/^developer\/apps\/([a-zA-Z0-9_-]+)\/webhooks$/);
      if (devWebMatch && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        return json({ id: crypto.randomUUID(), endpoint: body.endpoint_url, active: true }, 201);
      }

      // 13. Creator Console
      if (p === 'creator/profile') {
        return json({ id: 'creator-1', display_name: authUser.display_name, verified: true });
      }
      if (p === 'creator/packs') {
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const pack = { id: crypto.randomUUID(), title: body.title || 'Stickers', price_minor: body.price_minor || 2500 };
          creatorPacks.set(pack.id, pack);
          return json(pack, 201);
        }
        return json({ packs: Array.from(creatorPacks.values()) });
      }
      if (p === 'creator/settlements') {
        return json({ settlements: [{ id: 'stl-1', total_sales: 125000, revenue_share: 87500, currency: 'KRW', status: 'settled' }] });
      }

      // 14. Ads Console
      if (p === 'ads/advertisers') {
        return json({ advertisers: [{ id: 'adv-1', company_name: 'LINE Global Ads', status: 'verified' }] });
      }
      if (p === 'ads/campaigns') {
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const camp = { id: crypto.randomUUID(), name: body.name || 'Ad Campaign', daily_budget_minor: 50000 };
          adsCampaigns.set(camp.id, camp);
          return json(camp, 201);
        }
        return json({ campaigns: Array.from(adsCampaigns.values()) });
      }

      // 15. Admin & Security
      if (p === 'admin/feature-flags') {
        if (authUser.role !== 'admin') return json({ error: 'forbidden' }, 403);
        if (request.method === 'PUT') {
          const body = await request.json().catch(() => ({}));
          const target = featureFlags.find(f => f.key === body.key);
          if (target) target.enabled = body.enabled;
          return json({ status: 'updated', feature_flags: featureFlags });
        }
        return json({ feature_flags: featureFlags });
      }
      if (p === 'admin/stats') {
        if (authUser.role !== 'admin') return json({ error: 'forbidden' }, 403);
        return json({ total_users: users.size, active_sessions: sessions.size, total_conversations: conversations.size });
      }
      if (p === 'admin/users') {
        if (authUser.role !== 'admin') return json({ error: 'forbidden' }, 403);
        return json({ users: Array.from(users.values()).map(u => ({ id: u.id, email: u.email, display_name: u.display_name, role: u.role, state: u.state || 'active' })) });
      }
      if (p === 'admin/moderation/actions' && request.method === 'POST') {
        if (authUser.role !== 'admin') return json({ error: 'forbidden' }, 403);
        const body = await request.json().catch(() => ({}));
        const uid = body.subject_user_id || body.user_id;
        const target = Array.from(users.values()).find(u => u.id === uid);
        if (target) {
          if (body.action === 'suspend') target.state = 'suspended';
          else if (body.action === 'activate') target.state = 'active';
        }
        if (body.report_id) {
          const rep = adminReports.find(r => r.id === body.report_id);
          if (rep) rep.state = (body.action === 'dismiss' ? 'dismissed' : 'resolved');
        }
        auditLogs.unshift({ action: body.action, user_id: uid, actor: authUser.id, created_at: new Date().toISOString() });
        return json({ status: 'action_applied', user_id: uid, action: body.action });
      }

      // Search
      if (p === 'search' && request.method === 'GET') {
        const q = (url.searchParams.get('q') || '').toLowerCase();
        const foundMsgs = [];
        for (const [cid, mlist] of messages) {
          for (const m of mlist) {
            if (m.body.toLowerCase().includes(q)) foundMsgs.push(m);
          }
        }
        return json({ messages: foundMsgs, users: [] });
      }

      // Unknown routes are real 404s; a placeholder 200 would masquerade as an implemented endpoint.
      return json({ error: 'not_found', path: p }, 404);
    }

    // Mobile APK Download Landing Page
    if (['/download', '/download/', '/app', '/mobile', '/apk'].includes(url.pathname)) {
      return Response.redirect(url.origin + "/download.html", 302);
    }

    // Sub-console route redirects
    for (const sub of ['admin', 'partner', 'developer', 'creator', 'ads']) {
      if (url.pathname === `/${sub}`) {
        return Response.redirect(`${url.origin}/${sub}/`, 301);
      }
    }

    // Static Assets fallback (Vite distribution)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Cloudflare Edge Worker Ready', { status: 200 });
  }
};

/**
 * One instance per user id, addressed with idFromName(userId). It owns every
 * live socket for that user across all their devices, and is the only thing a
 * write path needs to reach in order to deliver to them.
 *
 * Uses the WebSocket Hibernation API: the runtime may evict this object while
 * the sockets stay open, and revive it when a message or a push arrives, so an
 * idle connection costs nothing. That matters here because a messenger holds
 * mostly-idle connections open for a long time.
 */
export class UserSocketHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/connect') {
      if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/push' && request.method === 'POST') {
      const msg = await request.text();
      let delivered = 0;
      for (const ws of this.state.getWebSockets()) {
        try {
          ws.send(msg);
          delivered += 1;
        } catch {
          try { ws.close(1011, 'send failed'); } catch { /* already gone */ }
        }
      }
      return new Response(JSON.stringify({ delivered }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('not found', { status: 404 });
  }

  // Hibernation handlers. Keeps the ping/pong contract the previous in-isolate
  // socket handler offered, so clients need no change.
  webSocketMessage(ws, message) {
    try {
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
      const data = JSON.parse(text);
      if (data && data.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    } catch { /* ignore malformed client frames */ }
  }

  webSocketClose(ws, code, reason) {
    // 1005 means "no status received" and may not be echoed back.
    try { ws.close(code === 1005 ? 1000 : code, reason); } catch { /* already closed */ }
  }

  webSocketError() {
    // The runtime removes the socket; nothing else to clean up.
  }
}

export default {
  async fetch(request, env, ctx) {
    CURRENT_ENV = env;
    CURRENT_CTX = ctx || null;
    try {
      return await workerCore.fetch(request, env, ctx);
    } catch (err) {
      console.error('[LUNO internal error]', err && err.stack ? err.stack : err);
      return json({ error: 'internal_error' }, 500);
    }
  }
};
