/**
 * Cloudflare Worker Edge Gateway & Backend for LUNO Messenger Monorepo.
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
const passkeyChallenges = new Map(); // challenge -> { userId, purpose, expiresAt }
const recoveryChallenges = new Map(); // id -> { userId, codeHash, expiresAt, consumedAt } (no-DB fallback; D1 otherwise)
const passkeyCreds = new Map(); // credentialIdB64 -> { userId, jwk, counter, transports, name, createdAt }
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
const oaBotRules = new Map();
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
const adminReports = [];
// A-20/B-3: attachment bytes live in R2 (MEDIA_BUCKET); D1 keeps metadata
// only. Base64 intake is kept so existing clients keep working.
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_B64 = 14_000_000;
const ATTACHMENT_MIME_ALLOW = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/pdf', 'text/plain',
]);
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
const SESSION_TTL_MS = 15 * 60 * 1000; // A-15: access tokens live 15 minutes.
const REFRESH_TTL_MS = 30 * 86400 * 1000; // Refresh tokens live 30 days, single-use (rotation).
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
  // hydrateCursors filters by user_id alone, which the composite primary key cannot serve.
  `CREATE INDEX IF NOT EXISTS idx_luno_read_cursors_user ON luno_read_cursors(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_sessions_user_active ON luno_sessions(user_id, created_at) WHERE revoked_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS luno_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, action TEXT NOT NULL, target TEXT, detail TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_ws_tickets (
    ticket TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_ws_tickets_exp ON luno_ws_tickets(expires_at)`,
  `CREATE TABLE IF NOT EXISTS luno_attachments (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL,
    mime TEXT NOT NULL, size INTEGER NOT NULL, b64 TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_passkey_challenges (
    challenge TEXT PRIMARY KEY, user_id TEXT NOT NULL, purpose TEXT NOT NULL,
    expires_at INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_passkey_ch_user ON luno_passkey_challenges(user_id)`,
  `CREATE TABLE IF NOT EXISTS luno_passkey_credentials (
    credential_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0, transports TEXT, name TEXT DEFAULT '', last_used_at TEXT,
    created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_passkey_cred_user ON luno_passkey_credentials(user_id)`,
  `CREATE TABLE IF NOT EXISTS luno_recovery_challenges (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL, consumed_at INTEGER, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_recovery_user ON luno_recovery_challenges(user_id)`,
];
const LUNO_SCHEMA_BASE = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, handle TEXT UNIQUE,
    password_hash TEXT NOT NULL, display_name TEXT NOT NULL, avatar_url TEXT DEFAULT '',
    cover_url TEXT DEFAULT '', prefs_json TEXT DEFAULT '',
    status_message TEXT DEFAULT '', bio TEXT DEFAULT '', phone_number TEXT DEFAULT '',
    birthday TEXT DEFAULT '', state TEXT DEFAULT 'active',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL,
    avatar_url TEXT DEFAULT '', official INTEGER DEFAULT 0, owner_id TEXT DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT DEFAULT 'member',
    last_read_message_id TEXT DEFAULT '', joined_at TEXT NOT NULL,
    is_pinned INTEGER DEFAULT 0, is_muted INTEGER DEFAULT 0, is_hidden INTEGER DEFAULT 0,
    PRIMARY KEY (conversation_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL,
    body TEXT NOT NULL, kind TEXT DEFAULT 'text', media_url TEXT DEFAULT '',
    sticker_id TEXT DEFAULT '', reply_to_id TEXT DEFAULT '',
    is_pinned INTEGER DEFAULT 0, is_unsent INTEGER DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS message_reactions (
    message_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id, emoji))`,
  `CREATE TABLE IF NOT EXISTS friends (
    user_id TEXT NOT NULL, friend_id TEXT NOT NULL, status TEXT DEFAULT 'accepted',
    is_favorite INTEGER DEFAULT 0, created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, friend_id))`,
  `CREATE TABLE IF NOT EXISTS wallets (
    user_id TEXT PRIMARY KEY, balance INTEGER DEFAULT 0, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS wallet_transactions (
    id TEXT PRIMARY KEY, from_user_id TEXT NOT NULL, to_user_id TEXT NOT NULL,
    amount INTEGER NOT NULL, note TEXT DEFAULT '', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS keep_items (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
    category TEXT DEFAULT 'text', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS openchat_rooms (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
    category TEXT DEFAULT 'general', cover_url TEXT DEFAULT '',
    member_count INTEGER DEFAULT 1, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, author_id TEXT NOT NULL,
    body TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, title TEXT NOT NULL,
    image_urls TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, title TEXT NOT NULL,
    event_date TEXT NOT NULL, location TEXT DEFAULT '', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, question TEXT NOT NULL,
    option1 TEXT NOT NULL, option2 TEXT NOT NULL, votes1 INTEGER DEFAULT 0, votes2 INTEGER DEFAULT 0,
    multiple INTEGER DEFAULT 0, closed INTEGER DEFAULT 0, created_by TEXT DEFAULT '',
    options_json TEXT DEFAULT '[]', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_notices (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
    starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, created_at TEXT NOT NULL)`
];
const LUNO_SCHEMA_PHASE1 = [
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT,
    expires_at INTEGER NOT NULL, revoked INTEGER DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_login_attempts_key ON login_attempts(key, created_at)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT NOT NULL, window_start INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key, window_start))`,
  `CREATE TABLE IF NOT EXISTS blocks (
    blocker_id TEXT NOT NULL, blocked_id TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id))`,
  `CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id)`,
  `CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL, target_type TEXT NOT NULL,
    target_id TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id)`,
  `CREATE TABLE IF NOT EXISTS user_bans (
    user_id TEXT PRIMARY KEY, reason TEXT NOT NULL DEFAULT '',
    banned_by TEXT NOT NULL DEFAULT '', expires_at INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, action TEXT NOT NULL,
    target TEXT, detail TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor)`,
  `CREATE TABLE IF NOT EXISTS e2ee_keys (
    user_id TEXT NOT NULL, device_id TEXT NOT NULL, identity_key TEXT NOT NULL DEFAULT '',
    signed_prekey TEXT NOT NULL DEFAULT '', prekeys_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL, PRIMARY KEY (user_id, device_id))`,
  `CREATE TABLE IF NOT EXISTS push_tokens (
    user_id TEXT NOT NULL, device_id TEXT NOT NULL, platform TEXT NOT NULL DEFAULT '',
    token TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, device_id))`,
  `CREATE TABLE IF NOT EXISTS conversation_notes (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, author_id TEXT NOT NULL,
    title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_conversation_notes_conv ON conversation_notes(conversation_id)`,
  `CREATE TABLE IF NOT EXISTS conversation_events (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, title TEXT NOT NULL,
    starts_at TEXT NOT NULL, location TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_conversation_events_conv ON conversation_events(conversation_id)`,
  `CREATE TABLE IF NOT EXISTS event_rsvps (
    event_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL,
    updated_at TEXT NOT NULL, PRIMARY KEY (event_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id TEXT NOT NULL, option_id TEXT NOT NULL, user_id TEXT NOT NULL,
    created_at TEXT NOT NULL, PRIMARY KEY (poll_id, option_id, user_id))`,
  `CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id)`,
  `CREATE TABLE IF NOT EXISTS reactions (
    message_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL,
    created_at TEXT NOT NULL, PRIMARY KEY (message_id, user_id, emoji))`,
  `CREATE TABLE IF NOT EXISTS call_logs (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, caller_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'voice', started_at TEXT NOT NULL,
    ended_at TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'ended')`,
  `CREATE INDEX IF NOT EXISTS idx_call_logs_conv ON call_logs(conversation_id)`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, object_key TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL DEFAULT 0,
    sha256 TEXT NOT NULL DEFAULT '', uploader_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_conv ON attachments(conversation_id)`
];
// Additive columns for tables that predate Phase 1. Applied with a
// PRAGMA guard because SQLite has no idempotent ADD COLUMN.
const LUNO_SCHEMA_PHASE1_COLS = [
  ['users', 'handle', 'TEXT'],
  ['users', 'birthday', "TEXT DEFAULT ''"],
  ['users', 'avatar_url', "TEXT DEFAULT ''"],
  ['users', 'cover_url', "TEXT DEFAULT ''"],
  ['users', 'prefs_json', "TEXT DEFAULT ''"],
  ['users', 'status_message', "TEXT DEFAULT ''"],
  ['users', 'bio', "TEXT DEFAULT ''"],
  ['users', 'phone_number', "TEXT DEFAULT ''"],
  ['users', 'state', "TEXT DEFAULT 'active'"],
  ['users', 'password_hash', "TEXT NOT NULL DEFAULT ''"],
  ['users', 'display_name', "TEXT NOT NULL DEFAULT ''"],
  ['users', 'created_at', "TEXT NOT NULL DEFAULT ''"],
  ['users', 'updated_at', "TEXT NOT NULL DEFAULT ''"],
  ['friends', 'is_favorite', 'INTEGER DEFAULT 0'],
  ['friends', 'status', "TEXT DEFAULT 'accepted'"],
  ['friends', 'created_at', 'TEXT'],
  ['conversations', 'owner_id', "TEXT DEFAULT ''"],
  ['conversation_members', 'is_pinned', 'INTEGER DEFAULT 0'],
  ['conversation_members', 'is_muted', 'INTEGER DEFAULT 0'],
  ['conversation_members', 'is_hidden', 'INTEGER DEFAULT 0'],
  ['polls', 'multiple', 'INTEGER DEFAULT 0'],
  ['polls', 'closed', 'INTEGER DEFAULT 0'],
  ['polls', 'created_by', "TEXT DEFAULT ''"],
  ['polls', 'options_json', "TEXT DEFAULT '[]'"],
  ['attachments', 'name', "TEXT DEFAULT ''"],
  ['e2ee_keys', 'prekey_sig', "TEXT DEFAULT ''"],
];
async function ensurePhase1Columns(db) {
  for (const [table, column, ddl] of LUNO_SCHEMA_PHASE1_COLS) {
    let cols = [];
    try {
      const res = await db.prepare(`PRAGMA table_info(${table})`).all();
      cols = (res.results || []).map(r => r.name);
    } catch (_) { continue; }
    if (!cols.includes(column)) {
      await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`).run();
    }
  }
  // Backfill + uniqueness for the new users.handle (A-18).
  try {
    await db.prepare(`UPDATE users SET handle = 'user_' || substr(id, 1, 8) WHERE handle IS NULL`).run();
    await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle ON users(handle)`).run();
  } catch (_) { /* pre-existing duplicates stay; register enforces going forward */ }
  // Rows that predate display_name get the email prefix so clients never render a blank name.
  try {
    await db.prepare(`UPDATE users SET display_name = substr(email, 1, instr(email, '@') - 1) WHERE display_name = ''`).run();
  } catch (_) { /* ancient row without email stays blank */ }
}

let schemaReady = null;
function dbOf() { return CURRENT_ENV && CURRENT_ENV.DB ? CURRENT_ENV.DB : null; }
async function ensureSchema() {
  const db = dbOf();
  if (!db) return false;
  if (!schemaReady) {
    schemaReady = (async () => {
      // Every new isolate runs this once; one batch is one round trip instead of one per statement.
      if (typeof db.batch === 'function') await db.batch(LUNO_SCHEMA.map(sql => db.prepare(sql)));
      else for (const sql of LUNO_SCHEMA) await db.prepare(sql).run();
      const phase1 = [...LUNO_SCHEMA_BASE, ...LUNO_SCHEMA_PHASE1];
      if (typeof db.batch === 'function') await db.batch(phase1.map(sql => db.prepare(sql)));
      else for (const sql of phase1) await db.prepare(sql).run();
      await ensurePhase1Columns(db);
      return true;
    })().catch(err => { schemaReady = null; throw err; });
  }
  return schemaReady;
}
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
// ======================================================================
// Passkey (WebAuthn) registration — no-dependency RP verification.
// Policy (Go parity): attestation none + packed(self) only, ES256 only,
// user presence required, user verification preferred. Challenges are
// single-use with a 5-minute TTL; D1 is the only authority when bound
// (same lesson as the ws tickets), memory Maps cover tests/local.
// ======================================================================
const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;

function pkB64Encode(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function pkB64Decode(s) {
  if (typeof s !== 'string' || s.length === 0 || s.length > 32768 || !/^[A-Za-z0-9_-]*$/.test(s)) {
    throw new Error('bad b64url');
  }
  const bin = atob(s.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function pkU8eq(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

// Minimal definite-length CBOR decoder. Maps decode with 's:'/'n:'
// prefixed keys so string and int keys can coexist.
function pkCborDecode(buf, o, depth) {
  o = o || { off: 0 };
  depth = depth || 0;
  if (depth > 8) throw new Error('cbor depth');
  if (o.off >= buf.length) throw new Error('cbor overrun');
  const b = buf[o.off++];
  const major = b >> 5;
  let n = b & 31;
  if (n === 31) throw new Error('cbor indefinite');
  if (n === 24) {
    if (o.off >= buf.length) throw new Error('cbor overrun');
    n = buf[o.off++];
  } else if (n === 25) {
    if (o.off + 2 > buf.length) throw new Error('cbor overrun');
    n = (buf[o.off] << 8) | buf[o.off + 1];
    o.off += 2;
  } else if (n === 26) {
    if (o.off + 4 > buf.length) throw new Error('cbor overrun');
    n = buf[o.off] * 16777216 + (buf[o.off + 1] << 16) + (buf[o.off + 2] << 8) + buf[o.off + 3];
    o.off += 4;
  } else if (n === 27) throw new Error('cbor u64');
  if (major === 0) return n;
  if (major === 1) return -1 - n;
  if (major === 2 || major === 3) {
    if (o.off + n > buf.length) throw new Error('cbor overrun');
    const slice = buf.slice(o.off, o.off + n);
    o.off += n;
    return major === 2 ? slice : new TextDecoder().decode(slice);
  }
  if (major === 4) {
    if (n > 64) throw new Error('cbor array');
    const a = [];
    for (let i = 0; i < n; i++) a.push(pkCborDecode(buf, o, depth + 1));
    return a;
  }
  if (major === 5) {
    if (n > 64) throw new Error('cbor map');
    const m = {};
    for (let i = 0; i < n; i++) {
      const k = pkCborDecode(buf, o, depth + 1);
      const v = pkCborDecode(buf, o, depth + 1);
      m[typeof k === 'string' ? 's:' + k : 'n:' + k] = v;
    }
    return m;
  }
  if (major === 7) {
    if (n === 20) return false;
    if (n === 21) return true;
    if (n === 22) return null;
    throw new Error('cbor simple');
  }
  throw new Error('cbor tag');
}

function pkCborTop(buf) {
  const o = { off: 0 };
  const v = pkCborDecode(buf, o, 0);
  if (o.off !== buf.length) throw new Error('cbor trailing');
  return v;
}

function pkParseAuthData(ad) {
  if (!(ad instanceof Uint8Array) || ad.length < 37) throw new Error('authData short');
  const flags = ad[32];
  const out = {
    rpIdHash: ad.slice(0, 32),
    flags,
    counter: ad[33] * 16777216 + (ad[34] << 16) + (ad[35] << 8) + ad[36],
    credId: null,
    cose: null,
  };
  if (flags & 0x40) {
    if (ad.length < 55) throw new Error('authData attested short');
    const l = (ad[53] << 8) | ad[54];
    if (55 + l > ad.length) throw new Error('authData cred overrun');
    out.credId = ad.slice(55, 55 + l);
    const o = { off: 55 + l };
    out.cose = pkCborDecode(ad, o, 0);
  }
  return out;
}

function pkCoseToJwk(cose) {
  if (!cose || cose['n:1'] !== 2 || cose['n:3'] !== -7 || cose['n:-1'] !== 1) {
    throw new Error('cose not ES256');
  }
  const x = cose['n:-2'];
  const y = cose['n:-3'];
  if (!(x instanceof Uint8Array) || x.length !== 32 || !(y instanceof Uint8Array) || y.length !== 32) {
    throw new Error('cose coords');
  }
  return { kty: 'EC', crv: 'P-256', x: pkB64Encode(x), y: pkB64Encode(y), ext: true };
}

// Strict minimal DER ECDSA signature to WebCrypto raw R||S (P-256).
function pkDerToRaw(der) {
  if (!(der instanceof Uint8Array)) throw new Error('der shape');
  let o = 0;
  const need = (n) => { if (o + n > der.length) throw new Error('der overrun'); };
  need(2);
  if (der[o++] !== 0x30) throw new Error('der seq');
  let len = der[o++];
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 2) throw new Error('der len');
    need(n);
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | der[o++];
  }
  if (len !== der.length - o) throw new Error('der trailing');
  const out = new Uint8Array(64);
  for (const half of [0, 32]) {
    need(2);
    if (der[o++] !== 0x02) throw new Error('der int');
    let ilen = der[o++];
    need(ilen);
    if (ilen === 0 || ilen > 33) throw new Error('der intlen');
    let start = o;
    if (ilen === 33) {
      if (der[o] !== 0) throw new Error('der pad');
      start += 1;
      ilen = 32;
    }
    out.set(der.slice(start, start + ilen), half + 32 - ilen);
    o = start + ilen;
  }
  if (o !== der.length) throw new Error('der trailing2');
  return out;
}

async function pkIssueChallenge(userId, purpose) {
  const challenge = pkB64Encode(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = Date.now() + PASSKEY_CHALLENGE_TTL_MS;
  if (dbOf()) {
    await ensureSchema();
    await dbOf().prepare(
      'INSERT INTO luno_passkey_challenges(challenge,user_id,purpose,expires_at,created_at) VALUES (?,?,?,?,?) ON CONFLICT(challenge) DO UPDATE SET expires_at=excluded.expires_at,created_at=excluded.created_at'
    ).bind(challenge, userId, purpose, Math.floor(expiresAt / 1000), now()).run();
  } else {
    passkeyChallenges.set(challenge, { userId, purpose, expiresAt });
  }
  return challenge;
}

async function pkLatestChallenge(userId, purpose) {
  if (dbOf()) {
    await ensureSchema();
    const row = await dbOf().prepare(
      'SELECT challenge FROM luno_passkey_challenges WHERE user_id=? AND purpose=? ORDER BY created_at DESC LIMIT 1'
    ).bind(userId, purpose).first();
    return row ? row.challenge : null;
  }
  let found = null;
  for (const [ch, c] of passkeyChallenges) {
    if (c.userId === userId && c.purpose === purpose) found = ch;
  }
  return found;
}

async function pkConsumeChallenge(challenge, userId, purpose) {
  if (dbOf()) {
    await ensureSchema();
    const row = await dbOf().prepare(
      'DELETE FROM luno_passkey_challenges WHERE challenge=? AND user_id=? AND purpose=? AND expires_at>? RETURNING challenge'
    ).bind(challenge, userId, purpose, Math.floor(Date.now() / 1000)).first();
    return !!row;
  }
  const c = passkeyChallenges.get(challenge);
  if (!c || c.userId !== userId || c.purpose !== purpose || c.expiresAt <= Date.now()) return false;
  passkeyChallenges.delete(challenge);
  return true;
}

async function pkListCreds(userId) {
  if (dbOf()) {
    await ensureSchema();
    await pkEnsureLastUsed();
    const res = await dbOf().prepare(
      'SELECT credential_id,public_key,counter,transports,name,created_at,last_used_at FROM luno_passkey_credentials WHERE user_id=?'
    ).bind(userId).all();
    return (res.results || []).map(r => ({
      credId: r.credential_id, jwk: JSON.parse(r.public_key),
      counter: r.counter, transports: r.transports, name: r.name, createdAt: r.created_at, lastUsedAt: r.last_used_at,
    }));
  }
  return [...passkeyCreds.values()].filter(c => c.userId === userId);
}

async function pkStoreCred(userId, credIdB64, jwk, counter, transports) {
  if (dbOf()) {
    await ensureSchema();
    await dbOf().prepare(
      'INSERT INTO luno_passkey_credentials(credential_id,user_id,public_key,counter,transports,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(credential_id) DO NOTHING'
    ).bind(credIdB64, userId, JSON.stringify(jwk), counter, transports ? JSON.stringify(transports) : null, now()).run();
    return;
  }
  passkeyCreds.set(credIdB64, { userId, credId: credIdB64, jwk, counter, transports, createdAt: now() });
}

async function pkVerifyRegistration({ rpId, origin, challengeB64, body, excludeIds }) {
  if (!body || body.type !== 'public-key' || !body.response) throw new Error('shape');
  const credId = pkB64Decode(body.id);
  if (body.rawId !== undefined && body.rawId !== body.id) throw new Error('id mismatch');
  const clientDataBytes = pkB64Decode(body.response.clientDataJSON);
  const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
  if (clientData.type !== 'webauthn.create') throw new Error('type');
  if (clientData.challenge !== challengeB64) throw new Error('challenge');
  if (clientData.origin !== origin) throw new Error('origin');
  const attObj = pkCborTop(pkB64Decode(body.response.attestationObject));
  const fmt = attObj['s:fmt'];
  if (fmt !== 'none' && fmt !== 'packed') throw new Error('format');
  const authData = attObj['s:authData'];
  if (!(authData instanceof Uint8Array)) throw new Error('authData');
  const parsed = pkParseAuthData(authData);
  if (!(parsed.flags & 0x01)) throw new Error('UP missing');
  if (!(parsed.flags & 0x40)) throw new Error('AT missing');
  const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
  if (!pkU8eq(rpHash, parsed.rpIdHash)) throw new Error('rpId');
  if (!pkU8eq(credId, parsed.credId)) throw new Error('credId');
  if (excludeIds.includes(body.id)) throw new Error('excluded');
  const jwk = pkCoseToJwk(parsed.cose);
  const attStmt = attObj['s:attStmt'];
  if (typeof attStmt !== 'object' || attStmt === null) throw new Error('attStmt');
  if (fmt === 'none') {
    if (Object.keys(attStmt).length !== 0) throw new Error('none stmt');
  } else {
    if (attStmt['s:x5c'] !== undefined) throw new Error('x5c unsupported');
    if (attStmt['s:alg'] !== -7) throw new Error('alg');
    const sig = attStmt['s:sig'];
    if (!(sig instanceof Uint8Array)) throw new Error('sig');
    const cdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataBytes));
    const data = new Uint8Array(authData.length + cdHash.length);
    data.set(authData, 0);
    data.set(cdHash, authData.length);
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, pkDerToRaw(sig), data);
    if (!ok) throw new Error('packed sig');
  }
  return { credIdB64: body.id, jwk, counter: parsed.counter, transports: body.response.transports };
}

async function pkChallengeOwner(challenge, purpose) {
  if (dbOf()) {
    await ensureSchema();
    const row = await dbOf().prepare(
      'SELECT user_id,expires_at FROM luno_passkey_challenges WHERE challenge=? AND purpose=?'
    ).bind(challenge, purpose).first();
    if (!row || row.expires_at <= Math.floor(Date.now() / 1000)) return null;
    return row.user_id;
  }
  const c = passkeyChallenges.get(challenge);
  if (!c || c.purpose !== purpose || c.expiresAt <= Date.now()) return null;
  return c.userId;
}

let pkLastUsedEnsured = false;
async function pkEnsureLastUsed() {
  if (pkLastUsedEnsured || !dbOf()) return;
  pkLastUsedEnsured = true;
  try {
    await dbOf().prepare('ALTER TABLE luno_passkey_credentials ADD COLUMN last_used_at TEXT').run();
  } catch { /* column already exists */ }
}

async function pkUpdateCounter(userId, credIdB64, counter) {
  const stamp = now();
  if (dbOf()) {
    await ensureSchema();
    await pkEnsureLastUsed();
    await dbOf().prepare('UPDATE luno_passkey_credentials SET counter=?,last_used_at=? WHERE credential_id=? AND user_id=?')
      .bind(counter, stamp, credIdB64, userId).run();
    return;
  }
  const c = passkeyCreds.get(credIdB64);
  if (c && c.userId === userId) { c.counter = counter; c.lastUsedAt = stamp; }
}

async function pkDeleteCred(userId, credIdB64) {
  if (dbOf()) {
    await ensureSchema();
    const res = await dbOf().prepare('DELETE FROM luno_passkey_credentials WHERE credential_id=? AND user_id=?')
      .bind(credIdB64, userId).run();
    return ((res.meta && res.meta.changes) || 0) > 0;
  }
  const c = passkeyCreds.get(credIdB64);
  if (!c || c.userId !== userId) return false;
  passkeyCreds.delete(credIdB64);
  return true;
}

async function pkVerifyAssertion({ rpId, origin, challengeB64, body, cred }) {
  if (!body || body.type !== 'public-key' || !body.response) throw new Error('shape');
  if (body.id !== cred.credId) throw new Error('credId');
  if (body.rawId !== undefined && body.rawId !== body.id) throw new Error('id mismatch');
  const clientDataBytes = pkB64Decode(body.response.clientDataJSON);
  const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
  if (clientData.type !== 'webauthn.get') throw new Error('type');
  if (clientData.challenge !== challengeB64) throw new Error('challenge');
  if (clientData.origin !== origin) throw new Error('origin');
  const authData = pkB64Decode(body.response.authenticatorData);
  const parsed = pkParseAuthData(authData);
  if (!(parsed.flags & 0x01)) throw new Error('UP missing');
  const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
  if (!pkU8eq(rpHash, parsed.rpIdHash)) throw new Error('rpId');
  const stored = cred.counter || 0;
  if (parsed.counter <= stored && (parsed.counter !== 0 || stored !== 0)) throw new Error('counter');
  const sig = pkB64Decode(body.response.signature);
  const cdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataBytes));
  const data = new Uint8Array(authData.length + cdHash.length);
  data.set(authData, 0);
  data.set(cdHash, authData.length);
  const key = await crypto.subtle.importKey('jwk', cred.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, pkDerToRaw(sig), data);
  if (!ok) throw new Error('sig');
  return parsed.counter;
}
function parsePbkdf2(stored) {
  if (typeof stored !== 'string' || !stored.startsWith('pbkdf2$')) return null;
  const parts = stored.split('$');
  if (parts.length === 4) {
    const iter = Number(parts[1]);
    return Number.isInteger(iter) && iter > 0 && parts[2] && parts[3] ? { iter, salt: parts[2], hash: parts[3] } : null;
  }
  // 3-segment rows predate iteration storage: iter 0 means unknown (legacy 1000
  // or register-written current). checkPassword retries both, then self-heals.
  if (parts.length === 3 && parts[1] && parts[2]) return { iter: 0, salt: parts[1], hash: parts[2] };
  return null;
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
  if (dbOf()) user.role = await storedUserRole(user.id);
  const token = `cf-token-${user.id}.${crypto.randomUUID()}`;
  const sessionId = crypto.randomUUID();
  const created = now();
  const info = clientInfo(request);
  sessions.set(token, { user_id: user.id, role: user.role, device_id: sessionId, created_at: created, device_name: info.device_name, platform: info.platform, ip: info.ip });
  const db = dbOf();
  let refreshToken = null;
  if (db) {
    await ensureSchema();
    await db.prepare('INSERT INTO luno_sessions (token_hash, session_id, user_id, role, device_name, platform, ip, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(await sha256Hex(token), sessionId, user.id, user.role || 'user', info.device_name, info.platform, info.ip, created, created).run();
    refreshToken = await issueRefreshToken(user.id, sessionId);
  }
  await recordLoginEvent(user, sessionId, info);
  return { token, deviceId: sessionId, refreshToken };
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
    await revokeRefreshForSession(sid);
  }
  for (const [tok, s] of Array.from(sessions)) if (s.device_id === sid) { sessions.delete(tok); revokedTokens.add(tok); }
}
// ---------- Refresh rotation (A-15) ----------
async function issueRefreshToken(userId, sessionId) {
  const db = dbOf();
  if (!db) return null;
  const refresh = `cf-refresh-${crypto.randomUUID()}`;
  await ensureSchema();
  await db.prepare('INSERT INTO refresh_tokens (token_hash, user_id, device_id, expires_at, revoked, created_at) VALUES (?, ?, ?, ?, 0, ?)')
    .bind(await sha256Hex(refresh), userId, sessionId, Date.now() + REFRESH_TTL_MS, Date.now()).run();
  return refresh;
}
async function revokeRefreshForSession(sessionId) {
  const db = dbOf();
  if (!db || !sessionId) return;
  await ensureSchema();
  await db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE device_id = ? AND revoked = 0').bind(sessionId).run();
}
async function revokeAllRefresh(userId, exceptSessionId) {
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  if (exceptSessionId) {
    await db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND device_id <> ? AND revoked = 0').bind(userId, exceptSessionId).run();
  } else {
    await db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0').bind(userId).run();
  }
}
// ---------- Login throttle + rate limits (A-8, D1-backed) ----------
const LOGIN_LOCKOUT_THRESHOLD = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
function throttleKeys(identifier, ip) {
  const keys = [];
  if (identifier) keys.push('acct:' + identifier);
  if (ip) keys.push('ip:' + ip);
  return keys;
}
async function loginThrottleBlocked(identifier, ip) {
  const db = dbOf();
  if (!db) return false;
  await ensureSchema();
  const since = Date.now() - LOGIN_LOCKOUT_MS;
  for (const key of throttleKeys(identifier, ip)) {
    const row = await db.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE key = ? AND success = 0 AND created_at >= ?').bind(key, since).first();
    if (Number(row?.n || 0) >= LOGIN_LOCKOUT_THRESHOLD) return true;
  }
  return false;
}
async function recordLoginFailure(identifier, ip) {
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  const at = Date.now();
  for (const key of throttleKeys(identifier, ip)) {
    await db.prepare('INSERT INTO login_attempts (key, success, created_at) VALUES (?, 0, ?)').bind(key, at).run();
  }
}
async function clearLoginFailures(identifier, ip) {
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  for (const key of throttleKeys(identifier, ip)) {
    await db.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key).run();
  }
}
async function rateLimit(key, limit) {
  const db = dbOf();
  if (!db) return true; // single-node dev without D1: nothing to coordinate.
  await ensureSchema();
  const windowStart = Math.floor(Date.now() / RATE_WINDOW_MS);
  const row = await db.prepare('SELECT count FROM rate_limits WHERE key = ? AND window_start = ?').bind(key, windowStart).first();
  if (row && Number(row.count) >= limit) return false;
  await db.prepare('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1').bind(key, windowStart).run();
  return true;
}
async function revokeOtherSessions(userId, keepSid, by) {
  const db = dbOf();
  if (db) {
    await ensureSchema();
    await db.prepare('UPDATE luno_sessions SET revoked_at = ?, revoked_by = ? WHERE user_id = ? AND session_id <> ? AND revoked_at IS NULL').bind(now(), by, userId, keepSid || '').run();
    await revokeAllRefresh(userId, keepSid || null);
  }
  for (const [tok, s] of Array.from(sessions)) {
    if (s.user_id === userId && s.device_id !== keepSid) { sessions.delete(tok); revokedTokens.add(tok); }
  }
}
async function d1Batch(db, stmts) {
  if (typeof db.batch === 'function') {
    await db.batch(stmts.map(([sql, ...params]) => db.prepare(sql).bind(...params)));
    return;
  }
  for (const [sql, ...params] of stmts) await db.prepare(sql).bind(...params).run();
}
// A-10: one deletion path for DELETE /me and POST /me/delete-account.
// The users row is retained in anonymized form (state='deleted', credentials
// and profile PII wiped) so audit trails and unique constraints stay intact;
// every other user-owned row is removed in a single batch.
async function deleteAccountData(userId) {
  const gone = usersById.get(userId);
  if (gone) {
    gone.state = 'deleted';
    gone.display_name = '탈퇴한 사용자';
    delete gone.pw_hash; delete gone.pw_salt; delete gone.pw_iter; delete gone.legacy_plain;
    gone.bio = ''; gone.status_message = ''; gone.avatar_url = ''; gone.phone = ''; gone.birthday = '';
  }
  for (const [email, u] of Array.from(users)) if (u.id === userId) users.delete(email);
  for (const [tok, sess] of Array.from(sessions)) {
    if (sess.user_id === userId) { sessions.delete(tok); revokedTokens.add(tok); }
  }
  for (const key of Array.from(friendships.keys())) {
    if (key.startsWith(userId + ':') || key.endsWith(':' + userId)) friendships.delete(key);
  }
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  const at = now();
  // A-20/B-3: remove the user's R2 objects before the metadata rows go.
  const bucket = mediaBucketOf();
  if (bucket) {
    try {
      const rows = await db.prepare('SELECT object_key FROM attachments WHERE uploader_id = ?').bind(userId).all();
      for (const r of (rows.results || [])) { if (r.object_key) await bucket.delete(r.object_key).catch(() => {}); }
    } catch (_) {}
  }
  await d1Batch(db, [
    ["UPDATE users SET state = 'deleted', display_name = ?, password_hash = 'pbkdf2$deleted', bio = '', status_message = '', avatar_url = '', phone_number = '', birthday = '', updated_at = ? WHERE id = ?", '탈퇴한 사용자', at, userId],
    ['DELETE FROM luno_sessions WHERE user_id = ?', userId],
    ['DELETE FROM refresh_tokens WHERE user_id = ?', userId],
    ['DELETE FROM friends WHERE user_id = ? OR friend_id = ?', userId, userId],
    ['DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?', userId, userId],
    ['DELETE FROM push_tokens WHERE user_id = ?', userId],
    ['DELETE FROM e2ee_keys WHERE user_id = ?', userId],
    ['DELETE FROM luno_messages WHERE sender_id = ?', userId],
    ['DELETE FROM luno_attachments WHERE owner_id = ?', userId],
    ['DELETE FROM attachments WHERE uploader_id = ?', userId],
    ['DELETE FROM luno_read_cursors WHERE user_id = ?', userId],
    ['DELETE FROM luno_ws_tickets WHERE user_id = ?', userId],
    ['DELETE FROM conversation_notes WHERE author_id = ?', userId],
    ['DELETE FROM event_rsvps WHERE user_id = ?', userId],
    ['DELETE FROM poll_votes WHERE user_id = ?', userId],
    ['DELETE FROM reactions WHERE user_id = ?', userId],
  ]);
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
  await db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").bind(encodePasswordHash(user), user.id).run();
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
  noteLatest(conv, list);
}
// Adds or refreshes the given rows without dropping other cached messages, for
// reads that fetch only part of a room (the conversation list).
function mergeRows(cid, rows) {
  if (!rows.length) return;
  const byId = new Map((messages.get(cid) || []).map(m => [m.id, m]));
  for (const r of rows) byId.set(r.id, rowToMessage(r));
  const list = [...byId.values()].sort((a, b) => a.sequence - b.sequence);
  messages.set(cid, list);
  noteLatest(conversations.get(cid), list);
}
function noteLatest(conv, list) {
  if (!conv) return;
  const max = list.reduce((a, m) => Math.max(a, m.sequence || 0), 0);
  if (max > (conv.last_sequence || 0)) conv.last_sequence = max;
  const lastAt = list.length ? list[list.length - 1].created_at : null;
  if (lastAt && String(lastAt) > String(conv.updated_at || '')) conv.updated_at = lastAt;
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
  await hydrateDurableConversations(userId);
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  // The conversation list needs only each room's latest message and the messages
  // after the viewer's read cursor (unread count, mentions), capped at the newest
  // LIST_UNREAD_WINDOW. Per room that is one sequence range on the
  // (conversation_id, sequence) index, starting at
  //   MIN(MAX(cursor + 1, latest - (window - 1)), latest)
  // which is the capped unread run when there are unread messages and just the
  // latest message otherwise. D1 reads about one row per room plus its unread rows.
  // A ROW_NUMBER() window here read every message of every room on each refresh,
  // because the window cannot push its limit into the index.
  // One SELECT, no UNION: D1 rejects compound SELECTs of more than 5 terms
  // ("too many terms in compound SELECT"); multi-row VALUES is not limited.
  await hydrateCursors(userId);
  const cids = Array.from(conversations.values()).filter(c => c.members.includes(userId)).map(c => c.id);
  for (let i = 0; i < cids.length; i += LIST_HYDRATE_CHUNK) {
    const chunk = cids.slice(i, i + LIST_HYDRATE_CHUNK);
    const params = chunk.flatMap(cid => [cid, readCursors.get(`${cid}:${userId}`) || 0]);
    const { results } = await db.prepare(
      `WITH k(cid, cur) AS (VALUES ${chunk.map(() => '(?, ?)').join(', ')}),
       t AS (SELECT cid, cur, (SELECT MAX(sequence) FROM luno_messages x WHERE x.conversation_id = k.cid) AS latest FROM k)
       SELECT m.* FROM t JOIN luno_messages m
         ON m.conversation_id = t.cid AND m.sequence >= MIN(MAX(t.cur + 1, t.latest - ${LIST_UNREAD_WINDOW - 1}), t.latest)`
    ).bind(...params).all();
    const byConv = new Map(chunk.map(cid => [cid, []]));
    for (const r of results || []) byConv.get(r.conversation_id)?.push(r);
    for (const [cid, rows] of byConv) mergeRows(cid, rows);
  }
}
// D1 allows 100 bound parameters per statement; each room binds two.
const LIST_HYDRATE_CHUNK = 40;
const LIST_UNREAD_WINDOW = 200;
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
// ---------- Attachments (A-20/B-3: R2 bytes + D1 metadata) ----------
function mediaBucketOf() { return CURRENT_ENV && CURRENT_ENV.MEDIA_BUCKET ? CURRENT_ENV.MEDIA_BUCKET : null; }
async function persistAttachmentR2(att) {
  const bucket = mediaBucketOf();
  const db = dbOf();
  if (!bucket || !db) return null;
  const object_key = `conv/${att.conversation_id}/${att.id}`;
  const sha256 = await sha256Hex(att.bytes);
  await bucket.put(object_key, att.bytes, { httpMetadata: { contentType: att.mime } });
  await ensureSchema();
  await db.prepare('INSERT INTO attachments (id, conversation_id, object_key, name, mime_type, size_bytes, sha256, uploader_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(att.id, att.conversation_id, object_key, att.name, att.mime, att.bytes.length, sha256, att.owner, now()).run();
  return { object_key, sha256, size: att.bytes.length };
}
async function loadAttachment(id) {
  if (!id) return null;
  const db = dbOf();
  if (!db) return null;
  await ensureSchema();
  const meta = await db.prepare('SELECT * FROM attachments WHERE id = ?').bind(String(id)).first();
  if (meta) {
    const bucket = mediaBucketOf();
    if (!bucket) return null;
    const obj = await bucket.get(meta.object_key);
    if (!obj) return null;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    return { id: meta.id, owner: meta.uploader_id, conversation_id: meta.conversation_id, name: meta.name || 'file', mime: meta.mime_type, size: meta.size_bytes, bytes };
  }
  // Legacy rows: base64 still in D1 from before the R2 cutover. Read-only —
  // no new b64 writes exist anymore.
  const r = await db.prepare('SELECT * FROM luno_attachments WHERE id = ?').bind(String(id)).first();
  if (!r) return null;
  const bin = atob(r.b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { id: r.id, owner: r.owner_id, conversation_id: r.conversation_id, name: r.name, mime: r.mime, size: r.size, bytes };
}

// ---------- LUNO editorial SAMPLE content (G-4: explicitly labelled, not real press) ----------
const NEWS_SAMPLE = [
  {
    "id": "news-hero-01",
    "title": "LUNO Pay로 시작하는 스마트한 더치페이",
    "press": "LUNO 에디토리얼(샘플)",
    "category": "경제",
    "published_at": "2026-10-31T08:50:00.000Z",
    "image_url": "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80",
    "summary": "모임 뒤 정산은 대화방 송금으로 끝내세요.",
    "content": "LUNO 지갑에서 대화 상대에게 바로 송금할 수 있습니다. 더치페이 내역은 대화방에서 바로 확인할 수 있으며, 이 기사는 LUNO 에디토리얼 샘플 콘텐츠입니다.",
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
    "title": "LUNO 포인트 적립 가이드",
    "press": "LUNO 에디토리얼(샘플)",
    "category": "경제",
    "published_at": "2026-10-31T08:28:00.000Z",
    "image_url": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop&q=80",
    "summary": "송금할 때마다 쌓이는 포인트를 확인하세요.",
    "content": "LUNO Pay 송금 금액의 0.1%가 포인트로 적립됩니다. 지갑 탭에서 잔액과 포인트를 함께 확인할 수 있으며, 이 기사는 LUNO 에디토리얼 샘플 콘텐츠입니다.",
    "sample": true
  },
  {
    "id": "news-hero-04",
    "title": "LUNO 스티커로 대화에 생기를",
    "press": "LUNO 에디토리얼(샘플)",
    "category": "엔터",
    "published_at": "2026-10-31T08:15:00.000Z",
    "image_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80",
    "summary": "감정을 전하는 스티커 팩을 만나보세요.",
    "content": "채팅방 스티커 버튼에서 다양한 팩을 고를 수 있습니다. 자주 쓰는 스티커는 즐겨찾기에 담아두세요. 이 기사는 LUNO 에디토리얼 샘플 콘텐츠입니다.",
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
    "title": "주말 모임 정산은 LUNO 송금으로",
    "press": "LUNO 에디토리얼(샘플)",
    "category": "엔터",
    "published_at": "2026-10-31T08:35:00.000Z",
    "image_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80",
    "summary": "영수증 사진과 함께 정산 요청을 보내세요.",
    "content": "모임 사진을 앨범에 올리고 정산은 대화방 송금으로 마무리하세요. 송금 완료 메시지가 대화방에 남습니다. 이 기사는 LUNO 에디토리얼 샘플 콘텐츠입니다.",
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
    "title": "QR 로그인은 모바일에서 승인하세요",
    "press": "LUNO 에디토리얼(샘플)",
    "category": "경제",
    "published_at": "2026-10-31T07:00:00.000Z",
    "image_url": "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=300&auto=format&fit=crop&q=80",
    "summary": "PC 로그인은 언제나 내 손안에서 승인됩니다.",
    "content": "PC/웹에서 로그인하면 모바일 설정의 QR 승인으로 직접 승인해야 로그인됩니다. 모르는 승인 요청은 무시하세요. 이 기사는 LUNO 에디토리얼 샘플 콘텐츠입니다.",
    "sample": true
  }
];


// ---------- Passwords ----------
// Only PBKDF2 digests are ever compared. A stored digest is never accepted as the
// password itself, and no plaintext copy is kept on the user object.
// Stored form: pbkdf2$<iterations>$<salt>$<hash>. The older pbkdf2$<salt>$<hash>
// form used 1,000 iterations and is upgraded on the next successful login.
const PBKDF2_LEGACY_ITERATIONS = 1000;
const PBKDF2_DEFAULT_ITERATIONS = 100000; // workerd caps PBKDF2 at 100k iterations; higher throws NotSupportedError on real Workers (local dev has no cap).
const REVOKED_LEGACY_PASSWORDS = new Set(['LineAdmin#2026!', 'LineUser#2026!', 'Admin#2026!', 'User#2026!', 'LunoUser#Rotated$72mP', 'LunoAdmin#RotatedEdge$99xK', 'LunoAdmin#2026!', 'LunoUser#2026!', 'Alice#Rotated$48wT', 'Bob#Rotated$31qR']);
function pbkdf2Iterations() {
  const configured = Number(CURRENT_ENV?.PBKDF2_ITERATIONS);
  return Number.isInteger(configured) && configured >= 10000 && configured <= 100000 ? configured : PBKDF2_DEFAULT_ITERATIONS;
}
async function pbkdf2(password, saltHex, iterations = PBKDF2_LEGACY_ITERATIONS) {
  try {
    const salt = Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16)));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
    return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.error('[LUNO pbkdf2 failed]', err?.message || err);
    return null;
  }
}
function timingSafeEqualText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
function encodePasswordHash(user) {
  return `pbkdf2$${user.pw_iter || PBKDF2_LEGACY_ITERATIONS}$${user.pw_salt}$${user.pw_hash}`;
}
// Fills the password fields of a user object from a users.password_hash value.
// A value that is not a PBKDF2 digest is a legacy plaintext row: it is kept only
// to verify and immediately re-hash it on the next login, never compared as a hash.
function applyStoredPassword(user, stored) {
  delete user.password; delete user.raw_password;
  const hashed = parsePbkdf2(stored);
  if (hashed) {
    user.pw_hash = hashed.hash; user.pw_salt = hashed.salt; user.pw_iter = hashed.iter;
    delete user.legacy_plain;
  } else if (typeof stored === 'string' && stored && !REVOKED_LEGACY_PASSWORDS.has(stored) && !REVOKED_LEGACY_PASSWORDS.has(stored.replace(/^sha256:/, ''))) {
    user.legacy_plain = stored.startsWith('sha256:') ? stored.slice(7) : stored;
    delete user.pw_hash; delete user.pw_salt; delete user.pw_iter;
  } else {
    delete user.pw_hash; delete user.pw_salt; delete user.pw_iter; delete user.legacy_plain;
  }
  return user;
}
async function setPassword(user, password) {
  delete user.password; delete user.raw_password; delete user.legacy_plain;
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
  const iterations = pbkdf2Iterations();
  const hash = await pbkdf2(password, salt, iterations);
  if (!hash) throw new Error('password hashing unavailable');
  user.pw_salt = salt;
  user.pw_hash = hash;
  user.pw_iter = iterations;
}
async function checkPassword(user, password) {
  if (!user || typeof password !== 'string' || !password) return false;
  if (REVOKED_LEGACY_PASSWORDS.has(password)) return false;
  let valid = false;
  if (user.pw_hash && user.pw_salt) {
    const iterKnown = !!user.pw_iter;
    const hash = await pbkdf2(password, user.pw_salt, user.pw_iter || PBKDF2_LEGACY_ITERATIONS);
    valid = !!hash && timingSafeEqualText(hash, user.pw_hash);
    if (!valid && !iterKnown) {
      const hash2 = await pbkdf2(password, user.pw_salt, pbkdf2Iterations());
      valid = !!hash2 && timingSafeEqualText(hash2, user.pw_hash);
      if (valid) user.pw_iter = pbkdf2Iterations();
    }
    if (!valid) return false;
    if ((user.pw_iter || PBKDF2_LEGACY_ITERATIONS) >= pbkdf2Iterations()) {
      if (!iterKnown) {
        try { await persistPassword(user); } catch (err) { console.error('[LUNO password upgrade failed]', err?.message || err); }
      }
      return true;
    }
  } else if (typeof user.legacy_plain === 'string' && user.legacy_plain) {
    if (!timingSafeEqualText(password, user.legacy_plain)) return false;
    valid = true;
  }
  if (!valid) return false;
  // Upgrade a weak or plaintext record now that the real password is known.
  await setPassword(user, password);
  try { await persistPassword(user); } catch (err) { console.error('[LUNO password upgrade failed]', err?.message || err); }
  return true;
}
async function hashPendingPasswords() {
  for (const u of users.values()) {
    if (typeof u.password === 'string' && u.password && !u.pw_hash) {
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
    status_message: u.status_message || '', avatar_color: u.avatar_color || '#4F7CFF',
    birthday: u.birthday || '', avatar_url: u.avatar_url || '', cover_url: u.cover_url || ''
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
// Item 12: prefs ride the users row (prefs_json) so toggles survive isolates.
// The Map stays the sync read cache; D1 is the source of truth.
function hydrateUserPrefs(userId, prefsJson) {
  if (!prefsJson) return;
  try {
    const parsed = JSON.parse(prefsJson);
    if (parsed && typeof parsed === 'object') userPrefs.set(userId, { ...DEFAULT_PREFS, ...parsed });
  } catch {}
}
function walletOf(userId) {
  if (!wallets.has(userId)) wallets.set(userId, { balance: 0, tx: [] }); // new wallets start empty: no phantom seed money
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
// A-3/A-4: bidirectional block state. Memory first (no-DB path), D1 blocks
// table second so a block survives isolates and redeploys.
async function blockState(a, b) {
  const byMe = fMeta(a, b).blocked, byThem = fMeta(b, a).blocked;
  if (byMe || byThem) return { byMe, byThem };
  const db = dbOf();
  if (!db) return { byMe: false, byThem: false };
  await ensureSchema();
  const { results } = await db.prepare('SELECT blocker_id FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)').bind(a, b, b, a).all();
  let dByMe = false, dByThem = false;
  for (const r of results || []) {
    if (r.blocker_id === a) dByMe = true; else dByThem = true;
  }
  return { byMe: dByMe, byThem: dByThem };
}
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
  out.sender_name = userBrief(msg.sender_id)?.display_name || '';
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
async function systemMessage(cid, body) {
  if (conversations.get(cid)?._durable) return await pushPersistent(cid, conversations.get(cid).owner_id, { kind: 'system', body });
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
  // Item 9: 'N' derives from the persisted read cursor — a read room never
  // shows N on any isolate. Rooms flagged badge_n stay out of numeric sums.
  const unread = unreadFor(conv.id, viewerId);
  return {
    id: conv.id, kind: conv.kind, title, last_sequence: conv.last_sequence || 0,
    unread_count: unread, mentioned: mentionedIn(conv.id, viewerId),
    updated_at: conv.updated_at, owner_id: conv.owner_id || null, notice: conv.notice || '',
    pinned: meta.pinned, muted: meta.muted, hidden: meta.hidden, badge_n: !!conv.badge_n && unread > 0,
    member_count: conv.members.length, members: memberBriefs, official: !!conv.official,
    last_message: last ? { id: last.id, kind: last.kind, body: last.unsent ? '' : String(last.body).slice(0, 120), unsent: !!last.unsent, sender_id: last.sender_id, created_at: last.created_at } : null
  };
}
function botReply(text, account) {
  const t = String(text || '').toLowerCase();
  const rules = (typeof oaBotRules !== 'undefined' && oaBotRules.get(account.id)) || [];
  for (const r of rules) {
    if (r.keywords && r.keywords.some(kw => t.includes(String(kw).toLowerCase()))) {
      return r.reply;
    }
  }
  if (/안녕|hello|hi\b/.test(t)) return `안녕하세요! ${account.name} 공식계정입니다. 👋 하단 리치 메뉴를 누르시거나 '도움말'을 입력해 보세요.`;
  if (/도움|help/.test(t)) return '사용 가능한 안내: 공지사항, 고객센터, 보안 안내, 이벤트, 날씨, 쿠폰, 특가, 페이 혜택';
  if (/공지|notice/.test(t)) return '📢 이번 주 업데이트: 타임라인·VOOM·Pay 기능 및 공식계정 리치메뉴가 추가되었습니다.';
  return '메시지를 전달받았습니다. 하단 리치 메뉴 버튼을 누르시거나 "도움말"을 입력해 보세요. 🤖';
}
function seedExtras() {
  const demo = users.get('user@luno.local');
  const colors = { 'admin@luno.local': '#6366f1', 'user@luno.local': '#4F7CFF' };
  const status = { 'admin@luno.local': '운영 중 🛠️', 'user@luno.local': '오늘도 좋은 하루 ☀️' };
  for (const [email, u] of users) {
    u.avatar_color = colors[email] || '#4F7CFF';
    u.status_message = status[email] || '';
    usersById.set(u.id, u);
  }

  for (const [id, name, handle, description, color] of [
    ['oa-notice', 'LUNO 공식 안내', '@luno_notice', 'LUNO 서비스 소식과 업데이트를 전해드립니다.', '#315BCD']
  ]) officialAccounts.set(id, { id, name, handle, description, color });

  // Default Rich Menus for Official Accounts
  richMenus.set('oa-notice', {
    id: 'menu_oa-notice',
    account_id: 'oa-notice',
    title: 'LUNO 공식 안내 종합 메뉴',
    layout: 'grid_2x3',
    tiles: [
      { id: 't1', label: '📢 최신 공지', icon: '📢', action: { type: 'message', text: '공지사항' } },
      { id: 't2', label: '💬 고객센터 상담', icon: '💬', action: { type: 'message', text: '상담' } },
      { id: 't3', label: '🔒 보안 가이드', icon: '🔒', action: { type: 'message', text: '보안 안내' } },
      { id: 't4', label: '🎁 진행중 이벤트', icon: '🎁', action: { type: 'message', text: '이벤트' } },
      { id: 't5', label: '⚡ 신규 기능 안내', icon: '⚡', action: { type: 'message', text: '신규 기능' } },
      { id: 't6', label: '🌐 공식 웹사이트', icon: '🌐', action: { type: 'uri', uri: 'https://luno-messenger.dnjstjqppk.workers.dev' } }
    ]
  });



  // Default Chatbot Keyword Auto-Reply Rules
  oaBotRules.set('oa-notice', [
    { id: 'r_n1', keywords: ['공지', '공지사항'], reply: '📢 [LUNO 공지] v2.0.0 업데이트가 완료되었습니다.\n• 세션 보안 강화 및 원격 로그아웃\n• 13종 메시지 클라우드 영속성 보장\n• 공식계정 리치 메뉴 및 챗봇 자동응답 릴리스' },
    { id: 'r_n2', keywords: ['상담', '고객센터', '문의'], reply: '💬 [고객센터] 문의 사항을 남겨주시면 담당 상담원이 순차적으로 답변을 드립니다.\n• 운영 시간: 평일 09:00 ~ 18:00 (주말/공휴일 휴무)' },
    { id: 'r_n3', keywords: ['보안', '해킹', '비밀번호'], reply: '🔒 [보안 센터] LUNO는 2단계 기기 인증과 원격 세션 즉시 실효화(Revocation) 기능을 제공합니다. 의심스러운 로그인은 설정 > 활성 기기 관리에서 즉시 종료할 수 있습니다.' },
    { id: 'r_n4', keywords: ['이벤트', '혜택'], reply: '🎁 [이벤트 안내] 신규 친구 등록 시 1,000 LUNO Pay 포인트 즉시 적립! 친구 초대 링크를 공유해보세요.' },
    { id: 'r_n5', keywords: ['신규', '기능', '업데이트'], reply: '⚡ [신규 기능] 6개 웹 포털(Admin, Partner, Developer, Creator, Ads), 공식 계정 인터랙티브 리치 메뉴가 활성화되었습니다.' }
  ]);



}

const featureFlags = [
  { key: 'e2ee_letter_sealing', enabled: false, description: 'Signal Letter-Sealing End-to-End Encryption (not implemented)' },
  { key: 'webrtc_group_calling', enabled: true, description: 'Multi-party Voice & Video Calling' },
  { key: 'ai_smart_replies', enabled: true, description: 'AI-assisted quick responses' },
  { key: 'openchat_live_streaming', enabled: false, description: 'Public community voice stages' }
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
  const seedPassword = (name) => {
    const configured = env && env[name];
    return typeof configured === 'string' && configured.length >= 8 ? configured : null;
  };

  // Bootstrap accounts come ONLY from operator-provided env secrets. No
  // fallback passwords: without the env vars these accounts do not exist.
  const seeds = [];
  const adminPw = seedPassword('ADMIN_INITIAL_PASSWORD');
  if (adminPw) seeds.push({
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@luno.local',
    password: adminPw,
    display_name: 'System Administrator',
    role: 'admin',
    handle: 'admin',
    bio: 'Cloudflare Edge Master Admin'
  });
  const demoPw = seedPassword('DEMO_INITIAL_PASSWORD');
  if (demoPw) seeds.push({
    id: '00000000-0000-0000-0000-000000000002',
    email: 'user@luno.local',
    password: demoPw,
    display_name: 'LUNO Demo User',
    role: 'user',
    handle: 'luno_user',
    bio: 'LUNO Global Messenger User'
  });

  for (const s of seeds) {
    users.set(s.email.toLowerCase(), s);
    usersById.set(s.id, s);
  }
  // Demo identities are explicitly public: email search finds them.
  for (const s of seeds) {
    if (s.role !== 'admin') userPrefs.set(s.id, { ...DEFAULT_PREFS, searchable_by_email: true });
  }


  // Pre-seed OpenChat room
  communityRooms.set('room-1', {
    id: 'room-1',
    name: 'LUNO Global Developer Lounge',
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
      ...headers
    }
  });
}

function requestOrigin(request) {
  try { return new URL(request.url).origin; } catch { return ''; }
}
// CORS is allowlisted: same-origin requests plus env.ALLOWED_ORIGINS.
// Anything else gets no ACAO header, so browsers block the read.
function corsOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (!origin) return '';
  if (origin === requestOrigin(request)) return origin;
  const list = String((env && env.ALLOWED_ORIGINS) || '').split(',').map(s => s.trim()).filter(Boolean);
  return list.includes(origin) ? origin : '';
}
function cookieValue(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return '';
}
// I-2: refresh tokens travel as httpOnly cookies. Secure is set on https
// origins only so http://localhost development keeps working.
function refreshCookie(token, request, maxAge = 30 * 86400) {
  let secure = false;
  try { secure = new URL(request.url).protocol === 'https:'; } catch { secure = false; }
  return `luno_refresh=${token}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}
// I-3: hardening headers on every response. The strict CSP applies to API
// payloads only; hosted app assets keep their own document policy.
async function withSecurityHeaders(request, res) {
  if (!res || res.webSocket) return res;
  const headers = new Headers(res.headers);
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  try {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/') || path === '/metrics') {
      headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    }
  } catch { /* keep the other headers */ }
  const nullBody = res.status === 204 || res.status === 304 || res.status === 101;
  return new Response(nullBody ? null : res.body, { status: res.status, statusText: res.statusText, headers });
}
async function withCors(request, env, res) {
  if (!res || res.webSocket) return res;
  const origin = corsOrigin(request, env);
  if (!origin || res.headers.has('Access-Control-Allow-Origin')) return res;
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  const nullBody = res.status === 204 || res.status === 304 || res.status === 101;
  return new Response(nullBody ? null : res.body, { status: res.status, statusText: res.statusText, headers });
}

// Authentication is session-backed only: a token is valid iff its digest exists in D1 (or the
// in-memory store when no D1 is bound), has not been revoked and is inside its TTL. The old
// stateless "cf-token-<userId>.*" fallback accepted any forged token and is removed.
async function loadUserFromD1(id, knownRole) {
  const db = dbOf();
  if (!db) return null;
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!row) return null;
  const u = applyStoredPassword({
    id: row.id, email: row.email, handle: row.handle || '', birthday: row.birthday || '',
    display_name: row.display_name || row.email.split('@')[0], role: knownRole === undefined ? await storedUserRole(row.id) : knownRole,
    bio: row.bio || '', status_message: row.status_message || '', avatar_url: row.avatar_url || '', cover_url: row.cover_url || '', created_at: row.created_at,
    state: row.state || undefined
  }, row.password_hash);
  users.set(row.email.toLowerCase(), u);
  usersById.set(u.id, u);
  hydrateUserPrefs(u.id, row.prefs_json);
  return u;
}
// A-2: login-time D1 lookup by any identifier (email/handle/phone). The D1
// row is authoritative: password changes, bans and deletions made on another
// isolate are visible to this login. Returns null when D1 has no such user,
// in which case the caller keeps its memory result (bootstrap seeds).
async function loadUserFromD1ByLogin(identifier) {
  const db = dbOf();
  if (!db || !identifier) return null;
  const row = await db.prepare('SELECT id FROM users WHERE email = ? OR LOWER(handle) = ? OR phone_number = ?').bind(identifier, identifier, identifier).first().catch(() => null);
  if (!row) return null;
  return loadUserFromD1(row.id, undefined);
}
// A-2: a ban is live in D1 (user_bans row, unexpired). expires_at = 0 means
// an indefinite ban.
async function isBanned(userId) {
  const db = dbOf();
  if (!db || !userId) return false;
  const row = await db.prepare('SELECT expires_at FROM user_bans WHERE user_id = ?').bind(userId).first().catch(() => null);
  if (!row) return false;
  const exp = Number(row.expires_at || 0);
  return exp === 0 || exp > Date.now();
}
// Privilege assignments are provisioned separately by an authorized operator.
// Email, demo seed data and the role copied into an old session are not grants.
const GRANTABLE_ROLES = ['user', 'admin', 'partner', 'developer', 'creator', 'ads'];
function grantedRole(role) { return GRANTABLE_ROLES.includes(role) ? role : 'user'; }
// Legacy databases have no grants: fail closed until the approved migration
// and explicit administrator provisioning have been completed.
// Once an isolate sees the table is absent it stops querying it (still failing closed
// to 'user'); a new isolate picks up the table as soon as the migration is applied.
let rolesTableAbsent = false;
function missingRolesTable(error) {
  const missing = /no such table.*luno_user_roles/i.test(String(error?.message));
  if (missing) rolesTableAbsent = true;
  return missing;
}
async function storedUserRole(userId) {
  const db = dbOf();
  if (!db || rolesTableAbsent) return 'user';
  try {
    const assignment = await db.prepare('SELECT role FROM luno_user_roles WHERE user_id = ?').bind(userId).first();
    return grantedRole(assignment?.role);
  } catch (error) {
    if (missingRolesTable(error)) return 'user';
    throw error;
  }
}
async function getAuthUser(request) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token || revokedTokens.has(token)) return null;
  let session = sessions.get(token);
  let grantedRoleFromSession = 'user';
  const db = dbOf();
  if (db) {
    await ensureSchema();
    const tokenHash = await sha256Hex(token);
    // One query per authenticated request: the session and the user's current
    // grant are read together, so a revoked grant still takes effect immediately.
    let row = null, joined = false;
    if (!rolesTableAbsent) try {
      row = await db.prepare('SELECT s.session_id, s.user_id, s.role, s.created_at, s.revoked_at, r.role AS granted_role FROM luno_sessions s LEFT JOIN luno_user_roles r ON r.user_id = s.user_id WHERE s.token_hash = ?').bind(tokenHash).first();
      joined = true;
    } catch (error) {
      if (!missingRolesTable(error)) throw error;
    }
    if (!joined) row = await db.prepare('SELECT session_id, user_id, role, created_at, revoked_at FROM luno_sessions WHERE token_hash = ?').bind(tokenHash).first();
    if (row) grantedRoleFromSession = grantedRole(row.granted_role);
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
  if (!user) user = await loadUserFromD1(userId, db ? grantedRoleFromSession : undefined);
  if (db) {
    // A-2: account standing is re-read from D1 on every request, so a ban,
    // suspension or deletion on another isolate takes effect immediately.
    const standing = await db.prepare('SELECT state FROM users WHERE id = ?').bind(userId).first().catch(() => null);
    const state = standing?.state || user?.state || 'active';
    if (user) user.state = state;
    if (!user || state === 'suspended' || state === 'deleted' || await isBanned(userId)) {
      sessions.delete(token);
      return null;
    }
  } else if (!user || user.state === 'suspended' || user.state === 'deleted') {
    return null;
  }
  if (db) user.role = grantedRoleFromSession;
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
// Shared data-URL photo validation (avatar + cover). Returns [message, code]
// or null; '' clears. Byte-identical to the original avatar checks.
function validatePhotoDataUrl(value, label, code) {
  if (typeof value !== 'string' || value.length > 350000) return [`${label} must be smaller than 256 KB`, code];
  if (value === '') return null;
  const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return ['Only JPEG, PNG and WebP photos are supported', code];
  let raw;
  try { raw = atob(match[2]); } catch { return ['Invalid photo encoding', null]; }
  const valid = match[1] === 'jpeg' ? raw.startsWith('\xff\xd8\xff') : match[1] === 'png' ? raw.startsWith('\x89PNG\r\n\x1a\n') : raw.startsWith('RIFF') && raw.slice(8, 12) === 'WEBP';
  if (!valid || raw.length > 262144) return [`Invalid or oversized ${label.toLowerCase()}`, code];
  return null;
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
function durableConversationsEnabled() { return CURRENT_ENV?.DURABLE_CONVERSATIONS === 'true' && !!dbOf(); }
function ownedResourcesDurable() { return CURRENT_ENV?.DURABLE_BUSINESS === 'true' && !!dbOf(); }
function ownedMap(kind) { return kind === 'creator_pack' ? creatorPacks : adsCampaigns; }
async function ownedList(kind, user) {
  if (ownedResourcesDurable()) {
    const sql = user.role === 'admin' ? 'SELECT * FROM luno_owned_resources WHERE kind=?' : 'SELECT * FROM luno_owned_resources WHERE kind=? AND owner_id=?';
    const statement = dbOf().prepare(sql);
    const { results } = await (user.role === 'admin' ? statement.bind(kind) : statement.bind(kind, user.id)).all();
    return (results || []).map(row => ({ ...JSON.parse(row.payload), id: row.id, owner_id: row.owner_id }));
  }
  return Array.from(ownedMap(kind).values()).filter(value => user.role === 'admin' || value.owner_id === user.id);
}
async function ownedRead(kind, id) {
  if (!ownedResourcesDurable()) return ownedMap(kind).get(id);
  const row = await dbOf().prepare('SELECT * FROM luno_owned_resources WHERE kind=? AND id=?').bind(kind, id).first();
  return row ? { ...JSON.parse(row.payload), id: row.id, owner_id: row.owner_id } : null;
}
async function ownedSave(kind, value, create = false) {
  if (ownedResourcesDurable()) {
    if (create) await dbOf().prepare('INSERT INTO luno_owned_resources (kind,id,owner_id,payload,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(kind, value.id, value.owner_id, JSON.stringify(value), now(), now()).run();
    else await dbOf().prepare('UPDATE luno_owned_resources SET payload=?,updated_at=? WHERE kind=? AND id=? AND owner_id=?').bind(JSON.stringify(value), now(), kind, value.id, value.owner_id).run();
  } else ownedMap(kind).set(value.id, value);
  return value;
}
async function hydrateDurableConversation(cid) {
  if (!durableConversationsEnabled()) return conversations.get(cid);
  const row = await dbOf().prepare('SELECT * FROM luno_conversations WHERE id = ?').bind(cid).first();
  if (!row) { if (conversations.get(cid)?._durable) conversations.delete(cid); return conversations.get(cid); }
  if (row.deleted_at) { conversations.delete(cid); return null; }
  const { results } = await dbOf().prepare('SELECT user_id, role FROM luno_conversation_members WHERE conversation_id = ? ORDER BY joined_at, user_id').bind(cid).all();
  const previous = conversations.get(cid);
  const conv = { ...previous, id: row.id, kind: row.kind, title: row.title, notice: row.notice, avatar_url: row.avatar_url, owner_id: row.owner_id, members: (results || []).map(member => member.user_id), revision: row.revision, created_at: row.created_at, updated_at: row.updated_at, last_sequence: previous?.last_sequence || 0, _durable: true };
  conversations.set(cid, conv);
  return conv;
}
async function hydrateDurableConversations(userId) {
  if (!durableConversationsEnabled()) return;
  const { results } = await dbOf().prepare('SELECT conversation_id FROM luno_conversation_members WHERE user_id = ?').bind(userId).all();
  const ids = new Set((results || []).map(row => row.conversation_id));
  for (const conv of conversations.values()) if (conv._durable && conv.members.includes(userId) && !ids.has(conv.id)) conv.members = conv.members.filter(id => id !== userId);
  for (const cid of ids) await hydrateDurableConversation(cid);
}
async function createDurableConversation(fields) {
  if (!durableConversationsEnabled() || fields.members.some(id => officialAccounts.has(id))) return createConversation(fields);
  const db = dbOf(), at = now();
  const key = fields.kind === 'direct' ? [...fields.members].sort().join(':') : null;
  const cid = key ? `dm-${await sha256Hex(key)}` : uid();
  const owner = fields.owner_id || fields.members[0];
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO luno_conversations (id,kind,title,owner_id,direct_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').bind(cid, fields.kind, fields.title || '', owner, key, at, at),
    ...fields.members.map(id => db.prepare('INSERT OR IGNORE INTO luno_conversation_members (conversation_id,user_id,role,joined_at) VALUES (?,?,?,?)').bind(cid, id, id === owner ? 'owner' : 'member', at))
  ]);
  return await hydrateDurableConversation(cid);
}
async function persistDurableConversation(conv) {
  if (!conv?._durable || !durableConversationsEnabled()) return;
  const db = dbOf(), mutation = uid(), at = now();
  const statements = [db.prepare('UPDATE luno_conversations SET title=?,notice=?,avatar_url=?,owner_id=?,revision=revision+1,mutation_token=?,deleted_at=?,updated_at=? WHERE id=? AND revision=? AND deleted_at IS NULL').bind(conv.title || '', conv.notice || '', conv.avatar_url || '', conv.owner_id, mutation, conv.members.length ? null : at, at, conv.id, conv.revision),
    db.prepare('DELETE FROM luno_conversation_members WHERE conversation_id=? AND EXISTS (SELECT 1 FROM luno_conversations WHERE id=? AND mutation_token=?)').bind(conv.id, conv.id, mutation),
    ...conv.members.map(id => db.prepare('INSERT INTO luno_conversation_members (conversation_id,user_id,role,joined_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM luno_conversations WHERE id=? AND mutation_token=?)').bind(conv.id, id, id === conv.owner_id ? 'owner' : 'member', at, conv.id, mutation))];
  try {
    const result = await db.batch(statements);
    if (!result[0]?.meta?.changes) {
      const error = new Error('Conversation changed; reload and retry'); error.code = 'CONVERSATION_CONFLICT'; throw error;
    }
    conv.revision += 1;
  } catch (error) { await hydrateDurableConversation(conv.id); throw error; }
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
// A-5: server-minted kinds a client must never send directly.
const FORGED_CLIENT_KINDS = new Set(['security_notice', 'pay', 'transfer', 'call_status', 'system']);
const pushTokens = new Map();
const deviceKeys = new Map();
const userKeys = new Map();
const groupCallRooms = new Map();
const richMenus = new Map();
const creatorSettlements = new Map();
const REACTIONS = ['❤️', '😍', '😂', '😮', '😢', '👍'];
// Smart-channel slot: served from D1 luno_notices (no hardcoded content).


const INLINE_MIME = /^(image\/(png|jpeg|gif|webp)|audio\/(webm|ogg|mp4|mpeg|wav)|video\/(mp4|webm))$/;

/**
 * Extended LUNO-class messenger API. Returns a Response when a route is handled, otherwise null.
 * Membership of /conversations/{id}/* and /calls/{id}/* is enforced by the caller before this runs.
 */

const PEER_USERS = [
  { id: 'peer-k', display_name: 'K 🙏', handle: 'k_pray', email: 'k@luno.local', avatar_color: '#315BCD', status_message: '기도하며 준비 중' },
  { id: 'peer-dodo', display_name: '도천재 도도형님', handle: 'dodo_genius', email: 'dodo@luno.local', avatar_color: '#22c55e', status_message: '최고의 개발자' },
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
      { id: `m-keep-${userId}-2`, conversation_id: keepCid, sender_id: userId, client_id: 'keep-2', sequence: 2, kind: 'text', body: 'https://luno-messenger.dnjstjqppk.workers.dev/ 프로덕션 점검 완료', read_count: 1, created_at: '2026-08-01T11:30:00Z' }
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
      { id: `m-k-${userId}-3`, conversation_id: kCid, sender_id: userId, client_id: 'k-3', sequence: 3, kind: 'call_status', body: '음성통화', metadata: { duration: '01:35', call_type: 'voice', call_status: 'completed' }, created_at: '2026-10-23T17:16:00Z' },
      { id: `m-k-${userId}-4`, conversation_id: kCid, sender_id: 'peer-k', client_id: 'k-4', sequence: 4, kind: 'call_status', body: '음성통화', metadata: { duration: '00:29', call_type: 'voice', call_status: 'completed' }, created_at: '2026-10-23T22:23:00Z' },
      { id: `m-k-${userId}-5`, conversation_id: kCid, sender_id: userId, client_id: 'k-5', sequence: 5, kind: 'call_status', body: '취소', metadata: { call_type: 'voice', call_status: 'cancelled' }, created_at: '2026-10-24T20:58:00Z' },
      { id: `m-k-${userId}-6`, conversation_id: kCid, sender_id: 'peer-k', client_id: 'k-6', sequence: 6, kind: 'call_status', body: '부재중 전화', metadata: { call_type: 'voice', call_status: 'missed' }, created_at: '2026-10-24T17:34:00Z' },
      { id: `m-k-${userId}-7`, conversation_id: kCid, sender_id: userId, client_id: 'k-7', sequence: 7, kind: 'call_status', body: '음성통화', metadata: { duration: '09:24', call_type: 'voice', call_status: 'completed' }, created_at: '2026-10-27T17:52:00Z' },
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
    // No cursor preset: the room shows N until actually read (item 9).
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

  // ---------- Passkeys (WebAuthn registration) ----------
  if (p === 'passkeys/register/begin' && request.method === 'POST') {
    const reqUrl = new URL(request.url);
    const rpId = reqUrl.hostname.toLowerCase();
    const creds = await pkListCreds(myId);
    const challenge = await pkIssueChallenge(myId, 'registration');
    return json({ publicKey: {
      challenge,
      rp: { id: rpId, name: 'LUNO' },
      user: {
        id: pkB64Encode(new TextEncoder().encode(myId)),
        name: me.email || me.handle || myId,
        displayName: me.display_name || me.email || 'LUNO user',
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      timeout: 300000,
      attestation: 'none',
      excludeCredentials: creds.map(c => ({ type: 'public-key', id: c.credId })),
    }});
  }
  if (p === 'passkeys/register/finish' && request.method === 'POST') {
    const b = await readJson(request);
    const reqUrl = new URL(request.url);
    const rpId = reqUrl.hostname.toLowerCase();
    const stored = await pkLatestChallenge(myId, 'registration');
    if (!stored || !(await pkConsumeChallenge(stored, myId, 'registration'))) {
      return bad('진행 중인 등록 절차가 없거나 만료되었습니다', 400);
    }
    const creds = await pkListCreds(myId);
    try {
      const v = await pkVerifyRegistration({
        rpId, origin: reqUrl.origin, challengeB64: stored, body: b,
        excludeIds: creds.map(c => c.credId),
      });
      await pkStoreCred(myId, v.credIdB64, v.jwk, v.counter, v.transports);
      return json({ verified: true, credential_id: v.credIdB64 });
    } catch (e) {
      return bad('패스키 검증에 실패했습니다', 400);
    }
  }
  if (p === 'passkeys' && request.method === 'GET') {
    const creds = await pkListCreds(myId);
    return json({ passkeys: creds.map(c => ({
      id: c.credId, name: c.name || '', created_at: c.createdAt, last_used_at: c.lastUsedAt || '',
    })) });
  }
  const pkDel = p.match(/^passkeys\/([^/]+)$/);
  if (pkDel && request.method === 'DELETE') {
    const ok = await pkDeleteCred(myId, pkDel[1]);
    if (!ok) return json({ error: 'not found' }, 404);
    return json({ deleted: true });
  }
  // ---------- Profile & settings ----------
  if (p === 'me') {
    if (dbOf()) {
      const row = await dbOf().prepare('SELECT * FROM users WHERE id = ?').bind(myId).first();
      if (row) me.avatar_url = row.avatar_url || '';
    }
    if (method === 'GET') return json({ ...publicUser(me), email: me.email, role: me.role });
    if (method === 'PATCH') {
      const b = await readJson(request);
      for (const [key, label, code] of [['avatar_url', 'Profile photo', 'INVALID_AVATAR'], ['cover_url', 'Cover photo', 'INVALID_COVER']]) {
        if (b[key] === undefined) continue;
        const err = validatePhotoDataUrl(b[key], label, code);
        if (err) return json(err[1] ? { error: err[0], code: err[1] } : { error: err[0] }, 400);
      }
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
      if (dbOf()) await dbOf().prepare("UPDATE users SET display_name = ?, bio = ?, status_message = ?, avatar_url = ?, cover_url = ?, handle = ?, birthday = ?, updated_at = ? WHERE id = ?").bind(me.display_name, me.bio || '', me.status_message || '', b.avatar_url === undefined ? (me.avatar_url || '') : b.avatar_url, b.cover_url === undefined ? (me.cover_url || '') : b.cover_url, me.handle || '', me.birthday || '', now(), myId).run();
      if (b.avatar_url !== undefined) me.avatar_url = b.avatar_url;
      if (b.cover_url !== undefined) me.cover_url = b.cover_url;
      return json({ ...publicUser(me), email: me.email, role: me.role });
    }
    if (method === 'DELETE') {
      // A-10 canonical route: password confirmation, then the shared
      // deleteAccountData() wipe. POST /me/delete-account is a
      // compatibility alias into the same path.
      const b = await readJson(request);
      if (!b.password) return json({ error: 'password required for account deletion' }, 400);
      if (!(await checkPassword(me, b.password))) return json({ error: 'password incorrect' }, 401);
      if (['user@luno.local'].includes((me.email || '').toLowerCase())) {
        return json({ error: 'shared demo accounts cannot be deleted', code: 'DEMO_PROTECTED' }, 403);
      }
      await deleteAccountData(myId);
      await revokeOtherSessions(myId, '', myId);
      await persistAudit(myId, 'account.delete', myId, {});
      return json({ status: 'account_deleted' });
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
      if (dbOf()) {
        await ensureSchema();
        await dbOf().prepare("UPDATE users SET prefs_json = ? WHERE id = ?").bind(JSON.stringify(prefs), myId).run();
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
    return json({ status: 'logged_out' }, 200, { 'Set-Cookie': refreshCookie('', request, 0) });
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
  if (p === 'me/qr' && method === 'GET') return json({ code: `LUNO-FRIEND:${me.handle}`, handle: me.handle });
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
      if (!await rateLimit('rl:friend:' + myId, 120)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
      const b = await readJson(request);
      let target = null;
      if (b.friend_id || b.target_user_id) target = usersById.get(b.friend_id || b.target_user_id);
      else if (b.handle || b.qr_code) {
        const h = String(b.handle || String(b.qr_code).replace(/^(LINE-FRIEND|LUNO-FRIEND):/i, '')).trim().toLowerCase().replace(/^@/, '');
        const all = Array.from(users.values());
        target = all.find(u => u.handle === h)
          || all.find(u => u.email && u.email.toLowerCase() === h && prefsOf(u.id).searchable_by_email)
          || all.find(u => u.display_name && u.display_name.toLowerCase() === h);
      }
      if (!target || target.state === 'suspended') return bad('사용자를 찾을 수 없습니다', 404);
      if (target.id === myId) return bad('자기 자신은 친구로 추가할 수 없습니다');
      if (isFriend(myId, target.id)) return json({ status: 'already_friends', friend: publicUser(target) });
      if (!prefsOf(target.id).allow_friend_requests || fMeta(target.id, myId).blocked) return bad('친구 추가할 수 없는 사용자입니다', 403);
      friendships.set(`${myId}:${target.id}`, true);
      friendships.set(`${target.id}:${myId}`, true);
      if (dbOf()) {
        await ensureSchema();
        const fat = now();
        await dbOf().prepare("INSERT OR IGNORE INTO friends (user_id, friend_id, status, is_favorite, created_at) VALUES (?, ?, 'accepted', 0, ?)").bind(myId, target.id, fat).run();
        await dbOf().prepare("INSERT OR IGNORE INTO friends (user_id, friend_id, status, is_favorite, created_at) VALUES (?, ?, 'accepted', 0, ?)").bind(target.id, myId, fat).run();
      }
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
      if (dbOf()) {
        await ensureSchema();
        if (typeof b.favorite === 'boolean') {
          await dbOf().prepare('UPDATE friends SET is_favorite = ? WHERE user_id = ? AND friend_id = ?').bind(b.favorite ? 1 : 0, myId, fid).run();
        }
        if (b.blocked === true) {
          await dbOf().prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').bind(myId, fid, now()).run();
        } else if (b.blocked === false) {
          await dbOf().prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').bind(myId, fid).run();
        }
      }
      return json({ status: 'updated', meta });
    }
    if (method === 'DELETE') {
      friendships.delete(`${myId}:${fid}`);
      friendships.delete(`${fid}:${myId}`);
      friendMeta.delete(`${myId}:${fid}`);
      friendMeta.delete(`${fid}:${myId}`);
      if (dbOf()) {
        await ensureSchema();
        await dbOf().prepare('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').bind(myId, fid, fid, myId).run();
      }
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
        const u = isOA ? officialAccounts.get(id) : (usersById.get(id) || await loadUserFromD1(id));
        if (!u || u.state === 'suspended') return bad('존재하지 않는 사용자가 포함되어 있습니다', 404);
        if (fMeta(myId, id).blocked) return bad('차단한 사용자와는 대화할 수 없습니다', 403);
        if (!isOA && !isFriend(myId, id)) {
          friendships.set(`${myId}:${id}`, true);
          friendships.set(`${id}:${myId}`, true);
        }
      }
      if (kind === 'direct') {
        if (ids.length !== 1) return bad('1:1 대화는 상대가 한 명이어야 합니다');
        await hydrateDurableConversations(myId);
        const existing = findDirect(myId, ids[0]);
        if (existing) { cMeta(existing.id, myId).hidden = false; return json(chatSummary(existing, myId)); }
        const isOA = officialAccounts.has(ids[0]);
        const oa = isOA ? officialAccounts.get(ids[0]) : null;
        const targetUser = !isOA ? usersById.get(ids[0]) : null;
        const convTitle = (b.title || (oa ? oa.name : targetUser ? targetUser.display_name : '')).trim();
        const c = await createDurableConversation({ kind: 'direct', title: convTitle, members: [myId, ids[0]] });
        sendTo(c.members, { type: 'conversation.updated', conversation_id: c.id });
        return json(chatSummary(c, myId), 201);
      }
      const title = clip(b.title, 50);
      if (!title) return bad('그룹 이름을 입력하세요');
      const c = await createDurableConversation({ kind: 'group', title, members: [myId, ...ids], owner_id: myId });
      await systemMessage(c.id, `${me.display_name}님이 그룹을 만들었습니다.`);
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
      if (b.owner_id !== undefined) {
        if (conv.kind !== 'group' || conv.owner_id !== myId || !conv.members.includes(b.owner_id)) return json({ error: 'ownership transfer forbidden' }, 403);
        conv.owner_id = b.owner_id;
      }
      await persistDurableConversation(conv);
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
    await persistDurableConversation(conv);
    await systemMessage(conv.id, `${me.display_name}님이 ${added.join(', ')}님을 초대했습니다.`);
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
    await persistDurableConversation(conv);
    await systemMessage(conv.id, `${target ? target.display_name : '멤버'}님이 내보내졌습니다.`);
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
      if (!await rateLimit('rl:msg:' + myId, 300)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
      const b = await readJson(request);
      const kind = b.kind || 'text';
      await hydrateConversation(cid);
      if (!MESSAGE_KINDS.has(kind)) return bad('지원하지 않는 메시지 종류입니다');
      if (FORGED_CLIENT_KINDS.has(kind)) return bad('시스템 메시지는 직접 전송할 수 없습니다', 400);
      if (conv.kind === 'direct') {
        const other = conv.members.find(x => x !== myId);
        if (other) {
          const blk = await blockState(myId, other);
          if (blk.byMe) return bad('차단한 사용자에게는 메시지를 보낼 수 없습니다', 403);
          if (blk.byThem) return bad('상대방이 차단한 대화에는 메시지를 보낼 수 없습니다', 403);
        }
      }
      if (b.client_id) {
        const dup = (messages.get(cid) || []).find(x => x.client_id === b.client_id && x.sender_id === myId);
        if (dup) return json({ message: decorateMessage(dup, myId, cid), duplicate: true }, 200);
      }
      let body = typeof b.body === 'string' ? b.body : '';
      let metadata = {};
      const meta = b.metadata && typeof b.metadata === 'object' ? b.metadata : {};
      // A-6: media payloads may only reference http(s) URLs or server-issued
      // attachment references. Active schemes can never be injected.
      const urlCandidates = [meta.url, meta.uri];
      if (['image', 'video', 'file', 'audio', 'voice'].includes(kind)) urlCandidates.push(body);
      for (const candidate of urlCandidates) {
        if (typeof candidate === 'string' && /^\s*(data|javascript|vbscript|file|blob):/i.test(candidate)) {
          return bad('허용되지 않은 링크 형식입니다', 400);
        }
      }
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
  if ((m = p.match(/^conversations\/([\w-]+)\/rich-menu$/)) && method === 'GET') {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const oaId = conv.members.find(x => officialAccounts.has(x) || richMenus.has(x));
    if (!oaId) return json({ rich_menu: null });
    const menu = richMenus.get(oaId) || null;
    return json({ rich_menu: menu });
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
    const cid = resolveConversationId(m[1], myId);
    let conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) {
      conv = await hydrateDurableConversation(cid).catch(() => null);
    }
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const q = clip(url.searchParams.get('q') || '', 100);
    if (q.length < 1) return json({ messages: [] });
    const hs = hiddenMsgs.get(myId);
    const db = dbOf();
    if (db) {
      // A-19: D1 SQL search over the caller's own rooms. LIKE over the
      // (conversation_id, sequence) index today; an FTS5 virtual table over
      // luno_messages(body) can replace the predicate without changing this
      // route's contract.
      await ensureSchema();
      const esc = q.replace(/[%_\\]/g, (ch) => '\\' + ch);
      const { results } = await db.prepare("SELECT * FROM luno_messages WHERE conversation_id = ? AND unsent = 0 AND kind <> 'sticker' AND body LIKE ? ESCAPE '\\' ORDER BY sequence DESC LIMIT 50").bind(cid, '%' + esc + '%').all();
      const out = (results || []).filter(r => !(hs && hs.has(r.id))).map(r => decorateMessage(rowToMessage(r), myId, cid));
      return json({ messages: out });
    }
    const ql = q.toLowerCase();
    const out = (messages.get(cid) || []).filter(x => !x.unsent && x.kind !== 'sticker' && !(hs && hs.has(x.id)) && String(x.body).toLowerCase().includes(ql));
    return json({ messages: out.slice(-50).reverse().map(x => decorateMessage(x, myId, cid)) });
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
      let ids = [];
      const candIds = (Array.isArray(b.attachment_ids) ? b.attachment_ids : []).slice(0, 100);
      if (candIds.length && dbOf()) {
        await ensureSchema();
        for (const aid of candIds) {
          const row = await dbOf().prepare('SELECT conversation_id, mime_type FROM attachments WHERE id = ?').bind(String(aid)).first().catch(() => null);
          if (row && row.conversation_id === cid && (row.mime_type || '').startsWith('image/')) ids.push(String(aid));
        }
      }
      const album = { id: uid(), title, attachment_ids: ids, created_by: myId, created_at: now() };
      list.push(album);
      albums.set(cid, list);
      return json(album, 201);
    }
  }

  // ---------- Attachments ----------
  if (p === 'attachments' && method === 'POST') {
    // Attachments bypass readJson's 3MB global cap with their own 413 gate.
    const rawBody = await request.text().catch(() => '');
    if (rawBody.length > MAX_ATTACHMENT_B64 + 4096) return bad('파일이 비어 있거나 너무 큽니다 (최대 10MB)', 413);
    let b = {};
    try { const v = JSON.parse(rawBody || '{}'); if (v && typeof v === 'object') b = v; } catch { b = {}; }
    const conv = conversations.get(b.conversation_id);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없습니다', 404);
    if (typeof b.content_base64 !== 'string' || !b.content_base64 || b.content_base64.length > MAX_ATTACHMENT_B64 || !/^[A-Za-z0-9+/=]+$/.test(b.content_base64)) return bad('파일이 비어 있거나 너무 큽니다 (최대 10MB)', 413);
    const mime = typeof b.mime_type === 'string' ? b.mime_type.toLowerCase() : '';
    if (!ATTACHMENT_MIME_ALLOW.has(mime)) return json({ error: '허용되지 않은 파일 형식입니다', code: 'MIME_NOT_ALLOWED' }, 415);
    const bucket = mediaBucketOf();
    const store = dbOf();
    if (!bucket || !store) return json({ error: '미디어 스토리지가 아직 연결되지 않았습니다', code: 'MEDIA_UNAVAILABLE' }, 503);
    const bin = atob(b.content_base64);
    if (bin.length > MAX_ATTACHMENT_BYTES) return bad('파일이 비어 있거나 너무 큽니다 (최대 10MB)', 413);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const att = { id: uid(), owner: myId, conversation_id: conv.id, name: clip(b.original_name || 'file', 120) || 'file', mime, bytes };
    await persistAttachmentR2(att);
    return json({ id: att.id, status: 'ready', original_name: att.name, mime_type: mime, size_bytes: bytes.length }, 201);
  }
  if ((m = p.match(/^attachments\/([\w-]+)(?:\/content)?$/)) && method === 'GET') {
    const att = await loadAttachment(m[1]);
    if (!att || !conversations.get(att.conversation_id)?.members.includes(myId)) return bad('파일을 찾을 수 없습니다', 404);
    const bytes = att.bytes;
    const inline = INLINE_MIME.test(att.mime);
    const acao = corsOrigin(request, typeof CURRENT_ENV !== 'undefined' ? CURRENT_ENV : null);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': inline ? att.mime : 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(att.name)}`,
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, max-age=3600', ...(acao ? { 'Access-Control-Allow-Origin': acao, 'Vary': 'Origin' } : {})
      }
    });
  }

  // ---------- Calls ----------
  if (p === 'calls' && method === 'POST') {
    const b = await readJson(request);
    if (!['voice', 'video'].includes(b.kind || 'voice')) return bad('통화 종류가 올바르지 않습니다');
    // A-12: membership is verified against D1 (durable rooms), not just isolate memory.
    let conv = conversations.get(b.conversation_id);
    if (!conv || !conv.members.includes(myId)) {
      conv = await hydrateDurableConversation(b.conversation_id).catch(() => null);
    }
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없습니다', 404);
    if (conv.official) return bad('공식계정과는 통화할 수 없습니다');
    if (conv.kind === 'direct') {
      const other = conv.members.find(x => x !== myId);
      if (other) {
        const blk = await blockState(myId, other);
        if (blk.byMe || blk.byThem) return bad('차단된 상대와는 통화할 수 없습니다', 403);
      }
    }
    const call = { id: uid(), conversation_id: conv.id, kind: b.kind || 'voice', state: 'ringing', initiated_by: myId, started_at: now(), connected_at: null, ended_at: null };
    callSessions.set(call.id, call);
    const peerId = conv.members.find(x => x !== myId);
    const callkitPayload = {
      type: 'call.ringing',
      call_id: call.id,
      conversation_id: conv.id,
      initiated_by: myId,
      caller_name: me.display_name,
      caller_handle: me.handle,
      caller_avatar_color: me.avatar_color,
      kind: call.kind,
      has_video: call.kind === 'video',
      callkit: {
        uuid: call.id,
        handle: me.handle || me.display_name,
        hasVideo: call.kind === 'video',
        localizedCallerName: me.display_name
      }
    };
    broadcast(callkitPayload);
    return json({ id: call.id, state: 'ringing', kind: call.kind, callkit: callkitPayload.callkit }, 201);
  }
  if (p === 'calls' && method === 'GET') {
    await hydrateUserConversations(myId);
    const peerColor = id => usersById.get(id)?.avatar_color || officialAccounts.get(id)?.color || '#4F7CFF';
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
    if (!call) return bad('통화를 찾을 수 없습니다', 404);
    let stateConv = conversations.get(call.conversation_id);
    if (!stateConv || !stateConv.members.includes(myId)) {
      stateConv = await hydrateDurableConversation(call.conversation_id).catch(() => null);
    }
    if (!stateConv || !stateConv.members.includes(myId)) return bad('통화를 찾을 수 없습니다', 404);
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
    // A-5/A-14: the server mints the call_status bubble itself (clients are
    // forbidden from forging system kinds). Shape matches the /calls ledger.
    const durText = Math.floor(duration / 60) + ':' + String(duration % 60).padStart(2, '0');
    pushMessage(call.conversation_id, call.initiated_by, { kind: 'call_status', body: (call.kind === 'video' ? '영상통화' : '음성통화') + (duration > 0 ? ' ' + durText : ''), metadata: { call_id: call.id, call_type: call.kind, call_kind: call.kind, duration: durText, call_status: call.result, status: call.result } });
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
      const bgs = ['linear-gradient(135deg,#4F7CFF,#0ea5e9)', 'linear-gradient(135deg,#f97316,#f43f5e)', 'linear-gradient(135deg,#6366f1,#ec4899)', 'linear-gradient(135deg,#14b8a6,#84cc16)'];
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
        if (dbOf()) {
          await ensureSchema();
          await dbOf().prepare("UPDATE users SET state = 'suspended' WHERE id = ?").bind(target.id).run();
          await dbOf().prepare('INSERT OR REPLACE INTO user_bans (user_id, reason, banned_by, expires_at, created_at) VALUES (?, ?, ?, 0, ?)').bind(target.id, clip(b.reason, 300), myId, now()).run();
        }
      } else if (b.action === 'activate') {
        target.state = 'active';
        if (dbOf()) {
          await ensureSchema();
          await dbOf().prepare("UPDATE users SET state = 'active' WHERE id = ?").bind(target.id).run();
          await dbOf().prepare('DELETE FROM user_bans WHERE user_id = ?').bind(target.id).run();
        }
      }
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
    return json({ error: 'Push delivery requires a configured provider-backed API', code: 'PUSH_NOT_CONFIGURED' }, 503);
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/sync$/)) && method === 'GET') {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없습니다', 404);
    const since = intIn(url.searchParams.get('since_sequence') || 0, 0, 1e9) || 0;
    const db = dbOf();
    let delta;
    if (db) {
      await ensureSchema();
      const { results } = await db.prepare('SELECT * FROM luno_messages WHERE conversation_id = ? AND sequence > ? ORDER BY sequence ASC LIMIT 501').bind(cid, since).all();
      delta = (results || []).map(rowToMessage);
    } else {
      delta = (messages.get(cid) || []).filter(x => x.sequence > since).sort((a, b) => a.sequence - b.sequence);
    }
    const hasMore = delta.length > 500;
    delta = delta.slice(0, 500);
    return json({
      conversation_id: cid,
      since_sequence: since,
      // Cursor is the last returned item, so paging cannot skip unseen messages.
      latest_sequence: delta.length ? delta[delta.length - 1].sequence : since,
      delta_messages: delta.map(x => decorateMessage(x, myId, cid)),
      has_more: hasMore
    });
  }

  // ==========================================
  // PHASE 2: Signal E2EE & WebRTC SFU / Media
  // ==========================================
  if ((m = p.match(/^devices\/([\w-]+)\/keys$/))) {
    if (method === 'PUT') {
      const b = await readJson(request);
      if (typeof b.identity_key !== 'string' || !b.identity_key) return bad('identity_key가 필요합니다');
      const otks = Array.isArray(b.one_time_prekeys) ? b.one_time_prekeys.filter(x => typeof x === 'string').slice(0, 100) : [];
      const bundle = {
        device_id: m[1],
        user_id: myId,
        identity_key: b.identity_key,
        signed_prekey: typeof b.signed_prekey === 'string' ? b.signed_prekey : '',
        prekey_sig: typeof b.prekey_sig === 'string' ? b.prekey_sig : '',
        one_time_prekeys: otks,
        updated_at: now()
      };
      deviceKeys.set(m[1], bundle);
      userKeys.set(myId, bundle);
      const kdb = dbOf();
      if (kdb) {
        await ensureSchema();
        await kdb.prepare('INSERT INTO e2ee_keys (user_id, device_id, identity_key, signed_prekey, prekey_sig, prekeys_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, device_id) DO UPDATE SET identity_key=excluded.identity_key, signed_prekey=excluded.signed_prekey, prekey_sig=excluded.prekey_sig, prekeys_json=excluded.prekeys_json, updated_at=excluded.updated_at')
          .bind(myId, m[1], bundle.identity_key, bundle.signed_prekey, bundle.prekey_sig, JSON.stringify(otks), bundle.updated_at).run();
      }
      return json({ status: 'keys_registered', device_id: m[1] });
    }
  }
  if ((m = p.match(/^users\/([\w-]+)\/keys$/)) && method === 'GET') {
    const targetId = m[1];
    const kdb = dbOf();
    if (kdb) {
      await ensureSchema();
      const row = await kdb.prepare('SELECT * FROM e2ee_keys WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1').bind(targetId).first();
      if (row) {
        let otks = [];
        try { otks = JSON.parse(row.prekeys_json || '[]'); } catch { otks = []; }
        const otk = otks.length ? otks.shift() : null;
        if (otk) await kdb.prepare('UPDATE e2ee_keys SET prekeys_json = ? WHERE user_id = ? AND device_id = ?').bind(JSON.stringify(otks), targetId, row.device_id).run();
        return json({ user_id: targetId, device_id: row.device_id, identity_key: row.identity_key, signed_prekey: row.signed_prekey, prekey_sig: row.prekey_sig || '', one_time_prekey: otk });
      }
    }
    const bundle = userKeys.get(targetId);
    if (!bundle) {
      return json({ error: 'No registered key bundle', code: 'KEY_BUNDLE_NOT_FOUND' }, 404);
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
    return json({ error: 'Speech transcription requires a configured provider-backed API', code: 'STT_NOT_CONFIGURED' }, 503);
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
        title: '공식 채널 기본 메뉴',
        layout: 'grid_2x3',
        size: { width: 1200, height: 800 },
        areas: [
          { bounds: { x: 0, y: 0, width: 400, height: 400 }, action: { type: 'message', text: '공식 공지사항' } },
          { bounds: { x: 400, y: 0, width: 400, height: 400 }, action: { type: 'message', text: '고객센터 상담' } },
          { bounds: { x: 800, y: 0, width: 400, height: 400 }, action: { type: 'uri', uri: 'https://luno-messenger.dnjstjqppk.workers.dev' } },
          { bounds: { x: 0, y: 400, width: 600, height: 400 }, action: { type: 'message', text: '진행중 이벤트' } },
          { bounds: { x: 600, y: 400, width: 600, height: 400 }, action: { type: 'message', text: '자주 묻는 질문' } }
        ],
        tiles: [
          { id: 't1', label: '📢 공식 공지', icon: '📢', action: { type: 'message', text: '공지사항' } },
          { id: 't2', label: '💬 고객센터 상담', icon: '💬', action: { type: 'message', text: '상담' } },
          { id: 't3', label: '🌐 공식 웹사이트', icon: '🌐', action: { type: 'uri', uri: 'https://luno-messenger.dnjstjqppk.workers.dev' } },
          { id: 't4', label: '🎁 진행중 이벤트', icon: '🎁', action: { type: 'message', text: '이벤트' } },
          { id: 't5', label: '❓ 자주 묻는 질문', icon: '❓', action: { type: 'message', text: '도움말' } },
          { id: 't6', label: '💳 LUNO Pay 혜택', icon: '💳', action: { type: 'message', text: '쿠폰' } }
        ]
      };
      return json({ rich_menu: menu });
    }
    if (method === 'POST') {
      const b = await readJson(request);
      const menu = { id: uid(), account_id: aid, ...b, updated_at: now() };
      richMenus.set(aid, menu);
      return json({ rich_menu: menu, status: 'saved' }, 201);
    }
  }
  if ((m = p.match(/^partner\/accounts\/([\w-]+)\/bot-rules$/))) {
    const aid = m[1];
    if (method === 'GET') {
      return json({ rules: oaBotRules.get(aid) || [] });
    }
    if (method === 'POST') {
      const b = await readJson(request);
      const rawKw = Array.isArray(b.keywords) ? b.keywords : String(b.keyword || '').split(',');
      const keywords = rawKw.map(k => String(k).trim()).filter(Boolean);
      const reply = clip(String(b.reply || b.response || ''), 1000);
      if (!keywords.length || !reply) return bad('키워드와 답변 내용을 입력하세요');
      const rules = oaBotRules.get(aid) || [];
      const newRule = { id: uid(), keywords, reply, match_type: b.match_type || 'contains', updated_at: now() };
      rules.push(newRule);
      oaBotRules.set(aid, rules);
      return json({ rule: newRule, rules }, 201);
    }
  }
  if ((m = p.match(/^partner\/accounts\/([\w-]+)\/bot-rules\/([\w-]+)$/)) && method === 'DELETE') {
    const [_, aid, ruleId] = m;
    let rules = oaBotRules.get(aid) || [];
    rules = rules.filter(r => r.id !== ruleId);
    oaBotRules.set(aid, rules);
    return json({ status: 'deleted', rule_id: ruleId });
  }
  if ((m = p.match(/^developer\/apps\/([\w-]+)\/webhooks\/test$/)) && method === 'POST') {
    return json({ error: 'Webhook delivery requires a configured delivery backend', code: 'WEBHOOK_DELIVERY_NOT_CONFIGURED' }, 503);
  }

  // ==========================================
  // PHASE 5: Payments, Settlements & Commerce
  // ==========================================
  if (p === 'checkout' && method === 'POST') {
    return json({ error: 'Verified payment provider integration is required', code: 'PAYMENTS_NOT_CONFIGURED' }, 503);
  }
  if (p === 'creator/settlements') {
    if (method === 'GET') {
      return json({ error: 'Settlement ledger is not connected', code: 'SETTLEMENTS_NOT_CONFIGURED' }, 503);
    }
  }
  if (p === 'creator/settlements/request' && method === 'POST') {
    return json({ error: 'Verified payout provider integration is required', code: 'SETTLEMENTS_NOT_CONFIGURED' }, 503);
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
    const b = await readJson(request);
    if (!b.password) return json({ error: 'password required for account deletion' }, 400);
    if (!(await checkPassword(me, b.password))) return json({ error: 'password incorrect' }, 401);
    if (['user@luno.local'].includes((me.email || '').toLowerCase())) {
      return json({ error: 'shared demo accounts cannot be deleted', code: 'DEMO_PROTECTED' }, 403);
    }
    await deleteAccountData(myId);
    await revokeOtherSessions(myId, '', myId);
    await persistAudit(myId, 'account.delete', myId, {});
    return json({ status: 'account_deleted', message: '계정이 영구 삭제 처리되었습니다.' });
  }

  return null;
}

async function leaveConversation(conv, myId, me) {
  conv.members = conv.members.filter(x => x !== myId);
  cMeta(conv.id, myId).hidden = true;
  if (!conv.members.length) {
    await persistDurableConversation(conv);
    conversations.delete(conv.id);
    return json({ status: 'left' });
  }
  if (conv.owner_id === myId) conv.owner_id = conv.members[0];
  await persistDurableConversation(conv);
  await systemMessage(conv.id, `${me.display_name}님이 나갔습니다.`);
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
    // Users and their grants in one query; a role lookup per user ran on every isolate start.
    let userRows = null;
    if (!rolesTableAbsent) try {
      userRows = await db.prepare('SELECT u.*, r.role AS granted_role FROM users u LEFT JOIN luno_user_roles r ON r.user_id = u.id').all();
    } catch (error) {
      if (!missingRolesTable(error)) throw error;
    }
    if (!userRows) userRows = await db.prepare('SELECT * FROM users').all();
    for (const row of userRows?.results || []) {
      const dName = (row.display_name === 'LUNO Demo User' || !row.display_name) ? 'LUNO Demo User' : row.display_name;
      const u = applyStoredPassword({
        id: row.id,
        email: row.email,
        handle: row.handle || '',
        birthday: row.birthday || '',
        display_name: dName,
        role: grantedRole(row.granted_role),
        bio: (row.bio && !row.bio.includes('LINE')) ? row.bio : 'LUNO Global Messenger User',
        status_message: row.status_message || '',
        avatar_url: row.avatar_url || '',
        cover_url: row.cover_url || '',
        created_at: row.created_at,
        state: row.state || undefined
      }, row.password_hash);
      users.set(row.email.toLowerCase(), u);
      usersById.set(u.id, u);
      hydrateUserPrefs(u.id, row.prefs_json);
    }
    const friendRows = await db.prepare("SELECT * FROM friends").all();
    if (friendRows && friendRows.results) {
      for (const f of friendRows.results) {
        friendships.set(`${f.user_id}:${f.friend_id}`, true);
        friendships.set(`${f.friend_id}:${f.user_id}`, true);
        if (Number(f.is_favorite)) fMeta(f.user_id, f.friend_id).favorite = true;
      }
    }
    const blockRows = await db.prepare("SELECT * FROM blocks").all().catch(() => null);
    if (blockRows && blockRows.results) {
      for (const bl of blockRows.results) fMeta(bl.blocker_id, bl.blocked_id).blocked = true;
    }
  } catch (err) {
    console.error('[D1 Sync Error]', err);
  }
}

// Latest Android build served from the LUNO URL (/download). Bumped on every
// APK release (release checklist in memory); routes below stay unchanged.
const LATEST_ANDROID_BUILD = {
  platform: 'android',
  version: '2.0.0',
  build: 8,
  package: 'com.bookingnetwork.messenger.global_messenger',
  assets: [
    { abi: 'arm64-v8a', label: 'arm64', recommended: true, file: 'luno-messenger-arm64.apk', size_bytes: 29662696, sha256: 'D0388416AB02CBC8E1026778CA5428CAD7B97CA02881245ACB382778A8B4F186', url: 'https://github.com/dnjstjq0824-byte/line/releases/download/v2.0.0-build8/luno-messenger-arm64.apk' },
    { abi: 'armeabi-v7a', label: 'arm32', file: 'luno-messenger-arm32.apk', size_bytes: 25811032, sha256: '968C93A21E83E0F6EF7F2C939A816F03A495BA395A337348976914F094B99781', url: 'https://github.com/dnjstjq0824-byte/line/releases/download/v2.0.0-build8/luno-messenger-arm32.apk' },
    { abi: 'x86_64', label: 'x86_64', file: 'luno-messenger-x86_64.apk', size_bytes: 32234982, sha256: '7B248A637CC0D09B0EA37D0B7C5BC27C23EA5A1CAB7472D9DF9322F416CC1F28', url: 'https://github.com/dnjstjq0824-byte/line/releases/download/v2.0.0-build8/luno-messenger-x86_64.apk' },
  ],
};

const READY_TABLES = ['users', 'wallets', 'luno_sessions', 'luno_messages', 'attachments', 'luno_read_cursors', 'luno_attachments', 'luno_ws_tickets', 'luno_audit'];
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

// Gateway routing shared by the export wrapper (transparent proxy) and
// workerCore (misconfiguration fails closed). Returns the validated origin,
// 'invalid' for a rejected API_BACKEND_ORIGIN, or null when the gateway
// does not apply to this request.
function gatewayOriginFor(request, env) {
  const url = new URL(request.url);
  const backendRoute = url.pathname.startsWith('/api/') || ['/healthz', '/readyz', '/metrics'].includes(url.pathname);
  if (!env.API_BACKEND_ORIGIN || !backendRoute) return null;
  try {
    const origin = new URL(env.API_BACKEND_ORIGIN);
    if (origin.protocol !== 'https:' || origin.username || origin.password ||
        origin.pathname !== '/' || origin.search || origin.hash || origin.origin === url.origin) {
      return 'invalid';
    }
    return origin;
  } catch {
    return 'invalid';
  }
}

const workerCore = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
	if ((url.pathname === '/api/v1/store/orders' || url.pathname === '/api/v1/wallet/charge') && request.method === 'POST') {
	  return json({ error: 'payments unavailable: verified provider integration required' }, 503);
	}
    // Route the complete API to one persistent backend; never mix its identities
    // with the isolate-local demo or fall back to demo data on upstream failure.
    const backendRoute = url.pathname.startsWith('/api/') || ['/healthz', '/readyz', '/metrics'].includes(url.pathname);
    // Valid origins are proxied transparently by the export wrapper (no edge
    // header rewrites); only a misconfigured origin fails closed here.
    if (gatewayOriginFor(request, env) === 'invalid') {
      return json({ error: 'backend configuration invalid' }, 503);
    }
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    // Cloudflare hostnames can serve production traffic. Public standalone hosts
    // require explicit opt-in just like custom domains.
    // Any further standalone host must be named explicitly. There is no blanket
    // allow-every-host switch: unknown hosts get static assets only, never the API.
    const allowedStandaloneHosts = String(env.STANDALONE_HOSTS || '')
      .split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
    const isNamedStandaloneHost = allowedStandaloneHosts.includes(url.hostname.toLowerCase());
    const apiEnabled = isLocal || isNamedStandaloneHost;
    if (!apiEnabled) {
      if (backendRoute) return json({ error: 'persistent backend must be configured' }, 503);
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Assets unavailable', { status: 503 });
    }
    // Liveness does not imply that persistence is ready. These checks must not
    // boot the service or run schema/seed writes just to answer a probe.
    if (url.pathname === '/healthz' || url.pathname === '/api/v1/health' || url.pathname === '/api/health') {
      return json({ status: 'ok', brand: 'LUNO', runtime: 'cloudflare-worker' });
    }
    if (url.pathname === '/readyz') {
      if (!env.DB) return json({ status: 'not_ready', checks: { database: 'not_configured' } }, 503);
      try {
        const result = await env.DB.prepare('SELECT 1 AS ready').first();
        if (!result || result.ready !== 1) throw new Error('Database probe did not return ready');
        // Naming every required table makes a missing one fail to compile, and LIMIT 0
        // reads no rows. Counting names in sqlite_master read the whole schema
        // (46 rows on production) on every probe.
        try {
          await env.DB.prepare(`SELECT 1 FROM ${READY_TABLES.join(', ')} LIMIT 0`).all();
        } catch (error) {
          if (/no such table/i.test(String(error?.message))) return json({ status: 'not_ready', checks: { database: 'healthy', schema: 'missing_required_tables' } }, 503);
          throw error;
        }
        return json({ status: 'ready', brand: 'LUNO', runtime: 'cloudflare-worker', checks: { database: 'healthy', schema: 'ready' } });
      } catch {
        return json({ status: 'not_ready', checks: { database: 'unavailable' } }, 503);
      }
    }
    await boot(env);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      const origin = corsOrigin(request, env);
      return new Response(null, {
        status: 204,
        headers: origin ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Vary': 'Origin',
        } : {},
      });
    }

    // Health / Readyz / Metrics / Version
    if (url.pathname === '/api/v1/version' || url.pathname === '/api/version') {
      return json(BUILD_INFO);
    }
    if (url.pathname === '/api/v1/app/latest' && request.method === 'GET') {
      const b = LATEST_ANDROID_BUILD;
      return json({ platform: b.platform, version: b.version, build: b.build, package: b.package, assets: b.assets });
    }
    if (url.pathname === '/api/v1/channel/slot' && request.method === 'GET') {
      const auth = await getAuthUser(request);
      if (!auth) return json({ error: 'unauthorized' }, 401);
      const now = new Date().toISOString();
      let active = null;
      try {
        await ensureSchema();
        active = await dbOf().prepare(
          'SELECT id, title, body FROM luno_notices WHERE starts_at <= ? AND ? < ends_at ORDER BY starts_at DESC LIMIT 1'
        ).bind(now, now).first();
      } catch { active = null; }
      if (!active) return json({ slot: null });
      return json({ slot: { id: active.id, title: active.title, body: active.body } });
    }
    if (url.pathname === '/api/v1/translate' && request.method === 'POST') {
      const auth = await getAuthUser(request);
      if (!auth) return json({ error: 'unauthorized' }, 401);
      return json({ error: 'Translation engine is not configured', code: 'TRANSLATE_NOT_CONFIGURED' }, 503);
    }
    if (url.pathname === '/metrics') {
      const viewer = await getAuthUser(request);
      if (!viewer) return json({ error: 'unauthorized' }, 401);
      if (viewer.role !== 'admin') return json({ error: 'forbidden' }, 403);
      const mdb = dbOf();
      if (!mdb) return json({ error: 'metrics unavailable: database not configured' }, 503);
      await ensureSchema();
      const count = async (table, where) => {
        try {
          const row = await mdb.prepare(`SELECT COUNT(*) AS c FROM ${table}${where ? ' WHERE ' + where : ''}`).first();
          return Number(row?.c || 0);
        } catch { return 0; }
      };
      const mUsers = await count('users');
      const mSessions = await count('luno_sessions', 'revoked_at IS NULL');
      const mMessages = await count('luno_messages');
      const mAttachments = await count('attachments');
      const mBans = await count('user_bans');
      const mReports = await count('reports', `status = 'open'`);
      const out = [
        '# HELP luno_users_total Registered users (D1)',
        '# TYPE luno_users_total gauge',
        `luno_users_total ${mUsers}`,
        '# HELP luno_sessions_active Non-revoked sessions (D1)',
        '# TYPE luno_sessions_active gauge',
        `luno_sessions_active ${mSessions}`,
        '# HELP luno_messages_total Persisted messages (D1)',
        '# TYPE luno_messages_total gauge',
        `luno_messages_total ${mMessages}`,
        '# HELP luno_attachments_total Stored attachment metadata (D1, bytes in R2)',
        '# TYPE luno_attachments_total gauge',
        `luno_attachments_total ${mAttachments}`,
        '# HELP luno_bans_total Banned users (D1)',
        '# TYPE luno_bans_total gauge',
        `luno_bans_total ${mBans}`,
        '# HELP luno_reports_open Open reports (D1)',
        '# TYPE luno_reports_open gauge',
        `luno_reports_open ${mReports}`,
        '# HELP luno_build_info Worker build (D1)',
        '# TYPE luno_build_info gauge',
        `luno_build_info{commit="${BUILD_INFO.short_commit || 'unknown'}"} 1`,
      ];
      return new Response(out.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; version=0.0.4' } });
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
        if (!await rateLimit('rl:register:' + (request.headers.get('CF-Connecting-IP') || 'unknown'), 120)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
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
          await env.DB.prepare("INSERT OR REPLACE INTO users (id, email, handle, password_hash, display_name, bio, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))")
            .bind(newUser.id, newUser.email, newUser.handle, encodePasswordHash(newUser), newUser.display_name, newUser.bio).run();
          await d1Run(env.DB, "INSERT OR REPLACE INTO wallets (user_id, balance, updated_at) VALUES (?, 0, datetime('now'))", newUser.id);
        }
        return json({ id: newUser.id, email: newUser.email, display_name: newUser.display_name }, 201);
      }

      // 1b. Passkey login (email-first, public)
      if (p === 'passkeys/login/begin' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
        const user = email
          ? (users.get(email) || Array.from(users.values()).find(u => u.email && u.email.toLowerCase() === email))
          : null;
        if (!user || user.state === 'suspended' || user.state === 'deleted') {
          return json({ error: 'invalid credentials' }, 401);
        }
        const creds = await pkListCreds(user.id);
        if (creds.length === 0) {
          return json({ error: 'invalid credentials' }, 401);
        }
        const reqUrl = new URL(request.url);
        const challenge = await pkIssueChallenge(user.id, 'authentication');
        return json({ publicKey: {
          challenge,
          rpId: reqUrl.hostname.toLowerCase(),
          allowCredentials: creds.map(c => ({ type: 'public-key', id: c.credId })),
          timeout: 300000,
          userVerification: 'preferred',
        }});
      }
      if (p === 'passkeys/login/finish' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        let challenge = '';
        try {
          const cdBytes = pkB64Decode((body && body.response && body.response.clientDataJSON) || '');
          challenge = JSON.parse(new TextDecoder().decode(cdBytes)).challenge || '';
        } catch { return bad('invalid request', 400); }
        if (!challenge) return bad('invalid request', 400);
        const userId = await pkChallengeOwner(challenge, 'authentication');
        if (!userId || !(await pkConsumeChallenge(challenge, userId, 'authentication'))) {
          return bad('진행 중인 로그인 절차가 없거나 만료되었습니다', 400);
        }
        const user = usersById.get(userId) || Array.from(users.values()).find(u => u.id === userId);
        if (!user || user.state === 'suspended' || user.state === 'deleted') {
          return json({ error: 'invalid credentials' }, 401);
        }
        const creds = await pkListCreds(userId);
        const cred = creds.find(c => c.credId === body.id);
        if (!cred) return json({ error: 'invalid credentials' }, 401);
        const reqUrl = new URL(request.url);
        try {
          const counter = await pkVerifyAssertion({
            rpId: reqUrl.hostname.toLowerCase(), origin: reqUrl.origin,
            challengeB64: challenge, body, cred,
          });
          await pkUpdateCounter(userId, cred.credId, counter);
          const { token: ptoken, deviceId: pdevice, refreshToken: pre } = await createSession(user, request);
          return json({
            access_token: ptoken,
            ...(pre ? { refresh_token: pre } : {}),
            token_type: 'Bearer',
            expires_in: 900,
            user_id: user.id,
            role: user.role,
            device_id: pdevice,
          });
        } catch (e) {
          return json({ error: 'invalid credentials' }, 401);
        }
      }
      // 2. Auth: Login
      if (p === 'auth/login' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const identifier = (body.email || body.email_or_phone || body.username || '').toLowerCase().trim();
        const loginIp = request.headers.get('CF-Connecting-IP') || '';
        if (!await rateLimit('rl:auth:' + (loginIp || 'unknown'), 120)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
        if (await loginThrottleBlocked(identifier, loginIp)) return json({ error: 'account temporarily locked after repeated failures', code: 'LOGIN_LOCKED' }, 429, { 'Retry-After': '900' });
        let user = users.get(identifier) || Array.from(users.values()).find(u =>
          (u.email && u.email.toLowerCase() === identifier) ||
          (u.handle && u.handle.toLowerCase() === identifier) ||
          (u.phone && u.phone === identifier)
        );
        // A-2: D1 is authoritative when present — a password change, ban or
        // deletion on another isolate is visible to this login. Memory-only
        // bootstrap seeds still authenticate via the lookup above.
        if (dbOf()) {
          await ensureSchema();
          const fresh = await loadUserFromD1ByLogin(identifier);
          if (fresh) user = fresh;
        }
        if (!user || user.state === 'suspended' || user.state === 'deleted') {
          await recordLoginFailure(identifier, loginIp);
          return json({ error: 'invalid credentials' }, 401);
        }
        if (dbOf() && await isBanned(user.id)) {
          await recordLoginFailure(identifier, loginIp);
          return json({ error: 'invalid credentials' }, 401);
        }
        if (REVOKED_LEGACY_PASSWORDS.has(body.password)) {
          await recordLoginFailure(identifier, loginIp);
          return json({ error: 'invalid credentials' }, 401);
        }
        const valid = await checkPassword(user, body.password);
        if (!valid) {
          await recordLoginFailure(identifier, loginIp);
          return json({ error: 'invalid credentials' }, 401);
        }
        await clearLoginFailures(identifier, loginIp);
        const { token, deviceId, refreshToken } = await createSession(user, request);
        return json({
          access_token: token,
          ...(refreshToken ? { refresh_token: refreshToken } : {}),
          token_type: 'Bearer',
          expires_in: 900,
          user_id: user.id,
          role: user.role,
          device_id: deviceId
        }, 200, refreshToken ? { 'Set-Cookie': refreshCookie(refreshToken, request) } : {});
      }
      // 2b. Auth: Refresh rotation (A-15). Single-use refresh tokens: each
      // successful call burns the presented token and mints a fresh pair on
      // the same session. Presenting an already-rotated token signals theft:
      // only the compromised session chain is revoked (rotation reuses the
      // session id, so the thief's rotated tokens die with it).
      if (p === 'auth/refresh' && request.method === 'POST') {
        if (!await rateLimit('rl:refresh:' + (request.headers.get('CF-Connecting-IP') || 'unknown'), 120)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
        const rbody = await request.json().catch(() => ({}));
        const presented = String(rbody.refresh_token || cookieValue(request, 'luno_refresh') || '');
        const rdb = dbOf();
        if (!rdb) return json({ error: 'token refresh requires a configured database' }, 501);
        if (!presented.startsWith('cf-refresh-')) return json({ error: 'invalid credentials' }, 401);
        await ensureSchema();
        const rhash = await sha256Hex(presented);
        const rrow = await rdb.prepare('SELECT token_hash, user_id, device_id, expires_at, revoked FROM refresh_tokens WHERE token_hash = ?').bind(rhash).first();
        if (!rrow) return json({ error: 'invalid credentials' }, 401);
        if (rrow.revoked) {
          // Scope the kill to this session chain. A whole-grant kill
          // self-sustains across multi-device clients: every live client
          // holds a pre-kill token and re-kills on its next refresh,
          // permanently DoSing fresh logins (prod login-kick loop).
          await revokeSessionById(rrow.device_id, rrow.user_id);
          await persistAudit(rrow.user_id, 'refresh.reuse_detected', rrow.device_id || '', {});
          return json({ error: 'invalid credentials' }, 401);
        }
        if (Number(rrow.expires_at) <= Date.now()) {
          await rdb.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?').bind(rhash).run();
          return json({ error: 'invalid credentials' }, 401);
        }
        const srow = rrow.device_id ? await rdb.prepare('SELECT session_id, revoked_at FROM luno_sessions WHERE session_id = ?').bind(rrow.device_id).first() : null;
        if (!srow || srow.revoked_at) {
          await rdb.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?').bind(rhash).run();
          return json({ error: 'invalid credentials' }, 401);
        }
        const ruser = usersById.get(rrow.user_id) || await loadUserFromD1(rrow.user_id);
        if (!ruser || ruser.state === 'suspended' || ruser.state === 'deleted') return json({ error: 'invalid credentials' }, 401);
        const rcreated = now();
        const newAccess = `cf-token-${ruser.id}.${crypto.randomUUID()}`;
        await rdb.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?').bind(rhash).run();
        const newRefresh = await issueRefreshToken(ruser.id, rrow.device_id);
        await rdb.prepare('UPDATE luno_sessions SET token_hash = ?, created_at = ?, last_seen_at = ? WHERE session_id = ? AND revoked_at IS NULL')
          .bind(await sha256Hex(newAccess), rcreated, rcreated, rrow.device_id).run();
        for (const [tok, sess] of Array.from(sessions)) {
          if (sess.device_id === rrow.device_id) { sessions.delete(tok); revokedTokens.add(tok); }
        }
        sessions.set(newAccess, { user_id: ruser.id, role: ruser.role, device_id: rrow.device_id, created_at: rcreated });
        return json({
          access_token: newAccess,
          refresh_token: newRefresh,
          token_type: 'Bearer',
          expires_in: 900,
          user_id: ruser.id,
          role: ruser.role,
          device_id: rrow.device_id
        }, 200, { 'Set-Cookie': refreshCookie(newRefresh, request) });
      }


      // 2c. Auth: password recovery (Go parity). No email sender is
      // configured, so the single-use code is returned inline like Go's
      // dev-mode response; challenges live in D1 when bound, memory otherwise.
      if (p === 'auth/recover' && request.method === 'POST') {
        if (!await rateLimit('rl:recover:' + (request.headers.get('CF-Connecting-IP') || 'unknown'), 60)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
        const body = await request.json().catch(() => ({}));
        const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
        if (!email.includes('@')) return json({ error: 'invalid email' }, 400);
        const quiet = () => json({ status: 'recovery_token_sent_if_account_exists' });
        let user = users.get(email) || Array.from(users.values()).find(u => u.email && u.email.toLowerCase() === email);
        if (dbOf()) {
          await ensureSchema();
          const fresh = await loadUserFromD1ByLogin(email);
          if (fresh) user = fresh;
        }
        if (!user || user.state === 'suspended' || user.state === 'deleted') return quiet();
        const challengeId = crypto.randomUUID();
        const code = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().slice(0, 8);
        const codeHash = await sha256Hex(code);
        const expiresAt = Date.now() + 15 * 60 * 1000;
        if (dbOf()) {
          await dbOf().prepare('INSERT INTO luno_recovery_challenges (id, user_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').bind(challengeId, user.id, codeHash, expiresAt, now()).run();
        } else {
          recoveryChallenges.set(challengeId, { userId: user.id, codeHash, expiresAt, consumedAt: 0 });
        }
        return json({ status: 'recovery_token_sent_if_account_exists', challenge_id: challengeId, recovery_code: code });
      }
      if (p === 'auth/recover/verify' && request.method === 'POST') {
        if (!await rateLimit('rl:recoverv:' + (request.headers.get('CF-Connecting-IP') || 'unknown'), 60)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
        const body = await request.json().catch(() => ({}));
        const challengeId = typeof body.challenge_id === 'string' ? body.challenge_id : '';
        const code = typeof body.recovery_code === 'string' ? body.recovery_code : '';
        const next = typeof body.new_password === 'string' ? body.new_password : '';
        if (!challengeId || code.length < 16 || next.length < 10) return json({ error: 'invalid recovery request' }, 400);
        const hash = await sha256Hex(code);
        let userId = '';
        if (dbOf()) {
          await ensureSchema();
          const row = await dbOf().prepare('SELECT user_id, code_hash, expires_at, consumed_at FROM luno_recovery_challenges WHERE id = ?').bind(challengeId).first();
          if (!row || row.code_hash !== hash || Number(row.expires_at) <= Date.now()) return json({ error: 'invalid or expired recovery challenge' }, 401);
          if (row.consumed_at) return json({ error: 'recovery challenge already consumed' }, 409);
          userId = row.user_id;
        } else {
          const entry = recoveryChallenges.get(challengeId);
          if (!entry || entry.codeHash !== hash || entry.expiresAt <= Date.now()) return json({ error: 'invalid or expired recovery challenge' }, 401);
          if (entry.consumedAt) return json({ error: 'recovery challenge already consumed' }, 409);
          userId = entry.userId;
        }
        const user = usersById.get(userId) || await loadUserFromD1(userId);
        if (!user || user.state === 'suspended' || user.state === 'deleted') return json({ error: 'invalid or expired recovery challenge' }, 401);
        await setPassword(user, next);
        await persistPassword(user);
        if (dbOf()) {
          const done = await dbOf().prepare('UPDATE luno_recovery_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL').bind(Date.now(), challengeId).run();
          if (!done.meta.changes) return json({ error: 'recovery challenge already consumed' }, 409);
        } else {
          recoveryChallenges.get(challengeId).consumedAt = Date.now();
        }
        await revokeOtherSessions(userId, '', userId);
        await revokeAllRefresh(userId, null);
        await persistAudit(userId, 'password.recover', userId, {});
        return json({ status: 'password_reset' });
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

      // Management APIs must not inherit the permissions of a customer who
      // can merely open an official-account conversation.
      const partnerAccountRoute = p.match(/^partner\/accounts\/([\w-]+)(?:\/|$)/);
      if (partnerAccountRoute && authUser.role !== 'admin') {
        const account = partnerAccounts.get(partnerAccountRoute[1]);
        const organization = account && partnerOrgs.get(account.org_id);
        if (!organization || organization.owner_id !== authUser.id) return json({ error: 'account forbidden' }, 403);
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
        const valid = await checkPassword(authUser, currentPass);
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
        await hydrateDurableConversation(resolvedCid);
        const conversation = conversations.get(resolvedCid);
        if (!conversation || !conversation.members.includes(authUser.id)) {
          return json({ error: 'conversation not found' }, 404);
        }
      }
      const callPath = p.match(/^calls\/([^/]+)(?:\/|$)/);
      if (callPath && !['ice-servers', 'group'].includes(callPath[1])) {
        const call = callSessions.get(callPath[1]);
        // A-12: member check falls back to D1 so a durable room hydrated on
        // another isolate still authorizes signaling, state and quality posts.
        let callConv = call ? conversations.get(call.conversation_id) : null;
        if (call && (!callConv || !callConv.members.includes(authUser.id))) {
          callConv = await hydrateDurableConversation(call.conversation_id).catch(() => null);
        }
        if (!call || !callConv || !callConv.members.includes(authUser.id)) {
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
        let callConv = conversations.get(body.conversation_id);
        if (!callConv || !callConv.members.includes(authUser.id)) {
          callConv = await hydrateDurableConversation(body.conversation_id).catch(() => null);
        }
        if (!callConv || !callConv.members.includes(authUser.id)) {
          return json({ error: 'conversation not found' }, 404);
        }
        if (callConv.kind === 'direct') {
          const other = callConv.members.find(x => x !== authUser.id);
          if (other) {
            const blk = await blockState(authUser.id, other);
            if (blk.byMe || blk.byThem) return json({ error: 'blocked' }, 403);
          }
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
            { id: 'pack-1', title: 'Luno Friends Special Edition', price_minor: 2500, currency: 'KRW' },
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
          const org = { id: orgId, name: body.name || 'Partner Org', country: body.country || 'KR', owner_id: authUser.id, my_role: 'owner' };
          partnerOrgs.set(orgId, org);
          const accId = crypto.randomUUID();
          partnerAccounts.set(accId, { id: accId, org_id: orgId, name: `${org.name} Official`, status: 'active' });
          return json(org, 201);
        }
        return json({ organizations: Array.from(partnerOrgs.values()).filter(org => authUser.role === 'admin' || org.owner_id === authUser.id) });
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
        return json({ organizations: [{ id: 'dev-org-1', name: 'LUNO Dev Team' }] });
      }
      if (p === 'developer/apps') {
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const secret = crypto.randomUUID();
          const app = { id: crypto.randomUUID(), owner_id: authUser.id, name: body.name || 'Bot App', client_id: `cli_${crypto.randomUUID().slice(0, 8)}`, client_secret_hash: await sha256Hex(secret) };
          devApps.set(app.id, app);
          const { client_secret_hash, ...visible } = app;
          return json({ ...visible, client_secret: secret }, 201);
        }
        return json({ apps: Array.from(devApps.values()).filter(app => authUser.role === 'admin' || app.owner_id === authUser.id).map(({ client_secret, client_secret_hash, ...visible }) => visible) });
      }
      const devWebMatch = p.match(/^developer\/apps\/([a-zA-Z0-9_-]+)\/webhooks$/);
      if (devWebMatch && request.method === 'POST') {
        const app = devApps.get(devWebMatch[1]);
        if (!app) return json({ error: 'app not found' }, 404);
        if (app.owner_id !== authUser.id) return json({ error: 'app forbidden' }, 403);
        return json({ error: 'Durable webhook configuration storage is not implemented', code: 'WEBHOOK_STORAGE_NOT_CONFIGURED' }, 503);
      }

      // 13. Creator Console
      if (p === 'creator/profile') {
        return json({ id: 'creator-1', display_name: authUser.display_name, verified: true });
      }
      if (p === 'creator/packs') {
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const pack = { id: crypto.randomUUID(), owner_id: authUser.id, title: clip(body.title || 'Stickers', 100), price_minor: Number.isSafeInteger(body.price_minor) && body.price_minor >= 0 ? body.price_minor : 0, status: 'draft' };
          await ownedSave('creator_pack', pack, true);
          return json(pack, 201);
        }
        return json({ packs: await ownedList('creator_pack', authUser) });
      }
      if (p === 'creator/settlements') {
        return json({ settlements: [{ id: 'stl-1', total_sales: 125000, revenue_share: 87500, currency: 'KRW', status: 'settled' }] });
      }

      // 14. Ads Console
      if (p === 'ads/advertisers') {
        return json({ advertisers: [{ id: 'adv-1', company_name: 'LUNO Global Ads', status: 'verified' }] });
      }
      if (p === 'ads/campaigns') {
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const camp = { id: crypto.randomUUID(), owner_id: authUser.id, name: clip(body.name || 'Ad Campaign', 100), daily_budget_minor: Number.isSafeInteger(body.daily_budget_minor) && body.daily_budget_minor >= 0 ? body.daily_budget_minor : 0, status: 'draft' };
          await ownedSave('ad_campaign', camp, true);
          return json(camp, 201);
        }
        return json({ campaigns: await ownedList('ad_campaign', authUser) });
      }
      const ownedPath = p.match(/^(creator\/packs|ads\/campaigns)\/([\w-]+)$/);
      if (ownedPath) {
        const kind = ownedPath[1] === 'creator/packs' ? 'creator_pack' : 'ad_campaign';
        const value = await ownedRead(kind, ownedPath[2]);
        if (!value) return json({ error: 'resource not found' }, 404);
        if (value.owner_id !== authUser.id && !(authUser.role === 'admin' && request.method === 'GET')) return json({ error: 'resource forbidden' }, 403);
        if (request.method === 'GET') return json(value);
        if (request.method === 'PATCH') {
          const body = await readJson(request);
          const field = kind === 'creator_pack' ? 'title' : 'name';
          const name = clip(body[field], 100);
          if (!name) return json({ error: `${field} required` }, 400);
          return json(await ownedSave(kind, { ...value, [field]: name }));
        }
        return json({ error: 'method not implemented' }, 405);
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
          if (body.action === 'suspend') {
            target.state = 'suspended';
            if (dbOf()) {
              await ensureSchema();
              await dbOf().prepare("UPDATE users SET state = 'suspended' WHERE id = ?").bind(target.id).run();
              await dbOf().prepare('INSERT OR REPLACE INTO user_bans (user_id, reason, banned_by, expires_at, created_at) VALUES (?, ?, ?, 0, ?)').bind(target.id, clip(body.reason, 300), authUser.id, now()).run();
            }
          } else if (body.action === 'activate') {
            target.state = 'active';
            if (dbOf()) {
              await ensureSchema();
              await dbOf().prepare("UPDATE users SET state = 'active' WHERE id = ?").bind(target.id).run();
              await dbOf().prepare('DELETE FROM user_bans WHERE user_id = ?').bind(target.id).run();
            }
          }
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
      const gwOrigin = gatewayOriginFor(request, env);
      if (gwOrigin && gwOrigin !== 'invalid') {
        // Transparent reverse proxy: the upstream response passes through
        // byte-identical (cf_gateway contract) — no edge header rewrites.
        const url = new URL(request.url);
        url.protocol = gwOrigin.protocol;
        url.host = gwOrigin.host;
        const upstream = new Request(url, request);
        upstream.headers.delete('Host');
        try {
          return await fetch(new Request(upstream, { redirect: 'manual' }));
        } catch {
          return withSecurityHeaders(request, await withCors(request, env, json({ error: 'backend unavailable' }, 502)));
        }
      }
      return withSecurityHeaders(request, await withCors(request, env, await workerCore.fetch(request, env, ctx)));
    } catch (err) {
      if (err?.code === 'CONVERSATION_CONFLICT') return json({ error: err.message, code: err.code }, 409);
      console.error('[LUNO internal error]', err && err.stack ? err.stack : err);
      return withCors(request, env, json({ error: 'internal_error' }, 500));
    }
  }
};
