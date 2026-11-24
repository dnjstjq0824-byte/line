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
// F22: request id for structured logs + per-isolate request/error counters.
// Counters reset on isolate eviction; /metrics labels them honestly.
let CURRENT_RID = '';
const f22Requests = new Map();
const f22Errors = new Map();
function f22RouteOf(pathname) {
  return String(pathname || '/').replace(/[0-9a-fA-F]{8}-[0-9a-fA-F-]{4,}/g, '{id}').replace(/\/\d+(?=\/|$)/g, '/{id}');
}
function f22Bump(map, key) { map.set(key, (map.get(key) || 0) + 1); }
const AUTH_CTX = new WeakMap();
const qrChallenges = new Map();
const phoneVerificationCodes = new Map();
const friendships = new Map();
const passkeyChallenges = new Map(); // challenge -> { userId, purpose, expiresAt }
const recoveryChallenges = new Map(); // id -> { userId, codeHash, expiresAt, consumedAt } (no-DB fallback; D1 otherwise)
const recoveryMailOutbox = []; // S1 test seam: mock/log driver deliveries { email, code, created_at }
const verificationMailOutbox = []; // F1 test seam: verification codes { email, code, created_at }
const smsOutbox = []; // F2 test seam: sms deliveries { phone, code, created_at }
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
const partnerOrgs = new Map();
const partnerAccounts = new Map();
const partnerTickets = new Map();
const partnerCampaigns = new Map();
const partnerCoupons = new Map();
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
const wallets = new Map();
const ownedPacks = new Map();
const ownedThemes = new Map();
const officialAccounts = new Map();
const followedOfficial = new Map();
const adminReports = [];
// F24: legal consent. Versions are the single source of truth for what the
// signup/login gates demand; userConsents is a D1 write-through cache of who
// agreed to what, when (luno_consents). The verification birthdate is NEVER
// stored — only the age14 confirmation bit and timestamp survive.
const LEGAL_VERSIONS = { terms: '2026-11-24.1', privacy: '2026-11-21.1' };
const userConsents = new Map();
// A-20/B-3: attachment bytes live in R2 (MEDIA_BUCKET); D1 keeps metadata
// only. Base64 intake is kept so existing clients keep working.
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
// S7: bot screenshot uploads cap lower than user uploads.
const BOT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENT_B64 = 14_000_000;
const ATTACHMENT_MIME_ALLOW = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/pdf', 'text/plain',
]);
const MAX_BODY = 20000;
// H2: daily per-user quotas. All three defaults live here and nowhere else.
const QUOTA_UPLOADS_PER_DAY = 200;
const QUOTA_UPLOAD_BYTES_PER_DAY = 1024 * 1024 * 1024; // 1GB
const QUOTA_ROOMS_PER_DAY = 50;
// T1: translation guards. Defaults live here and nowhere else.
const TRANSLATE_MAX_CHARS = 5000;
const TRANSLATE_PER_MINUTE = 60;
const STT_MAX_B64 = 14_000_000;
const STT_PER_MINUTE = 30;
const TTS_MAX_CHARS = 2000;
const TTS_PER_MINUTE = 30;
const TRANSLATE_CHARS_PER_DAY = 50000;
// F23: every money-adjacent cap (H2 quotas above, T1 guards above, L-09 bot
// budgets below) lives in this one block. Product limits (group sizes,
// preview bytes) stay with the features they shape.
// L-09: daily cost caps per bot. Requests count completions (+explicit
// extras), tokens count runner-reported LLM usage.
const BOT_DAILY_REQUESTS = 1000;
const BOT_DAILY_TOKENS = 1000000;

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
// Free built-in "Orbit Crew" chips of the Android app (lunoOrbitCrewStickers in
// mobile/flutter_app/lib/legacy_tokens.dart). Shipped APKs (build <= 13) send
// them as kind=sticker with body "<emoji> [<Character>]" and no metadata, so
// the worker must accept exactly these bodies or every tap fails with 400.
const ORBIT_CREW_STICKERS = new Map([
  ['\u{1f6f8}\u{1f44b} [Lumi]', 'lumi_hi'],
  ['\u{1fa90}\u{2764}\u{fe0f} [Nori]', 'nori_warm'],
  ['\u{1f4ab}\u{2728} [Poko]', 'poko_love'],
  ['\u{1f680}\u{1f525} [Luno]', 'luno_cheer'],
  ['\u{2604}\u{fe0f}\u{1f602} [Comet]', 'comet_laugh'],
  ['\u{1f468}\u{200d}\u{1f680}\u{1f647} [Astro]', 'astro_bow']
]);
const THEME_CATALOG = [
  { id: 'mint', title: '민트 브리즈', price_minor: 0 },
  { id: 'ocean', title: '오션 블루', price_minor: 0 },
  { id: 'sunset', title: '선셋 글로우', price_minor: 1500 },
  { id: 'sakura', title: '사쿠라 핑크', price_minor: 1500 },
  { id: 'midnight', title: '미드나잇', price_minor: 0 }
];
const DEFAULT_PREFS = {
  theme: 'mint', dark_mode: false, language: 'ko', font_size: 'medium',
  show_read_receipts: true, searchable_by_id: true, searchable_by_email: false, discoverable_by_phone: true,
  allow_friend_requests: true, notifications: true, notification_preview: true,
  letter_sealing: false, wallpaper: 'default', link_previews: true
};
// F13: plan vocabulary for future tiers (no billing code lives here).
const ACCOUNT_PLANS = ['personal', 'developer', 'business'];
const PLAN_GRANTS = { personal: [], developer: [], business: [] };

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
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_luno_messages_client ON luno_messages(conversation_id, sender_id, client_id)`,
  `CREATE TABLE IF NOT EXISTS luno_read_cursors (
    conversation_id TEXT NOT NULL, user_id TEXT NOT NULL, sequence INTEGER NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY (conversation_id, user_id))`,
  // hydrateCursors filters by user_id alone, which the composite primary key cannot serve.
  `CREATE INDEX IF NOT EXISTS idx_luno_read_cursors_user ON luno_read_cursors(user_id)`,
  `CREATE TABLE IF NOT EXISTS luno_chat_meta (
    conversation_id TEXT NOT NULL, user_id TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, muted INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
    PRIMARY KEY (conversation_id, user_id))`,
  `CREATE INDEX IF NOT EXISTS idx_luno_chat_meta_user ON luno_chat_meta(user_id)`,
  // E6: sender-key parcels. Opaque to the server (1:1-sealed per device);
  // recipients fetch on room open and on unknown generations.
  `CREATE TABLE IF NOT EXISTS luno_sk_parcels (
    id TEXT PRIMARY KEY, to_user_id TEXT NOT NULL, from_user_id TEXT NOT NULL, room_id TEXT NOT NULL, gen INTEGER NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_sk_parcels_to ON luno_sk_parcels(to_user_id, room_id)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_sessions_user_active ON luno_sessions(user_id, created_at) WHERE revoked_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS luno_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, action TEXT NOT NULL, target TEXT, detail TEXT, created_at TEXT NOT NULL)`,
  // F16: feature flags ride D1 (no-DB isolates keep the memory seeds).
  `CREATE TABLE IF NOT EXISTS luno_feature_flags (
    key TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, description TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)`,
  // F17: business consoles ride D1 behind DURABLE_BUSINESS; the Maps
  // stay the no-DB cache (webhooks stay 503 without durable storage).
  `CREATE TABLE IF NOT EXISTS luno_partner_orgs (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL DEFAULT 'KR', owner_id TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_partner_accounts (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_partner_tickets (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, contact_id TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL DEFAULT 'normal', note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_partner_campaigns (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, template_json TEXT NOT NULL DEFAULT 'null', status TEXT NOT NULL DEFAULT 'scheduled', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_partner_coupons (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, code TEXT NOT NULL, max_redemptions INTEGER NOT NULL DEFAULT 50, redeemed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_rich_menus (
    account_id TEXT PRIMARY KEY, menu_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_oa_bot_rules (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, keywords_json TEXT NOT NULL, reply TEXT NOT NULL, match_type TEXT NOT NULL DEFAULT 'contains', updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_dev_orgs (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_dev_apps (
    id TEXT PRIMARY KEY, org_id TEXT, owner_id TEXT NOT NULL, name TEXT NOT NULL, client_id TEXT NOT NULL, client_secret_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_dev_webhooks (
    id TEXT PRIMARY KEY, app_id TEXT NOT NULL, endpoint_url TEXT NOT NULL, secret_hash TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_dev_miniapps (
    id TEXT PRIMARY KEY, app_id TEXT NOT NULL, origin TEXT NOT NULL, manifest_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_creator_profiles (
    user_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_creator_items (
    id TEXT PRIMARY KEY, pack_id TEXT NOT NULL, object_key TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'static', ordinal INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_ads_advertisers (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_ads_groups (
    id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, name TEXT NOT NULL, targeting_json TEXT NOT NULL DEFAULT '{}', bid_minor INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  // F17: owned resources were migration-only; fresh databases 500ed on
  // packs/campaigns under DURABLE_BUSINESS. Same shape as the migration.
  `CREATE TABLE IF NOT EXISTS luno_owned_resources (
    kind TEXT NOT NULL CHECK (kind IN ('creator_pack','ad_campaign')), id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), payload TEXT NOT NULL CHECK (json_valid(payload)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(kind,id))`,
  `CREATE INDEX IF NOT EXISTS idx_luno_owned_owner ON luno_owned_resources(kind,owner_id,id)`,
  // F22: client telemetry (errors + perf), masked at ingest. user_id is the
  // only identity column; payloads never carry secrets or message bodies.
  `CREATE TABLE IF NOT EXISTS luno_telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT, received_at TEXT NOT NULL, reporter TEXT NOT NULL DEFAULT '', user_id TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', stack TEXT NOT NULL DEFAULT '', context_json TEXT NOT NULL DEFAULT '{}', ms INTEGER)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_telemetry_kind ON luno_telemetry(kind,received_at)`,
  // F24: legal consent records. One row per user; age14_confirmed NULL means
  // grandfathered (consented to versions, age never verified at signup).
  `CREATE TABLE IF NOT EXISTS luno_consents (
    user_id TEXT PRIMARY KEY, terms_version TEXT NOT NULL, privacy_version TEXT NOT NULL, age14_confirmed INTEGER, consented_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
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
  // D4: feed, stories, VOOM and openchat live in D1 (no memory authority).
  `CREATE TABLE IF NOT EXISTS luno_timeline_posts (
    id TEXT PRIMARY KEY, author_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
    bg TEXT NOT NULL DEFAULT '', visibility TEXT NOT NULL DEFAULT 'friends',
    created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_timeline_author ON luno_timeline_posts(author_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS luno_timeline_comments (
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL, author_id TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_timeline_comments_post ON luno_timeline_comments(post_id)`,
  `CREATE TABLE IF NOT EXISTS luno_timeline_likes (
    post_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (post_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS luno_stories (
    id TEXT PRIMARY KEY, author_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
    bg TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_stories_author ON luno_stories(author_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS luno_story_views (
    story_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (story_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS luno_voom_posts (
    id TEXT PRIMARY KEY, author_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
    emoji TEXT NOT NULL DEFAULT '', bg TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_voom_author ON luno_voom_posts(author_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS luno_voom_likes (
    post_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (post_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS luno_voom_comments (
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL, author_id TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_voom_comments_post ON luno_voom_comments(post_id)`,
  `CREATE TABLE IF NOT EXISTS luno_community_rooms (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL DEFAULT 'public', owner_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_community_members (
    room_id TEXT NOT NULL, user_id TEXT NOT NULL, nickname TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (room_id, user_id))`,
  `CREATE INDEX IF NOT EXISTS idx_luno_community_members_room ON luno_community_members(room_id, user_id)`,
  `CREATE TABLE IF NOT EXISTS luno_community_posts (
    id TEXT PRIMARY KEY, room_id TEXT NOT NULL, author_id TEXT NOT NULL,
    author_name TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_community_posts_room ON luno_community_posts(room_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS luno_community_post_likes (
    post_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (post_id, user_id))`,
  // D2: conversation extras without a legacy table get luno_ tables.
  `CREATE TABLE IF NOT EXISTS luno_pins (
    conversation_id TEXT NOT NULL, message_id TEXT NOT NULL,
    pinned_by TEXT NOT NULL, pinned_at TEXT NOT NULL,
    PRIMARY KEY (conversation_id, message_id))`,
  `CREATE TABLE IF NOT EXISTS luno_hidden_messages (
    user_id TEXT NOT NULL, message_id TEXT NOT NULL,
    PRIMARY KEY (user_id, message_id))`,
  `CREATE INDEX IF NOT EXISTS idx_luno_hidden_user ON luno_hidden_messages(user_id)`,
  // D3: owned shop items (packs + themes).
  `CREATE TABLE IF NOT EXISTS luno_owned_items (
    user_id TEXT NOT NULL, item_type TEXT NOT NULL, item_id TEXT NOT NULL,
    PRIMARY KEY (user_id, item_type, item_id))`,
  // F30: customer support tickets. Answers ride the ticket row plus an
  // official-room message (luno_messages). No memory mirror: D1 required.
  `CREATE TABLE IF NOT EXISTS luno_support_tickets (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category TEXT NOT NULL,
    body TEXT NOT NULL, app_version TEXT NOT NULL DEFAULT '', device_info TEXT NOT NULL DEFAULT '',
    attachment_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open',
    answer TEXT NOT NULL DEFAULT '', answered_by TEXT NOT NULL DEFAULT '', answered_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_support_user ON luno_support_tickets(user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_support_status ON luno_support_tickets(status, created_at)`,
  // F29: moderation hide list (temporary blind) + blocked attachment hashes.
  `CREATE TABLE IF NOT EXISTS luno_hidden_targets (
    target_type TEXT NOT NULL, target_id TEXT NOT NULL,
    hidden_by TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    PRIMARY KEY (target_type, target_id))`,
  `CREATE TABLE IF NOT EXISTS luno_blocked_hashes (
    sha256 TEXT PRIMARY KEY, reason TEXT NOT NULL DEFAULT '',
    blocked_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`,
  // P0-5: group-call seat directory (user -> live rooms). The seat set
  // itself lives in the per-room Durable Object; this table only tells
  // the socket-close sweep which rooms to vacate on every isolate.
  `CREATE TABLE IF NOT EXISTS luno_group_call_seats (
    user_id TEXT NOT NULL, room_id TEXT NOT NULL, joined_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, room_id))`,
];
const LUNO_SCHEMA_BASE = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, handle TEXT UNIQUE,
    password_hash TEXT NOT NULL, display_name TEXT NOT NULL, avatar_url TEXT DEFAULT '',
    cover_url TEXT DEFAULT '', avatar_color TEXT DEFAULT '#4F7CFF', plan TEXT DEFAULT 'personal', prefs_json TEXT DEFAULT '',
    status_message TEXT DEFAULT '', bio TEXT DEFAULT '', phone_number TEXT DEFAULT '',
    birthday TEXT DEFAULT '', state TEXT DEFAULT 'active', kind TEXT DEFAULT 'user',
    email_verified INTEGER DEFAULT 0, deleted_at TEXT DEFAULT '', deletion_reason TEXT DEFAULT '',
    phone_verified INTEGER DEFAULT 0, phone_hmac TEXT DEFAULT '', contact_consent_at TEXT DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  // F1: email verification codes (hash only, 15-minute life, 5 attempts).
  `CREATE TABLE IF NOT EXISTS luno_email_codes (
    email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  // F6: group invite links (unguessable token, expiry, revoke flag).
  `CREATE TABLE IF NOT EXISTS luno_invites (
    token TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, created_by TEXT NOT NULL,
    expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  // F8: link preview cache (OG title/description/image per URL).
  `CREATE TABLE IF NOT EXISTS luno_link_previews (
    url TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '', ok INTEGER NOT NULL DEFAULT 0, fetched_at INTEGER NOT NULL DEFAULT 0)`,
  // F12: admin-managed official accounts, follows and news (no seeds).
  `CREATE TABLE IF NOT EXISTS luno_official_accounts (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, handle TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#4F7CFF',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_official_follows (
    user_id TEXT NOT NULL, account_id TEXT NOT NULL, conversation_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, PRIMARY KEY (user_id, account_id))`,
  `CREATE TABLE IF NOT EXISTS luno_news (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, press TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '', published_at TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`,
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
    is_favorite INTEGER DEFAULT 0, is_hidden INTEGER DEFAULT 0, nickname TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, friend_id))`,
  `CREATE TABLE IF NOT EXISTS wallets (
    user_id TEXT PRIMARY KEY, balance INTEGER DEFAULT 0, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS wallet_transactions (
    id TEXT PRIMARY KEY, from_user_id TEXT NOT NULL, to_user_id TEXT NOT NULL,
    amount INTEGER NOT NULL, note TEXT DEFAULT '', kind TEXT DEFAULT '', created_at TEXT NOT NULL)`,
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
    image_urls TEXT NOT NULL, created_by TEXT DEFAULT '', created_at TEXT NOT NULL)`,
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
  `CREATE TABLE IF NOT EXISTS luno_daily_quotas (
    user_id TEXT NOT NULL, day TEXT NOT NULL,
    uploads INTEGER NOT NULL DEFAULT 0, upload_bytes INTEGER NOT NULL DEFAULT 0,
    rooms INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day))`,
  `CREATE TABLE IF NOT EXISTS luno_qr_challenges (
    challenge_id TEXT PRIMARY KEY, qr_token TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', user_id TEXT,
    expires_at INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_translation_cache (
    text_hash TEXT NOT NULL, target_lang TEXT NOT NULL,
    translated TEXT NOT NULL, source_lang TEXT NOT NULL DEFAULT '',
    engine TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
    PRIMARY KEY (text_hash, target_lang))`,
  `CREATE TABLE IF NOT EXISTS luno_translate_usage (
    user_id TEXT NOT NULL, day TEXT NOT NULL,
    chars INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day))`,
  `CREATE TABLE IF NOT EXISTS luno_push_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
    kind TEXT NOT NULL, conversation_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_push_outbox_user ON luno_push_outbox(user_id)`,
  `CREATE TABLE IF NOT EXISTS blocks (
    blocker_id TEXT NOT NULL, blocked_id TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id))`,
  `CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id)`,
  `CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL, target_type TEXT NOT NULL,
    target_id TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
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
  `CREATE TABLE IF NOT EXISTS e2ee_backups (
    user_id TEXT PRIMARY KEY, blob_json TEXT NOT NULL DEFAULT '',
    byte_len INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS push_tokens (
    user_id TEXT NOT NULL, device_id TEXT NOT NULL, platform TEXT NOT NULL DEFAULT '',
    token TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, device_id))`,
  // P1-4: Web Push subscriptions (browser endpoints). D1-required, no
  // memory mirror (support-tickets precedent). Endpoints the push
  // service reports 404/410 are deleted on send.
  `CREATE TABLE IF NOT EXISTS luno_webpush_subs (
    endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL,
    p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_luno_webpush_user ON luno_webpush_subs(user_id, created_at)`,
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
  `CREATE TABLE IF NOT EXISTS luno_call_sessions (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'voice',
    state TEXT NOT NULL DEFAULT 'ringing', initiated_by TEXT, started_at TEXT NOT NULL,
    connected_at TEXT, ended_at TEXT, result TEXT)`,
  // Build 18: signals kept until the call ends, so a callee woken by a push
  // (socket closed while the offer went out) can replay them.
  `CREATE TABLE IF NOT EXISTS luno_call_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT, call_id TEXT NOT NULL, from_user_id TEXT NOT NULL,
    signal_type TEXT NOT NULL, sdp TEXT, candidate TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_call_signals_call ON luno_call_signals(call_id, id)`,
  // Build 18: lets the lock-screen "decline" button end a ringing call
  // without a session (the notification's background isolate has none).
  `CREATE TABLE IF NOT EXISTS luno_call_ring_tokens (
    call_id TEXT PRIMARY KEY, token TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, object_key TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL DEFAULT 0,
    sha256 TEXT NOT NULL DEFAULT '', uploader_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_conv ON attachments(conversation_id)`,
  // L-17: rooms and users where LLM bots may act. Empty by default.
  `CREATE TABLE IF NOT EXISTS luno_bot_allowlist (
    kind TEXT NOT NULL, ref_id TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (kind, ref_id))`,
  // L-06: scoped bot tokens. Only the hash is stored; the secret itself is
  // shown once at mint time. Rooms/ops are JSON arrays.
  `CREATE TABLE IF NOT EXISTS luno_bot_tokens (
    id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, bot_id TEXT NOT NULL,
    rooms_json TEXT NOT NULL, ops_json TEXT NOT NULL, expires_at INTEGER NOT NULL,
    revoked INTEGER DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_bot_tokens_hash ON luno_bot_tokens(token_hash)`,
  // L-07: bot work queue. Claim/complete below; routing (L-02) enqueues.
  `CREATE TABLE IF NOT EXISTS luno_bot_jobs (
    id TEXT PRIMARY KEY, bot_id TEXT NOT NULL, room_id TEXT NOT NULL,
    kind TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 5,
    locked_by TEXT, lock_expires_at INTEGER NOT NULL DEFAULT 0,
    result_json TEXT DEFAULT '', error TEXT DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_bot_jobs_claim ON luno_bot_jobs(bot_id, status, created_at)`,
  // L-04: append-only decision record. One decision per proposal (unique);
  // no UPDATE/DELETE path may ever touch this table (pinned by test).
  `CREATE TABLE IF NOT EXISTS luno_decisions (
    id TEXT PRIMARY KEY, room_id TEXT NOT NULL, proposal_message_id TEXT NOT NULL UNIQUE,
    decided_by TEXT NOT NULL, decision TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_decisions_room ON luno_decisions(room_id, created_at)`,
  // L-09: per-bot per-day usage counters and the kill switch flag.
  `CREATE TABLE IF NOT EXISTS luno_bot_usage (
    bot_id TEXT NOT NULL, day TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0,
    tokens INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (bot_id, day))`,
  `CREATE TABLE IF NOT EXISTS luno_bot_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  // PC agent: durable rooms ship with the runtime schema, so a fresh D1 no
  // longer depends on a hand-applied migration. Same shapes as
  // migrations/20261105_durable_conversations.sql + 20261114_group_roles.sql;
  // IF NOT EXISTS keeps databases that already ran them untouched.
  `CREATE TABLE IF NOT EXISTS luno_conversations (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('direct','group')), title TEXT NOT NULL,
    notice TEXT NOT NULL DEFAULT '', avatar_url TEXT NOT NULL DEFAULT '',
    owner_id TEXT NOT NULL REFERENCES users(id), direct_key TEXT UNIQUE,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0), mutation_token TEXT, deleted_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS luno_conversation_members (
    conversation_id TEXT NOT NULL REFERENCES luno_conversations(id), user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK (role IN ('owner','member','admin')), joined_at TEXT NOT NULL,
    PRIMARY KEY (conversation_id,user_id))`,
  `CREATE INDEX IF NOT EXISTS idx_luno_members_user ON luno_conversation_members(user_id,conversation_id)`
];
// Additive columns for tables that predate Phase 1. Applied with a
// PRAGMA guard because SQLite has no idempotent ADD COLUMN.
const LUNO_SCHEMA_PHASE1_COLS = [
  ['users', 'handle', 'TEXT'],
  ['users', 'birthday', "TEXT DEFAULT ''"],
  ['users', 'avatar_url', "TEXT DEFAULT ''"],
  ['users', 'cover_url', "TEXT DEFAULT ''"],
  ['users', 'avatar_color', "TEXT DEFAULT '#4F7CFF'"],
  ['users', 'plan', "TEXT DEFAULT 'personal'"],
  ['users', 'prefs_json', "TEXT DEFAULT ''"],
  ['users', 'status_message', "TEXT DEFAULT ''"],
  ['users', 'bio', "TEXT DEFAULT ''"],
  ['users', 'phone_number', "TEXT DEFAULT ''"],
  ['users', 'phone_verified', 'INTEGER DEFAULT 0'],
  ['users', 'phone_hmac', "TEXT DEFAULT ''"],
  ['users', 'contact_consent_at', "TEXT DEFAULT ''"],
  ['users', 'state', "TEXT DEFAULT 'active'"],
  ['users', 'kind', "TEXT DEFAULT 'user'"],
  // F1: legacy rows grandfather to verified (they registered before
  // verification existed); new rows always set the flag explicitly.
  ['users', 'email_verified', 'INTEGER DEFAULT 1'],
  ['users', 'deleted_at', "TEXT DEFAULT ''"],
  ['users', 'deletion_reason', "TEXT DEFAULT ''"],
  ['users', 'password_hash', "TEXT NOT NULL DEFAULT ''"],
  ['users', 'display_name', "TEXT NOT NULL DEFAULT ''"],
  ['users', 'created_at', "TEXT NOT NULL DEFAULT ''"],
  ['users', 'updated_at', "TEXT NOT NULL DEFAULT ''"],
  ['friends', 'is_favorite', 'INTEGER DEFAULT 0'],
  ['friends', 'is_hidden', 'INTEGER DEFAULT 0'],
  ['friends', 'nickname', "TEXT DEFAULT ''"],
  ['reports', 'details', "TEXT DEFAULT ''"],
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
  ['attachments', 'encrypted', 'INTEGER DEFAULT 0'],
  ['reports', 'e2ee_disclosed', 'INTEGER DEFAULT 0'],
  ['e2ee_keys', 'prekey_sig', "TEXT DEFAULT ''"],
  ['albums', 'created_by', "TEXT DEFAULT ''"],
  ['wallet_transactions', 'kind', "TEXT DEFAULT ''"],
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
  // L-01: rows that predate kind are human accounts.
  try {
    await db.prepare(`UPDATE users SET kind = 'user' WHERE kind IS NULL`).run();
  } catch (_) { /* column still missing on exotic builds; helper defaults to user */ }
}

let schemaReady = null;
function dbOf() { return CURRENT_ENV && CURRENT_ENV.DB ? CURRENT_ENV.DB : null; }
// A cached startup promise belongs to the request that created it. If that
// request ended before it settled (client went away), Workers rejects every
// later await of it ("created by a request that has since ended"), and the
// isolate used to answer 500 to everything until it was recycled. A failed
// await now drops the cache and redoes the work once in this request.
async function ensureSchema() {
  for (let attempt = 0; ; attempt++) {
    try {
      return await ensureSchemaOnce();
    } catch (err) {
      schemaReady = null;
      if (attempt >= 1) throw err;
    }
  }
}
async function ensureSchemaOnce() {
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
  // or register-written current). checkPassword retries both, never rewriting.
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
// F23: a storage failure is not an invalid ticket. D1 stays the only
// authority while reachable (a missing row is still null: no replay, ever);
// when D1 itself errors, the minting isolate honours its memory copy once
// and every other isolate throws TICKET_STORAGE_DOWN so the upgrade answers
// 503 (retry with a fresh ticket), never a misleading 401.
function ticketStorageDown() {
  const e = new Error('ticket storage unavailable');
  e.code = 'TICKET_STORAGE_DOWN';
  return e;
}
async function redeemWsTicket(ticket) {
  if (!ticket) return null;
  const db = dbOf();
  if (db) {
    await ensureSchema();
    let row = null;
    let storageOk = true;
    try {
      row = await db
        .prepare('DELETE FROM luno_ws_tickets WHERE ticket = ? AND expires_at > ? RETURNING user_id')
        .bind(ticket, Date.now())
        .first();
    } catch {
      storageOk = false;
    }
    if (storageOk) {
      // D1 answered: drop any local copy so this isolate cannot honour a
      // ticket that is now gone everywhere.
      wsTickets.delete(ticket);
      return row && row.user_id ? row.user_id : null;
    }
    const local = wsTickets.get(ticket);
    if (!local) throw ticketStorageDown();
    wsTickets.delete(ticket);
    // Expiry is checkable locally, so an expired ticket is honestly a 401
    // even mid-outage; only the storage verdict is unknown.
    if (local.expiresAt <= Date.now()) return null;
    return local.userId;
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

// ---------- Legal consent (F24) ----------
// Full years between a YYYY-MM-DD birthdate and a YYYY-MM-DD day, or null
// for anything malformed (including impossible dates like Feb 30 and any
// future birthdate). Pure: the same inputs decide identically everywhere.
function ageOnDate(birthdate, onDay) {
  if (typeof birthdate !== 'string' || typeof onDay !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdate.trim());
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(onDay.trim());
  if (!m || !d) return null;
  const by = Number(m[1]), bm = Number(m[2]), bd = Number(m[3]);
  const oy = Number(d[1]), om = Number(d[2]), od = Number(d[3]);
  if (bm < 1 || bm > 12 || om < 1 || om > 12) return null;
  const dim = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (bd < 1 || bd > dim(by, bm) || od < 1 || od > dim(oy, om)) return null;
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age--;
  return age < 0 ? null : age;
}
function consentOfferedValid(offered) {
  return !!offered && offered.terms === LEGAL_VERSIONS.terms && offered.privacy === LEGAL_VERSIONS.privacy;
}
async function loadConsent(userId) {
  if (userConsents.has(userId)) return userConsents.get(userId);
  const db = dbOf();
  if (!db) return null;
  await ensureSchema();
  const row = await db.prepare('SELECT terms_version, privacy_version, age14_confirmed, consented_at FROM luno_consents WHERE user_id = ?').bind(userId).first().catch(() => null);
  if (!row) return null;
  const rec = { terms: row.terms_version, privacy: row.privacy_version, age14: row.age14_confirmed, at: row.consented_at };
  userConsents.set(userId, rec);
  return rec;
}
async function saveConsent(userId, rec) {
  userConsents.set(userId, rec);
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  await db.prepare('INSERT OR REPLACE INTO luno_consents (user_id, terms_version, privacy_version, age14_confirmed, consented_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(userId, rec.terms, rec.privacy, rec.age14, rec.at, now()).run();
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
// P1-2: rate_limits TTL. Only the current window is ever read, so any older
// row is garbage. The 2-minute cron is reserved for the offline sweep, so
// each isolate sweeps opportunistically, at most once per 10 minutes.
let rateLimitGcAt = 0;
const RATE_LIMIT_GC_MS = 10 * 60 * 1000;
async function rateLimitGc(db, windowStart) {
  const nowMs = Date.now();
  if (nowMs - rateLimitGcAt < RATE_LIMIT_GC_MS) return;
  rateLimitGcAt = nowMs;
  await db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(windowStart).run().catch(() => null);
}
async function rateLimit(key, limit) {
  const db = dbOf();
  if (!db) return true; // single-node dev without D1: nothing to coordinate.
  await ensureSchema();
  const windowStart = Math.floor(Date.now() / RATE_WINDOW_MS);
  // P1-2: one atomic upsert instead of SELECT-then-INSERT (no TOCTOU race,
  // one D1 write instead of two). The first `limit` hits in a window stay
  // open; hit limit+1 is 429 — the exact contract stage5/auth_hardening pin.
  const row = await db.prepare('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1 RETURNING count').bind(key, windowStart).first();
  const allowed = !row || Number(row.count) <= limit;
  await rateLimitGc(db, windowStart);
  return allowed;
}
// H2: daily quotas are D1-backed (UTC day) so every isolate sees the same
// counters. Pure boundary check is exported for tests; without D1 (local
// dev) quotas pass open, exactly like rateLimit above.
function quotaDayUTC() {
  return new Date().toISOString().slice(0, 10);
}
function quotaWouldExceed(used, amount, cap) {
  return used + amount > cap;
}
async function quotaConsumeUpload(userId, byteLen) {
  const db = dbOf();
  if (!db) return { ok: true, uploads: 0, bytes: 0 };
  await ensureSchema();
  const day = quotaDayUTC();
  const row = await db.prepare('SELECT uploads, upload_bytes FROM luno_daily_quotas WHERE user_id = ? AND day = ?').bind(userId, day).first() || {};
  const uploads = Number(row.uploads) || 0;
  const bytes = Number(row.upload_bytes) || 0;
  if (quotaWouldExceed(uploads, 1, QUOTA_UPLOADS_PER_DAY)) return { ok: false, reason: 'upload_count', uploads, bytes };
  if (quotaWouldExceed(bytes, byteLen, QUOTA_UPLOAD_BYTES_PER_DAY)) return { ok: false, reason: 'upload_bytes', uploads, bytes };
  await db.prepare('INSERT INTO luno_daily_quotas (user_id, day, uploads, upload_bytes) VALUES (?, ?, 1, ?) ON CONFLICT(user_id, day) DO UPDATE SET uploads = uploads + 1, upload_bytes = upload_bytes + ?').bind(userId, day, byteLen, byteLen).run();
  return { ok: true, uploads: uploads + 1, bytes: bytes + byteLen };
}
async function quotaConsumeRoom(userId) {
  const db = dbOf();
  if (!db) return { ok: true, rooms: 0 };
  await ensureSchema();
  const day = quotaDayUTC();
  const row = await db.prepare('SELECT rooms FROM luno_daily_quotas WHERE user_id = ? AND day = ?').bind(userId, day).first() || {};
  const rooms = Number(row.rooms) || 0;
  if (quotaWouldExceed(rooms, 1, QUOTA_ROOMS_PER_DAY)) return { ok: false, rooms };
  await db.prepare('INSERT INTO luno_daily_quotas (user_id, day, rooms) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET rooms = rooms + 1').bind(userId, day).run();
  return { ok: true, rooms: rooms + 1 };
}
// H3: QR login challenges persist in D1 (luno_qr_challenges) so approval and
// polling work from any isolate. Same XOR shape as the passkey helpers above:
// D1 when configured, the qrChallenges Map for local runs without a database.
const QR_CHALLENGE_TTL_MS = 180000;
async function qrIssueChallenge() {
  const challId = crypto.randomUUID();
  const qrToken = `qr-tok-${crypto.randomUUID()}`;
  const expiresAt = Date.now() + QR_CHALLENGE_TTL_MS;
  if (dbOf()) {
    await ensureSchema();
    await dbOf().prepare(
      'INSERT INTO luno_qr_challenges(challenge_id,qr_token,status,user_id,expires_at,created_at) VALUES (?,?,?,?,?,?)'
    ).bind(challId, qrToken, 'pending', null, Math.floor(expiresAt / 1000), now()).run();
  } else {
    qrChallenges.set(challId, { token: qrToken, status: 'pending', user_id: null, created_at: Date.now() });
  }
  return { challId, qrToken };
}
async function qrGetChallenge(challId) {
  if (dbOf()) {
    await ensureSchema();
    const row = await dbOf().prepare(
      'SELECT challenge_id, qr_token, status, user_id, expires_at FROM luno_qr_challenges WHERE challenge_id = ?'
    ).bind(challId).first();
    if (!row) return null;
    return { id: row.challenge_id, token: row.qr_token, status: row.status, user_id: row.user_id, expiresAt: Number(row.expires_at) * 1000 };
  }
  const c = qrChallenges.get(challId);
  if (!c) return null;
  return { id: challId, token: c.token, status: c.status, user_id: c.user_id, expiresAt: c.created_at + QR_CHALLENGE_TTL_MS };
}
async function qrApproveChallenge(challId, userId) {
  // 'ok' | 'missing' | 'expired'. Re-approving an unexpired challenge keeps
  // the old overwrite semantics; expired rows are deleted like before.
  if (dbOf()) {
    await ensureSchema();
    const nowSec = Math.floor(Date.now() / 1000);
    const row = await dbOf().prepare(
      `UPDATE luno_qr_challenges SET status='authenticated', user_id=? WHERE challenge_id=? AND expires_at>? RETURNING challenge_id`
    ).bind(userId, challId, nowSec).first();
    if (row) return 'ok';
    const existing = await dbOf().prepare('SELECT expires_at FROM luno_qr_challenges WHERE challenge_id = ?').bind(challId).first();
    if (!existing) return 'missing';
    await dbOf().prepare('DELETE FROM luno_qr_challenges WHERE challenge_id = ?').bind(challId).run();
    return 'expired';
  }
  const c = qrChallenges.get(challId);
  if (!c) return 'missing';
  if (Date.now() > c.created_at + QR_CHALLENGE_TTL_MS) {
    qrChallenges.delete(challId);
    return 'expired';
  }
  c.status = 'authenticated';
  c.user_id = userId;
  return 'ok';
}
async function qrDeleteChallenge(challId) {
  if (dbOf()) {
    await ensureSchema();
    await dbOf().prepare('DELETE FROM luno_qr_challenges WHERE challenge_id = ?').bind(challId).run();
  }
  qrChallenges.delete(challId);
}
// T1: translation provider interface. translate(env, text, target, source)
// resolves { translated, source_lang, engine }. One registration slot; the
// fake provider prefixes [target] and is selectable only when DEMO_MODE is on
// (tests + local demo). Source text is never logged.
const translateProviders = new Map();
function registerTranslateProvider(name, provider) {
  translateProviders.set(name, provider);
}
const translateProviderCalls = [];
registerTranslateProvider('fake', {
  languages: ['ko', 'en', 'ja', 'th'],
  async translate(env, text, target, source) {
    translateProviderCalls.push({ text, target, source });
    return { translated: `[${target}] ${text}`, source_lang: source || 'auto', engine: 'fake' };
  },
});
// Google Cloud Translation (v2, NMT — not an LLM, so L-15 does not apply).
// Selected with TRANSLATE_PROVIDER=google; requires the GOOGLE_TRANSLATE_API_KEY
// secret (an API key restricted to translate.googleapis.com). Without the key
// activeTranslateProvider stays null and /translate fails closed with
// TRANSLATE_NOT_CONFIGURED. The key and source text are never logged or
// returned. Tests inject a stub via env.GOOGLE_TRANSLATE_FETCH.
const GOOGLE_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';
registerTranslateProvider('google', {
  languages: ['ko', 'en', 'ja', 'th'],
  async translate(env, text, target, source) {
    translateProviderCalls.push({ text, target, source });
    const body = { q: text, target, format: 'text' };
    if (source && source !== 'auto') body.source = source;
    const doFetch = typeof env.GOOGLE_TRANSLATE_FETCH === 'function' ? env.GOOGLE_TRANSLATE_FETCH : fetch;
    const res = await doFetch(GOOGLE_TRANSLATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_TRANSLATE_API_KEY },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    const t = data && data.data && Array.isArray(data.data.translations) ? data.data.translations[0] : null;
    if (!res.ok || !t || typeof t.translatedText !== 'string') {
      const err = new Error('google translate upstream failed');
      err.code = 'TRANSLATE_UPSTREAM_ERROR';
      err.status = 502;
      throw err;
    }
    return { translated: t.translatedText, source_lang: t.detectedSourceLanguage || source || 'auto', engine: 'google' };
  },
});
function activeTranslateProvider(env) {
  const name = env.TRANSLATE_PROVIDER;
  if (!name) return null;
  if (name === 'fake' && env.DEMO_MODE !== 'true') return null;
  if (name === 'google' && !(typeof env.GOOGLE_TRANSLATE_API_KEY === 'string' && env.GOOGLE_TRANSLATE_API_KEY.trim())) return null;
  return translateProviders.get(name) || null;
}
// F14: speech-to-text provider interface, mirroring T1. transcribe(env,
// audioB64, mime, lang) resolves { text, lang, engine }. The fake provider
// answers canned text and is selectable only when DEMO_MODE is on. Audio
// bytes are never logged.
const sttProviders = new Map();
function registerSttProvider(name, provider) {
  sttProviders.set(name, provider);
}
const sttProviderCalls = [];
registerSttProvider('fake', {
  languages: ['ko', 'en', 'ja', 'th'],
  async transcribe(env, audioB64, mime, lang) {
    sttProviderCalls.push({ bytes: audioB64.length, mime, lang });
    return { text: `[${lang || 'auto'} transcript]`, lang: lang || 'auto', engine: 'fake' };
  },
});
// A13: whisper STT engine adapter (OpenAI-compatible /audio/transcriptions).
// Selected with STT_PROVIDER=whisper. Requires WHISPER_API_KEY plus an
// operator-configured WHISPER_BASE_URL (self-hosted or OpenAI-compatible
// endpoint); without either, activeSttProvider stays null so ai/stt fails
// closed with STT_NOT_CONFIGURED. No vendor URL is built in (L-15: the worker
// cannot reach any LLM by construction). WHISPER_MODEL (default whisper-1)
// is optional. Audio bytes and the key are never logged.
// Tests inject a stub via env.WHISPER_FETCH.
const WHISPER_AUDIO_EXT = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/webm': 'webm', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac' };
registerSttProvider('whisper', {
  languages: ['ko', 'en', 'ja', 'th'],
  async transcribe(env, audioB64, mime, lang) {
    sttProviderCalls.push({ bytes: audioB64.length, mime, lang });
    const base = (typeof env.WHISPER_BASE_URL === 'string' && env.WHISPER_BASE_URL.replace(/\/+$/, '')) || '';
    const model = (typeof env.WHISPER_MODEL === 'string' && env.WHISPER_MODEL.trim()) || 'whisper-1';
    const bytes = Uint8Array.from(atob(audioB64), (c) => c.charCodeAt(0));
    const ext = WHISPER_AUDIO_EXT[mime] || 'm4a';
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mime || 'audio/mp4' }), `audio.${ext}`);
    form.append('model', model);
    if (lang && lang !== 'auto') form.append('language', String(lang).slice(0, 10));
    const doFetch = typeof env.WHISPER_FETCH === 'function' ? env.WHISPER_FETCH : fetch;
    const res = await doFetch(`${base}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHISPER_API_KEY}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data.text !== 'string' || !data.text) {
      const err = new Error('whisper upstream failed');
      err.code = 'STT_UPSTREAM_ERROR';
      err.status = 502;
      throw err;
    }
    return { text: data.text, lang: lang || 'auto', engine: 'whisper' };
  },
});
function activeSttProvider(env) {
  const name = env && env.STT_PROVIDER;
  if (!name) return null;
  if (name === 'fake' && env.DEMO_MODE !== 'true') return null;
  if (name === 'whisper' && !(typeof env.WHISPER_API_KEY === 'string' && env.WHISPER_API_KEY && typeof env.WHISPER_BASE_URL === 'string' && env.WHISPER_BASE_URL.trim())) return null;
  if (name === 'google' && !(googleAiKey(env) && typeof env.GOOGLE_CLOUD_PROJECT === 'string' && env.GOOGLE_CLOUD_PROJECT.trim())) return null;
  return sttProviders.get(name) || null;
}
// A14: text-to-speech provider interface, mirroring F14. synthesize(env,
// text, voice, lang) resolves { audio_base64, mime_type, voice, engine }.
// The fake provider answers canned bytes and is selectable only when
// DEMO_MODE is on. Text is never logged.
const ttsProviders = new Map();
function registerTtsProvider(name, provider) {
  ttsProviders.set(name, provider);
}
const ttsProviderCalls = [];
registerTtsProvider('fake', {
  voices: ['luno'],
  async synthesize(env, text, voice, lang) {
    ttsProviderCalls.push({ chars: text.length, voice, lang });
    return { audio_base64: 'UklGRg==', mime_type: 'audio/wav', voice: voice || 'luno', engine: 'fake' };
  },
});
// ---------- Google Cloud AI (Speech-to-Text v2, Text-to-Speech, Vision) ----------
// None of these are LLMs (L-15 does not apply). All three share one API key
// secret, GOOGLE_AI_API_KEY, restricted in GCP to speech/texttospeech/vision.
// Speech v2 also needs GOOGLE_CLOUD_PROJECT (the project id in its URL).
// Without the key every provider stays inactive and the routes fail closed
// (STT_NOT_CONFIGURED / TTS_NOT_CONFIGURED / OCR_NOT_CONFIGURED; moderation
// simply does not run). Audio, text, image bytes and the key are never
// logged. Tests inject a stub via env.GOOGLE_AI_FETCH.
function googleAiKey(env) {
  const k = env && env.GOOGLE_AI_API_KEY;
  return typeof k === 'string' && k.trim() ? k.trim() : '';
}
function googleAiFetch(env) {
  return env && typeof env.GOOGLE_AI_FETCH === 'function' ? env.GOOGLE_AI_FETCH : fetch;
}
async function googleAiPost(env, url, body, code) {
  const res = await googleAiFetch(env)(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleAiKey(env) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error('google ai upstream failed');
    err.code = code;
    err.status = 502;
    throw err;
  }
  return data;
}
const GOOGLE_LANG_CODES = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', th: 'th-TH' };
function googleLangFor(lang, text) {
  if (lang && GOOGLE_LANG_CODES[lang]) return GOOGLE_LANG_CODES[lang];
  const s = String(text || '');
  if (/[가-힣]/.test(s)) return 'ko-KR';
  if (/[぀-ヿ]/.test(s)) return 'ja-JP';
  if (/[฀-๿]/.test(s)) return 'th-TH';
  if (s && /[a-z]/i.test(s)) return 'en-US';
  return 'ko-KR';
}
// Speech v2 auto-detects the container, so the app's AAC/m4a voice notes and
// the web's WebM/Opus recordings both work without transcoding.
registerSttProvider('google', {
  languages: ['ko', 'en', 'ja', 'th'],
  async transcribe(env, audioB64, mime, lang) {
    sttProviderCalls.push({ bytes: audioB64.length, mime, lang });
    const project = String(env.GOOGLE_CLOUD_PROJECT || '').trim();
    const languageCode = googleLangFor(lang, '');
    const data = await googleAiPost(env,
      `https://speech.googleapis.com/v2/projects/${encodeURIComponent(project)}/locations/global/recognizers/_:recognize`,
      { config: { autoDecodingConfig: {}, languageCodes: [languageCode], model: 'long', features: { enableAutomaticPunctuation: true } }, content: audioB64 },
      'STT_UPSTREAM_ERROR');
    const parts = (Array.isArray(data.results) ? data.results : [])
      .map((r) => (r && Array.isArray(r.alternatives) && r.alternatives[0] && r.alternatives[0].transcript) || '')
      .filter(Boolean);
    return { text: parts.join(' ').trim(), lang: lang && lang !== 'auto' ? lang : languageCode.slice(0, 2), engine: 'google' };
  },
});
const GOOGLE_TTS_VOICES = ['ko-KR-Neural2-A', 'ko-KR-Neural2-C', 'en-US-Neural2-F', 'en-US-Neural2-D', 'ja-JP-Neural2-B', 'ja-JP-Neural2-C', 'th-TH-Neural2-C'];
registerTtsProvider('google', {
  voices: GOOGLE_TTS_VOICES,
  async synthesize(env, text, voice, lang) {
    ttsProviderCalls.push({ chars: text.length, voice, lang });
    const named = GOOGLE_TTS_VOICES.includes(voice) ? voice : '';
    const languageCode = named ? named.slice(0, 5) : googleLangFor(lang, text);
    const data = await googleAiPost(env, 'https://texttospeech.googleapis.com/v1/text:synthesize', {
      input: { text },
      voice: named ? { languageCode, name: named } : { languageCode },
      audioConfig: { audioEncoding: 'MP3' },
    }, 'TTS_UPSTREAM_ERROR');
    if (typeof data.audioContent !== 'string' || !data.audioContent) {
      const err = new Error('google tts empty');
      err.code = 'TTS_UPSTREAM_ERROR';
      err.status = 502;
      throw err;
    }
    return { audio_base64: data.audioContent, mime_type: 'audio/mpeg', voice: named || languageCode, engine: 'google' };
  },
});
// Vision: VISION_PROVIDER=google turns on SafeSearch upload screening and the
// ai/ocr route. Screening blocks adult or violent images rated LIKELY or
// VERY_LIKELY; on a Vision outage it fails open (uploads keep working) and
// counts the miss in visionScreenMisses so ops can see it in tests/metrics.
const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
const visionScreenStats = { checked: 0, blocked: 0, misses: 0 };
function visionActive(env) {
  return !!(env && env.VISION_PROVIDER === 'google' && googleAiKey(env));
}
async function visionAnnotate(env, contentB64, featureType) {
  const data = await googleAiPost(env, VISION_URL, { requests: [{ image: { content: contentB64 }, features: [{ type: featureType }] }] }, 'VISION_UPSTREAM_ERROR');
  const r = Array.isArray(data.responses) ? data.responses[0] || {} : {};
  if (r.error) {
    const err = new Error('vision response error');
    err.code = 'VISION_UPSTREAM_ERROR';
    err.status = 502;
    throw err;
  }
  return r;
}
const VISION_UNSAFE = new Set(['LIKELY', 'VERY_LIKELY']);
async function visionScreenImage(env, contentB64) {
  if (!visionActive(env)) return { checked: false, unsafe: false };
  try {
    const r = await visionAnnotate(env, contentB64, 'SAFE_SEARCH_DETECTION');
    const s = r.safeSearchAnnotation || {};
    const reasons = ['adult', 'violence'].filter((k) => VISION_UNSAFE.has(s[k]));
    visionScreenStats.checked++;
    if (reasons.length) visionScreenStats.blocked++;
    return { checked: true, unsafe: reasons.length > 0, reasons };
  } catch {
    visionScreenStats.misses++;
    return { checked: false, unsafe: false };
  }
}
function activeTtsProvider(env) {
  const name = env && env.TTS_PROVIDER;
  if (!name) return null;
  if (name === 'fake' && env.DEMO_MODE !== 'true') return null;
  if (name === 'google' && !googleAiKey(env)) return null;
  return ttsProviders.get(name) || null;
}
async function translateCacheGet(textHash, target) {
  const db = dbOf();
  if (!db) return null;
  await ensureSchema();
  return db.prepare('SELECT translated, source_lang, engine FROM luno_translation_cache WHERE text_hash = ? AND target_lang = ?').bind(textHash, target).first();
}
async function translateCachePut(textHash, target, translated, sourceLang, engine) {
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  await db.prepare('INSERT OR IGNORE INTO luno_translation_cache(text_hash,target_lang,translated,source_lang,engine,created_at) VALUES (?,?,?,?,?,?)').bind(textHash, target, translated, sourceLang || '', engine || '', now()).run();
}
async function translateConsumeChars(userId, len) {
  const db = dbOf();
  if (!db) return { ok: true };
  await ensureSchema();
  const day = quotaDayUTC();
  const row = await db.prepare('SELECT chars FROM luno_translate_usage WHERE user_id = ? AND day = ?').bind(userId, day).first() || {};
  const used = Number(row.chars) || 0;
  if (quotaWouldExceed(used, len, TRANSLATE_CHARS_PER_DAY)) return { ok: false, used };
  await db.prepare('INSERT INTO luno_translate_usage(user_id,day,chars) VALUES (?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET chars = chars + ?').bind(userId, day, len, len).run();
  return { ok: true, used: used + len };
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
// F3: 30-day deletion grace. Reasons come from a fixed set; the confirm
// phrase is the account email (locale-free, no new strings).
const ACCOUNT_DELETE_GRACE_MS = 30 * 24 * 3600 * 1000;
// F28: retention windows in days. TEMPORARY VALUES (임시값) — legal review
// must fix the final periods; every number below is a placeholder, not policy.
// Deleted-account grace reuses the settled F3 30-day window (not provisional).
const RETENTION_DAYS = {
  messages: 1095, // 3y 임시값
  attachments: 1095, // 3y 임시값
  access_records: 90, // revoked sessions only; 90d 임시값
  audit_logs: 1825, // 5y 임시값
  reports: 1095, // closed reports only; 3y 임시값
};
const DELETE_REASONS = new Set(['not_using', 'privacy', 'hard_to_use', 'other']);
function deletionGraceUntil(fromIso) {
  return new Date(Date.parse(fromIso) + ACCOUNT_DELETE_GRACE_MS).toISOString();
}
// Shared by DELETE /me and POST /me/delete-account. Returns an error
// response when the request is invalid, else null.
async function checkDeletionBody(me, b) {
  if (!b.password) return json({ error: 'password required for account deletion' }, 400);
  if (!(await checkPassword(me, b.password))) return json({ error: 'password incorrect' }, 401);
  if (['user@luno.local'].includes((me.email || '').toLowerCase())) {
    return json({ error: 'shared demo accounts cannot be deleted', code: 'DEMO_PROTECTED' }, 403);
  }
  if (typeof b.confirm_text !== 'string' || b.confirm_text.trim().toLowerCase() !== String(me.email || '').toLowerCase()) {
    return json({ error: 'confirm phrase must equal the account email', code: 'CONFIRM_MISMATCH' }, 400);
  }
  const reason = b.reason === undefined || b.reason === null || b.reason === '' ? '' : String(b.reason);
  if (reason && !DELETE_REASONS.has(reason)) return json({ error: 'unknown deletion reason' }, 400);
  return null;
}
async function scheduleAccountDeletion(me, reason) {
  const stamped = now();
  me.state = 'deleted';
  me.deleted_at = stamped;
  me.deletion_reason = reason;
  const db = dbOf();
  if (db) {
    await ensureSchema();
    await db.prepare("UPDATE users SET state = 'deleted', deleted_at = ?, deletion_reason = ?, updated_at = ? WHERE id = ?")
      .bind(stamped, reason, stamped, me.id).run();
  }
  return stamped;
}
// F3: pre-grace rows (no stamp) count as expired — A-10 already wiped them.
function deletionExpired(user) {
  if (!user || user.state !== 'deleted') return false;
  const ts = Date.parse(user.deleted_at || '') || 0;
  return !user.deleted_at || Date.now() - ts > ACCOUNT_DELETE_GRACE_MS;
}
async function restoreDeletion(user) {
  user.state = 'active';
  user.deleted_at = '';
  user.deletion_reason = '';
  const db = dbOf();
  if (db) {
    await ensureSchema();
    await db.prepare("UPDATE users SET state = 'active', deleted_at = '', deletion_reason = '', updated_at = datetime('now') WHERE id = ?").bind(user.id).run();
  }
  await persistAudit(user.id, 'account.recover', user.id, {});
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
    delete gone.pw_hash; delete gone.pw_salt; delete gone.pw_iter;
    gone.bio = ''; gone.status_message = ''; gone.avatar_url = ''; gone.cover_url = ''; gone.phone = ''; gone.birthday = '';
    gone.deletion_reason = '';
  }
  for (const [email, u] of Array.from(users)) if (u.id === userId) users.delete(email);
  for (const [tok, sess] of Array.from(sessions)) {
    if (sess.user_id === userId) { sessions.delete(tok); revokedTokens.add(tok); }
  }
  for (const key of Array.from(friendships.keys())) {
    if (key.startsWith(userId + ':') || key.endsWith(':' + userId)) friendships.delete(key);
  }
  // F3: sweep the rest of the in-memory user state (rooms keep a tombstone
  // member entry; audit rows stay for abuse tracing).
  for (const key of Array.from(friendMeta.keys())) {
    if (key.startsWith(userId + ':') || key.endsWith(':' + userId)) friendMeta.delete(key);
  }
  for (const key of Array.from(chatMeta.keys())) {
    if (key.endsWith(':' + userId)) chatMeta.delete(key);
  }
  for (const [cid, list] of Array.from(messages)) {
    const kept = (list || []).filter(m => m.sender_id !== userId);
    if (kept.length !== (list || []).length) messages.set(cid, kept);
  }
  for (const key of Array.from(readCursors.keys())) {
    if (key.endsWith(':' + userId)) readCursors.delete(key);
  }
  for (const [mid, rm] of Array.from(reactionStore)) {
    for (const [emoji, set] of Array.from(rm)) {
      set.delete(userId);
      if (!set.size) rm.delete(emoji);
    }
    if (!rm.size) reactionStore.delete(mid);
  }
  for (const [cid, list] of Array.from(noteStore)) noteStore.set(cid, (list || []).filter(n => n.author_id !== userId));
  for (const [cid, list] of Array.from(eventStore)) eventStore.set(cid, (list || []).filter(e => e.created_by !== userId));
  for (const [pid, poll] of Array.from(polls)) {
    if (poll && poll.created_by === userId) { polls.delete(pid); pollVotes.delete(pid); }
  }
  for (const [cid, list] of Array.from(pinnedMessages)) pinnedMessages.set(cid, (list || []).filter(p => p.pinned_by !== userId));
  for (const [cid, list] of Array.from(albums)) albums.set(cid, (list || []).filter(a => a.created_by !== userId));
  savedMessages.delete(userId);
  hiddenMsgs.delete(userId);
  wallets.delete(userId);
  ownedPacks.delete(userId);
  ownedThemes.delete(userId);
  userPrefs.delete(userId);
  pushTokens.delete(userId);
  userKeys.delete(userId);
  for (const [dev, bundle] of Array.from(deviceKeys)) {
    if (bundle && bundle.user_id === userId) deviceKeys.delete(dev);
  }
  for (const [credId, cred] of Array.from(passkeyCreds)) {
    if (cred && cred.userId === userId) passkeyCreds.delete(credId);
  }
  followedOfficial.delete(userId);
  for (const [ticket, t] of Array.from(wsTickets)) {
    if (t && t.userId === userId) wsTickets.delete(ticket);
  }
  for (const conv of conversations.values()) {
    if (conv.members && conv.members.includes(userId)) conv.members = conv.members.filter(x => x !== userId);
  }
  for (const cid of [`conv-keep-${userId}`, `conv-oa-notice-${userId}`]) {
    conversations.delete(cid);
    messages.delete(cid);
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
      await bucket.delete(profilePhotoKey(userId, 'avatar')).catch(() => {});
      await bucket.delete(profilePhotoKey(userId, 'cover')).catch(() => {});
    } catch (_) {}
  }
  await d1Batch(db, [
    ["UPDATE users SET state = 'deleted', display_name = ?, password_hash = 'pbkdf2$deleted', bio = '', status_message = '', avatar_url = '', cover_url = '', phone_number = '', birthday = '', deletion_reason = '', updated_at = ? WHERE id = ?", '탈퇴한 사용자', at, userId],
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
    ['DELETE FROM luno_chat_meta WHERE user_id = ?', userId],
    ['DELETE FROM luno_ws_tickets WHERE user_id = ?', userId],
    ['DELETE FROM conversation_notes WHERE author_id = ?', userId],
    ['DELETE FROM event_rsvps WHERE user_id = ?', userId],
    ['DELETE FROM poll_votes WHERE user_id = ?', userId],
    ['DELETE FROM reactions WHERE user_id = ?', userId],
    ['DELETE FROM message_reactions WHERE user_id = ?', userId],
    ['DELETE FROM wallets WHERE user_id = ?', userId],
    ['DELETE FROM polls WHERE created_by = ?', userId],
    ['DELETE FROM conversation_events WHERE created_by = ?', userId],
    ['DELETE FROM albums WHERE created_by = ?', userId],
    ['DELETE FROM keep_items WHERE user_id = ?', userId],
    ['DELETE FROM luno_hidden_messages WHERE user_id = ?', userId],
    ['DELETE FROM luno_pins WHERE pinned_by = ?', userId],
    ['DELETE FROM luno_email_codes WHERE email = (SELECT email FROM users WHERE id = ?)', userId],
    ['DELETE FROM luno_translate_usage WHERE user_id = ?', userId],
  ]);
  const acctEmail = (usersById.get(userId) || {}).email || '';
  if (acctEmail) {
    await db.prepare('DELETE FROM login_attempts WHERE key = ?').bind('acct:' + String(acctEmail).toLowerCase()).run().catch(() => null);
  }
  // Migration-only tables may not exist on every database; purge past them.
  await db.prepare('DELETE FROM luno_conversation_members WHERE user_id = ?').bind(userId).run().catch(() => null);
  await db.prepare('DELETE FROM luno_user_roles WHERE user_id = ?').bind(userId).run().catch(() => null);
}
// F28: delete only rows past their retention window. Live sessions stay
// (current state, not history), open reports stay (pending work), and
// deletions finalize only past the F3 grace. Returns per-type counts.
async function purgeExpiredData() {
  const db = dbOf();
  if (!db) return null;
  await ensureSchema();
  const counts = { messages: 0, attachments: 0, access_records: 0, audit_logs: 0, reports: 0, deleted_accounts: 0 };
  const cutoff = (days) => new Date(Date.now() - days * 86400000).toISOString();
  const msgCut = cutoff(RETENTION_DAYS.messages);
  counts.messages = Number((await db.prepare('DELETE FROM luno_messages WHERE created_at < ?').bind(msgCut).run().catch(() => null))?.meta?.changes || 0);
  for (const [cid, list] of Array.from(messages)) {
    const kept = (list || []).filter(m => !(m.created_at && m.created_at < msgCut));
    if (kept.length !== (list || []).length) messages.set(cid, kept);
  }
  const attCut = cutoff(RETENTION_DAYS.attachments);
  const bucket = mediaBucketOf();
  const old = await db.prepare('SELECT id, object_key FROM attachments WHERE created_at < ?').bind(attCut).all().catch(() => ({ results: [] }));
  for (const r of (old.results || [])) {
    if (bucket && r.object_key) await bucket.delete(r.object_key).catch(() => {});
  }
  counts.attachments = Number((await db.prepare('DELETE FROM attachments WHERE created_at < ?').bind(attCut).run().catch(() => null))?.meta?.changes || 0)
    + Number((await db.prepare('DELETE FROM luno_attachments WHERE created_at < ?').bind(attCut).run().catch(() => null))?.meta?.changes || 0);
  counts.access_records = Number((await db.prepare('DELETE FROM luno_sessions WHERE revoked_at IS NOT NULL AND revoked_at < ?').bind(cutoff(RETENTION_DAYS.access_records)).run().catch(() => null))?.meta?.changes || 0);
  counts.audit_logs = Number((await db.prepare('DELETE FROM luno_audit WHERE created_at < ?').bind(cutoff(RETENTION_DAYS.audit_logs)).run().catch(() => null))?.meta?.changes || 0);
  counts.reports = Number((await db.prepare("DELETE FROM reports WHERE status IN ('resolved','dismissed') AND created_at < ?").bind(cutoff(RETENTION_DAYS.reports)).run().catch(() => null))?.meta?.changes || 0);
  for (const r of (await db.prepare("SELECT id, deleted_at FROM users WHERE state = 'deleted'").all().catch(() => ({ results: [] }))).results || []) {
    if (deletionExpired({ state: 'deleted', deleted_at: r.deleted_at })) {
      await deleteAccountData(r.id);
      counts.deleted_accounts++;
    }
  }
  for (const rep of Array.from(adminReports)) {
    if ((rep.state === 'resolved' || rep.state === 'dismissed') && rep.created_at && rep.created_at < cutoff(RETENTION_DAYS.reports)) {
      adminReports.splice(adminReports.indexOf(rep), 1);
    }
  }
  return counts;
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
  await hydrateReactions((results || []).map(r => r.id));
  await hydrateUsersByIds((results || []).map(r => r.sender_id));
}
// D2: reaction + hidden caches are D1 write-through; hydration fills them so
// the synchronous decoration paths keep working on cold isolates.
async function hydrateReactions(messageIds) {
  const db = dbOf();
  if (!db || !messageIds.length) return;
  await ensureSchema();
  const ph = messageIds.map(() => '?').join(',');
  const { results } = await db.prepare(`SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id IN (${ph})`).bind(...messageIds).all();
  for (const r of results || []) {
    if (!reactionStore.has(r.message_id)) reactionStore.set(r.message_id, new Map());
    const rm = reactionStore.get(r.message_id);
    if (!rm.has(r.emoji)) rm.set(r.emoji, new Set());
    rm.get(r.emoji).add(r.user_id);
  }
}
async function hydrateHidden(userId) {
  const db = dbOf();
  if (!db || !userId) return;
  await ensureSchema();
  const { results } = await db.prepare('SELECT message_id FROM luno_hidden_messages WHERE user_id = ?').bind(userId).all();
  hiddenMsgs.set(userId, new Set((results || []).map(r => r.message_id)));
}
async function hydratePins(cid) {
  const db = dbOf();
  if (!db || !cid) return;
  await ensureSchema();
  const { results } = await db.prepare('SELECT message_id, pinned_by, pinned_at FROM luno_pins WHERE conversation_id = ?').bind(cid).all();
  pinnedMessages.set(cid, (results || []).map(r => ({ message_id: r.message_id, pinned_by: r.pinned_by, pinned_at: r.pinned_at })));
}
async function hydratePolls(cid) {
  const db = dbOf();
  if (!db || !cid) return;
  await ensureSchema();
  const { results } = await db.prepare('SELECT * FROM polls WHERE conversation_id = ?').bind(cid).all();
  for (const row of results || []) {
    let options = [];
    try { options = JSON.parse(row.options_json || '[]'); } catch { options = []; }
    const poll = { id: row.id, conversation_id: row.conversation_id, question: row.question, multiple: !!row.multiple, closed: !!row.closed, created_by: row.created_by || '', created_at: row.created_at, options: options.map((o, i) => ({ id: o.id || `opt-${i}`, text: o.text || '', voters: new Set() })) };
    const votes = await db.prepare('SELECT option_id, user_id FROM poll_votes WHERE poll_id = ?').bind(row.id).all();
    for (const v of votes.results || []) poll.options.find(o => o.id === v.option_id)?.voters.add(v.user_id);
    polls.set(poll.id, poll);
  }
}
async function hydrateNotes(cid) {
  const db = dbOf();
  if (!db || !cid) return;
  await ensureSchema();
  const { results } = await db.prepare('SELECT * FROM conversation_notes WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC').bind(cid).all();
  noteStore.set(cid, (results || []).map(r => ({ id: r.id, title: r.title, body: r.body, author_id: r.author_id, created_at: r.created_at })));
}
async function hydrateEvents(cid) {
  const db = dbOf();
  if (!db || !cid) return;
  await ensureSchema();
  const { results } = await db.prepare('SELECT * FROM conversation_events WHERE conversation_id = ? ORDER BY starts_at ASC').bind(cid).all();
  const list = [];
  for (const row of results || []) {
    const ev = { id: row.id, title: row.title, starts_at: row.starts_at, location: row.location || '', created_by: row.created_by || '', created_at: row.created_at, rsvps: new Map() };
    const rsvps = await db.prepare('SELECT user_id, status FROM event_rsvps WHERE event_id = ?').bind(row.id).all();
    for (const s of rsvps.results || []) ev.rsvps.set(s.user_id, s.status);
    list.push(ev);
  }
  eventStore.set(cid, list);
}
async function hydrateAlbums(cid) {
  const db = dbOf();
  if (!db || !cid) return;
  await ensureSchema();
  const { results } = await db.prepare('SELECT * FROM albums WHERE conversation_id = ?').bind(cid).all();
  albums.set(cid, (results || []).map(r => {
    let ids = [];
    try { ids = JSON.parse(r.image_urls || '[]'); } catch { ids = []; }
    return { id: r.id, title: r.title, attachment_ids: Array.isArray(ids) ? ids : [], created_by: r.created_by || '', created_at: r.created_at };
  }));
}
async function hydrateKeep(userId) {
  const db = dbOf();
  if (!db || !userId) return;
  await ensureSchema();
  const { results } = await db.prepare('SELECT * FROM keep_items WHERE user_id = ? ORDER BY created_at DESC, rowid DESC').bind(userId).all();
  savedMessages.set(userId, (results || []).map(r => ({ id: r.id, body: r.body, kind: r.category || 'text', created_at: r.created_at })));
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
// Read receipts: every member's cursor for one room. decorateMessage counts
// the OTHER members' cursors, but hydrateCursors only loads the viewer's own,
// so a peer who read on another isolate showed as unread ("읽음" vanished).
async function hydrateRoomCursors(cid) {
  const db = dbOf();
  if (!db || !cid) return;
  await ensureSchema();
  const { results } = await db.prepare('SELECT user_id, sequence FROM luno_read_cursors WHERE conversation_id = ?').bind(cid).all().catch(() => ({ results: [] }));
  for (const r of results || []) {
    const key = `${cid}:${r.user_id}`;
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
  await hydrateChatMeta(userId);
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
// 6-8: chat list flags (pin/mute/hide) survive isolates. The memory map is
// the read cache; D1 is the source of truth. Hydration only fills misses so
// it never clobbers a flag this isolate just set; roomMuted re-checks D1
// when memory says unmuted, like blockState.
async function persistChatMeta(cid, userId) {
  const db = dbOf();
  if (!db || !cid || !userId) return;
  await ensureSchema();
  const m = cMeta(cid, userId);
  await db.prepare('INSERT INTO luno_chat_meta (conversation_id, user_id, pinned, muted, hidden, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(conversation_id, user_id) DO UPDATE SET pinned = excluded.pinned, muted = excluded.muted, hidden = excluded.hidden, updated_at = excluded.updated_at')
    .bind(cid, userId, m.pinned ? 1 : 0, m.muted ? 1 : 0, m.hidden ? 1 : 0, now()).run();
}
async function hydrateChatMeta(userId) {
  const db = dbOf();
  if (!db || !userId) return;
  await ensureSchema();
  const { results } = await db.prepare('SELECT conversation_id, pinned, muted, hidden FROM luno_chat_meta WHERE user_id = ?').bind(userId).all();
  for (const r of results || []) {
    const key = `${r.conversation_id}:${userId}`;
    if (!chatMeta.has(key)) chatMeta.set(key, { pinned: Number(r.pinned) === 1, muted: Number(r.muted) === 1, hidden: Number(r.hidden) === 1 });
  }
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
      if (/UNIQUE|constraint/i.test(String(err && err.message))) {
        const clash = msg.client_id ? await db.prepare('SELECT * FROM luno_messages WHERE conversation_id = ? AND sender_id = ? AND client_id = ?').bind(cid, senderId, msg.client_id).first().catch(() => null) : null;
        if (clash) {
          const orig = rowToMessage(clash);
          orig._duplicate = true;
          return orig;
        }
        if (attempt < 4) continue;
      }
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
  // U1: the notice room (with its sample alerts) is demo-only. Real accounts
  // keep only their Keep room until the official-account flow (F12) ships.
  if (isDemoUser(CURRENT_ENV, user.id)) ensureDemoConversationsForUser(user.id);
  const cid = `conv-oa-notice-${user.id}`;
  if (!conversations.has(cid)) return;
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
  await db.prepare('INSERT INTO attachments (id, conversation_id, object_key, name, mime_type, size_bytes, sha256, uploader_id, encrypted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(att.id, att.conversation_id, object_key, att.name, att.mime, att.bytes.length, sha256, att.owner, att.encrypted ? 1 : 0, now()).run();
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

// S2: handles that registration must never assign (compared lowercased).
// System peer identities use the peer- prefix; handles cannot contain '-',
// so the reservation is enforced as "peer" plus a separator (or exact).
const RESERVED_HANDLES = new Set(['admin', 'luno', 'luno_notice']);
const RESERVED_PEER_PREFIX = /^peer([-_.]|$)/;
// ---------- Passwords ----------
// Only PBKDF2 digests are ever compared. A stored digest is never accepted as the
// password itself, and no plaintext copy is kept on the user object.
// Stored form: pbkdf2$<iterations>$<salt>$<hash>. The older pbkdf2$<salt>$<hash>
// form used 1,000 iterations and is upgraded on the next successful login.
const PBKDF2_LEGACY_ITERATIONS = 1000;
const PBKDF2_DEFAULT_ITERATIONS = 100000; // workerd caps PBKDF2 at 100k iterations; higher throws NotSupportedError on real Workers (local dev has no cap).
const REVOKED_LEGACY_PASSWORD_HASHES = new Set(['685fbe49e51e664e063d6050937213dfe5379107d4ef451d0fc2ee0f1ad8eae6', 'cf515df07d60c8a9c79434e86808315bffee80da5c8b1511f306cc16dbd9f0d5', 'bbd95540ec1b1ec1632f30df9ab7957265768d386991925df88ed8619e8f05fd', '953a33067bb06e02bc7a84484c147a920922f574ebf49ef0e63da2fe39912d5c', '9a70c90403e672681e737fd4c9c77049d444a85dd791ee9dcc0bc8e7b729851e', 'bc5ab389af312062e3079f8bec52af6ea5bbcae0d0b9605e67979d8d65e6f083', 'f10b4023de5096dc8baa1fcd4388db652ff31cad283be13d3a46bd5ecfc92af8', 'd8488c30fc745977465e60f7b27530f9de84ca9c471df697baead130c0422e51', 'eec93217a4c087a81e335d6e4d8c2fcd71a583b6c65ef6b0ddefd1dc09ce4be0', '7cf74e271160b803dfa980737b8116c1a7ba86ccdec9d4a4f2f7ff282c88a47e']);
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
    logx('error', 'pbkdf2 failed', { error: err?.message || String(err) });
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
// S4: only PBKDF2 digests yield verifiable credentials. Anything else
// (plaintext, sha256: rows) leaves the user without credentials, and login
// rejects those rows with password_reset_required instead of accepting them.
function applyStoredPassword(user, stored) {
  delete user.password; delete user.raw_password;
  const hashed = parsePbkdf2(stored);
  if (hashed) {
    user.pw_hash = hashed.hash; user.pw_salt = hashed.salt; user.pw_iter = hashed.iter;
  } else {
    delete user.pw_hash; delete user.pw_salt; delete user.pw_iter;
  }
  return user;
}
async function setPassword(user, password) {
  delete user.password; delete user.raw_password;
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
  if (REVOKED_LEGACY_PASSWORD_HASHES.has(await sha256Hex(password))) return false;
  // S4: pure verification — no legacy-plaintext acceptance and no login-time
  // rehashing. Rows without PBKDF2 credentials never verify here; the login
  // handler answers those with password_reset_required.
  if (!user.pw_hash || !user.pw_salt) return false;
  const hash = await pbkdf2(password, user.pw_salt, user.pw_iter || PBKDF2_LEGACY_ITERATIONS);
  if (hash && timingSafeEqualText(hash, user.pw_hash)) return true;
  if (!user.pw_iter) {
    const hash2 = await pbkdf2(password, user.pw_salt, pbkdf2Iterations());
    return !!hash2 && timingSafeEqualText(hash2, user.pw_hash);
  }
  return false;
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
    birthday: u.birthday || '', avatar_url: u.avatar_url || '', cover_url: u.cover_url || '',
    kind: userKind(u)
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
// D3: one transfer row per money move; each side's entry derives from it.
function walletTxView(row, viewerId) {
  const base = { id: row.id, note: row.note || '', created_at: row.created_at };
  if (row.kind === 'charge') return { ...base, type: 'charge', amount: Number(row.amount) };
  if (row.kind === 'purchase') return { ...base, type: 'purchase', amount: -Number(row.amount) };
  const outgoing = row.from_user_id === viewerId;
  const other = outgoing ? row.to_user_id : row.from_user_id;
  return { ...base, type: outgoing ? 'send' : 'receive', amount: outgoing ? -Number(row.amount) : Number(row.amount), counterparty: userBrief(other)?.display_name || '' };
}
async function hydrateWallet(userId) {
  const db = dbOf();
  if (!db || !userId) return;
  await ensureSchema();
  await db.prepare('INSERT OR IGNORE INTO wallets (user_id, balance, updated_at) VALUES (?, 0, ?)').bind(userId, now()).run();
  const bal = await db.prepare('SELECT balance FROM wallets WHERE user_id = ?').bind(userId).first();
  const { results } = await db.prepare('SELECT * FROM wallet_transactions WHERE from_user_id = ? OR to_user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 50').bind(userId, userId).all();
  const rows = results || [];
  const others = new Set();
  for (const r of rows) {
    if (r.from_user_id && r.from_user_id !== userId) others.add(r.from_user_id);
    if (r.to_user_id && r.to_user_id !== userId) others.add(r.to_user_id);
  }
  await hydrateUsersByIds([...others]);
  wallets.set(userId, { balance: Number(bal?.balance || 0), tx: rows.map(r => walletTxView(r, userId)) });
}
async function hydrateOwned(userId) {
  const db = dbOf();
  if (!db || !userId) return;
  await ensureSchema();
  const { results } = await db.prepare('SELECT item_type, item_id FROM luno_owned_items WHERE user_id = ?').bind(userId).all();
  const packs = new Set(['basic']);
  const themes = new Set(THEME_CATALOG.filter(t => t.price_minor === 0).map(t => t.id));
  for (const r of results || []) (r.item_type === 'theme' ? themes : packs).add(r.item_id);
  ownedPacks.set(userId, packs);
  ownedThemes.set(userId, themes);
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
  out.sender_kind = userBrief(msg.sender_id)?.kind || 'user';
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
  const memberBriefs = conv.members.map(id => { const brief = userBrief(id); return brief ? { ...brief, role: convRole(conv, id) } : null; }).filter(Boolean);
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
    member_count: conv.members.length, members: memberBriefs, my_role: convRole(conv, viewerId), avatar_url: conv.avatar_url || '', official: !!conv.official, e2ee: e2eeEnforcedSync() && e2eeRoomTargeted(conv),
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
      { id: 't6', label: '🌐 공식 웹사이트', icon: '🌐', action: { type: 'uri', uri: publicBaseUrl() } }
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
// F16: D1-backed flags; the seed list above is the default overlay.
async function listFeatureFlags() {
  const out = featureFlags.map(f => ({ ...f }));
  const db = dbOf();
  if (!db) return out;
  await ensureSchema();
  const rows = (await db.prepare('SELECT key, enabled, description FROM luno_feature_flags').all().catch(() => ({ results: [] }))).results || [];
  for (const r of rows) {
    const t = out.find(f => f.key === r.key);
    if (t) { t.enabled = Number(r.enabled) === 1; if (r.description) t.description = r.description; }
    else out.push({ key: r.key, enabled: Number(r.enabled) === 1, description: r.description || '' });
  }
  return out;
}
async function saveFeatureFlag(key, enabled) {
  const target = featureFlags.find(f => f.key === key);
  if (target) target.enabled = enabled; else featureFlags.push({ key, enabled, description: '' });
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  await db.prepare('INSERT INTO luno_feature_flags (key, enabled, description, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at')
    .bind(key, enabled ? 1 : 0, (target && target.description) || '', now()).run();
}

// ---------- E2 (F11): E2EE directory + enforcement ----------
// Identity format: base64url(X25519 32B) + "." + base64url(Ed25519 32B).
function e2eeIdentityParts(s) {
  if (typeof s !== 'string') return null;
  const parts = s.split('.');
  if (parts.length !== 2) return null;
  try {
    const x = pkB64Decode(parts[0]), ed = pkB64Decode(parts[1]);
    if (x.length !== 32 || ed.length !== 32) return null;
    return { x, ed };
  } catch { return null; }
}
// Server-side prekey check (defense in depth; clients always verify bundles
// before use). Returns true/false when well-formed, null when the bundle
// predates the dotted identity format (stored unverified, as before).
async function e2eeVerifyPrekeySig(identityKey, signedPrekey, sig) {
  const id = e2eeIdentityParts(identityKey);
  if (!id || typeof signedPrekey !== 'string' || !signedPrekey || typeof sig !== 'string' || !sig) return null;
  try {
    const spk = pkB64Decode(signedPrekey), s = pkB64Decode(sig);
    const key = await crypto.subtle.importKey('raw', id.ed, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, s, spk);
  } catch { return null; }
}
// E5: enforcement follows the env switch only, so the room flag below
// (sync, read from the same switch) can never disagree with it. The
// admin-console flag entry is display-only (E10 updates its wording).
function e2eeEnforcedSync() {
  return String((typeof CURRENT_ENV !== 'undefined' && CURRENT_ENV && CURRENT_ENV.E2EE_ENFORCED) || '').toLowerCase() === 'true';
}
async function e2eeEnforced() {
  return e2eeEnforcedSync();
}
// Rooms whose new messages must be ciphertext: 1:1 / group / self rooms
// with no bot member. Official rooms are read-only elsewhere; openchat,
// feed and stories never pass through conversations.
function e2eeRoomTargeted(conv) {
  if (!conv || conv.official || conv.kind === 'official') return false;
  if (conv.kind !== 'direct' && conv.kind !== 'group' && conv.kind !== 'self' && conv.kind !== 'keep') return false;
  for (const id of conv.members || []) {
    const u = usersById.get(id);
    if (u && userKind(u) === 'bot') return false;
  }
  return true;
}
const E2EE_INTRO_BODY = '이 시점부터 종단 간 암호화됩니다';
async function e2eeEnsureIntroNotice(cid, conv) {
  try {
    const db = dbOf();
    if (db) {
      await ensureSchema();
      const hit = await db.prepare("SELECT 1 AS x FROM luno_messages WHERE conversation_id = ? AND kind = 'system' AND body = ? LIMIT 1").bind(cid, E2EE_INTRO_BODY).first().catch(() => null);
      if (hit) return;
    } else if ((messages.get(cid) || []).some(m => m.kind === 'system' && m.body === E2EE_INTRO_BODY)) {
      return;
    }
    if (conv && conv._durable) await pushPersistent(cid, conv.owner_id, { kind: 'system', body: E2EE_INTRO_BODY });
    else pushMessage(cid, 'system', { kind: 'system', body: E2EE_INTRO_BODY });
  } catch { /* the marker must never break sending */ }
}
async function e2eeAnnounceKeyChange(userId, deviceId, action = 'changed') {
  try { await hydrateDurableConversations(userId); } catch { /* memory only */ }
  const bodies = { changed: '보안 키가 변경되었습니다', added: '새 기기가 추가되었습니다', removed: '기기가 삭제되었습니다' };
  const rooms = Array.from(conversations.values()).filter(c => (c.members || []).includes(userId) && e2eeRoomTargeted(c));
  for (const room of rooms) {
    const fields = { kind: 'security_notice', body: bodies[action] || bodies.changed, metadata: { user_id: userId, device_id: deviceId, e2ee_action: action } };
    try {
      if (room._durable) await pushPersistent(room.id, userId, fields);
      else pushMessage(room.id, userId, fields);
    } catch { /* one room must not block the rest */ }
  }
  const auditAction = action === 'changed' ? 'e2ee.key_change' : `e2ee.device_${action}`;
  try { await persistAudit(userId, auditAction, userId, { device_id: deviceId }); } catch { /* audit never blocks */ }
}

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
      logx('error', 'hub push failed', { user_id: userId, error: err && err.message ? err.message : String(err) });
      return 0;
    }
  }));
  return results.reduce((a, b) => a + b, 0);
}

// P0-5: group-call rooms live in per-room Durable Objects (one stub per
// conversation id), so joins and signals agree on every isolate. Without
// the GROUP_CALLS binding (unit tests, local dev) the previous
// per-isolate Map path stands unchanged.
function groupCallsBinding() {
  return CURRENT_ENV && CURRENT_ENV.GROUP_CALLS ? CURRENT_ENV.GROUP_CALLS : null;
}
async function groupRoomFetch(roomId, path, body) {
  const ns = groupCallsBinding();
  const stub = ns.get(ns.idFromName(String(roomId)));
  const res = await stub.fetch(`https://group-call.internal${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
async function trackGroupCallSeat(userId, roomId) {
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  await db.prepare('INSERT OR IGNORE INTO luno_group_call_seats (user_id, room_id, joined_at) VALUES (?, ?, ?)').bind(userId, roomId, Date.now()).run().catch(() => null);
}
async function untrackGroupCallSeat(userId, roomId) {
  const db = dbOf();
  if (!db) return;
  await db.prepare('DELETE FROM luno_group_call_seats WHERE user_id = ? AND room_id = ?').bind(userId, roomId).run().catch(() => null);
}
// P0-5: a dropped socket vacates every group seat of its user. With the
// binding the seat directory (D1) names the rooms, so seats die on all
// isolates; without it the legacy local sweep stands. Takes env
// explicitly so tests can drive it (exported below).
async function groupCallSeatSweep(env, userId) {
  const ns = env && env.GROUP_CALLS ? env.GROUP_CALLS : null;
  const db = env && env.DB ? env.DB : null;
  if (!ns || !db) {
    for (const [rid, peers] of groupCallRooms) {
      if (peers.has(userId)) {
        peers.delete(userId);
        sendTo(Array.from(peers), { type: 'call.group.user_left', room_id: rid, user_id: userId });
      }
    }
    return { swept: true };
  }
  await ensureSchema();
  const { results } = await db.prepare('SELECT room_id FROM luno_group_call_seats WHERE user_id = ?').bind(userId).all().catch(() => ({ results: [] }));
  for (const row of results || []) {
    try {
      const stub = ns.get(ns.idFromName(String(row.room_id)));
      const res = await stub.fetch('https://group-call.internal/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const left = await res.json().catch(() => ({}));
      if (res.status === 200 && left && left.left) {
        sendTo(left.participants || [], { type: 'call.group.user_left', room_id: row.room_id, user_id: userId });
      }
    } catch { /* a dead room leaves nothing behind */ }
  }
  await db.prepare('DELETE FROM luno_group_call_seats WHERE user_id = ?').bind(userId).run().catch(() => null);
  return { swept: true };
}

// Every call site is synchronous fire-and-forget. Keep that contract and let the
// runtime finish the delivery after the response has been returned.
function hubFanOut(userIds, payload) {
  if (!hubBinding()) return;
  const task = hubDeliver(userIds, payload);
  if (CURRENT_CTX && typeof CURRENT_CTX.waitUntil === 'function') CURRENT_CTX.waitUntil(task);
  else task.catch(() => {});
}

// The recipients of a broadcast: conversation members. (D4 removed the
// community-room branch with the duplicate handlers; community fanout goes
// through sendTo with D1 membership.)
function broadcastRecipients(payload) {
  const conversationId = payload.conversation_id || callSessions.get(payload.call_id)?.conversation_id;
  const conversation = conversations.get(conversationId);
  if (conversation) return conversation.members || [];
  return [];
}

async function announceProfileChange(userId) {
  const ids = new Set();
  const db = dbOf();
  if (db) {
    try {
      const { results } = await db.prepare('SELECT user_id AS id FROM friends WHERE friend_id = ? UNION SELECT friend_id AS id FROM friends WHERE user_id = ? UNION SELECT m2.user_id AS id FROM luno_conversation_members m1 JOIN luno_conversation_members m2 ON m2.conversation_id = m1.conversation_id WHERE m1.user_id = ?').bind(userId, userId, userId).all();
      for (const row of results || []) if (row.id) ids.add(row.id);
    } catch {}
  }
  for (const id of friendIds(userId)) ids.add(id);
  for (const conv of conversations.values()) if ((conv.members || []).includes(userId)) for (const m of conv.members) ids.add(m);
  const payload = { type: 'profile.updated', user_id: userId };
  for (const id of ids) notifyUser(id, payload);
  if (!ids.has(userId)) notifyUser(userId, payload);
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
  if (!conversation) return;
  for (const [ws, userId] of activeSockets) {
    if (!conversation.members.includes(userId)) continue;
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
    // F24: operator-provisioned accounts carry current-version consent from
    // birth (age never verified: null, like any grandfathered account).
    userConsents.set(s.id, { terms: LEGAL_VERSIONS.terms, privacy: LEGAL_VERSIONS.privacy, age14: null, at: now() });
  }
  // Demo identities are explicitly public: email search finds them.
  for (const s of seeds) {
    if (s.role !== 'admin') userPrefs.set(s.id, { ...DEFAULT_PREFS, searchable_by_email: true });
  }


  // D4: the room-1 openchat seed moved to D1 (seedDemoRoom in boot(), still
  // DEMO_MODE-only); community rooms no longer have a memory store.
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

// F27: single public base address. Env PUBLIC_BASE_URL wins; the default is
// the current production host. CORS and every absolute self-link derive
// from this one value (no other host literals in this file). STANDALONE_HOSTS
// stays explicit opt-in per the hostname-gate security contract.
const DEFAULT_PUBLIC_BASE_URL = 'https://lunotalk.com';
function publicBaseUrl(env) {
  const src = env || (typeof CURRENT_ENV !== 'undefined' ? CURRENT_ENV : null);
  const v = String((src && src.PUBLIC_BASE_URL) || DEFAULT_PUBLIC_BASE_URL).trim().replace(/\/+$/, '');
  return v || DEFAULT_PUBLIC_BASE_URL;
}
function publicBaseOrigin(env) {
  try { return new URL(publicBaseUrl(env)).origin; } catch { return new URL(DEFAULT_PUBLIC_BASE_URL).origin; }
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
  if (origin === publicBaseOrigin(env)) return origin;
  const list = String((env && env.ALLOWED_ORIGINS) || '').split(',').map(s => s.trim()).filter(Boolean);
  return list.includes(origin) ? origin : '';
}
// ---------- Front page language (lunotalk.com) ----------
// Kept equal to apps/user-web/src/site-i18n.ts SITE_LANGS (scripts/site_lang.test.mjs).
const SITE_LANGS = ['ko', 'en', 'ja', 'zh', 'zh-tw', 'th', 'vi', 'id', 'ms', 'hi', 'ar', 'es', 'pt', 'fr', 'de', 'it', 'ru', 'tr'];
// Countries with one clear language. Multilingual or English-first markets
// (IN, PH, SG, CA, CH, BE, LU, ...) are left out on purpose: the browser
// language decides there.
const COUNTRY_SITE_LANG = (() => {
  const map = {};
  const put = (lang, codes) => { for (const c of codes.split(' ')) map[c] = lang; };
  put('ko', 'KR');
  put('ja', 'JP');
  put('zh', 'CN');
  put('zh-tw', 'TW HK MO');
  put('th', 'TH');
  put('vi', 'VN');
  put('id', 'ID');
  put('ms', 'MY BN');
  put('ar', 'SA AE EG QA KW BH OM JO LB IQ SY YE PS LY TN DZ MA SD MR');
  put('es', 'ES MX AR CO CL PE VE EC GT CU BO DO HN PY SV NI CR PA UY PR GQ');
  put('pt', 'BR PT AO MZ CV GW ST TL');
  put('fr', 'FR MC SN CI CM ML BF NE TG BJ GA CG CD MG HT GN TD CF DJ KM');
  put('de', 'DE AT LI');
  put('it', 'IT SM VA');
  put('ru', 'RU BY KZ KG TJ');
  put('tr', 'TR');
  put('en', 'US GB AU NZ IE ZA NG KE GH UG TZ ZW ZM JM TT');
  return map;
})();
function siteLangFromTag(tag) {
  const t = String(tag || '').toLowerCase().trim();
  if (!t) return null;
  if (t.startsWith('zh')) return /(tw|hk|mo|hant)/.test(t) ? 'zh-tw' : 'zh';
  if (SITE_LANGS.includes(t)) return t;
  const primary = t.split('-')[0];
  if (primary === 'fil' || primary === 'tl') return 'en';
  return SITE_LANGS.includes(primary) ? primary : null;
}
function siteLangFor(request) {
  const saved = cookieValue(request, 'luno_lang');
  if (saved && SITE_LANGS.includes(saved)) return saved;
  // The lunotalk.com relay forwards the visitor's country (its own fetch to
  // this worker would otherwise geolocate to the relay's data centre).
  const country = String(request.headers.get('X-Luno-Country') || (request.cf && request.cf.country) || request.headers.get('CF-IPCountry') || '').toUpperCase();
  if (COUNTRY_SITE_LANG[country]) return COUNTRY_SITE_LANG[country];
  const accept = String(request.headers.get('Accept-Language') || '');
  const tags = accept.split(',').map(part => { const [tag, q] = part.trim().split(';q='); return { tag, q: q === undefined ? 1 : Number(q) || 0 }; })
    .filter(x => x.tag && x.q > 0).sort((a, b) => b.q - a.q);
  for (const { tag } of tags) { const lang = siteLangFromTag(tag); if (lang) return lang; }
  return 'en';
}
function siteLangRedirect(request) {
  const url = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: { Location: `/${siteLangFor(request)}${url.search}`, 'Cache-Control': 'no-store', Vary: 'Cookie, Accept-Language' },
  });
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
  // F19: null/undefined maxAge yields a session cookie (no Max-Age) for
  // logins without "stay signed in"; 0 still expires (logout).
  const age = (maxAge === null || maxAge === undefined) ? '' : `; Max-Age=${maxAge}`;
  return `luno_refresh=${token}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Strict; Path=/${age}`;
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
    } else if ((res.headers.get('Content-Type') || '').toLowerCase().includes('text/html')) {
      // F19: shipped HTML (app shell, consoles, landing) runs scripts and
      // styles from self only, never frames, and leaks no referrer path.
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"); // fonts: luno-v2.css @import (first-party design dependency)
      headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
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

// F2: mail/SMS driver adapter. mock/log are test doubles; P0-1 adds the
// real senders (resend mail, twilio SMS). Without their keys the driver
// resolves to none and every route fails closed exactly as before.
// In workerd the "file" is the worker log (dashboard/tail); tests observe
// deliveries through the outbox seams (mock/log) or a stubbed fetch.
function resolveMailDriver(env) {
  const provider = env.RECOVERY_MAIL_PROVIDER;
  if (provider === 'mock' || provider === 'log') return provider;
  if (provider === 'resend' && env.RESEND_API_KEY) return 'resend';
  return 'none';
}
function resolveSmsDriver(env) {
  const provider = env.SMS_PROVIDER;
  if (provider === 'mock' || provider === 'log') return provider;
  if (provider === 'twilio' && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM) return 'twilio';
  return 'none';
}
// P0-1: Resend mail send. Throws on transport/API failure (callers fail
// closed); returns the provider id. Needs the RESEND_API_KEY secret and
// a verified MAIL_FROM domain (SPF/DKIM/DMARC) — representative action.
async function resendSend(env, entry) {
  const from = env.MAIL_FROM || 'LUNO <noreply@lunotalk.com>';
  const recovery = entry.purpose === 'recovery';
  const subject = recovery ? '[LUNO] 비밀번호 재설정 안내' : '[LUNO] 이메일 인증번호';
  const text = recovery
    ? `LUNO 비밀번호 재설정 요청이 접수되었습니다.\n\n아래 코드를 15분 안에 입력해 주세요:\n${entry.code}\n\n본인이 요청하지 않았다면 이 메일을 무시해 주세요.`
    : `LUNO 이메일 인증번호입니다. 15분 안에 입력해 주세요:\n${entry.code}`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [entry.email], subject, text }),
  });
  if (!res.ok) throw new Error(`resend send failed: ${res.status}`);
  const sent = await res.json().catch(() => ({}));
  return sent && sent.id ? String(sent.id) : '';
}
// P0-1: Twilio SMS send. Throws on transport/API failure. Needs the
// TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM secrets.
async function twilioSend(env, entry) {
  const sid = env.TWILIO_ACCOUNT_SID;
  const body = new URLSearchParams({ To: entry.phone, From: env.TWILIO_FROM, Body: `[LUNO] 인증번호: ${entry.code} (3분 유효)` });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${sid}:${env.TWILIO_AUTH_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`twilio send failed: ${res.status}`);
  const sent = await res.json().catch(() => ({}));
  return sent && sent.sid ? String(sent.sid) : '';
}
// Deliver one code; returns false on none (caller decides quiet vs closed).
// Real sends push a redacted record (provider id only — never the
// recipient or code) and the outbox is capped so production never grows it.
async function deliverCode(env, driver, outbox, entry) {
  if (driver === 'none') return false;
  // F22: recipient addresses never reach logs (outbox seam keeps them for tests).
  if (driver === 'log') logx('info', 'code delivered', { channel: entry.channel, purpose: entry.purpose });
  let providerId = '';
  if (driver === 'resend') providerId = await resendSend(env, entry);
  if (driver === 'twilio') providerId = await twilioSend(env, entry);
  if (driver === 'resend' || driver === 'twilio') {
    logx('info', 'code delivered', { channel: entry.channel, purpose: entry.purpose, provider: driver, provider_id: providerId });
    outbox.push({ channel: entry.channel, purpose: entry.purpose, provider: driver, provider_id: providerId, created_at: Date.now() });
  } else {
    outbox.push({ ...entry, created_at: Date.now() });
  }
  while (outbox.length > 500) outbox.shift();
  return true;
}
// S1: recovery mail fails closed without a driver (501 at the route).
async function sendRecoveryMail(env, email, code) {
  if (!await deliverCode(env, resolveMailDriver(env), recoveryMailOutbox, { channel: 'mail', purpose: 'recovery', email, code })) {
    throw new Error(`recovery mail provider not implemented: ${env.RECOVERY_MAIL_PROVIDER}`);
  }
}
// F1: verification mail. Callers pre-check the provider (quiet/auto paths),
// so reaching here without one is a bug.
function verificationProvider(env) {
  return resolveMailDriver(env) === 'none' ? null : resolveMailDriver(env);
}
async function sendVerificationMail(env, email, code) {
  if (!await deliverCode(env, resolveMailDriver(env), verificationMailOutbox, { channel: 'mail', purpose: 'verify', email, code })) {
    throw new Error('verification mail provider not configured');
  }
}
async function sendSms(env, phone, code) {
  if (!await deliverCode(env, resolveSmsDriver(env), smsOutbox, { channel: 'sms', purpose: 'login', phone, code })) {
    throw new Error('sms provider not configured');
  }
}
function newEmailCode() {
  return String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
}
// Authentication is session-backed only: a token is valid iff its digest exists in D1 (or the
// in-memory store when no D1 is bound), has not been revoked and is inside its TTL. The old
// stateless "cf-token-<userId>.*" fallback accepted any forged token and is removed.
function cacheUserRow(row, granted) {
  const u = applyStoredPassword({
    id: row.id, email: row.email, handle: row.handle || '', birthday: row.birthday || '',
    display_name: row.display_name || row.email.split('@')[0], role: granted,
    phone: row.phone_number || '', phone_verified: row.phone_verified ? 1 : 0, phone_hmac: row.phone_hmac || '', contact_consent_at: row.contact_consent_at || '',
    bio: row.bio || '', status_message: row.status_message || '', avatar_url: row.avatar_url || '', cover_url: row.cover_url || '', avatar_color: row.avatar_color || '#4F7CFF', plan: row.plan || 'personal', created_at: row.created_at,
    state: row.state || undefined, kind: row.kind || 'user', email_verified: row.email_verified === 0 ? 0 : 1,
    deleted_at: row.deleted_at || '', deletion_reason: row.deletion_reason || ''
  }, row.password_hash);
  if (isEnvAdmin(u.id)) u.role = 'admin';
  users.set(row.email.toLowerCase(), u);
  usersById.set(u.id, u);
  hydrateUserPrefs(u.id, row.prefs_json);
  return u;
}
async function loadUserFromD1(id, knownRole) {
  const db = dbOf();
  if (!db) return null;
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!row) return null;
  const u = applyStoredPassword({
    id: row.id, email: row.email, handle: row.handle || '', birthday: row.birthday || '',
    display_name: row.display_name || row.email.split('@')[0], role: knownRole === undefined ? await storedUserRole(row.id) : knownRole,
    phone: row.phone_number || '', phone_verified: row.phone_verified ? 1 : 0, phone_hmac: row.phone_hmac || '', contact_consent_at: row.contact_consent_at || '',
    bio: row.bio || '', status_message: row.status_message || '', avatar_url: row.avatar_url || '', cover_url: row.cover_url || '', avatar_color: row.avatar_color || '#4F7CFF', plan: row.plan || 'personal', created_at: row.created_at,
    state: row.state || undefined, kind: row.kind || 'user', email_verified: row.email_verified === 0 ? 0 : 1,
    deleted_at: row.deleted_at || '', deletion_reason: row.deletion_reason || ''
  }, row.password_hash);
  users.set(row.email.toLowerCase(), u);
  usersById.set(u.id, u);
  hydrateUserPrefs(u.id, row.prefs_json);
  return u;
}
// D7: batch-cache user rows by id (room members, message senders, authors).
const profileFreshAt = new Map();
async function refreshCachedProfiles(ids) {
  const db = dbOf();
  if (!db) return;
  const env = typeof CURRENT_ENV !== 'undefined' ? CURRENT_ENV : null;
  const ttl = Number(env && env.PROFILE_REFRESH_MS !== undefined ? env.PROFILE_REFRESH_MS : 15000);
  const at = Date.now();
  const stale = [...new Set(ids || [])].filter(id => id && usersById.has(id) && !officialAccounts.has(id) && !(at - (profileFreshAt.get(id) || 0) < ttl));
  if (!stale.length) return;
  for (const id of stale) profileFreshAt.set(id, at);
  const ph = stale.map(() => '?').join(',');
  const r = await db.prepare(`SELECT id, display_name, handle, bio, status_message, avatar_url, cover_url, avatar_color FROM users WHERE id IN (${ph})`).bind(...stale).all().catch(() => null);
  for (const row of (r && r.results) || []) {
    const u = usersById.get(row.id);
    if (!u) continue;
    if (row.display_name) u.display_name = row.display_name;
    u.handle = row.handle || '';
    u.bio = row.bio || '';
    u.status_message = row.status_message || '';
    u.avatar_url = row.avatar_url || '';
    u.cover_url = row.cover_url || '';
    u.avatar_color = row.avatar_color || '#4F7CFF';
  }
}
async function hydrateUsersByIds(ids) {
  const missing = [...new Set(ids || [])].filter(id => id && !usersById.has(id) && !officialAccounts.has(id));
  if (!missing.length) { await refreshCachedProfiles(ids); return; }
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  await refreshCachedProfiles(ids);
  for (const id of missing) profileFreshAt.set(id, Date.now());
  const ph = missing.map(() => '?').join(',');
  let rows = null;
  if (!rolesTableAbsent) {
    try {
      const r = await db.prepare(`SELECT u.*, gr.role AS granted_role FROM users u LEFT JOIN luno_user_roles gr ON gr.user_id = u.id WHERE u.id IN (${ph})`).bind(...missing).all();
      rows = r.results || [];
    } catch (error) {
      if (!missingRolesTable(error)) throw error;
    }
  }
  if (!rows) {
    const r = await db.prepare(`SELECT * FROM users WHERE id IN (${ph})`).bind(...missing).all();
    rows = r.results || [];
  }
  for (const row of rows) cacheUserRow(row, grantedRole(row.granted_role));
}
// A-2: login-time D1 lookup by any identifier (email/handle/phone). The D1
// row is authoritative: password changes, bans and deletions made on another
// isolate are visible to this login. Returns null when D1 has no such user,
// in which case the caller keeps its memory result (bootstrap seeds).
// D7: D1 fallback for friend-add lookup now that boot no longer caches all
// users. Preference order mirrors the memory path (handle, searchable
// email, display name); H4 removes the display-name leg.
async function findUserByHandleOrEmail(h) {
  const db = dbOf();
  if (!db || !h) return null;
  await ensureSchema();
  const byHandle = await db.prepare('SELECT id FROM users WHERE LOWER(handle) = ?').bind(h).first().catch(() => null);
  if (byHandle) return loadUserFromD1(byHandle.id, undefined);
  const byEmail = await db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').bind(h).first().catch(() => null);
  if (byEmail) {
    const u = await loadUserFromD1(byEmail.id, undefined);
    if (u && prefsOf(u.id).searchable_by_email) return u;
  }
  // H4: no display-name fallback — the function finally matches its name.
  return null;
}
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
// F16: a suspension with a past expiry lifts itself; permanent bans
// (expires_at = 0) never auto-lift, and warn-only states have no row.
const F22_SECRET_CONTAINS = ['password', 'passwd', 'secret', 'token', 'credential', 'otp', 'captcha', 'apikey', 'api_key', 'privatekey', 'private_key', 'cookie', 'authorization', 'authtoken', 'sdp'];
const F22_SECRET_EXACT = ['code', 'pin'];
const F22_BODY_EXACT = ['body', 'text', 'message', 'content', 'caption', 'bio', 'status_message', 'statusmessage'];
const F22_EMAIL_EXACT = ['email', 'emails', 'email_address'];
function f22IsSecretKey(lower) {
  if (F22_SECRET_EXACT.includes(lower)) return true;
  return F22_SECRET_CONTAINS.some(part => lower.includes(part));
}
function f22ScrubText(value) {
  return String(value)
    .replace(/Bearer [A-Za-z0-9\-._~+/]+=*/g, 'Bearer [redacted]')
    .replace(/cf-(?:token|refresh)-[0-9a-fA-F-]+/g, '[token]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]*){0,2}/g, '[jwt]')
    .replace(/-----BEGIN [^-]+-----[^-]*-----END [^-]+-----/g, '[private-key]');
}
function maskTelemetryValue(value, seen, depth) {
  seen = seen || new Set();
  depth = depth || 0;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return f22ScrubText(value);
  if (typeof value !== 'object') return value;
  if (depth > 10) return '[depth]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  let out;
  if (Array.isArray(value)) {
    out = value.map(v => maskTelemetryValue(v, seen, depth + 1));
  } else {
    out = {};
    for (const key of Object.keys(value)) {
      const lower = key.toLowerCase();
      const v = value[key];
      if (f22IsSecretKey(lower)) out[key] = typeof v === 'string' ? '[redacted]' : v;
      else if (F22_BODY_EXACT.includes(lower)) out[key] = typeof v === 'string' ? `[text len=${v.length}]` : maskTelemetryValue(v, seen, depth + 1);
      else if (F22_EMAIL_EXACT.includes(lower)) out[key] = typeof v === 'string' ? '[email]' : v;
      else out[key] = maskTelemetryValue(v, seen, depth + 1);
    }
  }
  seen.delete(value);
  return out;
}
// Worker log lines get the value-pattern scan (never key rules: free text).
function logSafe(value) {
  try {
    return f22ScrubText(typeof value === 'string' ? value : (value && value.stack) || String(value));
  } catch { return '[unloggable]'; }
}
// F22: structured log line, always with the request id. `extra` gets full
// key-based masking, so callers may pass small context objects freely.
function logx(level, event, extra) {
  try {
    const line = { ts: now(), rid: CURRENT_RID || '-', level, event };
    if (extra !== undefined) line.extra = maskTelemetryValue(extra);
    if (level === 'error') console.error(JSON.stringify(line));
    else console.log(JSON.stringify(line));
  } catch { /* logging must never throw */ }
}
async function suspensionExpired(userId) {
  const db = dbOf();
  if (!db || !userId) return false;
  const row = await db.prepare('SELECT expires_at FROM user_bans WHERE user_id = ?').bind(userId).first().catch(() => null);
  if (!row) return false;
  const exp = Number(row.expires_at || 0);
  return exp > 0 && exp <= Date.now();
}
async function healExpiredSuspension(userId) {
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  await db.prepare("UPDATE users SET state = 'active' WHERE id = ?").bind(userId).run();
  await db.prepare('DELETE FROM user_bans WHERE user_id = ?').bind(userId).run();
  const u = usersById.get(userId);
  if (u) u.state = 'active';
}
// Privilege assignments are provisioned separately by an authorized operator.
// Email, demo seed data and the role copied into an old session are not grants.
const GRANTABLE_ROLES = ['user', 'admin', 'partner', 'developer', 'creator', 'ads'];
function grantedRole(role) { return GRANTABLE_ROLES.includes(role) ? role : 'user'; }
// F6: group roles. The owner rides the room; admins ride conv.admins
// (memory) and the member role column (D1). Direct rooms have no admins.
function convRole(conv, userId) {
  if (!conv || conv.kind !== 'group') return 'member';
  if (conv.owner_id === userId) return 'owner';
  if ((conv.admins || []).includes(userId)) return 'admin';
  return 'member';
}
function convPrivileged(conv, userId) {
  const r = convRole(conv, userId);
  return r === 'owner' || r === 'admin';
}
// L-01: account kind. Anything that is not an issued bot is a human user,
// including seeds, peers and rows that predate the kind column.
function userKind(u) { return u && u.kind === 'bot' ? 'bot' : 'user'; }
// S2 handle rules shared by public register and admin bot issuance.
// Returns 'shape' | 'reserved' | null (usable).
function handleRuleError(h) {
  if (!/^[a-z0-9_.]{3,20}$/.test(h)) return 'shape';
  if (RESERVED_HANDLES.has(h) || RESERVED_PEER_PREFIX.test(h)) return 'reserved';
  return null;
}
async function handleTaken(h) {
  if (Array.from(users.values()).some(u => (u.handle || '').toLowerCase() === h)) return true;
  const db = dbOf();
  if (db) {
    const row = await db.prepare('SELECT id FROM users WHERE LOWER(handle) = ?').bind(h).first().catch(() => null);
    if (row) return true;
  }
  return false;
}
async function allocateHandle(prefix) {
  for (let tries = 0; tries < 5; tries++) {
    const candidate = `${prefix}${crypto.randomUUID().slice(0, 6)}`;
    if (!(await handleTaken(candidate))) return candidate;
  }
  return '';
}
// L-17: master switch (default off) plus room/user allowlist. Routing (L-02)
// requires the switch AND a listed room AND a listed author — fail closed on
// every leg, including a missing database.
function llmEnabled() { return String(CURRENT_ENV?.LLM_ENABLED || '').toLowerCase() === 'true'; }
async function botAllowListed(kind, refId) {
  const db = dbOf();
  if (!db || !refId) return false;
  await ensureSchema();
  const row = await db.prepare('SELECT ref_id FROM luno_bot_allowlist WHERE kind = ? AND ref_id = ?').bind(kind, refId).first().catch(() => null);
  return !!row;
}
async function botMayAct(roomId, authorId) {
  if (!llmEnabled()) return false;
  if (await botKilled()) return false;
  if (!(await botAllowListed('room', roomId))) return false;
  return botAllowListed('user', authorId);
}
// L-09: daily cost caps per bot live in the caps block at the top of this
// file (F23: next to the H2/T1 caps); only the counters stay here.
function botDayUTC(d = new Date()) { return d.toISOString().slice(0, 10); }
async function botUsage(botId, day) {
  const db = dbOf();
  if (!db) return { requests: 0, tokens: 0 };
  await ensureSchema();
  const row = await db.prepare('SELECT requests, tokens FROM luno_bot_usage WHERE bot_id = ? AND day = ?').bind(botId, day).first().catch(() => null);
  return { requests: Number(row?.requests || 0), tokens: Number(row?.tokens || 0) };
}
async function botQuotaOk(botId) {
  const u = await botUsage(botId, botDayUTC());
  return u.requests < BOT_DAILY_REQUESTS && u.tokens < BOT_DAILY_TOKENS;
}
async function botKilled() {
  const db = dbOf();
  if (!db) return false;
  await ensureSchema();
  const row = await db.prepare('SELECT value FROM luno_bot_config WHERE key = ?').bind('kill').first().catch(() => null);
  return row?.value === '1';
}
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
// A1: operator-configured administrators (comma-separated user ids). Ids, not
// emails: without email verification anyone could squat an admin address.
// The luno_user_roles table stays authoritative alongside this list.
function isEnvAdmin(userId) {
  if (!userId) return false;
  const ids = String(CURRENT_ENV?.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return ids.includes(userId);
}
async function storedUserRole(userId) {
  if (isEnvAdmin(userId)) return 'admin';
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
  if (token.startsWith('cf-bot-')) return authBotToken(token);
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
    // F1: verification rides the same re-read so flips apply live.
    const standing = await db.prepare('SELECT state, email_verified FROM users WHERE id = ?').bind(userId).first().catch(() => null);
    const state = standing?.state || user?.state || 'active';
    if (user) user.state = state;
    if (user && standing && standing.email_verified !== undefined && standing.email_verified !== null) {
      user.email_verified = Number(standing.email_verified) === 0 ? 0 : 1;
    }
    // F16: an expired temporary suspension lifts itself on next use.
    if (user && state === 'suspended' && await suspensionExpired(userId)) {
      await healExpiredSuspension(userId);
      user.state = 'active';
    }
    if (!user || user.state === 'suspended' || user.state === 'deleted' || await isBanned(userId)) {
      sessions.delete(token);
      return null;
    }
  } else if (!user || user.state === 'suspended' || user.state === 'deleted') {
    return null;
  }
  if (db) user.role = grantedRoleFromSession;
  if (db && isEnvAdmin(userId)) user.role = 'admin';
  AUTH_CTX.set(request, { token, session_id: session.device_id });
  return user;
}

// L-06: scoped bot tokens. Verified against D1 on every request (no cache)
// so revoke and expiry bite immediately. Memory-only isolates fail closed.
async function authBotToken(token) {
  const db = dbOf();
  if (!db) return null;
  await ensureSchema();
  const row = await db.prepare('SELECT id, bot_id, rooms_json, ops_json, expires_at, revoked FROM luno_bot_tokens WHERE token_hash = ?').bind(await sha256Hex(token)).first().catch(() => null);
  if (!row || row.revoked || Number(row.expires_at) <= Date.now()) return null;
  const bot = usersById.get(row.bot_id) || await loadUserFromD1(row.bot_id, 'user');
  if (!bot || userKind(bot) !== 'bot') return null;
  const standing = await db.prepare('SELECT state FROM users WHERE id = ?').bind(row.bot_id).first().catch(() => null);
  const state = standing?.state || bot.state || 'active';
  if (state === 'suspended' || state === 'deleted' || await isBanned(row.bot_id)) return null;
  let rooms = [], ops = [];
  try { rooms = JSON.parse(row.rooms_json); ops = JSON.parse(row.ops_json); } catch { return null; }
  if (!Array.isArray(rooms) || !Array.isArray(ops)) return null;
  return { ...bot, role: 'user', kind: 'bot', botScope: { id: row.id, rooms, ops, expires_at: Number(row.expires_at) } };
}
function botScopeAllows(me, op, roomId) {
  const s = me && me.botScope;
  return !!s && s.ops.includes(op) && s.rooms.includes(roomId);
}
// Routes a bot token may touch at all; per-room/op scope is checked inside
// each handler. Everything else answers 403 for bots.
function isBotApiRoute(p, method) {
  if (/^conversations\/[\w-]+\/messages$/.test(p)) return method === 'GET' || method === 'POST';
  if (method === 'GET' && /^conversations\/[\w-]+$/.test(p)) return true;
  // L-08: runners re-read mention context through the delta sync (read op).
  if (method === 'GET' && /^conversations\/[\w-]+\/sync$/.test(p)) return true;
  if (method === 'GET' && p === 'bot/token') return true;
  if (method === 'POST' && p === 'bot/jobs/claim') return true;
  if (method === 'POST' && /^bot\/jobs\/[\w-]+\/complete$/.test(p)) return true;
  if (method === 'POST' && p === 'attachments') return true;
  return false;
}
// L-02: direct bot mentions become mention jobs — one per mentioned bot per
// message. Skipped when the switch/allowlist (L-17) denies, the bot is not a
// member, or the mention is '@all' (broadcasts never page bots).
async function routeBotMentions(conv, authorId, msg) {
  const mentions = (msg.metadata && Array.isArray(msg.metadata.mentions) ? msg.metadata.mentions : []).filter(x => x && x !== 'all');
  if (!mentions.length) return;
  if (!(await botMayAct(conv.id, authorId))) return;
  for (const targetId of new Set(mentions)) {
    if (!conv.members.includes(targetId)) continue;
    const target = usersById.get(targetId) || await loadUserFromD1(targetId, 'user');
    if (!target || userKind(target) !== 'bot') continue;
    if (!(await botQuotaOk(targetId))) continue;
    await enqueueBotJob({ botId: targetId, roomId: conv.id, kind: 'mention',
      payload: { message_id: msg.id, author_id: authorId, body: String(msg.body || '').slice(0, 4000) } });
  }
}
// PC agent: a slash command in an allow-listed room becomes one command job
// per target bot. Targets are the mentioned bots, or every bot member when
// nothing is mentioned (one runner merges those by message_id). A reply to
// a bot message counts as a command for that bot even without the slash.
// Returns true when the message was handled as a command (mention routing
// then stays out of the way, so one message never becomes two jobs).
function botCommandText(msg) {
  if (!msg || msg.kind !== 'text') return '';
  const body = String(msg.body || '').trim();
  if (body.startsWith('/')) return body;
  const mentions = msg.metadata && Array.isArray(msg.metadata.mentions) ? msg.metadata.mentions : [];
  if (!mentions.length) return '';
  const at = body.search(/(^|\s)\/[a-z]{2,12}!?(\s|$)/);
  return at < 0 ? '' : body.slice(at).trim();
}
async function routeBotCommands(conv, authorId, msg) {
  if (!msg || msg.kind !== 'text') return false;
  const author = usersById.get(authorId) || await loadUserFromD1(authorId, 'user');
  if (!author || userKind(author) === 'bot') return false;
  let text = botCommandText(msg);
  const mentions = (msg.metadata && Array.isArray(msg.metadata.mentions) ? msg.metadata.mentions : []);
  if (mentions.includes('all')) return false;
  let replyBot = '';
  if (!text && msg.reply_to) {
    const orig = (messages.get(conv.id) || []).find(x => x.id === msg.reply_to);
    const origSender = orig ? (usersById.get(orig.sender_id) || await loadUserFromD1(orig.sender_id, 'user')) : null;
    if (origSender && userKind(origSender) === 'bot') { replyBot = origSender.id; text = String(msg.body || '').trim(); }
  }
  if (!text) return false;
  if (!(await botMayAct(conv.id, authorId))) return false;
  const candidates = replyBot ? [replyBot] : (mentions.length ? [...new Set(mentions)] : conv.members);
  let queued = 0;
  for (const targetId of candidates) {
    if (targetId === authorId || !conv.members.includes(targetId)) continue;
    const target = usersById.get(targetId) || await loadUserFromD1(targetId, 'user');
    if (!target || userKind(target) !== 'bot') continue;
    if (!(await botQuotaOk(targetId))) continue;
    await enqueueBotJob({ botId: targetId, roomId: conv.id, kind: 'command',
      payload: { message_id: msg.id, author_id: authorId, body: text.slice(0, 4000), created_at: msg.created_at,
        ...(msg.reply_to ? { reply_to: msg.reply_to } : {}) } });
    queued++;
  }
  return queued > 0;
}
// PC agent presence: runners report ready/busy on every claim. One row per
// bot in luno_bot_config, rewritten at most every BOT_PRESENCE_WRITE_MS
// unless the state changed; a bot unseen for BOT_PRESENCE_TTL_MS is offline.
const BOT_PRESENCE_TTL_MS = 90 * 1000;
const BOT_PRESENCE_WRITE_MS = 25 * 1000;
const botPresenceCache = new Map();
function botPresenceView(bot, row) {
  let p = null;
  try { p = row && row.value ? JSON.parse(row.value) : null; } catch { p = null; }
  const at = Number(p && p.at) || 0;
  const online = at > 0 && Date.now() - at <= BOT_PRESENCE_TTL_MS;
  return {
    id: bot.id, display_name: bot.display_name || '', handle: bot.handle || '',
    state: online ? (p.state === 'busy' ? 'busy' : 'ready') : 'offline',
    detail: online ? String(p.detail || '') : '', queue: online ? (Number(p.queue) || 0) : 0,
    version: String((p && p.version) || ''), last_seen_at: at ? new Date(at).toISOString() : null
  };
}
async function botPresenceTouch(bot, input) {
  const db = dbOf();
  if (!db) return;
  const src = input && typeof input === 'object' ? input : {};
  const next = {
    state: src.state === 'busy' ? 'busy' : 'ready', detail: clip(String(src.detail || ''), 200),
    queue: Math.max(0, Math.min(999, Number.isInteger(src.queue) ? src.queue : 0)),
    version: clip(String(src.version || ''), 40), at: Date.now()
  };
  const prev = botPresenceCache.get(bot.id);
  const changed = !prev || prev.state !== next.state || prev.detail !== next.detail || prev.queue !== next.queue;
  if (!changed && next.at - prev.at < BOT_PRESENCE_WRITE_MS) return;
  botPresenceCache.set(bot.id, next);
  const value = JSON.stringify(next);
  await db.prepare('INSERT INTO luno_bot_config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = ?')
    .bind('presence:' + bot.id, value, value).run().catch(() => null);
  if (!changed) return;
  const view = botPresenceView(bot, { value });
  for (const roomId of (bot.botScope && bot.botScope.rooms) || []) {
    try {
      await hydrateConversation(roomId);
      if (conversations.get(roomId)) broadcast({ type: 'bot.presence', conversation_id: roomId, bot: view });
    } catch { /* presence fan-out never fails a claim */ }
  }
}
// S1 (blueprint 9-2): PC-off detection. Every claim records a throttled
// seen:<bot> heartbeat ({ at, rooms }); a 2-minute cron warns each work
// room once when its bot has been silent for over BOT_OFFLINE_WARN_MS.
// warned:<bot> dedups the warning until the next claim clears it.
const BOT_SEEN_WRITE_MS = 60 * 1000;
const BOT_OFFLINE_WARN_MS = 3 * 60 * 1000;
const KST_OFFSET_MS = 9 * 3600 * 1000;
const seenCache = new Map();
async function botSeenTouch(bot, rooms) {
  const db = dbOf();
  if (!db) return;
  const at = Date.now();
  const list = Array.isArray(rooms) ? rooms.filter((r) => typeof r === 'string' && r).slice(0, 50) : [];
  const roomsKey = list.join(',');
  const prev = seenCache.get(bot.id);
  if (prev && at - prev.at < BOT_SEEN_WRITE_MS && prev.roomsKey === roomsKey) return;
  seenCache.set(bot.id, { at, roomsKey });
  const value = JSON.stringify({ at, rooms: list });
  await db.prepare('INSERT INTO luno_bot_config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = ?')
    .bind('seen:' + bot.id, value, value).run().catch(() => null);
  await db.prepare('DELETE FROM luno_bot_config WHERE key = ?').bind('warned:' + bot.id).run().catch(() => null);
}
function offlineWarningBody(at) {
  const hhmm = new Date(at + KST_OFFSET_MS).toISOString().slice(11, 16);
  return `⚠️ 집 PC 응답 없음 (마지막 접속 ${hhmm}) — 정전·재부팅 확인 필요`;
}
async function sweepOfflineBots() {
  const db = dbOf();
  if (!db) return 0;
  if (!llmEnabled() || await botKilled()) return 0;
  await ensureSchema();
  const rows = await db.prepare("SELECT key, value FROM luno_bot_config WHERE key LIKE 'seen:%'").all().catch(() => null);
  const list = (rows && rows.results) || [];
  const nowMs = Date.now();
  let warned = 0;
  for (const row of list) {
    const botId = String(row.key).slice(5);
    let seen = null;
    try { seen = JSON.parse(row.value); } catch { seen = null; }
    const at = Number(seen && seen.at) || 0;
    if (!at || nowMs - at <= BOT_OFFLINE_WARN_MS) continue;
    const already = await db.prepare('SELECT value FROM luno_bot_config WHERE key = ?').bind('warned:' + botId).first().catch(() => null);
    if (already) continue;
    const rooms = Array.isArray(seen.rooms) ? seen.rooms.filter((r) => typeof r === 'string' && r) : [];
    const body = offlineWarningBody(at);
    for (const roomId of rooms) {
      try {
        await pushPersistent(roomId, botId, { kind: 'text', body, metadata: { offline_warning: true, last_seen_at: at } });
      } catch { /* one bad room never blocks the sweep */ }
    }
    await db.prepare('INSERT INTO luno_bot_config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = ?')
      .bind('warned:' + botId, String(nowMs), String(nowMs)).run().catch(() => null);
    warned++;
  }
  return warned;
}
// L-04: append one decision. Called by approvals (L-05) only. Returns the
// decision id, or null when the proposal was already decided.
async function recordDecision({ roomId, proposalMessageId, decidedBy, decision }) {
  const db = dbOf();
  if (!db) return null;
  if (decision !== 'approved' && decision !== 'rejected') return null;
  await ensureSchema();
  const id = uid();
  try {
    await db.prepare(`INSERT INTO luno_decisions (id, room_id, proposal_message_id, decided_by, decision, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))`).bind(id, roomId, proposalMessageId, decidedBy, decision).run();
  } catch (err) {
    if (/UNIQUE constraint|unique/i.test(String(err && err.message))) return null;
    throw err;
  }
  return id;
}
// L-07: enqueue one unit of bot work. Internal only — routing (L-02) calls
// it; runners use claim/complete. Returns the job id or null without D1.
async function enqueueBotJob({ botId, roomId, kind, payload, maxAttempts = 5 }) {
  const db = dbOf();
  if (!db) return null;
  await ensureSchema();
  const id = uid();
  await db.prepare(`INSERT INTO luno_bot_jobs (id, bot_id, room_id, kind, payload_json, status, attempts, max_attempts, lock_expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, 0, datetime('now'), datetime('now'))`)
    .bind(id, botId, roomId, kind, JSON.stringify(payload || {}), maxAttempts).run();
  return id;
}

// N1-L: notification funnel. notify(env, userIds, event) filters out the
// sender, users with notifications off, and muted rooms, then dispatches to
// the push provider. WS delivery of the underlying events (message.created,
// call.ringing) continues at the existing broadcast points, which connected
// clients already consume; this funnel adds the filtered provider leg.
// Providers: none (default) and log (D1 outbox for local verification).
// fcm: Firebase Cloud Messaging HTTP v1 (see the provider below).
const pushProviders = new Map();
function registerPushProvider(name, send) {
  pushProviders.set(name, send);
}
function activePushProvider(env) {
  const name = env && env.PUSH_PROVIDER;
  if (!name || name === 'none') return null;
  if (name === 'fcm' && !fcmServiceAccount(env)) return null;
  return pushProviders.get(name) || null;
}
// FCM: PUSH_PROVIDER=fcm plus the FCM_SERVICE_ACCOUNT_JSON secret (a service
// account key with the Firebase Cloud Messaging API Admin role). Without a
// usable key the provider stays inactive (fail closed: no push, no error).
// The worker signs an RS256 JWT, trades it for an OAuth token (cached until
// shortly before expiry) and sends one message per android/ios token. Tokens
// FCM reports as unregistered are deleted. Delivery runs after the response
// via ctx.waitUntil when a request context exists. The key, tokens and
// message bodies are never logged. Tests inject a stub via env.FCM_FETCH.
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
let fcmTokenCache = { key: '', token: '', exp: 0 };
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
async function fcmAccessToken(env, sa) {
  const nowS = Math.floor(Date.now() / 1000);
  if (fcmTokenCache.key === sa.client_email && fcmTokenCache.token && fcmTokenCache.exp - 300 > nowS) return fcmTokenCache.token;
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const enc = new TextEncoder();
  const header = fcmB64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = fcmB64url(enc.encode(JSON.stringify({ iss: sa.client_email, scope: FCM_SCOPE, aud: tokenUri, iat: nowS, exp: nowS + 3600 })));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${header}.${claims}`)));
  const doFetch = typeof env.FCM_FETCH === 'function' ? env.FCM_FETCH : fetch;
  const res = await doFetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${header}.${claims}.${fcmB64url(sig)}`,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.access_token !== 'string') throw new Error('fcm oauth failed');
  fcmTokenCache = { key: sa.client_email, token: data.access_token, exp: nowS + (Number(data.expires_in) || 3600) };
  return data.access_token;
}
function fcmTokenGone(status, data) {
  if (status === 404) return true;
  const details = (data && data.error && Array.isArray(data.error.details)) ? data.error.details : [];
  // Only UNREGISTERED: INVALID_ARGUMENT can also mean a malformed message,
  // and deleting every token on our own bug would silently kill push.
  return details.some((d) => d && d.errorCode === 'UNREGISTERED');
}
async function fcmDeliver(env, sa, targets, event) {
  const db = dbOf();
  if (!db) return { sent: 0 };
  await ensureSchema();
  const marks = targets.map(() => '?').join(',');
  const rows = (await db.prepare(`SELECT user_id, device_id, token FROM push_tokens WHERE platform IN ('android','ios') AND user_id IN (${marks})`)
    .bind(...targets).all().catch(() => ({ results: [] }))).results || [];
  if (rows.length === 0) return { sent: 0 };
  const access = await fcmAccessToken(env, sa);
  const doFetch = typeof env.FCM_FETCH === 'function' ? env.FCM_FETCH : fetch;
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`;
  const cid = String(event.conversation_id || '');
  const isCall = event.kind === 'call';
  let sent = 0;
  for (const row of rows) {
    const preview = prefsOf(row.user_id).notification_preview !== false;
    const message = (event.kind === 'call' || event.kind === 'call_end') ? fcmCallMessage(row.token, event) : {
      token: row.token,
      notification: { title: String(event.title || 'LUNO').slice(0, 100), body: preview ? String(event.body || '').slice(0, 200) : '새 알림' },
      data: { kind: String(event.kind || 'message'), conversation_id: cid },
      android: {
        priority: 'high',
        // Same (tag, id 0) identity the app's local notifier uses, so a socket
        // notification and this push replace each other instead of stacking.
        notification: { channel_id: isCall ? 'luno_calls' : 'luno_messages', tag: isCall ? 'luno-call' : `luno-room-${cid}` },
      },
    };
    try {
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
        body: JSON.stringify({ message }),
      });
      if (res.ok) { sent++; continue; }
      const data = await res.json().catch(() => ({}));
      if (fcmTokenGone(res.status, data)) {
        await db.prepare('DELETE FROM push_tokens WHERE user_id = ? AND device_id = ? AND token = ?').bind(row.user_id, row.device_id, row.token).run().catch(() => null);
      }
    } catch { /* one bad token never blocks the rest */ }
  }
  return { sent };
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
registerPushProvider('fcm', async (env, targets, event) => {
  const sa = fcmServiceAccount(env);
  if (!sa) return;
  const task = fcmDeliver(env, sa, targets, event).catch(() => ({ sent: 0 }));
  if (CURRENT_CTX && typeof CURRENT_CTX.waitUntil === 'function') { CURRENT_CTX.waitUntil(task); return; }
  await task;
});
registerPushProvider('log', async (env, targets, event) => {
  if (event.kind === 'call_end') return; // a dismissal, not a notification
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  const at = now();
  for (const uid of targets) {
    const preview = prefsOf(uid).notification_preview !== false;
    await db.prepare('INSERT INTO luno_push_outbox(user_id,kind,conversation_id,title,body,created_at) VALUES (?,?,?,?,?,?)')
      .bind(uid, event.kind, event.conversation_id || '', event.title || '', preview ? (event.body || '') : '새 알림', at).run();
  }
});
// P1-4: Web Push (VAPID RFC 8292 + message encryption RFC 8291
// aes128gcm). Needs VAPID_PUBLIC_KEY (vars, base64url raw 65 bytes) +
// VAPID_PRIVATE_KEY (secret, base64url raw 32 bytes) + VAPID_SUBJECT
// (mailto). Without them this leg is a no-op and native/FCM behavior
// stands unchanged. Tests inject stub fetch via env.WEBPUSH_FETCH and
// drive webpushEncrypt directly against the RFC 8291 section 5 vector
// (exported below).
const WEBPUSH_MAX_SUBS_PER_USER = 10;
const WEBPUSH_TTL_MESSAGE = 86400;
const WEBPUSH_TTL_CALL = 45;
const WEBPUSH_TTL_DISMISS = 60;
function webpushB64uDecode(s) {
  const b = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function webpushConcat(...parts) {
  const bytes = parts.map((p) => (typeof p === 'number' ? new Uint8Array([p]) : p));
  const out = new Uint8Array(bytes.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of bytes) { out.set(p, at); at += p.length; }
  return out;
}
function webpushConfig(env) {
  try {
    const pub = webpushB64uDecode(env && env.VAPID_PUBLIC_KEY);
    const priv = webpushB64uDecode(env && env.VAPID_PRIVATE_KEY);
    const subject = String((env && env.VAPID_SUBJECT) || '');
    if (pub.length !== 65 || pub[0] !== 0x04 || priv.length !== 32) return null;
    if (!subject) return null;
    return { pub, priv, subject, pubB64u: String(env.VAPID_PUBLIC_KEY) };
  } catch { return null; }
}
async function webpushHkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8);
  return new Uint8Array(bits);
}
// RFC 8291 section 3.4 (single aes128gcm record). opts pins the random
// inputs for the section 5 vector test: { salt, asPublicRaw,
// asPrivateRaw, rs, padLen }. Production omits them (fresh ephemeral
// key, random salt, no extra padding).
async function webpushEncrypt(receiverPubRaw, authRaw, plaintext, opts = {}) {
  const enc = new TextEncoder();
  let asPub = opts.asPublicRaw || null;
  let asPrivKey = null;
  if (opts.asPrivateRaw && asPub) {
    asPrivKey = await crypto.subtle.importKey('jwk', {
      kty: 'EC', crv: 'P-256',
      x: fcmB64url(asPub.slice(1, 33)), y: fcmB64url(asPub.slice(33, 65)),
      d: fcmB64url(opts.asPrivateRaw),
    }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  } else {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    asPrivKey = pair.privateKey;
    const j = await crypto.subtle.exportKey('jwk', pair.publicKey);
    asPub = webpushConcat(0x04, webpushB64uDecode(j.x), webpushB64uDecode(j.y));
  }
  const uaPubKey = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256',
    x: fcmB64url(receiverPubRaw.slice(1, 33)), y: fcmB64url(receiverPubRaw.slice(33, 65)),
  }, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPubKey }, asPrivKey, 256));
  const keyInfo = webpushConcat(enc.encode('WebPush: info'), 0x00, receiverPubRaw, asPub);
  const ikm = await webpushHkdf(authRaw, ecdh, keyInfo, 32);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await webpushHkdf(salt, ikm, webpushConcat(enc.encode('Content-Encoding: aes128gcm'), 0x00), 16);
  const nonce = await webpushHkdf(salt, ikm, webpushConcat(enc.encode('Content-Encoding: nonce'), 0x00), 12);
  const record = webpushConcat(plaintext, 0x02, new Uint8Array(opts.padLen || 0));
  const rs = opts.rs || (record.length + 16);
  if (rs < record.length + 16) throw new Error('webpush rs too small');
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, record));
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = 65;
  header.set(asPub, 21);
  return webpushConcat(header, ct);
}
async function webpushVapidJwt(cfg, audience) {
  const enc = new TextEncoder();
  const nowS = Math.floor(Date.now() / 1000);
  const h = fcmB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const c = fcmB64url(enc.encode(JSON.stringify({ aud: audience, exp: nowS + 12 * 3600, sub: cfg.subject })));
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256',
    x: fcmB64url(cfg.pub.slice(1, 33)), y: fcmB64url(cfg.pub.slice(33, 65)),
    d: fcmB64url(cfg.priv),
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${h}.${c}`)));
  return `${h}.${c}.${fcmB64url(sig)}`;
}
// Payload the service worker renders. call_end carries a dismiss tag
// (the worker closes the ring notification); everything else opens url.
function webpushPayloadFor(event) {
  const kind = String((event && event.kind) || 'message');
  const cid = String((event && event.conversation_id) || '');
  const callId = String((event && event.call_id) || '');
  if (kind === 'call_end' && callId) return { dismiss: `call-${callId}` };
  const url = cid ? `/chats/${cid}` : '/chats';
  const tag = kind === 'call' && callId ? `call-${callId}` : (cid ? `chat-${cid}` : 'luno');
  return {
    title: String((event && event.title) || 'LUNO'),
    body: String((event && event.body) || '새 알림').slice(0, 200),
    url, tag, kind, conversation_id: cid,
  };
}
function webpushTopicFor(event) {
  const cid = String((event && event.conversation_id) || 'luno').replace(/[^A-Za-z0-9-_]/g, '').slice(0, 32);
  return cid || 'luno';
}
async function webpushSendOne(env, cfg, sub, payloadBytes, event) {
  const doFetch = typeof env.WEBPUSH_FETCH === 'function' ? env.WEBPUSH_FETCH : fetch;
  let uaPub = null, auth = null;
  try {
    uaPub = webpushB64uDecode(sub.p256dh);
    auth = webpushB64uDecode(sub.auth);
  } catch { return { ok: false, gone: true }; }
  if (uaPub.length !== 65 || uaPub[0] !== 0x04 || auth.length !== 16) return { ok: false, gone: true };
  const body = await webpushEncrypt(uaPub, auth, payloadBytes);
  const aud = new URL(sub.endpoint).origin;
  const jwt = await webpushVapidJwt(cfg, aud);
  const ringing = event && event.kind === 'call';
  const dismiss = event && event.kind === 'call_end';
  const res = await doFetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Content-Length': String(body.length),
      TTL: String(ringing ? WEBPUSH_TTL_CALL : (dismiss ? WEBPUSH_TTL_DISMISS : WEBPUSH_TTL_MESSAGE)),
      Urgency: ringing ? 'high' : 'normal',
      Topic: webpushTopicFor(event),
      Authorization: `vapid t=${jwt}, k=${cfg.pubB64u}`,
    },
    body,
  });
  await res.arrayBuffer().catch(() => null);
  if (res.status === 404 || res.status === 410) return { ok: false, gone: true };
  return { ok: res.ok, gone: false };
}
async function webpushDeliver(env, cfg, targets, event) {
  const db = dbOf();
  if (!db) return { sent: 0 };
  await ensureSchema();
  const enc = new TextEncoder();
  let payloadBytes = enc.encode(JSON.stringify(webpushPayloadFor(event)));
  if (payloadBytes.length > 3800) {
    const slim = { ...webpushPayloadFor(event), body: String((event && event.body) || '새 알림').slice(0, 100) };
    payloadBytes = enc.encode(JSON.stringify(slim));
  }
  if (payloadBytes.length > 3800) return { sent: 0 };
  let sent = 0;
  for (const uid of targets) {
    const { results } = await db.prepare('SELECT endpoint, p256dh, auth FROM luno_webpush_subs WHERE user_id = ?').bind(uid).all().catch(() => ({ results: [] }));
    for (const sub of results || []) {
      try {
        const r = await webpushSendOne(env, cfg, sub, payloadBytes, event);
        if (r.gone) await db.prepare('DELETE FROM luno_webpush_subs WHERE endpoint = ?').bind(sub.endpoint).run().catch(() => null);
        else if (r.ok) sent++;
      } catch { /* one dead endpoint never fails the batch */ }
    }
  }
  return { sent };
}
registerPushProvider('webpush', async (env, targets, event) => {
  const cfg = webpushConfig(env);
  if (!cfg) return;
  const task = webpushDeliver(env, cfg, targets, event).catch(() => ({ sent: 0 }));
  if (CURRENT_CTX && typeof CURRENT_CTX.waitUntil === 'function') { CURRENT_CTX.waitUntil(task); return; }
  await task;
});
async function roomMuted(cid, uid) {
  if (!cid) return false;
  if (cMeta(cid, uid).muted) return true;
  const db = dbOf();
  if (!db) return false;
  await ensureSchema();
  // 6-8: the legacy conversation_members table is never written; the live
  // flags are in luno_chat_meta.
  const row = await db.prepare('SELECT muted FROM luno_chat_meta WHERE conversation_id = ? AND user_id = ?').bind(cid, uid).first().catch(() => null);
  return Number(row?.muted) === 1;
}
async function notify(env, userIds, event) {
  const targets = [];
  for (const uid of new Set(userIds || [])) {
    if (!uid || uid === event.sender_id) continue;
    if (prefsOf(uid).notifications === false) continue;
    if (event.conversation_id && await roomMuted(event.conversation_id, uid)) continue;
    targets.push(uid);
  }
  if (targets.length === 0) return { notified: [] };
  // E8: sealed content gets "new message" only — never plaintext in the
  // push body. Plaintext rooms keep their preview (N1-L).
  let out = event;
  if (event && event.kind === 'message' && event.sealed && event.body) {
    out = { ...event, body: '새 메시지' };
  }
  const provider = activePushProvider(env || {});
  if (provider) await provider(env, targets, out);
  // P1-4: Web Push rides alongside the native leg (a user with both an
  // app and a subscribed browser gets both). Unconfigured VAPID keeps
  // this a strict no-op.
  const web = webpushConfig(env || {}) ? pushProviders.get('webpush') : null;
  if (web && web !== provider) await web(env, targets, out);
  return { notified: targets };
}
function notifyEnv() {
  return (typeof CURRENT_ENV !== 'undefined' && CURRENT_ENV) ? CURRENT_ENV : {};
}
function notifyMessagePreview(kind, body) {
  if (kind === 'text') return String(body || '').slice(0, 120) || '새 메시지';
  const labels = { image: '[사진]', video: '[동영상]', file: '[파일]', voice: '[음성 메시지]', sticker: '[스티커]', location: '[위치]', contact: '[연락처]' };
  return labels[kind] || '[새 메시지]';
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
// F5: profile/cover photo bytes live in R2 under profile/<uid>/avatar|cover
// and D1 keeps the serving path. Uploads overwrite the single object per
// slot (replace deletes the old bytes); clearing deletes the object.
// Rows that predate R2 keep an inline data: URL and still serve until the
// next upload. Without an R2 binding the inline value is kept as-is.
function photoBytesFromDataUrl(value) {
  const match = String(value || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return null;
  const bin = atob(match[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function photoContentTypeOf(bytes) {
  if (bytes.length > 2 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  if (bytes.length > 7 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  if (bytes.length > 11 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return 'application/octet-stream';
}
function profilePhotoKey(userId, which) { return `profile/${userId}/${which === 'cover' ? 'cover' : 'avatar'}`; }
function profilePhotoPath(userId, which) { return `/api/v1/users/${userId}/${which === 'cover' ? 'cover' : 'avatar'}`; }
async function storeProfilePhoto(userId, which, value) {
  const bucket = mediaBucketOf();
  const key = profilePhotoKey(userId, which);
  if (!value) {
    if (bucket) await bucket.delete(key).catch(() => {});
    return '';
  }
  if (!bucket) return value;
  const bytes = photoBytesFromDataUrl(value);
  await bucket.put(key, bytes, { httpMetadata: { contentType: photoContentTypeOf(bytes) } });
  return `${profilePhotoPath(userId, which)}?v=${photoVersion()}`;
}
// Photo URLs carry a random version: a new upload gets a new URL (no stale
// cached image in the app/web), and the version doubles as a capability so
// <img src> / NetworkImage can load it without an Authorization header.
// Paths stored before this change (no ?v=) keep requiring a bearer token.
// Sign-up guard: well-known misspellings of big mail domains (a real user
// signed up as ...@gamil.com and could not log in with gmail.com later).
const EMAIL_DOMAIN_TYPOS = {
  'gamil.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmali.com': 'gmail.com', 'gmaill.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.om': 'gmail.com', 'gmail.comm': 'gmail.com', 'gnail.com': 'gmail.com', 'gmeil.com': 'gmail.com', 'gmail.net': 'gmail.com',
  'naver.co': 'naver.com', 'naver.con': 'naver.com', 'navr.com': 'naver.com', 'nave.com': 'naver.com', 'naer.com': 'naver.com', 'nvaer.com': 'naver.com', 'naver.cm': 'naver.com', 'naber.com': 'naver.com',
  'daum.ner': 'daum.net', 'daum.nt': 'daum.net', 'daum.com': 'daum.net', 'duam.net': 'daum.net',
  'hanmail.ent': 'hanmail.net', 'hanmail.com': 'hanmail.net', 'hanmial.net': 'hanmail.net', 'hamail.net': 'hanmail.net',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com',
  'icloud.co': 'icloud.com', 'iclod.com': 'icloud.com', 'outlok.com': 'outlook.com', 'kakao.co': 'kakao.com',
};
function emailDomainTypo(email) {
  const at = String(email || '').lastIndexOf('@');
  if (at < 1) return '';
  return EMAIL_DOMAIN_TYPOS[String(email).slice(at + 1).toLowerCase()] || '';
}
function photoVersion() {
  return [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function servePublicPhoto(p, url) {
  const v = url.searchParams.get('v') || '';
  if (!/^[0-9a-f]{24}$/.test(v)) return null;
  let m;
  if ((m = p.match(/^users\/([\w-]+)\/(avatar|cover)$/))) {
    let u = usersById.get(m[1]);
    if (!u && dbOf()) u = await loadUserFromD1(m[1], undefined).catch(() => null);
    if (!u || u.state === 'suspended') return json({ error: 'not found' }, 404);
    let stored = m[2] === 'cover' ? u.cover_url : u.avatar_url;
    if (dbOf()) {
      const row = await dbOf().prepare('SELECT avatar_url, cover_url FROM users WHERE id = ?').bind(m[1]).first().catch(() => null);
      if (row) stored = m[2] === 'cover' ? row.cover_url : row.avatar_url;
    }
    if (stored !== `${profilePhotoPath(m[1], m[2])}?v=${v}`) return json({ error: 'not found' }, 404);
    const res = await serveProfilePhoto(m[1], m[2]);
    if (res.ok) res.headers.set('Cache-Control', 'private, max-age=31536000, immutable');
    return res;
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/avatar$/))) {
    let conv = conversations.get(m[1]);
    if (!conv && dbOf()) conv = await hydrateDurableConversation(m[1]).catch(() => null);
    if (!conv || conv.avatar_url !== `/api/v1/conversations/${m[1]}/avatar?v=${v}`) return json({ error: 'not found' }, 404);
    const res = await serveRoomPhoto(conv);
    if (res.ok) res.headers.set('Cache-Control', 'private, max-age=31536000, immutable');
    return res;
  }
  return null;
}
async function serveProfilePhoto(userId, which) {
  const bucket = mediaBucketOf();
  if (bucket) {
    const obj = await bucket.get(profilePhotoKey(userId, which)).catch(() => null);
    if (obj) {
      const bytes = new Uint8Array(await obj.arrayBuffer());
      return new Response(bytes, { headers: { 'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || photoContentTypeOf(bytes), 'Cache-Control': 'private, max-age=3600' } });
    }
  }
  if (dbOf()) {
    await ensureSchema();
    const row = await dbOf().prepare('SELECT avatar_url, cover_url FROM users WHERE id = ?').bind(userId).first().catch(() => null);
    const inline = row ? (which === 'cover' ? row.cover_url : row.avatar_url) : '';
    if (inline && inline.startsWith('data:image/')) {
      const bytes = photoBytesFromDataUrl(inline);
      if (bytes) return new Response(bytes, { headers: { 'Content-Type': photoContentTypeOf(bytes), 'Cache-Control': 'private, max-age=3600' } });
    }
  }
  return json({ error: 'not found' }, 404);
}
// F6: group room photo bytes live in R2 under conv/<cid>/avatar; D1 keeps
// the serving path on luno_conversations.avatar_url. Legacy inline data:
// URLs still serve until replaced. No R2 binding keeps the inline value.
async function storeRoomPhoto(cid, value) {
  const bucket = mediaBucketOf();
  const key = `conv/${cid}/avatar`;
  if (!value) {
    if (bucket) await bucket.delete(key).catch(() => {});
    return '';
  }
  if (!bucket) return value;
  const bytes = photoBytesFromDataUrl(value);
  await bucket.put(key, bytes, { httpMetadata: { contentType: photoContentTypeOf(bytes) } });
  return `/api/v1/conversations/${cid}/avatar?v=${photoVersion()}`;
}
async function serveRoomPhoto(conv) {
  const bucket = mediaBucketOf();
  if (bucket) {
    const obj = await bucket.get(`conv/${conv.id}/avatar`).catch(() => null);
    if (obj) {
      const bytes = new Uint8Array(await obj.arrayBuffer());
      return new Response(bytes, { headers: { 'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || photoContentTypeOf(bytes), 'Cache-Control': 'private, max-age=3600' } });
    }
  }
  if (conv.avatar_url && conv.avatar_url.startsWith('data:image/')) {
    const bytes = photoBytesFromDataUrl(conv.avatar_url);
    if (bytes) return new Response(bytes, { headers: { 'Content-Type': photoContentTypeOf(bytes), 'Cache-Control': 'private, max-age=3600' } });
  }
  return json({ error: 'not found' }, 404);
}
function inviteUrl(request, token) {
  try { return new URL(`/invite/${token}`, request.url).toString(); }
  catch { return `/invite/${token}`; }
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
function parseJsonSafe(text, fallback) {
  try {
    const v = JSON.parse(String(text ?? ''));
    return v === undefined ? fallback : v;
  } catch { return fallback; }
}
// F26: strict E.164 for the contact directory (uploads and bindings alike).
const E164_RE = /^\+[1-9][0-9]{7,14}$/;
// F26: directory HMAC key. Short or missing means discovery stays off.
function contactMatchSecret(env) {
  const src = env || (typeof CURRENT_ENV !== 'undefined' ? CURRENT_ENV : null);
  const s = String((src && src.CONTACT_MATCH_SECRET) || '');
  return s.length >= 16 ? s : '';
}
async function hmacSha256Hex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(text)));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// F17: partner account ownership, cache first then D1 (cold isolates).
async function partnerAccountOwnedBy(aid, userId) {
  const account = partnerAccounts.get(aid);
  const organization = account && partnerOrgs.get(account.org_id);
  if (organization) return organization.owner_id === userId;
  if (!ownedResourcesDurable()) return false;
  await ensureSchema();
  const row = await dbOf().prepare('SELECT o.owner_id FROM luno_partner_accounts a JOIN luno_partner_orgs o ON o.id = a.org_id WHERE a.id = ?').bind(aid).first().catch(() => null);
  return !!row && row.owner_id === userId;
}
async function devOrgById(oid) {
  const hit = devOrgs.get(oid);
  if (hit) return hit;
  if (!ownedResourcesDurable()) return null;
  await ensureSchema();
  const r = await dbOf().prepare('SELECT * FROM luno_dev_orgs WHERE id = ?').bind(oid).first().catch(() => null);
  if (!r) return null;
  const org = { id: r.id, name: r.name, owner_id: r.owner_id };
  devOrgs.set(org.id, org);
  return org;
}
async function devAppById(appId) {
  const hit = devApps.get(appId);
  if (hit) return hit;
  if (!ownedResourcesDurable()) return null;
  await ensureSchema();
  const r = await dbOf().prepare('SELECT * FROM luno_dev_apps WHERE id = ?').bind(appId).first().catch(() => null);
  if (!r) return null;
  const app = { id: r.id, org_id: r.org_id, owner_id: r.owner_id, name: r.name, client_id: r.client_id, client_secret_hash: r.client_secret_hash, status: r.status };
  devApps.set(app.id, app);
  return app;
}
// F17: top-level copy of the link-preview URL gate (that helper nests
// inside extended(); console routes in workerCore need the same rule).
function httpsPublicHostBlocked(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home') || h.endsWith('.corp')) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const o = v4.slice(1).map(Number);
    if (o.some(n => n > 255)) return true;
    if (o[0] === 10 || o[0] === 127 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168) || (o[0] === 169 && o[1] === 254) || o[0] === 0 || o[0] >= 224) return true;
    return false;
  }
  if (h.includes(':')) return true;
  return false;
}
function httpsPublicUrlError(value) {
  let u;
  try { u = new URL(String(value || '')); } catch { return 'valid URL required'; }
  if (u.protocol !== 'https:') return 'https URLs only';
  if (u.username || u.password) return 'credentialed URLs blocked';
  if (httpsPublicHostBlocked(u.hostname)) return 'internal addresses blocked';
  return null;
}
async function hydrateOaRules(aid) {
  if (!ownedResourcesDurable()) return;
  await ensureSchema();
  const rows = (await dbOf().prepare('SELECT id, keywords_json, reply, match_type FROM luno_oa_bot_rules WHERE account_id = ?').bind(aid).all().catch(() => ({ results: [] }))).results || [];
  if (rows.length) oaBotRules.set(aid, rows.map(r => ({ id: r.id, keywords: parseJsonSafe(r.keywords_json, []), reply: r.reply, match_type: r.match_type })));
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
  const conv = { ...previous, id: row.id, kind: row.kind, title: row.title, notice: row.notice, avatar_url: row.avatar_url, owner_id: row.owner_id, members: (results || []).map(member => member.user_id), admins: (results || []).filter(member => member.role === 'admin').map(member => member.user_id), revision: row.revision, created_at: row.created_at, updated_at: row.updated_at, last_sequence: previous?.last_sequence || 0, _durable: true };
  conversations.set(cid, conv);
  await hydrateUsersByIds(conv.members);
  return conv;
}
// Calls across isolates: callSessions was the only record, so an accept,
// hang-up or SDP/ICE signal that landed on another isolate got 404 and the
// peer kept ringing. D1 is now authoritative; memory is a cache.
async function loadCallSession(id) {
  const db = dbOf();
  if (!db) return callSessions.get(id) || null;
  await ensureSchema();
  const row = await db.prepare('SELECT * FROM luno_call_sessions WHERE id = ?').bind(id).first().catch(() => null);
  if (!row) return callSessions.get(id) || null;
  const call = { id: row.id, conversation_id: row.conversation_id, kind: row.kind, state: row.state, initiated_by: row.initiated_by, started_at: row.started_at, connected_at: row.connected_at || null, ended_at: row.ended_at || null };
  if (row.result) call.result = row.result;
  callSessions.set(id, call);
  return call;
}
async function saveCallSession(call) {
  const db = dbOf();
  if (!db) return;
  await ensureSchema();
  await db.prepare('INSERT OR REPLACE INTO luno_call_sessions (id, conversation_id, kind, state, initiated_by, started_at, connected_at, ended_at, result) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(call.id, call.conversation_id, call.kind || 'voice', call.state || 'ringing', call.initiated_by || null, call.started_at || now(), call.connected_at || null, call.ended_at || null, call.result || null).run();
}
// Build 18: a ring older than this is stale (the caller's own no-answer
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
async function hydrateDurableConversations(userId) {
  if (!durableConversationsEnabled()) return;
  const { results } = await dbOf().prepare('SELECT conversation_id FROM luno_conversation_members WHERE user_id = ?').bind(userId).all();
  const ids = new Set((results || []).map(row => row.conversation_id));
  for (const conv of conversations.values()) if (conv._durable && conv.members.includes(userId) && !ids.has(conv.id)) conv.members = conv.members.filter(id => id !== userId);
  for (const cid of ids) await hydrateDurableConversation(cid);
}
async function createDurableConversation(fields) {
  // D1: rooms with demo (peer-) members stay in memory — peers have no users
  // row, so the durable member FK would reject them (same as official rooms).
  if (!durableConversationsEnabled() || fields.members.some(id => officialAccounts.has(id) || String(id).startsWith('peer-'))) return createConversation(fields);
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
    ...conv.members.map(id => db.prepare('INSERT INTO luno_conversation_members (conversation_id,user_id,role,joined_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM luno_conversations WHERE id=? AND mutation_token=?)').bind(conv.id, id, id === conv.owner_id ? 'owner' : ((conv.admins || []).includes(id) ? 'admin' : 'member'), at, conv.id, mutation))];
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
// D4: timelineView/voomView replaced by timelineRowView/voomRowView (D1 rows).
const MESSAGE_KINDS = new Set(['text', 'sticker', 'image', 'video', 'voice', 'file', 'location', 'contact', 'pay', 'transfer', 'ciphertext', 'call_status', 'security_notice', 'proposal', 'decision', 'report']);
// L-03: bot-emitted kinds. Humans always 403; bots need the propose op.
const BOT_ONLY_KINDS = new Set(['proposal', 'decision', 'report']);
// A-5: server-minted kinds a client must never send directly.
const FORGED_CLIENT_KINDS = new Set(['security_notice', 'pay', 'transfer', 'call_status', 'system']);
// F30: frozen ticket vocabulary (STATIC in zero_store_inventory).
const SUPPORT_TICKET_CATEGORIES = ['account', 'chat', 'payment', 'bug', 'other'];
// F29: frozen report + hide vocabularies (spam predates F29, kept as-is).
const REPORT_CATEGORIES = ['spam', 'abuse', 'harassment', 'illegal_filming', 'child_exploitation', 'violence', 'other'];
const HIDE_TARGET_TYPES = ['message', 'feed_post', 'community_post', 'attachment'];
const pushTokens = new Map();
const deviceKeys = new Map();
const userKeys = new Map();
const skParcels = []; // E6: no-DB fallback; D1 luno_sk_parcels is the store.
const e2eeBackupBlobs = new Map(); // E9: no-DB fallback {blob, byteLen, updatedAt}.

// E9: passphrase-encrypted key/history backup. The server stores the blob
// and never sees the passphrase. R2 holds the bytes when a bucket exists,
// D1 carries small blobs, memory covers the no-DB path.
const E2EE_BACKUP_MAX_BYTES = 20 * 1024 * 1024;
const E2EE_BACKUP_D1_MAX_BYTES = 256 * 1024;
function e2eeBackupValid(b) {
  return !!b && typeof b === 'object' && b.v === 1 &&
    typeof b.salt === 'string' && b.salt.length > 0 &&
    typeof b.iv === 'string' && b.iv.length > 0 &&
    typeof b.ct === 'string' && b.ct.length > 0;
}
const groupCallRooms = new Map();
// S6: maximum live participants per group-call room.
// F6: maximum members per group room (create + invite + join).
const GROUP_MAX_MEMBERS = 500;
const GROUP_CALL_MAX_PARTICIPANTS = 8;
const richMenus = new Map();
// 6-8: removed dead creatorSettlements (declared, never read or written).
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

// U1: demo content exists only for test envs — DEMO_MODE for whole isolates
// (local harness/tests) or an explicit per-user allowlist. These flags must
// never be enabled in deployed defaults (see the wrangler pin test).
function isDemoUser(env, userId) {
  env = env || {};
  if (env.DEMO_MODE === 'true') return true;
  if (!userId) return false;
  const ids = String(env.DEMO_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return ids.includes(userId);
}

// The Keep memo room is a real feature: every account gets exactly this one.
function ensureKeepMemo(userId) {
  if (!userId) return;
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
      { id: `m-keep-${userId}-2`, conversation_id: keepCid, sender_id: userId, client_id: 'keep-2', sequence: 2, kind: 'text', body: `${publicBaseUrl()}/ 프로덕션 점검 완료`, read_count: 1, created_at: '2026-08-01T11:30:00Z' }
    ]);
  }
}

// F30: per-user customer-center room. Reuses the oa-notice official identity
// (the seed list stays exactly one account — pinned by test) with its own
// room id so answers never mix into the security-notice room.
function ensureSupportRoom(userId) {
  if (!userId) return null;
  const cid = `conv-oa-support-${userId}`;
  if (!conversations.has(cid)) {
    conversations.set(cid, {
      id: cid, kind: 'official', title: 'LUNO 고객센터',
      members: [userId, 'oa-notice'], official: true,
      last_sequence: 0, updated_at: now()
    });
    messages.set(cid, []);
  }
  return cid;
}

function ensureDemoConversationsForUser(userId) {
  if (!userId) return;
  initPeerUsers();

  // Ensure all peer friendships exist for this user
  for (const p of PEER_USERS) {
    friendships.set(`${userId}:${p.id}`, true);
    friendships.set(`${p.id}:${userId}`, true);
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

// ---------- D4 social helpers (module level; D1-backed views) ----------
async function socialDb() {
  const db = dbOf();
  if (!db) return null;
  await ensureSchema();
  return db;
}
async function likeMap(sdb, kind, postIds) {
  const out = new Map();
  if (!postIds.length) return out;
  const ph = postIds.map(() => '?').join(',');
  let sql = '';
  if (kind === 'timeline') sql = `SELECT post_id, user_id FROM luno_timeline_likes WHERE post_id IN (${ph})`;
  else if (kind === 'voom') sql = `SELECT post_id, user_id FROM luno_voom_likes WHERE post_id IN (${ph})`;
  else if (kind === 'community') sql = `SELECT post_id, user_id FROM luno_community_post_likes WHERE post_id IN (${ph})`;
  else throw new Error(`unknown like kind: ${kind}`);
  const { results } = await sdb.prepare(sql).bind(...postIds).all();
  for (const r of results || []) {
    if (!out.has(r.post_id)) out.set(r.post_id, []);
    out.get(r.post_id).push(r.user_id);
  }
  return out;
}
async function commentMap(sdb, kind, postIds) {
  const out = new Map();
  if (!postIds.length) return out;
  const ph = postIds.map(() => '?').join(',');
  let sql = '';
  if (kind === 'timeline') sql = `SELECT * FROM luno_timeline_comments WHERE post_id IN (${ph}) ORDER BY created_at ASC, rowid ASC`;
  else if (kind === 'voom') sql = `SELECT * FROM luno_voom_comments WHERE post_id IN (${ph}) ORDER BY created_at ASC, rowid ASC`;
  else throw new Error(`unknown comment kind: ${kind}`);
  const { results } = await sdb.prepare(sql).bind(...postIds).all();
  for (const r of results || []) {
    if (!out.has(r.post_id)) out.set(r.post_id, []);
    out.get(r.post_id).push(r);
  }
  return out;
}
async function storyViewsById(sdb, storyIds) {
  const out = new Map();
  if (!storyIds.length) return out;
  const ph = storyIds.map(() => '?').join(',');
  const { results } = await sdb.prepare(`SELECT story_id, user_id FROM luno_story_views WHERE story_id IN (${ph})`).bind(...storyIds).all();
  for (const r of results || []) {
    if (!out.has(r.story_id)) out.set(r.story_id, []);
    out.get(r.story_id).push(r.user_id);
  }
  return out;
}
function timelineRowView(row, likeIds, comments, viewerId) {
  return {
    id: row.id, author: userBrief(row.author_id), body: row.body, bg: row.bg, visibility: row.visibility,
    created_at: row.created_at, like_count: likeIds.length, liked: likeIds.includes(viewerId),
    comments: comments.map(c => ({ id: c.id, author_id: c.author_id, body: c.body, created_at: c.created_at, author: userBrief(c.author_id) }))
  };
}
function voomRowView(row, likeIds, comments, viewerId) {
  return {
    id: row.id, title: row.title, emoji: row.emoji, bg: row.bg, author: userBrief(row.author_id), created_at: row.created_at,
    like_count: likeIds.length, liked: likeIds.includes(viewerId),
    comments: comments.map(c => ({ id: c.id, author_id: c.author_id, body: c.body, created_at: c.created_at, author: userBrief(c.author_id) }))
  };
}
function communityPostRowView(row, likeIds, viewerId) {
  return {
    id: row.id, room_id: row.room_id, author_id: row.author_id, author_name: row.author_name,
    body: row.body, created_at: row.created_at,
    likes: likeIds.length, liked: likeIds.includes(viewerId)
  };
}
function escapeLike(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
async function seedDemoRoom(db) {
  const at = now();
  await db.prepare(`INSERT OR IGNORE INTO luno_community_rooms (id, name, description, visibility, owner_id, created_at) VALUES ('room-1', 'LUNO Global Developer Lounge', 'Cloudflare Edge OpenChat for engineers and creators', 'public', '', ?)`).bind(at).run();
  await db.prepare(`INSERT OR IGNORE INTO luno_community_posts (id, room_id, author_id, author_name, body, created_at) VALUES ('post-1', 'room-1', '', 'LineBot', 'Welcome to OpenChat on Cloudflare Edge!', ?)`).bind(at).run();
}

async function extended(p, request, url, me, token) {
  const method = request.method;
  let m;
  const myId = me.id;
  // L-06: bot scope tokens touch only the bot routes below; every other
  // authenticated route answers 403 for bots.
  if (userKind(me) === 'bot' && !isBotApiRoute(p, method)) return json({ error: 'forbidden' }, 403);
  ensureKeepMemo(myId);
  if (isDemoUser(CURRENT_ENV, myId)) ensureDemoConversationsForUser(myId);
  await hydrateHidden(myId);

  // ---------- Passkeys (WebAuthn registration) ----------
  if (p === 'passkeys/register/begin' && request.method === 'POST') {
    if (!await rateLimit('rl:pkregb:' + myId, 60)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
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
    if (!await rateLimit('rl:pkregf:' + myId, 60)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
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
      if (row) { me.avatar_url = row.avatar_url || ''; me.cover_url = row.cover_url || ''; me.avatar_color = row.avatar_color || '#4F7CFF'; }
    }
    if (method === 'GET') return json({ ...publicUser(me), email: me.email, role: me.role, plan: accountPlan(me) });
    if (method === 'PATCH') {
      const b = await readJson(request);
      for (const [key, which, label, code] of [['avatar_url', 'avatar', 'Profile photo', 'INVALID_AVATAR'], ['cover_url', 'cover', 'Cover photo', 'INVALID_COVER']]) {
        if (b[key] === undefined) continue;
        const err = validatePhotoDataUrl(b[key], label, code);
        if (err) return json(err[1] ? { error: err[0], code: err[1] } : { error: err[0] }, 400);
        b[key] = await storeProfilePhoto(myId, which, b[key]);
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
        if (h !== me.handle && dbOf()) {
          await ensureSchema();
          const taken = await dbOf().prepare('SELECT id FROM users WHERE LOWER(handle) = ? AND id != ?').bind(h, myId).first().catch(() => null);
          if (taken) return bad('이미 사용 중인 ID입니다', 409);
        }
        me.handle = h;
      }
      if (dbOf()) await dbOf().prepare("UPDATE users SET display_name = ?, bio = ?, status_message = ?, avatar_url = ?, cover_url = ?, avatar_color = ?, handle = ?, birthday = ?, updated_at = ? WHERE id = ?").bind(me.display_name, me.bio || '', me.status_message || '', b.avatar_url === undefined ? (me.avatar_url || '') : b.avatar_url, b.cover_url === undefined ? (me.cover_url || '') : b.cover_url, me.avatar_color || '#4F7CFF', me.handle || '', me.birthday || '', now(), myId).run();
      if (b.avatar_url !== undefined) me.avatar_url = b.avatar_url;
      if (b.cover_url !== undefined) me.cover_url = b.cover_url;
      // build 17: friends and chat partners refresh this profile at once.
      await announceProfileChange(myId);
      return json({ ...publicUser(me), email: me.email, role: me.role });
    }
    if (method === 'DELETE') {
      // F3: password + reason + email confirm phrase schedule a 30-day
      // grace; the wipe runs only after expiry (see login). POST
      // /me/delete-account is a compatibility alias into the same path.
      const b = await readJson(request);
      const invalid = await checkDeletionBody(me, b);
      if (invalid) return invalid;
      const reason = b.reason === undefined || b.reason === null || b.reason === '' ? '' : String(b.reason);
      const stamped = await scheduleAccountDeletion(me, reason);
      await revokeOtherSessions(myId, '', myId);
      await persistAudit(myId, 'account.delete_request', myId, { reason });
      return json({ status: 'deletion_scheduled', grace_until: deletionGraceUntil(stamped), message: '계정 삭제가 예약되었습니다. 30일 안에 로그인하면 복구됩니다.' });
    }
  }
// F8: link previews. Only public https pages are fetched: plain http,
// credentials, localhost/private/link-local hosts and intranet suffixes
// never reach fetch (every redirect hop re-validates). Bodies cap at
// 512KB and fetches at 3s; hits cache in D1 for 24h, misses for 1h.
const LINK_PREVIEW_MAX_BYTES = 524288;
const LINK_PREVIEW_TIMEOUT_MS = 3000;
const LINK_PREVIEW_TTL_MS = 24 * 3600 * 1000;
const LINK_PREVIEW_FAIL_TTL_MS = 3600 * 1000;
function linkPreviewHostBlocked(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home') || h.endsWith('.corp')) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const o = v4.slice(1).map(Number);
    if (o.some(n => n > 255)) return true;
    if (o[0] === 10 || o[0] === 127 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168) || (o[0] === 169 && o[1] === 254) || o[0] === 0 || o[0] >= 224) return true;
    return false;
  }
  if (h.includes(':')) return true;
  return false;
}
function linkPreviewUrlError(value) {
  let u;
  try { u = new URL(String(value || '')); } catch { return 'valid URL required'; }
  if (u.protocol !== 'https:') return 'https links only';
  if (u.username || u.password) return 'credentialed links blocked';
  if (linkPreviewHostBlocked(u.hostname)) return 'private hosts blocked';
  return null;
}
function linkPreviewMeta(html, prop) {
  const tags = String(html).match(/<meta[^>]*>/gi) || [];
  const want = String(prop).toLowerCase();
  for (const tag of tags) {
    const nm = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i);
    if (!nm || nm[1].toLowerCase() !== want) continue;
    const ct = tag.match(/content\s*=\s*["']([^"']{1,2000})["']/i);
    if (ct && ct[1].trim()) return ct[1].trim();
  }
  return '';
}
function linkPreviewTitle(html) {
  const m = String(html).match(/<title[^>]*>([^<]{1,500})<\/title\s*>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}
async function fetchLinkPreview(target) {
  let current = target;
  let res = null;
  for (let hop = 0; hop < 4; hop++) {
    const err = linkPreviewUrlError(current);
    if (err) return { blocked: err };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), LINK_PREVIEW_TIMEOUT_MS);
    try {
      res = await fetch(current, { method: 'GET', redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': 'LUNO-LinkPreview/1.0', 'Accept': 'text/html' } });
    } catch {
      return { failed: true };
    } finally { clearTimeout(timer); }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return { failed: true };
      try { current = new URL(loc, current).toString(); } catch { return { failed: true }; }
      res = null;
      continue;
    }
    break;
  }
  if (!res || !res.ok) return { failed: true };
  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  if (ctype && ctype.indexOf('text/html') < 0 && ctype.indexOf('application/xhtml') < 0) return { failed: true };
  let bytes;
  try {
    bytes = await res.arrayBuffer();
    if (bytes.byteLength > LINK_PREVIEW_MAX_BYTES) return { failed: true };
  } catch { return { failed: true }; }
  const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes).slice(0, 200000);
  const title = linkPreviewMeta(html, 'og:title') || linkPreviewTitle(html);
  const description = linkPreviewMeta(html, 'og:description') || linkPreviewMeta(html, 'description');
  let image = linkPreviewMeta(html, 'og:image');
  if (image) {
    try {
      const abs = new URL(image, current).toString();
      image = linkPreviewUrlError(abs) ? '' : abs;
    } catch { image = ''; }
  }
  return { title: clip(title, 200), description: clip(description, 500), image_url: clip(image, 2000) };
}
  if (p === 'link-preview' && method === 'GET') {
    const target = (url.searchParams.get('url') || '').trim();
    const invalid = linkPreviewUrlError(target);
    if (invalid) return bad(invalid);
    // E8: links inside sealed rooms need an explicit per-tap consent —
    // resolving one tells the server which URL was shared.
    const pvRoom = url.searchParams.get('room') || '';
    if (pvRoom) {
      const prc = conversations.get(resolveConversationId(pvRoom, myId));
      if (prc && e2eeRoomTargeted(prc) && url.searchParams.get('consented') !== '1') {
        return json({ error: 'preview needs your confirmation in encrypted rooms', code: 'PREVIEW_CONSENT_REQUIRED' }, 400);
      }
    }
    if (!dbOf()) return bad('previews unavailable', 503);
    await ensureSchema();
    const hit = await dbOf().prepare('SELECT * FROM luno_link_previews WHERE url = ?').bind(target).first().catch(() => null);
    const age = hit ? Date.now() - Number(hit.fetched_at) : Infinity;
    const ttl = hit && !hit.ok ? LINK_PREVIEW_FAIL_TTL_MS : LINK_PREVIEW_TTL_MS;
    if (hit && age < ttl) {
      if (!hit.ok) return json({ url: target, title: '', description: '', image_url: '', unavailable: true, cached: true });
      return json({ url: target, title: hit.title || '', description: hit.description || '', image_url: hit.image_url || '', unavailable: false, cached: true });
    }
    const pv = await fetchLinkPreview(target);
    if (pv.blocked) return bad(pv.blocked);
    if (pv.failed || !pv.title) {
      await dbOf().prepare('INSERT INTO luno_link_previews (url, title, description, image_url, ok, fetched_at) VALUES (?, ?, ?, ?, 0, ?) ON CONFLICT(url) DO UPDATE SET title = excluded.title, description = excluded.description, image_url = excluded.image_url, ok = 0, fetched_at = excluded.fetched_at').bind(target, '', '', '', Date.now()).run();
      return json({ url: target, title: '', description: '', image_url: '', unavailable: true, cached: false });
    }
    await dbOf().prepare('INSERT INTO luno_link_previews (url, title, description, image_url, ok, fetched_at) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(url) DO UPDATE SET title = excluded.title, description = excluded.description, image_url = excluded.image_url, ok = 1, fetched_at = excluded.fetched_at').bind(target, pv.title, pv.description, pv.image_url, Date.now()).run();
    return json({ url: target, title: pv.title, description: pv.description, image_url: pv.image_url, unavailable: false, cached: false });
  }
  // F26: contact discovery. Off unless phone auth runs; consented callers
  // match E.164 uploads against verified, discoverable, unblocked users.
  // Uploaded numbers are HMAC-compared and never stored or logged.
  if (p === 'contacts/consent') {
    if (method === 'GET') return json({ consented: !!me.contact_consent_at, consented_at: me.contact_consent_at || '' });
    if (method === 'POST') {
      if (!await rateLimit('rl:contactconsent:' + myId, 60)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
      const b = await readJson(request);
      if (typeof b.consented !== 'boolean') return bad('consented must be true or false');
      me.contact_consent_at = b.consented ? now() : '';
      if (dbOf()) {
        await ensureSchema();
        await dbOf().prepare('UPDATE users SET contact_consent_at = ? WHERE id = ?').bind(me.contact_consent_at, myId).run();
      }
      return json({ consented: !!me.contact_consent_at, consented_at: me.contact_consent_at });
    }
  }
  if (p === 'contacts/match' && method === 'POST') {
    const cenv = (typeof CURRENT_ENV !== 'undefined' ? CURRENT_ENV : null);
    if (resolveSmsDriver(cenv) === 'none') return json({ error: '연락처 찾기를 사용할 수 없습니다. 휴대폰 인증 기능이 꺼져 있습니다.', code: 'PHONE_AUTH_DISABLED' }, 503);
    const secret = contactMatchSecret(cenv);
    if (!secret) return json({ error: 'contact discovery not configured', code: 'CONTACT_DISCOVERY_UNCONFIGURED' }, 503);
    if (!dbOf()) return json({ error: 'contact discovery needs a database', code: 'DB_REQUIRED' }, 503);
    if (!me.contact_consent_at) return json({ error: '연락처 찾기에 먼저 동의해 주세요.', code: 'CONTACT_CONSENT_REQUIRED' }, 403);
    const b = await readJson(request);
    if (!Array.isArray(b.phones) || !b.phones.length) return bad('전화번호 목록이 필요합니다');
    if (b.phones.length > 500) return json({ error: 'too many numbers', code: 'TOO_MANY_NUMBERS' }, 400);
    if (!await rateLimit('rl:contactmatch:' + myId, 30)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
    const want = [];
    for (const raw of b.phones) {
      const e164 = String(raw || '').trim();
      if (E164_RE.test(e164)) want.push(e164);
    }
    const matches = [];
    if (want.length) {
      await ensureSchema();
      const hmacs = [];
      for (const e of want) hmacs.push(await hmacSha256Hex(secret, e));
      const ph = hmacs.map(() => '?').join(',');
      const rows = (await dbOf().prepare(`SELECT id, phone_hmac, prefs_json FROM users WHERE phone_verified = 1 AND phone_hmac IN (${ph})`).bind(...hmacs).all().catch(() => ({ results: [] }))).results || [];
      const byHmac = new Map(rows.map(r => [r.phone_hmac, r]));
      for (let i = 0; i < want.length; i++) {
        const row = byHmac.get(hmacs[i]);
        if (!row || row.id === myId) continue;
        hydrateUserPrefs(row.id, row.prefs_json);
        if (prefsOf(row.id).discoverable_by_phone === false) continue;
        const blk = await blockState(myId, row.id);
        if (blk.byMe || blk.byThem) continue;
        if (fMeta(myId, row.id).hidden || fMeta(row.id, myId).hidden) continue;
        const hid = await dbOf().prepare('SELECT 1 AS x FROM friends WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)) AND is_hidden = 1').bind(myId, row.id, row.id, myId).first().catch(() => null);
        if (hid) continue;
        const u = usersById.get(row.id) || await loadUserFromD1(row.id, undefined);
        if (!u || u.state === 'suspended' || u.state === 'deleted') continue;
        if (matches.some(m => m.user.id === u.id)) continue;
        matches.push({ phone: want[i], user: publicUser(u) });
      }
    }
    await persistAudit(myId, 'contacts.match', myId, { uploaded: want.length, matched: matches.length });
    return json({ matches });
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
  // F0: password change lives only at POST auth/change-password (same
  // contract, same audit). The duplicate me/password route is removed.
  if (p === 'me/qr' && method === 'GET') return json({ code: `LUNO-FRIEND:${me.handle}`, handle: me.handle });
  if (p === 'me/stickers' && method === 'GET') {
    const owned = packsOf(myId);
    return json({ packs: STICKER_CATALOG.filter(pk => owned.has(pk.id)) });
  }

  // ---------- Friends & users ----------
  if (p === 'friends') {
    await hydrateSocialGraph(myId);
    if (method === 'GET') {
      await refreshCachedProfiles(friendIds(myId));
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
      if (b.friend_id || b.target_user_id) {
        target = usersById.get(b.friend_id || b.target_user_id);
        if (!target && dbOf()) target = await loadUserFromD1(b.friend_id || b.target_user_id, undefined);
      } else if (b.handle || b.qr_code) {
        const h = String(b.handle || String(b.qr_code).replace(/^(LINE-FRIEND|LUNO-FRIEND):/i, '')).trim().toLowerCase().replace(/^@/, '');
        const all = Array.from(users.values());
        // H4: display-name matching is gone — friend-add resolves by handle,
        // QR (same handle after prefix strip), or opted-in email only.
        target = all.find(u => u.handle === h)
          || all.find(u => u.email && u.email.toLowerCase() === h && prefsOf(u.id).searchable_by_email);
        if (!target && dbOf()) target = await findUserByHandleOrEmail(h);
      }
      if (!target || target.state === 'suspended') return bad('사용자를 찾을 수 없습니다', 404);
      if (target.id === myId) return bad('자기 자신은 친구로 추가할 수 없습니다');
      if (isFriend(myId, target.id)) return json({ status: 'already_friends', friend: publicUser(target) });
      // D7: the reverse block check must hit D1 — only the requester's own
      // blocks are hydrated, never another user's.
      if (!prefsOf(target.id).allow_friend_requests || (await blockState(target.id, myId)).byMe) return bad('친구 추가할 수 없는 사용자입니다', 403);
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
    await hydrateSocialGraph(myId);
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
        // F0: hidden and nickname are durable, not memory-only.
        if (typeof b.hidden === 'boolean') {
          await dbOf().prepare('UPDATE friends SET is_hidden = ? WHERE user_id = ? AND friend_id = ?').bind(b.hidden ? 1 : 0, myId, fid).run();
        }
        if (b.nickname !== undefined) {
          await dbOf().prepare('UPDATE friends SET nickname = ? WHERE user_id = ? AND friend_id = ?').bind(clip(b.nickname, 30), myId, fid).run();
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
    await hydrateSocialGraph(myId);
    const q = clip(url.searchParams.get('q') || url.searchParams.get('search') || '', 50).toLowerCase().replace(/^@/, '');
    if (q.length < 2) return json({ users: [] });
    const matches = (u) => {
      if (u.id === myId || u.state === 'suspended' || u.role === 'admin') return false;
      const pr = prefsOf(u.id);
      return u.display_name.toLowerCase().includes(q) || (pr.searchable_by_id && u.handle === q) || (pr.searchable_by_email && u.email === q);
    };
    const seen = new Map();
    for (const u of users.values()) if (matches(u)) seen.set(u.id, u);
    if (dbOf() && seen.size < 20) {
      await ensureSchema();
      const like = `%${escapeLike(q)}%`;
      const { results } = await dbOf().prepare(
        `SELECT id FROM users WHERE id != ? AND (state IS NULL OR state != 'suspended') AND (LOWER(display_name) LIKE ? ESCAPE '\\' OR LOWER(handle) = ? OR LOWER(email) = ?) LIMIT 50`
      ).bind(myId, like, q, q).all().catch(() => ({ results: [] }));
      for (const r of results || []) {
        if (seen.has(r.id)) continue;
        const u = await loadUserFromD1(r.id, undefined);
        if (u && matches(u)) seen.set(u.id, u);
        if (seen.size >= 20) break;
      }
    }
    return json({ users: [...seen.values()].slice(0, 20).map(u => ({ ...publicUser(u), is_friend: isFriend(myId, u.id) })) });
  }
  if ((m = p.match(/^users\/([\w-]+)$/)) && method === 'GET') {
    await hydrateSocialGraph(myId);
    let u = usersById.get(m[1]);
    if (!u && dbOf()) u = await loadUserFromD1(m[1], undefined);
    if (!u || u.state === 'suspended') return bad('사용자를 찾을 수 없습니다', 404);
    return json({ ...publicUser(u), is_friend: isFriend(myId, u.id) });
  }
  if ((m = p.match(/^users\/([\w-]+)\/(avatar|cover)$/)) && method === 'GET') {
    let u = usersById.get(m[1]);
    if (!u && dbOf()) u = await loadUserFromD1(m[1], undefined);
    if (!u || u.state === 'suspended') return bad('사용자를 찾을 수 없습니다', 404);
    return serveProfilePhoto(m[1], m[2]);
  }

  // ---------- Official accounts ----------
// F12: D1-backed editorial content. oa-notice stays a code-defined system
// account; admin-created accounts/news and all follows persist in D1.
// D1 accounts hydrate into the memory map so briefs, replies and room
// exemptions treat them exactly like the built-in account.
async function listOfficialAccounts() {
  if (dbOf()) {
    await ensureSchema();
    const { results } = await dbOf().prepare('SELECT * FROM luno_official_accounts ORDER BY created_at').all().catch(() => ({ results: [] }));
    for (const r of results || []) officialAccounts.set(r.id, { id: r.id, name: r.name, handle: r.handle, description: r.description, color: r.color });
  }
  return officialAccounts;
}
async function followedMap(userId) {
  if (!followedOfficial.has(userId)) followedOfficial.set(userId, new Map());
  const mine = followedOfficial.get(userId);
  if (dbOf()) {
    await ensureSchema();
    const { results } = await dbOf().prepare('SELECT account_id, conversation_id FROM luno_official_follows WHERE user_id = ?').bind(userId).all().catch(() => ({ results: [] }));
    for (const r of results || []) mine.set(r.account_id, r.conversation_id);
  }
  return mine;
}
  if (p === 'official-accounts' && method === 'GET') {
    const all = await listOfficialAccounts();
    const mine = await followedMap(myId);
    return json({ accounts: Array.from(all.values()).map(o => ({ id: o.id, name: o.name, handle: o.handle, description: o.description, color: o.color, followed: mine.has(o.id) })) });
  }
  if ((m = p.match(/^official-accounts\/([\w-]+)\/follow$/))) {
    const all = await listOfficialAccounts();
    const acct = all.get(m[1]);
    if (!acct) return bad('공식계정을 찾을 수 없습니다', 404);
    const mine = await followedMap(myId);
    if (method === 'POST') {
      const existing = mine.get(acct.id);
      if (existing && conversations.get(existing)) return json({ status: 'already_following', conversation_id: existing });
      const c = createConversation({ kind: 'official', title: acct.name, members: [myId, acct.id], official: true });
      mine.set(acct.id, c.id);
      if (dbOf()) {
        await ensureSchema();
        await dbOf().prepare('INSERT INTO luno_official_follows (user_id, account_id, conversation_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, account_id) DO UPDATE SET conversation_id = excluded.conversation_id').bind(myId, acct.id, c.id, now()).run();
      }
      if (!existing) pushMessage(c.id, acct.id, { kind: 'text', body: `${acct.name} 공식계정을 추가해 주셔서 감사합니다! 🎉 '도움말'을 입력해 보세요.` });
      sendTo([myId], { type: 'conversation.updated', conversation_id: c.id });
      return json({ status: existing ? 'already_following' : 'following', conversation_id: c.id }, existing ? 200 : 201);
    }
    if (method === 'DELETE') {
      const cid = mine.get(acct.id);
      if (cid) { cMeta(cid, myId).hidden = true; await persistChatMeta(cid, myId); }
      mine.delete(acct.id);
      if (dbOf()) {
        await ensureSchema();
        await dbOf().prepare('DELETE FROM luno_official_follows WHERE user_id = ? AND account_id = ?').bind(myId, acct.id).run();
      }
      return json({ status: 'unfollowed' });
    }
  }

  // ---------- Conversations ----------
  if (p === 'conversations/read-all' && method === 'POST') {
    ensureKeepMemo(myId);
    if (isDemoUser(CURRENT_ENV, myId)) ensureDemoConversationsForUser(myId);
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
      ensureKeepMemo(myId);
      if (isDemoUser(CURRENT_ENV, myId)) ensureDemoConversationsForUser(myId);
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
      await hydrateSocialGraph(myId);
      const b = await readJson(request);
      const kind = b.kind === 'group' ? 'group' : 'direct';
      const ids = Array.from(new Set((Array.isArray(b.member_ids) ? b.member_ids : []).filter(x => typeof x === 'string' && x !== myId)));
      if (!ids.length) return bad('대화 상대를 선택하세요');
      if (ids.length + 1 > GROUP_MAX_MEMBERS) return bad(`그룹은 최대 ${GROUP_MAX_MEMBERS}명까지 가능합니다`);
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
        if (existing) { cMeta(existing.id, myId).hidden = false; await persistChatMeta(existing.id, myId); return json(chatSummary(existing, myId)); }
        const isOA = officialAccounts.has(ids[0]);
        const oa = isOA ? officialAccounts.get(ids[0]) : null;
        const targetUser = !isOA ? usersById.get(ids[0]) : null;
        const convTitle = (b.title || (oa ? oa.name : targetUser ? targetUser.display_name : '')).trim();
        const dquota = await quotaConsumeRoom(myId);
        if (!dquota.ok) return json({ error: 'daily room quota exceeded', code: 'QUOTA_EXCEEDED' }, 429);
        const c = await createDurableConversation({ kind: 'direct', title: convTitle, members: [myId, ids[0]] });
        sendTo(c.members, { type: 'conversation.updated', conversation_id: c.id });
        return json(chatSummary(c, myId), 201);
      }
      const title = clip(b.title, 50);
      if (!title) return bad('그룹 이름을 입력하세요');
      const gquota = await quotaConsumeRoom(myId);
      if (!gquota.ok) return json({ error: 'daily room quota exceeded', code: 'QUOTA_EXCEEDED' }, 429);
      const c = await createDurableConversation({ kind: 'group', title, members: [myId, ...ids], owner_id: myId });
      await systemMessage(c.id, `${me.display_name}님이 그룹을 만들었습니다.`);
      sendTo(c.members, { type: 'conversation.updated', conversation_id: c.id });
      return json(chatSummary(c, myId), 201);
    }
  }
  if (p === 'conversations/join' && method === 'POST') {
    const b = await readJson(request);
    if (!b.token || !dbOf()) return bad('초대 링크를 찾을 수 없습니다', 404);
    await ensureSchema();
    const inv = await dbOf().prepare('SELECT * FROM luno_invites WHERE token = ?').bind(String(b.token)).first();
    if (!inv || inv.revoked) return bad('초대 링크를 찾을 수 없습니다', 404);
    if (Number(inv.expires_at) <= Date.now()) return bad('만료된 초대 링크입니다', 410);
    let conv = conversations.get(inv.conversation_id) || await hydrateDurableConversation(inv.conversation_id).catch(() => null);
    if (!conv || conv.kind !== 'group') return bad('그룹 채팅방이 아닙니다', 404);
    if (conv.members.includes(myId)) return bad('이미 참여한 방입니다', 409);
    if (conv.members.length >= GROUP_MAX_MEMBERS) return bad(`그룹은 최대 ${GROUP_MAX_MEMBERS}명까지 가능합니다`);
    conv.members.push(myId);
    cMeta(conv.id, myId).hidden = false;
    await persistChatMeta(conv.id, myId);
    await persistDurableConversation(conv);
    await systemMessage(conv.id, `${me.display_name}님이 초대 링크로 참여했습니다.`);
    sendTo(conv.members, { type: 'conversation.updated', conversation_id: conv.id });
    return json(chatSummary(conv, myId));
  }
  if ((m = p.match(/^conversations\/([\w-]+)$/))) {
    const conv = conversations.get(resolveConversationId(m[1], myId));
    if (!conv) return bad('대화방을 찾을 수 없습니다', 404);
    if (method === 'GET') {
      if (userKind(me) === 'bot' && !botScopeAllows(me, 'read', conv.id)) return json({ error: 'forbidden' }, 403);
      if (userKind(me) === 'bot') await persistAudit(myId, 'bot.read', conv.id, { route: 'conversation' });
      return json(chatSummary(conv, myId));
    }
    if (method === 'PATCH') {
      const b = await readJson(request);
      if ((b.title !== undefined || b.notice !== undefined || b.avatar !== undefined || b.owner_id !== undefined) && conv.kind === 'group' && !convPrivileged(conv, myId)) return json({ error: 'group settings forbidden' }, 403);
      const announcements = [];
      if (b.title !== undefined) {
        if (conv.kind !== 'group') return bad('그룹 채팅방만 이름을 바꿀 수 있습니다');
        const t = clip(b.title, 50);
        if (!t) return bad('그룹 이름을 입력하세요');
        if (t !== conv.title) { conv.title = t; announcements.push(`${me.display_name}님이 방 이름을 '${t}'(으)로 바꿨습니다.`); }
      }
      if (b.notice !== undefined) {
        const n = clip(b.notice, 500);
        if (n !== (conv.notice || '')) { conv.notice = n; if (conv.kind === 'group') announcements.push(`${me.display_name}님이 공지를 바꿨습니다.`); }
      }
      if (b.avatar !== undefined) {
        if (conv.kind !== 'group') return bad('그룹 채팅방만 사진을 바꿀 수 있습니다');
        const photoErr = validatePhotoDataUrl(b.avatar, 'Group photo', 'INVALID_GROUP_PHOTO');
        if (photoErr) return json(photoErr[1] ? { error: photoErr[0], code: photoErr[1] } : { error: photoErr[0] }, 400);
        conv.avatar_url = await storeRoomPhoto(conv.id, b.avatar);
        announcements.push(b.avatar ? `${me.display_name}님이 방 사진을 바꿨습니다.` : `${me.display_name}님이 방 사진을 지웠습니다.`);
      }
      if (b.owner_id !== undefined) {
        if (conv.kind !== 'group' || conv.owner_id !== myId || !conv.members.includes(b.owner_id)) return json({ error: 'ownership transfer forbidden' }, 403);
        conv.owner_id = b.owner_id;
        conv.admins = (conv.admins || []).filter(id => id !== b.owner_id);
        announcements.push(`${me.display_name}님이 ${(usersById.get(b.owner_id) || {}).display_name || '멤버'}님에게 방장을 넘겼습니다.`);
      }
      await persistDurableConversation(conv);
      for (const a of announcements) await systemMessage(conv.id, a);
      sendTo(conv.members, { type: 'conversation.updated', conversation_id: conv.id });
      return json(chatSummary(conv, myId));
    }
    if (method === 'DELETE') {
      if (conv.kind === 'group') return await leaveConversation(conv, myId, me);
      cMeta(conv.id, myId).hidden = true;
      await persistChatMeta(conv.id, myId);
      const hs = hiddenMsgs.get(myId) || new Set();
      (messages.get(conv.id) || []).forEach(x => hs.add(x.id));
      hiddenMsgs.set(myId, hs);
      return json({ status: 'hidden' });
    }
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/meta$/)) && method === 'PATCH') {
    const b = await readJson(request);
    const cid = resolveConversationId(m[1], myId);
    const meta = cMeta(cid, myId);
    for (const k of ['pinned', 'muted', 'hidden']) if (typeof b[k] === 'boolean') meta[k] = b[k];
    await persistChatMeta(cid, myId);
    return json({ status: 'updated', meta });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/avatar$/)) && method === 'GET') {
    const conv = conversations.get(resolveConversationId(m[1], myId));
    if (!conv) return bad('대화방을 찾을 수 없습니다', 404);
    return serveRoomPhoto(conv);
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/members$/)) && method === 'POST') {
    await hydrateSocialGraph(myId);
    const conv = conversations.get(resolveConversationId(m[1], myId));
    if (conv.kind !== 'group') return bad('그룹 채팅방에서만 초대할 수 있습니다');
    const b = await readJson(request);
    const ids = Array.from(new Set((Array.isArray(b.member_ids) ? b.member_ids : []).filter(x => typeof x === 'string')));
    if (conv.members.length >= GROUP_MAX_MEMBERS) return bad(`그룹은 최대 ${GROUP_MAX_MEMBERS}명까지 가능합니다`);
    if (conv.members.length + ids.filter(id => !conv.members.includes(id)).length > GROUP_MAX_MEMBERS) return bad(`그룹은 최대 ${GROUP_MAX_MEMBERS}명까지 가능합니다`);
    const added = [];
    for (const id of ids) {
      const u = usersById.get(id);
      if (!u || conv.members.includes(id) || !isFriend(myId, id) || fMeta(myId, id).blocked) continue;
      // D1: demo identities have no users row; inviting one to a durable room
      // would violate the member FK, so they stay out of durable rooms.
      if (conv._durable && String(id).startsWith('peer-')) continue;
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
    if (!convPrivileged(conv, myId)) return bad('방장이나 관리자만 멤버를 내보낼 수 있습니다', 403);
    if (conv.owner_id !== myId && convRole(conv, m[2]) !== 'member') return bad('관리자는 일반 멤버만 내보낼 수 있습니다', 403);
    if (!conv.members.includes(m[2])) return bad('멤버가 아닙니다', 404);
    const target = usersById.get(m[2]);
    conv.members = conv.members.filter(x => x !== m[2]);
    conv.admins = (conv.admins || []).filter(x => x !== m[2]);
    await persistDurableConversation(conv);
    await systemMessage(conv.id, `${target ? target.display_name : '멤버'}님이 내보내졌습니다.`);
    sendTo([...conv.members, m[2]], { type: 'conversation.updated', conversation_id: conv.id });
    return json({ status: 'kicked' });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/members\/([\w-]+)\/role$/)) && method === 'PATCH') {
    const conv = conversations.get(resolveConversationId(m[1], myId));
    if (!conv || conv.kind !== 'group') return bad('그룹 채팅방이 아닙니다');
    if (conv.owner_id !== myId) return json({ error: 'role change forbidden' }, 403);
    if (!conv.members.includes(m[2]) || m[2] === conv.owner_id) return bad('멤버가 아닙니다', 404);
    const b = await readJson(request);
    if (b.role !== 'admin' && b.role !== 'member') return bad('올바르지 않은 역할입니다');
    conv.admins = (conv.admins || []).filter(id => id !== m[2]);
    if (b.role === 'admin') conv.admins.push(m[2]);
    await persistDurableConversation(conv);
    const target = usersById.get(m[2]);
    const targetName = target ? target.display_name : '멤버';
    await systemMessage(conv.id, b.role === 'admin' ? `${targetName}님이 관리자가 됐습니다.` : `${targetName}님이 일반 멤버가 됐습니다.`);
    sendTo(conv.members, { type: 'conversation.updated', conversation_id: conv.id });
    return json(chatSummary(conv, myId));
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/invites$/))) {
    const conv = conversations.get(resolveConversationId(m[1], myId));
    if (!conv || conv.kind !== 'group') return bad('그룹 채팅방이 아닙니다');
    if (!convPrivileged(conv, myId)) return json({ error: 'invite forbidden' }, 403);
    if (!dbOf()) return bad('초대 링크를 만들 수 없습니다', 503);
    await ensureSchema();
    if (method === 'GET') {
      const { results } = await dbOf().prepare('SELECT token, conversation_id, created_by, expires_at, revoked, created_at FROM luno_invites WHERE conversation_id = ? AND revoked = 0 AND expires_at > ? ORDER BY created_at DESC').bind(conv.id, Date.now()).all();
      return json({ invites: (results || []).map(r => ({ token: r.token, conversation_id: r.conversation_id, created_by: r.created_by, expires_at: r.expires_at, created_at: r.created_at, invite_url: inviteUrl(request, r.token) })) });
    }
    if (method === 'POST') {
      const b = await readJson(request);
      const hours = intIn(b.expires_in_hours ?? 168, 1, 720) ?? 168;
      const token = uid();
      const expires_at = Date.now() + hours * 3600000;
      await dbOf().prepare('INSERT INTO luno_invites (token, conversation_id, created_by, expires_at, revoked, created_at) VALUES (?, ?, ?, ?, 0, ?)').bind(token, conv.id, myId, expires_at, now()).run();
      return json({ token, invite_url: inviteUrl(request, token), conversation_id: conv.id, expires_at }, 201);
    }
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/invites\/([\w-]+)$/)) && method === 'DELETE') {
    const conv = conversations.get(resolveConversationId(m[1], myId));
    if (!conv || conv.kind !== 'group') return bad('그룹 채팅방이 아닙니다');
    if (!convPrivileged(conv, myId)) return json({ error: 'invite forbidden' }, 403);
    if (!dbOf()) return bad('초대 링크를 폐기할 수 없습니다', 503);
    await ensureSchema();
    const done = await dbOf().prepare('UPDATE luno_invites SET revoked = 1 WHERE token = ? AND conversation_id = ?').bind(m[2], conv.id).run();
    if (!done.meta?.changes) return bad('초대 링크를 찾을 수 없습니다', 404);
    return json({ status: 'revoked' });
  }

  // ---------- Messages ----------
  if ((m = p.match(/^conversations\/([\w-]+)\/messages$/))) {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (method === 'GET') {
      if (userKind(me) === 'bot' && !botScopeAllows(me, 'read', cid)) return json({ error: 'forbidden' }, 403);
      if (userKind(me) === 'bot') await persistAudit(myId, 'bot.read', cid, { route: 'messages' });
      await hydrateConversation(cid);
      await hydrateCursors(myId);
      await hydrateRoomCursors(cid);
      const before = intIn(url.searchParams.get('before_sequence') || 0, 0, 1e9) || 0;
      const limit = intIn(url.searchParams.get('limit') || 50, 1, 100) || 50;
      const hs = hiddenMsgs.get(myId);
      const db = dbOf();
      if (db && before) {
        // D7: deep history pages straight from D1 instead of the 500-message
        // memory window, so rooms beyond 500 messages stay readable.
        await ensureSchema();
        const { results } = await db.prepare("SELECT * FROM luno_messages WHERE conversation_id = ? AND sequence < ? AND id NOT IN (SELECT target_id FROM luno_hidden_targets WHERE target_type = 'message') ORDER BY sequence DESC LIMIT ?").bind(cid, before, limit + 1).all();
        const rows = (results || []).filter(r => !(hs && hs.has(r.id)));
        await hydrateReactions(rows.map(r => r.id));
        return json({ messages: rows.slice(0, limit).reverse().map(r => decorateMessage(rowToMessage(r), myId, cid)), has_more: rows.length > limit });
      }
      let list = (messages.get(cid) || []).filter(x => !(hs && hs.has(x.id)));
      const hidMem = await hiddenTargetIds('message', list.map(x => x.id));
      list = list.filter(x => !hidMem.has(x.id));
      if (before) list = list.filter(x => x.sequence < before);
      return json({ messages: list.slice(-limit).map(x => decorateMessage(x, myId, cid)), has_more: list.length > limit });
    }
    if (method === 'POST') {
      // F1: unverified accounts cannot send.
      if (me.email_verified === 0) return json({ error: 'email not verified', code: 'EMAIL_NOT_VERIFIED' }, 403);
      if (conv.official || conv.kind === 'official') return bad('공식계정 방은 읽기 전용입니다');
      if (!await rateLimit('rl:msg:' + myId, 300)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
      const b = await readJson(request);
      const kind = b.kind || 'text';
      await hydrateConversation(cid);
      if (!MESSAGE_KINDS.has(kind)) return bad('지원하지 않는 메시지 종류입니다');
      if (FORGED_CLIENT_KINDS.has(kind)) return bad('시스템 메시지는 직접 전송할 수 없습니다', 400);
      if (BOT_ONLY_KINDS.has(kind)) {
        if (userKind(me) !== 'bot') return json({ error: 'forbidden' }, 403);
        if (!botScopeAllows(me, 'propose', cid)) return json({ error: 'forbidden' }, 403);
      } else if (userKind(me) === 'bot' && !botScopeAllows(me, 'post', cid)) {
        return json({ error: 'forbidden' }, 403);
      }
      // E2: E2EE rooms accept ciphertext only (system kinds pass through).
      if (await e2eeEnforced() && e2eeRoomTargeted(conv) && kind !== 'ciphertext' && kind !== 'call_status' && kind !== 'security_notice') {
        return json({ error: 'this room is end-to-end encrypted', code: 'E2EE_CIPHERTEXT_REQUIRED' }, 400);
      }
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
        if (dbOf()) {
          const hit = await dbOf().prepare('SELECT * FROM luno_messages WHERE conversation_id = ? AND sender_id = ? AND client_id = ?').bind(cid, myId, String(b.client_id)).first().catch(() => null);
          if (hit) return json({ message: decorateMessage(rowToMessage(hit), myId, cid), duplicate: true }, 200);
        }
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
      } else if (kind === 'proposal' || kind === 'decision' || kind === 'report') {
        body = body.trim();
        if (!body) return bad('메시지를 입력하세요');
        if (body.length > MAX_BODY) return bad('메시지가 너무 깁니다');
      } else if (kind === 'sticker') {
        if (meta.sticker_id) {
          metadata = { ...meta };
          body = body || meta.label || '스티커';
        } else if (!meta.pack_id && ORBIT_CREW_STICKERS.has(body)) {
          metadata = { crew_id: ORBIT_CREW_STICKERS.get(body) };
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
      // E5: the one-time "encrypted from here" marker above the first ciphertext.
      if (kind === 'ciphertext') await e2eeEnsureIntroNotice(cid, conv);
      const msg = await pushPersistent(cid, myId, { client_id: b.client_id, kind, body, reply_to: replyTo, metadata: Object.keys(metadata).length ? metadata : undefined });
      if (msg._duplicate === true) {
        delete msg._duplicate;
        const raced = decorateMessage(msg, myId, cid);
        return json({ ...raced, message: raced, duplicate: true }, 200);
      }
      await persistCursor(cid, myId, msg.sequence);
      // L-02: bot mentions become jobs. Routing must never break messaging,
      // so failures are logged, not thrown.
      try {
        if (!(await routeBotCommands(conv, myId, msg))) await routeBotMentions(conv, myId, msg);
      } catch (err) { logx('error', 'bot route failed', { error: err && err.message ? err.message : String(err) }); }
      // N1-L: fan the message out to the notification provider leg.
      await notify(notifyEnv(), conv.members, {
        kind: 'message',
        conversation_id: cid,
        sender_id: myId,
        sealed: kind === 'ciphertext',
        title: me.display_name || me.handle || 'LUNO',
        body: notifyMessagePreview(kind, body),
      });
      if (conv.official) {
        const acct = officialAccounts.get(conv.members.find(x => officialAccounts.has(x)));
        if (acct && kind === 'text') {
          await hydrateOaRules(acct.id);
          await pushPersistent(cid, acct.id, { kind: 'text', body: botReply(body, acct) });
        }
      }
      if (userKind(me) === 'bot') await persistAudit(myId, BOT_ONLY_KINDS.has(kind) ? 'bot.propose' : 'bot.post', cid, { kind, message_id: msg.id });
      const decorated = decorateMessage(msg, myId, cid);
      return json({ ...decorated, message: decorated, duplicate: false }, 201);
    }
  }
// F9: unsend removes the attachment bytes with the metadata rows so an R2
// object never outlives its message (account purge covers the rest).
// F29: hidden ids among the given page (bounded IN query; empty without D1).
async function hiddenTargetIds(type, ids) {
  const out = new Set();
  const list = (ids || []).filter(Boolean);
  if (!list.length) return out;
  const db = dbOf();
  if (!db) return out;
  await ensureSchema().catch(() => {});
  const ph = list.map(() => '?').join(',');
  const rows = (await db.prepare(`SELECT target_id FROM luno_hidden_targets WHERE target_type = ? AND target_id IN (${ph})`).bind(type, ...list).all().catch(() => ({ results: [] }))).results || [];
  for (const r of rows) out.add(r.target_id);
  return out;
}
async function deleteAttachmentEverywhere(attId) {
  const db = dbOf();
  if (!db) return;
  await ensureSchema().catch(() => {});
  const meta = await db.prepare('SELECT object_key FROM attachments WHERE id = ?').bind(String(attId)).first().catch(() => null);
  const bucket = mediaBucketOf();
  if (meta && meta.object_key && bucket) await bucket.delete(meta.object_key).catch(() => {});
  await db.prepare('DELETE FROM attachments WHERE id = ?').bind(String(attId)).run().catch(() => null);
  await db.prepare('DELETE FROM luno_attachments WHERE id = ?').bind(String(attId)).run().catch(() => null);
}
  if ((m = p.match(/^conversations\/([\w-]+)\/messages\/([\w-]+)$/))) {
    const cid = resolveConversationId(m[1], myId);
    await hydrateConversation(cid);
    const list = messages.get(cid) || [];
    const msg = list.find(x => x.id === m[2]);
    if (!msg) return bad('메시지를 찾을 수 없습니다', 404);
    if (['PATCH', 'DELETE'].includes(method) && msg.sender_id !== myId) return bad('보낸 사람만 수정하거나 취소할 수 있습니다', 403);
    if (method === 'PATCH') {
      // E5: ciphertext edits replace the envelope (same kind, new body).
      if ((msg.kind !== 'text' && msg.kind !== 'ciphertext') || msg.unsent) return bad('텍스트 메시지만 수정할 수 있습니다');
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
      if (msg.metadata && msg.metadata.attachment_id) await deleteAttachmentEverywhere(msg.metadata.attachment_id);
      msg.unsent = true;
      msg.body = '';
      msg.metadata = undefined;
      await persistMessageUpdate(msg);
      const pins = pinnedMessages.get(cid);
      if (pins) pinnedMessages.set(cid, pins.filter(x => x.message_id !== msg.id));
      if (dbOf()) {
        await ensureSchema();
        await dbOf().prepare('DELETE FROM luno_pins WHERE conversation_id = ? AND message_id = ?').bind(cid, msg.id).run();
      }
      broadcast({ type: 'message.unsent', conversation_id: cid, message_id: msg.id });
      return json({ status: 'recalled', message_id: msg.id });
    }
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/messages\/([\w-]+)\/forward$/)) && method === 'POST') {
    // F7: forward into another room. Source membership comes from the
    // global gate; the target room is checked here. Attachment bytes are
    // copied under the target room so source-only members stay locked out.
    if (me.email_verified === 0) return json({ error: 'email not verified', code: 'EMAIL_NOT_VERIFIED' }, 403);
    if (!await rateLimit('rl:msg:' + myId, 300)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
    const b = await readJson(request);
    const scid = resolveConversationId(m[1], myId);
    const tcid = resolveConversationId(typeof b.to_conversation_id === 'string' ? b.to_conversation_id : '', myId);
    await hydrateConversation(scid);
    const orig = (messages.get(scid) || []).find(x => x.id === m[2]);
    if (!orig) return bad('메시지를 찾을 수 없습니다', 404);
    if (orig.unsent) return bad('취소된 메시지는 전달할 수 없습니다', 400);
    const forwardable = new Set(['text', 'sticker', 'image', 'video', 'voice', 'file', 'location', 'contact']);
    if (!forwardable.has(orig.kind)) return bad('이 종류의 메시지는 전달할 수 없습니다', 400);
    let tconv = conversations.get(tcid);
    if (!tconv && dbOf()) tconv = await hydrateDurableConversation(tcid).catch(() => null);
    if (!tconv || !tconv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    if (tconv.official || tconv.kind === 'official') return bad('공식계정 방은 읽기 전용입니다');
    // E5: server-side forward cannot mint ciphertext; the client re-encrypts.
    if (await e2eeEnforced() && e2eeRoomTargeted(tconv)) {
      return json({ error: 'this room is end-to-end encrypted', code: 'E2EE_CIPHERTEXT_REQUIRED' }, 400);
    }
    let metadata = { ...(orig.metadata || {}) };
    delete metadata.mentions;
    metadata.forwarded = true;
    if (['image', 'video', 'voice', 'file'].includes(orig.kind)) {
      const att = await loadAttachment(orig.metadata && orig.metadata.attachment_id);
      if (!att || att.conversation_id !== scid) return bad('첨부 파일을 찾을 수 없습니다', 404);
      const copy = { id: uid(), owner: myId, conversation_id: tcid, name: att.name, mime: att.mime, bytes: att.bytes };
      await persistAttachmentR2(copy);
      metadata = { attachment_id: copy.id, mime_type: copy.mime, name: copy.name, size_bytes: copy.bytes.length, forwarded: true };
      if (orig.kind === 'voice' && orig.metadata && orig.metadata.duration !== undefined) metadata.duration = orig.metadata.duration;
    }
    const msg = await pushPersistent(tcid, myId, { kind: orig.kind, body: orig.body, metadata: Object.keys(metadata).length ? metadata : undefined });
    await persistCursor(tcid, myId, msg.sequence);
    await notify(notifyEnv(), tconv.members, {
      kind: 'message',
      conversation_id: tcid,
      sender_id: myId,
      sealed: orig.kind === 'ciphertext',
      title: me.display_name || me.handle || 'LUNO',
      body: notifyMessagePreview(orig.kind, orig.body),
    });
    const fwd = decorateMessage(msg, myId, tcid);
    return json({ ...fwd, message: fwd, duplicate: false }, 201);
  }
  // ---------- L-05 approval box ----------
  if ((m = p.match(/^conversations\/([\w-]+)\/messages\/([\w-]+)\/decide$/)) && method === 'POST') {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    const b = await readJson(request);
    if (b.decision !== 'approved' && b.decision !== 'rejected') return bad('decision must be approved or rejected', 400);
    await hydrateConversation(cid);
    const target = (messages.get(cid) || []).find(x => x.id === m[2]);
    if (!target) return bad('제안 메시지를 찾을 수 없습니다', 404);
    if (target.kind !== 'proposal' || target.unsent) return bad('제안 메시지에만 결정할 수 있습니다', 400);
    // Approvers: room owner/admins (F6), global admins, or — in direct
    // rooms with no owner — any member. Everyone else 403s.
    const privileged = me.role === 'admin' || (conv && convPrivileged(conv, myId)) || (conv && conv.kind === 'direct');
    if (!privileged) return json({ error: 'forbidden' }, 403);
    const db = dbOf();
    if (!db) return json({ error: 'decisions require a configured database' }, 501);
    await ensureSchema();
    const prior = await db.prepare('SELECT id FROM luno_decisions WHERE proposal_message_id = ?').bind(target.id).first().catch(() => null);
    if (prior) return json({ error: 'proposal already decided' }, 409);
    const decisionId = await recordDecision({ roomId: cid, proposalMessageId: target.id, decidedBy: myId, decision: b.decision });
    if (!decisionId) return json({ error: 'proposal already decided' }, 409);
    const verdict = b.decision === 'approved' ? '승인되었습니다' : '거절되었습니다';
    const posted = await pushPersistent(cid, target.sender_id, { kind: 'decision', body: `제안 '${clip(target.body, 120)}'이 ${verdict}.`,
      metadata: { proposal_message_id: target.id, decision: b.decision } });
    // PC agent: a decided bot proposal becomes a decision job for that bot.
    try {
      const proposer = usersById.get(target.sender_id) || await loadUserFromD1(target.sender_id, 'user');
      if (proposer && userKind(proposer) === 'bot' && await botMayAct(cid, myId)) {
        await enqueueBotJob({ botId: proposer.id, roomId: cid, kind: 'decision',
          payload: { proposal_message_id: target.id, decision: b.decision, decided_by: myId } });
      }
    } catch (err) { logx('error', 'bot decision route failed', { error: err && err.message ? err.message : String(err) }); }
    await persistAudit(myId, 'proposal.decide', target.id, { room: cid, decision: b.decision, decision_id: decisionId });
    return json({ id: decisionId, message_id: posted.id, state: b.decision }, 201);
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/bots$/)) && method === 'GET') {
    const cid = resolveConversationId(m[1], myId);
    await hydrateConversation(cid);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없습니다', 404);
    const db = dbOf();
    const bots = [];
    for (const id of conv.members) {
      if (id === myId) continue;
      const u = usersById.get(id) || await loadUserFromD1(id, 'user');
      if (!u || userKind(u) !== 'bot') continue;
      let row = null;
      if (db) {
        await ensureSchema();
        row = await db.prepare('SELECT value FROM luno_bot_config WHERE key = ?').bind('presence:' + id).first().catch(() => null);
      }
      bots.push(botPresenceView(u, row));
    }
    return json({ bots, commands_allowed: bots.length > 0 && await botMayAct(cid, myId), presence_ttl_ms: BOT_PRESENCE_TTL_MS });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/proposals$/)) && method === 'GET') {
    const cid = resolveConversationId(m[1], myId);
    const db = dbOf();
    if (!db) return json({ error: 'decisions require a configured database' }, 501);
    await ensureSchema();
    await hydrateConversation(cid);
    const decided = {};
    const rows = (await db.prepare('SELECT proposal_message_id, decision, decided_by, created_at FROM luno_decisions WHERE room_id = ?').bind(cid).all().catch(() => ({ results: [] }))).results || [];
    for (const r of rows) decided[r.proposal_message_id] = r;
    const proposals = (messages.get(cid) || [])
      .filter(x => x.kind === 'proposal' && !x.unsent)
      .map(x => ({
        message_id: x.id, body: x.body, author_id: x.sender_id,
        author_name: userBrief(x.sender_id)?.display_name || '',
        created_at: x.created_at,
        state: decided[x.id] ? decided[x.id].decision : 'pending',
        decided_by: decided[x.id] ? decided[x.id].decided_by : null
      }))
      .sort((a, b2) => ((a.state === 'pending' ? 0 : 1) - (b2.state === 'pending' ? 0 : 1)) || String(b2.created_at).localeCompare(String(a.created_at)));
    return json({ proposals });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/messages\/([\w-]+)\/hide$/)) && method === 'POST') {
    const hcid = resolveConversationId(m[1], myId);
    await hydrateConversation(hcid);
    if (!(messages.get(hcid) || []).some(x => x.id === m[2])) return bad('메시지를 찾을 수 없습니다', 404);
    const db = dbOf();
    if (db) {
      await ensureSchema();
      await db.prepare('INSERT OR IGNORE INTO luno_hidden_messages (user_id, message_id) VALUES (?, ?)').bind(myId, m[2]).run();
    }
    const hs = hiddenMsgs.get(myId) || new Set();
    hs.add(m[2]);
    hiddenMsgs.set(myId, hs);
    return json({ status: 'hidden' });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/messages\/([\w-]+)\/reactions$/)) && method === 'POST') {
    const cid = resolveConversationId(m[1], myId), mid = m[2];
    const db = dbOf();
    if (db) {
      await ensureSchema();
      await hydrateConversation(cid);
      await hydrateReactions([mid]);
    }
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
    if (db) {
      await db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji <> ?').bind(mid, myId, b.reaction).run();
      if (removed) await db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').bind(mid, myId, b.reaction).run();
      else await db.prepare('INSERT OR IGNORE INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)').bind(mid, myId, b.reaction, now()).run();
    }
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
    const db = dbOf();
    if (db) {
      await ensureSchema();
      await hydrateConversation(cid);
      await hydratePins(cid);
    }
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
      if (!pins.some(x => x.message_id === src.id)) {
        const pin = { message_id: src.id, pinned_by: myId, pinned_at: now() };
        pins.unshift(pin);
        if (db) await db.prepare('INSERT OR IGNORE INTO luno_pins (conversation_id, message_id, pinned_by, pinned_at) VALUES (?, ?, ?, ?)').bind(cid, pin.message_id, pin.pinned_by, pin.pinned_at).run();
      }
      pinnedMessages.set(cid, pins);
      broadcast({ type: 'conversation.pins', conversation_id: cid });
      return json({ status: 'pinned', message_id: src.id }, 201);
    }
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/pins\/([\w-]+)$/)) && method === 'DELETE') {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const db = dbOf();
    if (db) {
      await ensureSchema();
      await db.prepare('DELETE FROM luno_pins WHERE conversation_id = ? AND message_id = ?').bind(cid, m[2]).run();
    }
    pinnedMessages.set(cid, (pinnedMessages.get(cid) || []).filter(x => x.message_id !== m[2]));
    broadcast({ type: 'conversation.pins', conversation_id: cid });
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
      // E8: sealed bodies are device-searchable only.
      const { results } = await db.prepare("SELECT * FROM luno_messages WHERE conversation_id = ? AND unsent = 0 AND kind <> 'sticker' AND kind <> 'ciphertext' AND body LIKE ? ESCAPE '\\' ORDER BY sequence DESC LIMIT 50").bind(cid, '%' + esc + '%').all();
      await hydrateReactions((results || []).map(r => r.id));
      await hydrateUsersByIds((results || []).map(r => r.sender_id));
      const out = (results || []).filter(r => !(hs && hs.has(r.id))).map(r => decorateMessage(rowToMessage(r), myId, cid));
      return json({ messages: out });
    }
    const ql = q.toLowerCase();
    const out = (messages.get(cid) || []).filter(x => !x.unsent && x.kind !== 'sticker' && x.kind !== 'ciphertext' && !(hs && hs.has(x.id)) && String(x.body).toLowerCase().includes(ql));
    return json({ messages: out.slice(-50).reverse().map(x => decorateMessage(x, myId, cid)) });
  }

  // ---------- Polls, notes, events, albums ----------
  if ((m = p.match(/^conversations\/([\w-]+)\/polls$/))) {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const db = dbOf();
    if (db) {
      await ensureSchema();
      await hydratePolls(cid);
    }
    if (method === 'GET') return json({ polls: Array.from(polls.values()).filter(x => x.conversation_id === cid).map(x => pollView(x, myId)) });
    if (method === 'POST') {
      const b = await readJson(request);
      const question = clip(b.question, 200);
      const opts = (Array.isArray(b.options) ? b.options : []).map(o => clip(String(o), 100)).filter(Boolean);
      if (!question || opts.length < 2 || opts.length > 10) return bad('질문과 2~10개의 선택지가 필요합니다');
      const poll = { id: uid(), conversation_id: cid, question, multiple: b.multiple === true, closed: false, created_by: myId, created_at: now(), options: opts.map((t, i) => ({ id: `opt-${i}`, text: t, voters: new Set() })) };
      polls.set(poll.id, poll);
      if (db) {
        const optionsJson = JSON.stringify(poll.options.map(o => ({ id: o.id, text: o.text })));
        await db.prepare('INSERT INTO polls (id, conversation_id, question, option1, option2, multiple, closed, created_by, options_json, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)').bind(poll.id, cid, question, opts[0] || '', opts[1] || '', poll.multiple ? 1 : 0, myId, optionsJson, poll.created_at).run();
      }
      pushMessage(cid, myId, { kind: 'poll', body: question, metadata: { poll_id: poll.id } });
      broadcast({ type: 'poll.updated', conversation_id: cid, poll_id: poll.id });
      return json(pollView(poll, myId), 201);
    }
  }
  if ((m = p.match(/^polls\/([\w-]+)\/vote$/)) && method === 'POST') {
    const db = dbOf();
    if (db) {
      await ensureSchema();
      const prow = await db.prepare('SELECT conversation_id FROM polls WHERE id = ?').bind(m[1]).first();
      if (prow) await hydratePolls(prow.conversation_id);
    }
    const poll = polls.get(m[1]);
    let pconv = poll ? conversations.get(poll.conversation_id) : null;
    if (poll && !pconv) pconv = await hydrateDurableConversation(poll.conversation_id).catch(() => null);
    if (!poll || !pconv?.members.includes(myId)) return bad('투표를 찾을 수 없습니다', 404);
    if (poll.closed) return bad('종료된 투표입니다');
    const b = await readJson(request);
    const opt = poll.options.find(o => o.id === b.option_id);
    if (!opt) return bad('선택지를 찾을 수 없습니다');
    const wasVoted = opt.voters.has(myId);
    if (wasVoted) opt.voters.delete(myId);
    else {
      if (!poll.multiple) poll.options.forEach(o => o.voters.delete(myId));
      opt.voters.add(myId);
    }
    if (db) {
      if (!poll.multiple && !wasVoted) await db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?').bind(m[1], myId).run();
      if (wasVoted) await db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND option_id = ? AND user_id = ?').bind(m[1], opt.id, myId).run();
      else await db.prepare('INSERT OR IGNORE INTO poll_votes (poll_id, option_id, user_id, created_at) VALUES (?, ?, ?, ?)').bind(m[1], opt.id, myId, now()).run();
    }
    broadcast({ type: 'poll.updated', conversation_id: poll.conversation_id, poll_id: poll.id });
    return json({ status: 'voted', poll: pollView(poll, myId) });
  }
  if ((m = p.match(/^polls\/([\w-]+)\/close$/)) && method === 'POST') {
    const db = dbOf();
    if (db) {
      await ensureSchema();
      const prow = await db.prepare('SELECT conversation_id FROM polls WHERE id = ?').bind(m[1]).first();
      if (prow) await hydratePolls(prow.conversation_id);
    }
    const poll = polls.get(m[1]);
    let pconv = poll ? conversations.get(poll.conversation_id) : null;
    if (poll && !pconv) pconv = await hydrateDurableConversation(poll.conversation_id).catch(() => null);
    if (!poll || !pconv?.members.includes(myId)) return bad('투표를 찾을 수 없습니다', 404);
    if (poll.created_by !== myId) return bad('투표를 만든 사람만 종료할 수 있습니다', 403);
    poll.closed = true;
    if (db) await db.prepare('UPDATE polls SET closed = 1 WHERE id = ?').bind(m[1]).run();
    broadcast({ type: 'poll.updated', conversation_id: poll.conversation_id, poll_id: poll.id });
    return json({ status: 'closed', poll: pollView(poll, myId) });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/notes$/))) {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const db = dbOf();
    if (db) {
      await ensureSchema();
      await hydrateNotes(cid);
    }
    const list = noteStore.get(cid) || [];
    if (method === 'GET') {
      await hydrateUsersByIds(list.map(n => n.author_id));
      return json({ notes: list.map(n => ({ ...n, author: userBrief(n.author_id) })) });
    }
    if (method === 'POST') {
      const b = await readJson(request);
      const title = clip(b.title, 80), body = clip(b.body, 3000);
      if (!title) return bad('노트 제목을 입력하세요');
      const note = { id: uid(), title, body, author_id: myId, created_at: now() };
      list.unshift(note);
      noteStore.set(cid, list);
      if (db) await db.prepare('INSERT INTO conversation_notes (id, conversation_id, author_id, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(note.id, cid, note.author_id, note.title, note.body, note.created_at).run();
      return json({ ...note, author: userBrief(myId) }, 201);
    }
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/notes\/([\w-]+)$/)) && method === 'DELETE') {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const db = dbOf();
    if (db) {
      await ensureSchema();
      await hydrateNotes(cid);
    }
    const list = noteStore.get(cid) || [];
    const note = list.find(n => n.id === m[2]);
    if (!note) return bad('노트를 찾을 수 없습니다', 404);
    if (note.author_id !== myId && conv.owner_id !== myId) return bad('삭제 권한이 없습니다', 403);
    noteStore.set(cid, list.filter(n => n.id !== m[2]));
    if (db) await db.prepare('DELETE FROM conversation_notes WHERE id = ? AND conversation_id = ?').bind(m[2], cid).run();
    return json({ status: 'deleted' });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/events$/))) {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const db = dbOf();
    if (db) {
      await ensureSchema();
      await hydrateEvents(cid);
    }
    const list = eventStore.get(cid) || [];
    const view = e => ({ ...e, rsvps: Object.fromEntries(e.rsvps), my_rsvp: e.rsvps.get(myId) || '', creator: userBrief(e.created_by) });
    if (method === 'GET') {
      await hydrateUsersByIds(list.map(e => e.created_by));
      return json({ events: list.map(view) });
    }
    if (method === 'POST') {
      const b = await readJson(request);
      const title = clip(b.title, 80);
      const startsAt = Date.parse(b.starts_at);
      if (!title || Number.isNaN(startsAt)) return bad('일정 제목과 시작 시간이 필요합니다');
      const ev = { id: uid(), title, starts_at: new Date(startsAt).toISOString(), location: clip(b.location || '', 100), created_by: myId, created_at: now(), rsvps: new Map([[myId, 'going']]) };
      list.push(ev);
      list.sort((a, b2) => a.starts_at.localeCompare(b2.starts_at));
      eventStore.set(cid, list);
      if (db) {
        await db.prepare('INSERT INTO conversation_events (id, conversation_id, title, starts_at, location, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(ev.id, cid, ev.title, ev.starts_at, ev.location, ev.created_by, ev.created_at).run();
        await db.prepare('INSERT OR IGNORE INTO event_rsvps (event_id, user_id, status, updated_at) VALUES (?, ?, ?, ?)').bind(ev.id, myId, 'going', now()).run();
      }
      pushMessage(cid, myId, { kind: 'text', body: `📅 일정 등록: ${title} (${new Date(startsAt).toLocaleString('ko-KR')})` });
      return json(view(ev), 201);
    }
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/events\/([\w-]+)\/rsvp$/)) && method === 'POST') {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const db = dbOf();
    if (db) {
      await ensureSchema();
      await hydrateEvents(cid);
    }
    const ev = (eventStore.get(cid) || []).find(e => e.id === m[2]);
    if (!ev) return bad('일정을 찾을 수 없습니다', 404);
    const b = await readJson(request);
    if (!['going', 'maybe', 'no'].includes(b.status)) return bad('참석 상태 값이 올바르지 않습니다');
    ev.rsvps.set(myId, b.status);
    if (db) await db.prepare('INSERT INTO event_rsvps (event_id, user_id, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(event_id, user_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at').bind(m[2], myId, b.status, now()).run();
    return json({ status: 'saved', rsvps: Object.fromEntries(ev.rsvps) });
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/albums$/))) {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없거나 접근 권한이 없습니다', 404);
    const db = dbOf();
    if (db) {
      await ensureSchema();
      await hydrateAlbums(cid);
    }
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
      if (db) await db.prepare('INSERT INTO albums (id, conversation_id, title, image_urls, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(album.id, cid, album.title, JSON.stringify(ids), myId, album.created_at).run();
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
    if (!conv) return bad('대화방을 찾을 수 없습니다', 404);
    if (userKind(me) === 'bot') {
      if (!botScopeAllows(me, 'post', conv.id)) return json({ error: 'forbidden' }, 403);
    } else if (!conv.members.includes(myId)) {
      return bad('대화방을 찾을 수 없습니다', 404);
    }
    if (typeof b.content_base64 !== 'string' || !b.content_base64 || b.content_base64.length > MAX_ATTACHMENT_B64 || !/^[A-Za-z0-9+/=]+$/.test(b.content_base64)) return bad('파일이 비어 있거나 너무 큽니다 (최대 10MB)', 413);
    const mime = typeof b.mime_type === 'string' ? b.mime_type.toLowerCase() : '';
    if (!ATTACHMENT_MIME_ALLOW.has(mime)) return json({ error: '허용되지 않은 파일 형식입니다', code: 'MIME_NOT_ALLOWED' }, 415);
    if (userKind(me) === 'bot' && !mime.startsWith('image/')) return json({ error: '허용되지 않은 파일 형식입니다', code: 'MIME_NOT_ALLOWED' }, 415);
    const bucket = mediaBucketOf();
    const store = dbOf();
    if (!bucket || !store) return json({ error: '미디어 스토리지가 아직 연결되지 않았습니다', code: 'MEDIA_UNAVAILABLE' }, 503);
    const bin = atob(b.content_base64);
    if (bin.length > MAX_ATTACHMENT_BYTES) return bad('파일이 비어 있거나 너무 큽니다 (최대 10MB)', 413);
    if (userKind(me) === 'bot' && bin.length > BOT_ATTACHMENT_MAX_BYTES) return bad('파일이 비어 있거나 너무 큽니다 (최대 5MB)', 413);
    const quota = await quotaConsumeUpload(myId, bin.length);
    if (!quota.ok) return json({ error: 'daily upload quota exceeded', code: 'QUOTA_EXCEEDED', quota_reason: quota.reason }, 429);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // F29: moderation-blocked bytes are rejected before they touch storage.
    // E7: sealed (E2EE) bytes skip content screening — ciphertext cannot be
    // screened, and must not be sent to a third-party API for a verdict.
    const sealed = b.encrypted === true;
    const upHash = await sha256Hex(bytes);
    await ensureSchema().catch(() => {});
    if (!sealed) {
      const blocked = await store.prepare('SELECT sha256 FROM luno_blocked_hashes WHERE sha256 = ?').bind(upHash).first().catch(() => null);
      if (blocked) return json({ error: '차단된 파일입니다', code: 'ATTACHMENT_BLOCKED' }, 403);
    }
    // GCP Vision SafeSearch: adult/violent photos never reach storage.
    if (!sealed && mime.startsWith('image/') && mime !== 'image/svg+xml') {
      const screen = await visionScreenImage(CURRENT_ENV, b.content_base64);
      if (screen.unsafe) return json({ error: '부적절한 이미지로 판단되어 보낼 수 없습니다', code: 'IMAGE_UNSAFE', reasons: screen.reasons }, 422);
    }
    const att = { id: uid(), owner: myId, conversation_id: conv.id, name: clip(b.original_name || 'file', 120) || 'file', mime, bytes, encrypted: sealed };
    await persistAttachmentR2(att);
    return json({ id: att.id, status: 'ready', original_name: att.name, mime_type: mime, size_bytes: bytes.length, encrypted: sealed, quota: { uploads_today: quota.uploads, bytes_today: quota.bytes } }, 201);
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
    await saveCallSession(call);
    const ringToken = await issueRingToken(call.id);
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
      ring_token: ringToken,
      callkit: {
        uuid: call.id,
        handle: me.handle || me.display_name,
        hasVideo: call.kind === 'video',
        localizedCallerName: me.display_name
      }
    };
    broadcast(callkitPayload);
    // N1-L: the invite doubles as the incoming-call notification.
    await notify(notifyEnv(), conv.members, {
      kind: 'call',
      conversation_id: conv.id,
      sender_id: myId,
      title: me.display_name || me.handle || 'LUNO',
      body: call.kind === 'video' ? '영상 전화가 왔습니다' : '음성 전화가 왔습니다',
      call_id: call.id,
      call_kind: call.kind,
      ring_token: ringToken,
    });
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
    // P1-6: the tab shows editor-published D1 rows (admin console) or an
    // honest empty feed. The labeled-sample fallback is removed: launch
    // serves no placeholder articles.
    if (dbOf()) {
      await ensureSchema();
      const { results } = await dbOf().prepare('SELECT * FROM luno_news ORDER BY published_at DESC, created_at DESC LIMIT 50').all().catch(() => ({ results: [] }));
      if (results && results.length) return json({ sample: false, hero: results, popular: [], fetched_at: now() });
    }
    return json({ sample: false, hero: [], popular: [], fetched_at: now() });
  }
  if ((m = p.match(/^calls\/([\w-]+)\/state$/)) && method === 'POST') {
    const call = await loadCallSession(m[1]);
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
      await saveCallSession(call);
      broadcast({ type: 'call.state', call_id: call.id, conversation_id: call.conversation_id, state: 'connected' });
      // Build 18: the callee's other devices stop ringing.
      await announceCallEnd(call);
      return json({ status: 'connected' });
    }
    const ended = await endCallSession(call, b.state, myId);
    return json({ status: 'ended', result: ended.result, duration: ended.duration });
  }
  // Build 18: the signals the other side sent (replayed by a callee whose
  // socket was closed when they went out). Membership is checked upstream.
  if ((m = p.match(/^calls\/([\w-]+)\/signals$/)) && method === 'GET') {
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

  // ---------- Timeline, stories, VOOM (D4: D1-backed, response shapes unchanged) ----------
  if (p === 'timeline') {
    await hydrateSocialGraph(myId);
    if (method === 'GET') {
      const sdb = await socialDb();
      if (!sdb) return json({ error: 'timeline requires a configured database' }, 501);
      const visible = [myId, ...friendIds(myId).filter(f => !fMeta(myId, f).hidden && !fMeta(myId, f).blocked)];
      const ph = visible.map(() => '?').join(',');
      const { results } = await sdb.prepare(
        `SELECT * FROM luno_timeline_posts WHERE author_id IN (${ph}) AND (visibility = 'friends' OR author_id = ?) AND id NOT IN (SELECT target_id FROM luno_hidden_targets WHERE target_type = 'feed_post') ORDER BY created_at DESC, rowid DESC LIMIT 100`
      ).bind(...visible, myId).all();
      const rows = results || [];
      const ids = rows.map(r => r.id);
      const likesByPost = await likeMap(sdb, 'timeline', ids);
      const commentsByPost = await commentMap(sdb, 'timeline', ids);
      await hydrateUsersByIds([...rows.map(r => r.author_id), ...[...commentsByPost.values()].flat().map(c => c.author_id)]);
      return json({ posts: rows.map(r => timelineRowView(r, likesByPost.get(r.id) || [], commentsByPost.get(r.id) || [], myId)) });
    }
    if (method === 'POST') {
      const sdb = await socialDb();
      if (!sdb) return json({ error: 'timeline requires a configured database' }, 501);
      const b = await readJson(request);
      const body = clip(b.body, 1000);
      if (!body) return bad('내용을 입력하세요');
      const bg = typeof b.bg === 'string' && /^(linear-gradient\([\w#%,\s().-]+\)|#[0-9a-fA-F]{6}|)$/.test(b.bg) ? b.bg : '';
      const post = { id: uid(), author_id: myId, body, bg, visibility: b.visibility === 'me' ? 'me' : 'friends', created_at: now() };
      await sdb.prepare('INSERT INTO luno_timeline_posts (id, author_id, body, bg, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(post.id, post.author_id, post.body, post.bg, post.visibility, post.created_at).run();
      sendTo(friendIds(myId), { type: 'timeline.updated' });
      return json(timelineRowView(post, [], [], myId), 201);
    }
  }
  if ((m = p.match(/^timeline\/([\w-]+)$/)) && method === 'DELETE') {
    const sdb = await socialDb();
    if (!sdb) return json({ error: 'timeline requires a configured database' }, 501);
    const post = await sdb.prepare('SELECT author_id FROM luno_timeline_posts WHERE id = ?').bind(m[1]).first();
    if (!post) return bad('게시물을 찾을 수 없습니다', 404);
    if (post.author_id !== myId) return bad('삭제 권한이 없습니다', 403);
    await sdb.prepare('DELETE FROM luno_timeline_likes WHERE post_id = ?').bind(m[1]).run();
    await sdb.prepare('DELETE FROM luno_timeline_comments WHERE post_id = ?').bind(m[1]).run();
    await sdb.prepare('DELETE FROM luno_timeline_posts WHERE id = ?').bind(m[1]).run();
    return json({ status: 'deleted' });
  }
  if ((m = p.match(/^timeline\/([\w-]+)\/(like|comments)$/)) && method === 'POST') {
    const sdb = await socialDb();
    if (!sdb) return json({ error: 'timeline requires a configured database' }, 501);
    const post = await sdb.prepare('SELECT * FROM luno_timeline_posts WHERE id = ?').bind(m[1]).first();
    if (!post || (post.author_id !== myId && !isFriend(myId, post.author_id))) return bad('게시물을 찾을 수 없습니다', 404);
    if (m[2] === 'like') {
      const existing = await sdb.prepare('SELECT user_id FROM luno_timeline_likes WHERE post_id = ? AND user_id = ?').bind(m[1], myId).first();
      if (existing) await sdb.prepare('DELETE FROM luno_timeline_likes WHERE post_id = ? AND user_id = ?').bind(m[1], myId).run();
      else await sdb.prepare('INSERT INTO luno_timeline_likes (post_id, user_id) VALUES (?, ?)').bind(m[1], myId).run();
    } else {
      const b = await readJson(request);
      const body = clip(b.body, 300);
      if (!body) return bad('댓글을 입력하세요');
      await sdb.prepare('INSERT INTO luno_timeline_comments (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)').bind(uid(), m[1], myId, body, now()).run();
    }
    const likesByPost = await likeMap(sdb, 'timeline', [m[1]]);
    const commentsByPost = await commentMap(sdb, 'timeline', [m[1]]);
    return json(timelineRowView(post, likesByPost.get(m[1]) || [], commentsByPost.get(m[1]) || [], myId), m[2] === 'like' ? 200 : 201);
  }
  if (p === 'stories') {
    await hydrateSocialGraph(myId);
    if (method === 'GET') {
      const sdb = await socialDb();
      if (!sdb) return json({ error: 'stories require a configured database' }, 501);
      const visible = [myId, ...friendIds(myId).filter(f => !fMeta(myId, f).hidden && !fMeta(myId, f).blocked)];
      const ph = visible.map(() => '?').join(',');
      const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { results } = await sdb.prepare(
        `SELECT * FROM luno_stories WHERE author_id IN (${ph}) AND created_at > ? ORDER BY created_at DESC, rowid DESC`
      ).bind(...visible, cutoff).all();
      const rows = results || [];
      await hydrateUsersByIds(rows.map(r => r.author_id));
      const viewsByStory = await storyViewsById(sdb, rows.map(r => r.id));
      return json({ stories: rows.map(x => {
        const viewers = viewsByStory.get(x.id) || [];
        return { id: x.id, author: userBrief(x.author_id), body: x.body, bg: x.bg, created_at: x.created_at, viewed: viewers.includes(myId), view_count: x.author_id === myId ? viewers.length : undefined };
      }) });
    }
    if (method === 'POST') {
      const sdb = await socialDb();
      if (!sdb) return json({ error: 'stories require a configured database' }, 501);
      const b = await readJson(request);
      const body = clip(b.body, 200);
      if (!body) return bad('스토리 내용을 입력하세요');
      const bg = typeof b.bg === 'string' && /^(linear-gradient\([\w#%,\s().-]+\)|#[0-9a-fA-F]{6}|)$/.test(b.bg) ? b.bg : '';
      // D4: stories older than 7 days are purged on the write path (no cron).
      const purgeBefore = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      await sdb.prepare('DELETE FROM luno_story_views WHERE story_id IN (SELECT id FROM luno_stories WHERE created_at < ?)').bind(purgeBefore).run();
      await sdb.prepare('DELETE FROM luno_stories WHERE created_at < ?').bind(purgeBefore).run();
      const story = { id: uid(), author_id: myId, body, bg, created_at: now() };
      await sdb.prepare('INSERT INTO luno_stories (id, author_id, body, bg, created_at) VALUES (?, ?, ?, ?, ?)').bind(story.id, story.author_id, story.body, story.bg, story.created_at).run();
      sendTo(friendIds(myId), { type: 'timeline.updated' });
      return json({ id: story.id }, 201);
    }
  }
  if ((m = p.match(/^stories\/([\w-]+)\/view$/)) && method === 'POST') {
    await hydrateSocialGraph(myId);
    const sdb = await socialDb();
    if (!sdb) return json({ error: 'stories require a configured database' }, 501);
    const s = await sdb.prepare('SELECT author_id FROM luno_stories WHERE id = ?').bind(m[1]).first();
    if (s && s.author_id !== myId && isFriend(myId, s.author_id)) {
      await sdb.prepare('INSERT OR IGNORE INTO luno_story_views (story_id, user_id) VALUES (?, ?)').bind(m[1], myId).run();
    }
    return json({ status: 'viewed' });
  }
  if (p === 'voom') {
    if (method === 'GET') {
      const sdb = await socialDb();
      if (!sdb) return json({ error: 'voom requires a configured database' }, 501);
      const { results } = await sdb.prepare('SELECT * FROM luno_voom_posts ORDER BY created_at DESC, rowid DESC').all();
      const rows = results || [];
      const ids = rows.map(r => r.id);
      const likesByPost = await likeMap(sdb, 'voom', ids);
      const commentsByPost = await commentMap(sdb, 'voom', ids);
      await hydrateUsersByIds([...rows.map(r => r.author_id), ...[...commentsByPost.values()].flat().map(c => c.author_id)]);
      return json({ videos: rows.map(x => voomRowView(x, likesByPost.get(x.id) || [], commentsByPost.get(x.id) || [], myId)) });
    }
    if (method === 'POST') {
      const sdb = await socialDb();
      if (!sdb) return json({ error: 'voom requires a configured database' }, 501);
      const b = await readJson(request);
      const title = clip(b.title, 100);
      if (!title) return bad('제목을 입력하세요');
      const emoji = clip(b.emoji || '🎬', 8) || '🎬';
      const bgs = ['linear-gradient(135deg,#4F7CFF,#0ea5e9)', 'linear-gradient(135deg,#f97316,#f43f5e)', 'linear-gradient(135deg,#6366f1,#ec4899)', 'linear-gradient(135deg,#14b8a6,#84cc16)'];
      const count = await sdb.prepare('SELECT COUNT(*) AS n FROM luno_voom_posts').first();
      const v = { id: uid(), title, emoji, author_id: myId, bg: bgs[Number(count?.n || 0) % bgs.length], created_at: now() };
      await sdb.prepare('INSERT INTO luno_voom_posts (id, author_id, title, emoji, bg, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(v.id, v.author_id, v.title, v.emoji, v.bg, v.created_at).run();
      return json(voomRowView(v, [], [], myId), 201);
    }
  }
  if ((m = p.match(/^voom\/([\w-]+)\/(like|comments)$/)) && method === 'POST') {
    const sdb = await socialDb();
    if (!sdb) return json({ error: 'voom requires a configured database' }, 501);
    const v = await sdb.prepare('SELECT * FROM luno_voom_posts WHERE id = ?').bind(m[1]).first();
    if (!v) return bad('영상을 찾을 수 없습니다', 404);
    if (m[2] === 'like') {
      const existing = await sdb.prepare('SELECT user_id FROM luno_voom_likes WHERE post_id = ? AND user_id = ?').bind(m[1], myId).first();
      if (existing) await sdb.prepare('DELETE FROM luno_voom_likes WHERE post_id = ? AND user_id = ?').bind(m[1], myId).run();
      else await sdb.prepare('INSERT INTO luno_voom_likes (post_id, user_id) VALUES (?, ?)').bind(m[1], myId).run();
    } else {
      const b = await readJson(request);
      const body = clip(b.body, 300);
      if (!body) return bad('댓글을 입력하세요');
      await sdb.prepare('INSERT INTO luno_voom_comments (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)').bind(uid(), m[1], myId, body, now()).run();
    }
    const likesByPost = await likeMap(sdb, 'voom', [m[1]]);
    const commentsByPost = await commentMap(sdb, 'voom', [m[1]]);
    return json(voomRowView(v, likesByPost.get(m[1]) || [], commentsByPost.get(m[1]) || [], myId), m[2] === 'like' ? 200 : 201);
  }

  // ---------- Pay wallet & shop (D3: wallets + owned items in D1) ----------
  if (p === 'wallet' && method === 'GET') {
    await hydrateWallet(myId);
    const w = walletOf(myId);
    return json({ balance: w.balance, currency: 'KRW', transactions: w.tx.slice(0, 50) });
  }
// F13: money moves only with an explicit operator flag. Default off:
// charge/send/orders answer 503 and no balance path runs.
function paymentsEnabled() { return CURRENT_ENV && CURRENT_ENV.PAYMENTS_ENABLED === 'true'; }
function paymentsGate() { return json({ error: '결제 기능은 준비 중입니다', code: 'PAYMENTS_DISABLED' }, 503); }
// Account plan + feature entitlement. Plans exist so future
// personal/developer/business tiers can attach; no billing code lives here.
function accountPlan(u) { return u && ACCOUNT_PLANS.includes(u.plan) ? u.plan : 'personal'; }
function entitled(u, feature) {
  if (feature === 'payments') return paymentsEnabled();
  return (PLAN_GRANTS[accountPlan(u)] || []).includes(feature);
}
  if (p === 'wallet/charge' && method === 'POST') {
    if (!entitled(me, 'payments')) return paymentsGate();
    const b = await readJson(request);
    const amount = intIn(b.amount, 1000, 1000000);
    if (amount === null) return bad('충전 금액은 1,000원 ~ 1,000,000원입니다');
    const db = dbOf();
    if (db) {
      await ensureSchema();
      await hydrateWallet(myId);
      const at = now(), txid = uid();
      await db.batch([
        db.prepare('INSERT INTO wallet_transactions (id, from_user_id, to_user_id, amount, note, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(txid, '', myId, amount, '잔액 충전(시뮬레이션)', 'charge', at),
        db.prepare('UPDATE wallets SET balance = balance + ?, updated_at = ? WHERE user_id = ?').bind(amount, at, myId),
      ]);
      await hydrateWallet(myId);
    } else {
      const w = walletOf(myId);
      w.balance += amount;
      w.tx.unshift({ id: uid(), type: 'charge', amount, note: '잔액 충전(시뮬레이션)', created_at: now() });
    }
    return json({ balance: walletOf(myId).balance }, 201);
  }
  if (p === 'wallet/send' && method === 'POST') {
    if (!entitled(me, 'payments')) return paymentsGate();
    await hydrateSocialGraph(myId);
    const b = await readJson(request);
    const amount = intIn(b.amount, 1, 500000);
    if (amount === null) return bad('송금 금액은 1원 ~ 500,000원입니다');
    if (!isFriend(myId, b.to_user_id) || fMeta(myId, b.to_user_id).blocked) return bad('친구에게만 송금할 수 있습니다', 403);
    const db = dbOf();
    if (db) {
      await ensureSchema();
      await hydrateWallet(myId);
      await hydrateWallet(b.to_user_id);
    }
    const mine = walletOf(myId);
    if (mine.balance < amount) return bad('잔액이 부족합니다', 402);
    const theirs = walletOf(b.to_user_id);
    const note = clip(b.note || '', 50);
    const at = now();
    if (db) {
      const txid = uid();
      await db.batch([
        db.prepare('INSERT INTO wallet_transactions (id, from_user_id, to_user_id, amount, note, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(txid, myId, b.to_user_id, amount, note, 'send', at),
        db.prepare('UPDATE wallets SET balance = balance - ?, updated_at = ? WHERE user_id = ?').bind(amount, at, myId),
        db.prepare('UPDATE wallets SET balance = balance + ?, updated_at = ? WHERE user_id = ?').bind(amount, at, b.to_user_id),
      ]);
      await hydrateWallet(myId);
      await hydrateWallet(b.to_user_id);
    } else {
      mine.balance -= amount;
      theirs.balance += amount;
      mine.tx.unshift({ id: uid(), type: 'send', amount: -amount, counterparty: userBrief(b.to_user_id)?.display_name, note, created_at: at });
      theirs.tx.unshift({ id: uid(), type: 'receive', amount, counterparty: me.display_name, note, created_at: at });
    }
    let conv = findDirect(myId, b.to_user_id);
    if (!conv) conv = createConversation({ kind: 'direct', title: '', members: [myId, b.to_user_id] });
    pushMessage(conv.id, myId, { kind: 'pay', body: note || '송금', metadata: { amount } });
    return json({ balance: walletOf(myId).balance }, 201);
  }
  if (p === 'store/stickers' && method === 'GET') {
    await hydrateOwned(myId);
    const owned = packsOf(myId);
    return json({ packs: STICKER_CATALOG.map(pk => ({ ...pk, owned: owned.has(pk.id), currency: 'KRW' })) });
  }
  if (p === 'store/themes' && method === 'GET') {
    await hydrateOwned(myId);
    const owned = themesOf(myId);
    return json({ themes: THEME_CATALOG.map(t => ({ ...t, owned: owned.has(t.id), currency: 'KRW' })) });
  }
  if (p === 'store/orders' && method === 'POST') {
    if (!entitled(me, 'payments')) return paymentsGate();
    const b = await readJson(request);
    const pack = STICKER_CATALOG.find(x => x.id === b.pack_id);
    const theme = THEME_CATALOG.find(x => x.id === b.theme_id);
    const item = pack || theme;
    if (!item) return bad('상품을 찾을 수 없습니다', 404);
    const db = dbOf();
    if (db) {
      await ensureSchema();
      await hydrateOwned(myId);
      await hydrateWallet(myId);
    }
    const owned = pack ? packsOf(myId) : themesOf(myId);
    if (owned.has(item.id)) return bad('이미 보유한 상품입니다', 409);
    const w = walletOf(myId);
    if (w.balance < item.price_minor) return bad('잔액이 부족합니다. Pay에서 충전해 주세요', 402);
    const orderId = uid();
    const at = now();
    if (db) {
      await db.batch([
        db.prepare('INSERT INTO wallet_transactions (id, from_user_id, to_user_id, amount, note, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(orderId, myId, '', item.price_minor, item.title, 'purchase', at),
        db.prepare('UPDATE wallets SET balance = balance - ?, updated_at = ? WHERE user_id = ?').bind(item.price_minor, at, myId),
        db.prepare('INSERT OR IGNORE INTO luno_owned_items (user_id, item_type, item_id) VALUES (?, ?, ?)').bind(myId, pack ? 'pack' : 'theme', item.id),
      ]);
      await hydrateWallet(myId);
      await hydrateOwned(myId);
    } else {
      w.balance -= item.price_minor;
      owned.add(item.id);
      w.tx.unshift({ id: orderId, type: 'purchase', amount: -item.price_minor, note: item.title, created_at: at });
    }
    storeOrders.set(orderId, { id: orderId, buyer: myId, amount: item.price_minor });
    return json({ order_id: orderId, status: 'completed', balance: walletOf(myId).balance }, 201);
  }

  // ---------- OpenChat (D4: D1-backed) ----------
  if (p === 'community/rooms') {
    if (method === 'GET') {
      const sdb = await socialDb();
      if (!sdb) return json({ error: 'openchat requires a configured database' }, 501);
      const q = clip(url.searchParams.get('q') || '', 50).toLowerCase();
      const like = `%${escapeLike(q)}%`;
      const { results } = q
        ? await sdb.prepare(`SELECT r.*, COUNT(m.user_id) AS member_count, MAX(CASE WHEN m.user_id = ? THEN 1 ELSE 0 END) AS joined
            FROM luno_community_rooms r LEFT JOIN luno_community_members m ON m.room_id = r.id
            WHERE LOWER(r.name) LIKE ? ESCAPE '\\' OR LOWER(r.description) LIKE ? ESCAPE '\\' GROUP BY r.id`).bind(myId, like, like).all()
        : await sdb.prepare(`SELECT r.*, COUNT(m.user_id) AS member_count, MAX(CASE WHEN m.user_id = ? THEN 1 ELSE 0 END) AS joined
            FROM luno_community_rooms r LEFT JOIN luno_community_members m ON m.room_id = r.id GROUP BY r.id`).bind(myId).all();
      return json({ rooms: (results || []).map(r => ({ id: r.id, name: r.name, description: r.description, visibility: r.visibility, owner_id: r.owner_id, created_at: r.created_at, member_count: Number(r.member_count || 0), joined: Number(r.joined || 0) === 1 })) });
    }
    if (method === 'POST') {
      const sdb = await socialDb();
      if (!sdb) return json({ error: 'openchat requires a configured database' }, 501);
      const b = await readJson(request);
      const name = clip(b.name, 50);
      if (!name) return bad('오픈채팅 이름을 입력하세요');
      const room = { id: uid(), name, description: clip(b.description || '', 200), visibility: 'public', owner_id: myId, created_at: now() };
      const nickname = clip(b.nickname || me.display_name, 20) || me.display_name;
      await sdb.prepare('INSERT INTO luno_community_rooms (id, name, description, visibility, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(room.id, room.name, room.description, room.visibility, room.owner_id, room.created_at).run();
      await sdb.prepare('INSERT INTO luno_community_members (room_id, user_id, nickname) VALUES (?, ?, ?)').bind(room.id, myId, nickname).run();
      return json({ ...room, member_count: 1, joined: true }, 201);
    }
  }
  if ((m = p.match(/^community\/rooms\/([\w-]+)\/(join|leave)$/)) && method === 'POST') {
    const sdb = await socialDb();
    if (!sdb) return json({ error: 'openchat requires a configured database' }, 501);
    const room = await sdb.prepare('SELECT id FROM luno_community_rooms WHERE id = ?').bind(m[1]).first();
    if (!room) return bad('오픈채팅을 찾을 수 없습니다', 404);
    if (m[2] === 'join') {
      const b = await readJson(request);
      const nickname = clip(b.nickname || me.display_name, 20) || me.display_name;
      await sdb.prepare('INSERT INTO luno_community_members (room_id, user_id, nickname) VALUES (?, ?, ?) ON CONFLICT(room_id, user_id) DO UPDATE SET nickname = excluded.nickname').bind(m[1], myId, nickname).run();
      const count = await sdb.prepare('SELECT COUNT(*) AS n FROM luno_community_members WHERE room_id = ?').bind(m[1]).first();
      return json({ status: 'joined', nickname, member_count: Number(count?.n || 0) }, 201);
    }
    await sdb.prepare('DELETE FROM luno_community_members WHERE room_id = ? AND user_id = ?').bind(m[1], myId).run();
    const count = await sdb.prepare('SELECT COUNT(*) AS n FROM luno_community_members WHERE room_id = ?').bind(m[1]).first();
    return json({ status: 'left', member_count: Number(count?.n || 0) });
  }
  if ((m = p.match(/^community\/rooms\/([\w-]+)\/posts$/))) {
    const sdb = await socialDb();
    if (!sdb) return json({ error: 'openchat requires a configured database' }, 501);
    const room = await sdb.prepare('SELECT id FROM luno_community_rooms WHERE id = ?').bind(m[1]).first();
    if (!room) return bad('오픈채팅을 찾을 수 없습니다', 404);
    if (method === 'GET') {
      const mine = await sdb.prepare('SELECT nickname FROM luno_community_members WHERE room_id = ? AND user_id = ?').bind(m[1], myId).first();
      const { results } = await sdb.prepare("SELECT * FROM luno_community_posts WHERE room_id = ? AND id NOT IN (SELECT target_id FROM luno_hidden_targets WHERE target_type = 'community_post') ORDER BY created_at DESC, rowid DESC LIMIT 200").bind(m[1]).all();
      const rows = results || [];
      const likesByPost = await likeMap(sdb, 'community', rows.map(r => r.id));
      return json({ posts: rows.map(x => communityPostRowView(x, likesByPost.get(x.id) || [], myId)), joined: !!mine, nickname: mine?.nickname || '' });
    }
    if (method === 'POST') {
      await sdb.prepare('INSERT OR IGNORE INTO luno_community_members (room_id, user_id, nickname) VALUES (?, ?, ?)').bind(m[1], myId, clip(me.display_name, 20) || '익명').run();
      const b = await readJson(request);
      const body = clip(b.body, 1000);
      if (!body) return bad('메시지를 입력하세요');
      const mine = await sdb.prepare('SELECT nickname FROM luno_community_members WHERE room_id = ? AND user_id = ?').bind(m[1], myId).first();
      const post = { id: uid(), room_id: m[1], author_id: myId, author_name: mine?.nickname || '익명', body, created_at: now() };
      await sdb.prepare('INSERT INTO luno_community_posts (id, room_id, author_id, author_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(post.id, post.room_id, post.author_id, post.author_name, post.body, post.created_at).run();
      const memberRows = await sdb.prepare('SELECT user_id FROM luno_community_members WHERE room_id = ?').bind(m[1]).all();
      sendTo((memberRows.results || []).map(r => r.user_id), { type: 'community.post', room_id: m[1], post: communityPostRowView(post, [], myId) });
      return json(communityPostRowView(post, [], myId), 201);
    }
  }
  if ((m = p.match(/^community\/rooms\/([\w-]+)\/posts\/([\w-]+)\/like$/)) && method === 'POST') {
    const sdb = await socialDb();
    if (!sdb) return json({ error: 'openchat requires a configured database' }, 501);
    const room = await sdb.prepare('SELECT id FROM luno_community_rooms WHERE id = ?').bind(m[1]).first();
    if (!room) return bad('오픈채팅을 찾을 수 없습니다', 404);
    await sdb.prepare('INSERT OR IGNORE INTO luno_community_members (room_id, user_id, nickname) VALUES (?, ?, ?)').bind(m[1], myId, clip(me.display_name, 20) || '익명').run();
    const post = await sdb.prepare('SELECT id FROM luno_community_posts WHERE id = ? AND room_id = ?').bind(m[2], m[1]).first();
    if (!post) return bad('게시물을 찾을 수 없습니다', 404);
    const existing = await sdb.prepare('SELECT user_id FROM luno_community_post_likes WHERE post_id = ? AND user_id = ?').bind(m[2], myId).first();
    if (existing) await sdb.prepare('DELETE FROM luno_community_post_likes WHERE post_id = ? AND user_id = ?').bind(m[2], myId).run();
    else await sdb.prepare('INSERT INTO luno_community_post_likes (post_id, user_id) VALUES (?, ?)').bind(m[2], myId).run();
    const memberRows = await sdb.prepare('SELECT user_id FROM luno_community_members WHERE room_id = ?').bind(m[1]).all();
    const likes = await sdb.prepare('SELECT COUNT(*) AS n FROM luno_community_post_likes WHERE post_id = ?').bind(m[2]).first();
    sendTo((memberRows.results || []).map(r => r.user_id), { type: 'community.post_liked', room_id: m[1], post_id: m[2], likes: Number(likes?.n || 0) });
    return json({ status: existing ? 'unliked' : 'liked', likes: Number(likes?.n || 0) });
  }

  // ---------- Search & reports ----------
  if (p === 'search' && method === 'GET') {
    await hydrateSocialGraph(myId);
    const q = clip(url.searchParams.get('q') || '', 100).toLowerCase();
    if (q.length < 2) return json({ messages: [], users: [], chats: [], official_accounts: [] });
    const mine = Array.from(conversations.values()).filter(c => c.members.includes(myId));
    const hs = hiddenMsgs.get(myId);
    const foundMsgs = [];
    for (const c of mine) {
      const title = chatSummary(c, myId).title;
      for (const x of messages.get(c.id) || []) {
        // E8: sealed bodies are device-searchable only — never server-matched.
        if (x.unsent || x.kind === 'sticker' || x.kind === 'system' || x.kind === 'ciphertext' || (hs && hs.has(x.id))) continue;
        if (String(x.body).toLowerCase().includes(q)) foundMsgs.push({ ...x, conversation_title: title });
      }
    }
    const hidSearch = await hiddenTargetIds('message', foundMsgs.map(x => x.id));
    const visSearch = foundMsgs.filter(x => !hidSearch.has(x.id));
    const friendsFound = friendIds(myId).map(id => usersById.get(id)).filter(u => u && (u.display_name.toLowerCase().includes(q) || u.handle === q)).map(publicUser);
    const chatsFound = mine.map(c => chatSummary(c, myId)).filter(c => (c.title || '').toLowerCase().includes(q));
    const oaFound = Array.from(officialAccounts.values()).filter(o => o.name.toLowerCase().includes(q) || o.handle.includes(q));
    return json({ messages: visSearch.slice(-30).reverse(), users: friendsFound, chats: chatsFound, official_accounts: oaFound });
  }
  // F4: reports persist to D1 (memory mirror kept for the no-DB path).
  function reportView(r) {
    return { id: r.id, reporter_id: r.reporter_id, subject_user_id: r.target_id || r.subject_user_id, category: r.reason || r.category, details: r.details || '', e2ee_disclosed: !!(r.e2ee_disclosed), state: r.status || r.state, created_at: r.created_at };
  }
  if (p === 'reports' && method === 'POST') {
    const b = await readJson(request);
    const category = clip(b.category, 80);
    if (!usersById.has(b.subject_user_id) || !REPORT_CATEGORIES.includes(category)) return bad('신고 정보가 올바르지 않습니다');
    // E8: decrypted content from a sealed room rides the report only with the
    // reporter's explicit per-report consent, and is marked as disclosed.
    let details = clip(b.details || '', 2000);
    let disclosed = 0;
    const dMid = typeof b.message_id === 'string' ? b.message_id : '';
    const dText = typeof b.e2ee_text === 'string' ? clip(b.e2ee_text, 2000) : '';
    if (dMid || dText) {
      let dConv = null;
      if (dMid) {
        for (const [dcid, mlist] of messages) {
          if ((mlist || []).some((x) => x.id === dMid)) { dConv = conversations.get(dcid); break; }
        }
        if (!dConv) return bad('메시지를 찾을 수 없습니다', 404);
      }
      if (dConv && e2eeRoomTargeted(dConv)) {
        if (!dText) return bad('복호화 내용을 첨부해 주세요', 400);
        if (b.plaintext_consent !== true) return json({ error: 'decrypted content needs your consent to attach', code: 'E2EE_CONSENT_REQUIRED' }, 400);
        disclosed = 1;
        details = clip(`${details}\n[복호화 첨부·신고자 동의 ${dMid}] ${dText}`, 4000);
      } else if (dText) {
        details = clip(`${details}\n${dText}`, 4000);
      }
    }
    const rep = { id: uid(), reporter_id: myId, subject_user_id: b.subject_user_id, category, details, e2ee_disclosed: disclosed, state: 'open', created_at: now() };
    adminReports.unshift(rep);
    if (dbOf()) {
      await ensureSchema();
      await dbOf().prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, e2ee_disclosed, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(rep.id, rep.reporter_id, 'user', rep.subject_user_id, rep.category, rep.details, disclosed, 'open', rep.created_at).run();
    }
    return json({ id: rep.id }, 201);
  }
  if (p === 'reports/mine' && method === 'GET') {
    if (dbOf()) {
      await ensureSchema();
      const rows = (await dbOf().prepare('SELECT * FROM reports WHERE reporter_id = ? ORDER BY created_at DESC LIMIT 100').bind(myId).all().catch(() => ({ results: [] }))).results || [];
      return json({ reports: rows.map(reportView) });
    }
    return json({ reports: adminReports.filter(r => r.reporter_id === myId).map(reportView) });
  }
  // F30: customer support tickets (D1 only, like official accounts/news).
  function supportTicketView(r) {
    return { id: r.id, category: r.category, body: r.body, app_version: r.app_version || '', device_info: r.device_info || '', attachment_id: r.attachment_id || '', status: r.status, answer: r.answer || '', answered_at: r.answered_at || '', created_at: r.created_at, updated_at: r.updated_at };
  }
  if (p === 'support/tickets' && method === 'POST') {
    if (!dbOf()) return bad('support tickets unavailable', 503);
    if (!await rateLimit('rl:support:' + myId, 60)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
    const b = await readJson(request);
    const category = clip(b.category, 30);
    if (!SUPPORT_TICKET_CATEGORIES.includes(category)) return bad('문의 분류를 선택하세요');
    const body = clip(b.body, 5000);
    if (!body) return bad('문의 내용을 입력하세요');
    const attachmentId = clip(b.attachment_id, 80);
    await ensureSchema();
    if (attachmentId) {
      const ownNew = await dbOf().prepare('SELECT uploader_id AS o FROM attachments WHERE id = ?').bind(attachmentId).first().catch(() => null);
      const ownLegacy = ownNew ? null : await dbOf().prepare('SELECT owner_id AS o FROM luno_attachments WHERE id = ?').bind(attachmentId).first().catch(() => null);
      if ((ownNew?.o ?? ownLegacy?.o) !== myId) return bad('첨부 파일을 찾을 수 없습니다');
    }
    const id = `sup-${uid()}`;
    const at = now();
    await dbOf().prepare('INSERT INTO luno_support_tickets (id, user_id, category, body, app_version, device_info, attachment_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, myId, category, body, clip(b.app_version, 40), clip(b.device_info, 200), attachmentId, 'open', at, at).run();
    return json({ id }, 201);
  }
  if (p === 'support/tickets' && method === 'GET') {
    if (!dbOf()) return bad('support tickets unavailable', 503);
    await ensureSchema();
    const { results } = await dbOf().prepare('SELECT * FROM luno_support_tickets WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 100').bind(myId).all().catch(() => ({ results: [] }));
    return json({ tickets: (results || []).map(supportTicketView) });
  }

  // S3: a bot reads its own token expiry for the morning briefing.
  if (p === 'bot/token' && method === 'GET') {
    if (userKind(me) !== 'bot') return json({ error: 'forbidden' }, 403);
    return json({ bot_id: myId, expires_at: me.botScope.expires_at, rooms: me.botScope.rooms, ops: me.botScope.ops });
  }
  // ---------- L-07 bot jobs (claim/complete; bots only, rooms in scope) ----------
  if (p === 'bot/jobs/claim' && method === 'POST') {
    if (userKind(me) !== 'bot') return json({ error: 'forbidden' }, 403);
    if (!await rateLimit('rl:botclaim:' + myId, 120)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
    const db = dbOf();
    if (!db) return json({ error: 'job queue requires a configured database' }, 501);
    await ensureSchema();
    const claimBody = await readJson(request).catch(() => ({}));
    await botPresenceTouch(me, claimBody && claimBody.presence);
    await botSeenTouch(me, (me.botScope && me.botScope.rooms) || []);
    if (await botKilled()) return json({ error: 'bot work halted by operator', code: 'LLM_KILLED' }, 403);
    if (!(await botQuotaOk(myId))) return json({ error: 'daily bot quota exceeded', code: 'BOT_QUOTA_EXCEEDED' }, 429);
    const rooms = (me.botScope && me.botScope.rooms) || [];
    if (!rooms.length) return json({ job: null });
    // Exhausted jobs fail out instead of clogging the queue.
    await db.prepare(`UPDATE luno_bot_jobs SET status = 'failed', error = 'max attempts exceeded', updated_at = datetime('now')
      WHERE bot_id = ? AND status != 'done' AND status != 'failed' AND attempts >= max_attempts`).bind(myId).run().catch(() => null);
    const ph = rooms.map(() => '?').join(',');
    for (let i = 0; i < 3; i++) {
      const cand = await db.prepare(`SELECT id FROM luno_bot_jobs WHERE bot_id = ? AND room_id IN (${ph})
        AND attempts < max_attempts AND (status = 'queued' OR (status = 'running' AND lock_expires_at < ?))
        ORDER BY created_at, rowid LIMIT 1`).bind(myId, ...rooms, Date.now()).first().catch(() => null);
      if (!cand) return json({ job: null });
      const lockUntil = Date.now() + 120000;
      const upd = await db.prepare(`UPDATE luno_bot_jobs SET status = 'running', attempts = attempts + 1, locked_by = ?, lock_expires_at = ?, updated_at = datetime('now')
        WHERE id = ? AND (status = 'queued' OR (status = 'running' AND lock_expires_at < ?))`)
        .bind(me.botScope.id, lockUntil, cand.id, Date.now()).run().catch(() => null);
      if (upd && upd.meta && Number(upd.meta.changes) === 1) {
        const job = await db.prepare('SELECT id, bot_id, room_id, kind, payload_json, status, attempts FROM luno_bot_jobs WHERE id = ?').bind(cand.id).first();
        let payload = {};
        try { payload = JSON.parse(job.payload_json); } catch {}
        return json({ job: { id: job.id, bot_id: job.bot_id, room_id: job.room_id, kind: job.kind, payload, status: job.status, attempts: job.attempts, locked_until: lockUntil } });
      }
    }
    return json({ job: null });
  }
  if ((m = p.match(/^bot\/jobs\/([\w-]+)\/complete$/)) && method === 'POST') {
    if (userKind(me) !== 'bot') return json({ error: 'forbidden' }, 403);
    const db = dbOf();
    if (!db) return json({ error: 'job queue requires a configured database' }, 501);
    const b = await readJson(request);
    if (b.status !== 'done' && b.status !== 'failed') return bad('status must be done or failed', 400);
    await ensureSchema();
    const job = await db.prepare('SELECT id, bot_id, status, locked_by FROM luno_bot_jobs WHERE id = ?').bind(m[1]).first().catch(() => null);
    if (!job || job.bot_id !== myId) return json({ error: 'job not found' }, 404);
    if (job.status !== 'running' || job.locked_by !== me.botScope.id) return json({ error: 'job is not locked by this runner' }, 409);
    const usage = (b.usage && typeof b.usage === 'object') ? b.usage : {};
    const reqN = usage.requests === undefined ? 1 : Number(usage.requests);
    const tokN = usage.tokens === undefined ? 0 : Number(usage.tokens);
    if (!Number.isInteger(reqN) || !Number.isInteger(tokN) || reqN < 0 || tokN < 0 || reqN > 1e9 || tokN > 1e9) {
      return bad('usage.requests and usage.tokens must be integers 0..1000000000', 400);
    }
    if (b.status === 'done') {
      await db.prepare(`UPDATE luno_bot_jobs SET status = 'done', result_json = ?, locked_by = NULL, lock_expires_at = 0, updated_at = datetime('now') WHERE id = ?`)
        .bind(clip(JSON.stringify(b.result ?? null), 4000), m[1]).run();
    } else {
      await db.prepare(`UPDATE luno_bot_jobs SET status = 'failed', error = ?, locked_by = NULL, lock_expires_at = 0, updated_at = datetime('now') WHERE id = ?`)
        .bind(clip(String(b.error || 'failed'), 500), m[1]).run();
    }
    const day = botDayUTC();
    await db.prepare(`INSERT INTO luno_bot_usage (bot_id, day, requests, tokens) VALUES (?, ?, ?, ?)
      ON CONFLICT (bot_id, day) DO UPDATE SET requests = requests + ?, tokens = tokens + ?`)
      .bind(myId, day, reqN, tokN, reqN, tokN).run().catch(() => null);
    return json({ status: b.status, id: m[1] }, 200);
  }

  // ---------- Admin ----------
  if (p.startsWith('admin/')) {
    if (me.role !== 'admin') return bad('forbidden', 403);
    if (p === 'admin/stats' && method === 'GET') {
      // F16: counts come from D1 so every isolate reports the same numbers.
      // Live calls stay memory (ephemeral by nature); orders follow in F17.
      if (dbOf()) {
        await ensureSchema();
        const count = async (sql) => Number((await dbOf().prepare(sql).first().catch(() => null))?.n || 0);
        return json({ metrics: {
          users: await count('SELECT COUNT(*) n FROM users'),
          active_sessions: await count('SELECT COUNT(*) n FROM luno_sessions WHERE revoked_at IS NULL'),
          conversations: await count('SELECT COUNT(*) n FROM luno_conversations'),
          messages: await count('SELECT COUNT(*) n FROM luno_messages'),
          open_reports: await count("SELECT COUNT(*) n FROM reports WHERE status = 'open'"),
          calls: callSessions.size, orders: storeOrders.size
        } });
      }
      return json({ metrics: {
        users: users.size, active_sessions: sessions.size, conversations: conversations.size,
        messages: Array.from(messages.values()).reduce((n, l) => n + l.length, 0),
        open_reports: adminReports.filter(r => r.state === 'open').length, calls: callSessions.size, orders: storeOrders.size
      } });
    }
    // F12: admin-managed official accounts and news (D1, no seeds).
    if (p === 'admin/official-accounts' && method === 'GET') {
      const all = await listOfficialAccounts();
      return json({ accounts: Array.from(all.values()) });
    }
    if (p === 'admin/official-accounts' && method === 'POST') {
      if (!dbOf()) return bad('official accounts unavailable', 503);
      const b = await readJson(request);
      const name = clip(String(b.name || ''), 40);
      if (!name) return bad('이름을 입력하세요');
      const color = /^#[0-9a-fA-F]{6}$/.test(String(b.color || '')) ? b.color : '#4F7CFF';
      const id = `oa-${uid()}`;
      const at = now();
      await ensureSchema();
      await dbOf().prepare('INSERT INTO luno_official_accounts (id, name, handle, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, name, clip(String(b.handle || ''), 30), clip(String(b.description || ''), 200), color, at, at).run();
      officialAccounts.set(id, { id, name, handle: clip(String(b.handle || ''), 30), description: clip(String(b.description || ''), 200), color });
      await persistAudit(myId, 'official_account.create', id);
      return json({ id, name, handle: clip(String(b.handle || ''), 30), description: clip(String(b.description || ''), 200), color }, 201);
    }
    if ((m = p.match(/^admin\/official-accounts\/([\w-]+)$/)) && (method === 'PATCH' || method === 'DELETE')) {
      if (!dbOf()) return bad('official accounts unavailable', 503);
      await ensureSchema();
      const row = await dbOf().prepare('SELECT * FROM luno_official_accounts WHERE id = ?').bind(m[1]).first().catch(() => null);
      if (!row) return bad('공식계정을 찾을 수 없습니다', 404);
      if (method === 'DELETE') {
        await dbOf().prepare('DELETE FROM luno_official_follows WHERE account_id = ?').bind(m[1]).run();
        await dbOf().prepare('DELETE FROM luno_official_accounts WHERE id = ?').bind(m[1]).run();
        officialAccounts.delete(m[1]);
        await persistAudit(myId, 'official_account.delete', m[1]);
        return json({ status: 'deleted' });
      }
      const b = await readJson(request);
      const name = b.name === undefined ? row.name : clip(String(b.name), 40);
      if (!name) return bad('이름을 입력하세요');
      const color = b.color === undefined ? row.color : (/^#[0-9a-fA-F]{6}$/.test(String(b.color)) ? b.color : row.color);
      await dbOf().prepare('UPDATE luno_official_accounts SET name = ?, handle = ?, description = ?, color = ?, updated_at = ? WHERE id = ?').bind(name, b.handle === undefined ? row.handle : clip(String(b.handle), 30), b.description === undefined ? row.description : clip(String(b.description), 200), color, now(), m[1]).run();
      const upd = await dbOf().prepare('SELECT * FROM luno_official_accounts WHERE id = ?').bind(m[1]).first();
      officialAccounts.set(m[1], { id: upd.id, name: upd.name, handle: upd.handle, description: upd.description, color: upd.color });
      await persistAudit(myId, 'official_account.update', upd.id);
      return json({ id: upd.id, name: upd.name, handle: upd.handle, description: upd.description, color: upd.color });
    }
    if (p === 'admin/news' && method === 'GET') {
      if (!dbOf()) return json({ articles: [] });
      await ensureSchema();
      const { results } = await dbOf().prepare('SELECT * FROM luno_news ORDER BY published_at DESC, created_at DESC LIMIT 100').all().catch(() => ({ results: [] }));
      return json({ articles: results || [] });
    }
    if (p === 'admin/news' && method === 'POST') {
      if (!dbOf()) return bad('news unavailable', 503);
      const b = await readJson(request);
      const title = clip(String(b.title || ''), 200);
      if (!title) return bad('제목을 입력하세요');
      const id = `news-${uid()}`;
      const at = now();
      await ensureSchema();
      await dbOf().prepare('INSERT INTO luno_news (id, title, press, category, published_at, image_url, summary, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, title, clip(String(b.press || ''), 60), clip(String(b.category || ''), 30), clip(String(b.published_at || at), 30), clip(String(b.image_url || ''), 2000), clip(String(b.summary || ''), 500), clip(String(b.content || ''), 20000), at).run();
      await persistAudit(myId, 'news.create', id);
      return json({ id, title }, 201);
    }
    if ((m = p.match(/^admin\/news\/([\w-]+)$/)) && (method === 'PATCH' || method === 'DELETE')) {
      if (!dbOf()) return bad('news unavailable', 503);
      await ensureSchema();
      const row = await dbOf().prepare('SELECT * FROM luno_news WHERE id = ?').bind(m[1]).first().catch(() => null);
      if (!row) return bad('기사를 찾을 수 없습니다', 404);
      if (method === 'DELETE') {
        await dbOf().prepare('DELETE FROM luno_news WHERE id = ?').bind(m[1]).run();
        await persistAudit(myId, 'news.delete', m[1]);
        return json({ status: 'deleted' });
      }
      const b = await readJson(request);
      const title = b.title === undefined ? row.title : clip(String(b.title), 200);
      if (!title) return bad('제목을 입력하세요');
      await dbOf().prepare('UPDATE luno_news SET title = ?, press = ?, category = ?, published_at = ?, image_url = ?, summary = ?, content = ? WHERE id = ?').bind(title, b.press === undefined ? row.press : clip(String(b.press), 60), b.category === undefined ? row.category : clip(String(b.category), 30), b.published_at === undefined ? row.published_at : clip(String(b.published_at), 30), b.image_url === undefined ? row.image_url : clip(String(b.image_url), 2000), b.summary === undefined ? row.summary : clip(String(b.summary), 500), b.content === undefined ? row.content : clip(String(b.content), 20000), m[1]).run();
      await persistAudit(myId, 'news.update', row.id);
      return json({ id: row.id, title });
    }
    // F30: support ticket queue + answers. An answer lands on the ticket row
    // and posts into the user's customer-center official room (read-only for
    // the user, like other official rooms) plus the N1-L push funnel.
    if (p === 'admin/support/tickets' && method === 'GET') {
      if (!dbOf()) return bad('support tickets unavailable', 503);
      await ensureSchema();
      const status = clip(url.searchParams.get('status'), 20);
      const q = status
        ? await dbOf().prepare('SELECT * FROM luno_support_tickets WHERE status = ? ORDER BY created_at DESC, rowid DESC LIMIT 100').bind(status).all().catch(() => ({ results: [] }))
        : await dbOf().prepare('SELECT * FROM luno_support_tickets ORDER BY created_at DESC, rowid DESC LIMIT 100').all().catch(() => ({ results: [] }));
      return json({ tickets: q.results || [] });
    }
    if ((m = p.match(/^admin\/support\/tickets\/([\w-]+)\/reply$/)) && method === 'POST') {
      if (!dbOf()) return bad('support tickets unavailable', 503);
      const b = await readJson(request);
      const answer = clip(b.answer, 5000);
      if (!answer) return bad('답변 내용을 입력하세요');
      await ensureSchema();
      const t = await dbOf().prepare('SELECT * FROM luno_support_tickets WHERE id = ?').bind(m[1]).first().catch(() => null);
      if (!t) return bad('문의를 찾을 수 없습니다', 404);
      const at = now();
      await dbOf().prepare("UPDATE luno_support_tickets SET status = 'answered', answer = ?, answered_by = ?, answered_at = ?, updated_at = ? WHERE id = ?").bind(answer, myId, at, at, m[1]).run();
      const cid = ensureSupportRoom(t.user_id);
      await pushPersistent(cid, 'oa-notice', { kind: 'text', body: answer, metadata: { support_ticket_id: t.id } });
      await notify(notifyEnv(), [t.user_id], { kind: 'message', conversation_id: cid, sender_id: 'oa-notice', title: 'LUNO 고객센터', body: notifyMessagePreview('text', answer) });
      await persistAudit(myId, 'support.ticket.reply', t.id, { user_id: t.user_id });
      return json({ status: 'answered', id: t.id, conversation_id: cid });
    }
    // L-01: admin-only bot issuance. Bots carry no password material and
    // authenticate with L-06 scope tokens only. The admin guard above
    // already returned 403 for non-admins.
    if (p === 'admin/bots' && method === 'POST') {
      if (!await rateLimit('rl:adminbots:' + (request.headers.get('CF-Connecting-IP') || 'unknown'), 60)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
      const b = await readJson(request);
      const displayName = clip(String(b.display_name || ''), 40);
      if (!displayName) return bad('display_name is required', 400);
      let botHandle = '';
      if (b.handle !== undefined && b.handle !== null && b.handle !== '') {
        botHandle = String(b.handle).toLowerCase();
        const rule = handleRuleError(botHandle);
        if (rule === 'shape') return json({ error: 'handle must be 3-20 lowercase letters, digits, _ or .' }, 400);
        if (rule === 'reserved') return json({ error: 'handle is not available' }, 409);
        if (await handleTaken(botHandle)) return json({ error: 'handle is already taken' }, 409);
      } else {
        botHandle = await allocateHandle('bot_');
        if (!botHandle) return json({ error: 'could not allocate a unique handle' }, 500);
      }
      const bot = {
        id: uid(), email: `${botHandle}@bots.invalid`, handle: botHandle,
        display_name: displayName, role: 'user', kind: 'bot', email_verified: 1,
        bio: 'LUNO bot', created_at: new Date().toISOString()
      };
      const db = dbOf();
      if (db) {
        await ensureSchema();
        try {
          await db.prepare("INSERT INTO users (id, email, handle, password_hash, display_name, bio, kind, email_verified, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?, 'bot', 1, datetime('now'), datetime('now'))")
            .bind(bot.id, bot.email, bot.handle, bot.display_name, bot.bio).run();
        } catch (err) {
          if (/UNIQUE constraint|unique/i.test(String(err && err.message))) return json({ error: 'handle is already taken' }, 409);
          throw err;
        }
        await d1Run(db, "INSERT OR IGNORE INTO wallets (user_id, balance, updated_at) VALUES (?, 0, datetime('now'))", bot.id);
      }
      users.set(bot.email, bot);
      usersById.set(bot.id, bot);
      await persistAudit(myId, 'bot.issue', bot.id);
      return json({ id: bot.id, email: bot.email, handle: bot.handle, display_name: bot.display_name, kind: 'bot' }, 201);
    }
    // L-06: scoped bot token mint/revoke. The guard above already returned 403.
    if ((m = p.match(/^admin\/bots\/([\w-]+)\/tokens$/)) && method === 'POST') {
      const db = dbOf();
      if (!db) return json({ error: 'bot tokens require a configured database' }, 501);
      const bot = usersById.get(m[1]) || await loadUserFromD1(m[1], 'user');
      if (!bot) return json({ error: 'bot not found' }, 404);
      if (userKind(bot) !== 'bot') return json({ error: 'bot tokens are issued to bots only' }, 400);
      const b = await readJson(request);
      const rooms = Array.isArray(b.rooms) ? b.rooms.map(r => clip(String(r || ''), 128)).filter(Boolean) : [];
      const ops = Array.isArray(b.ops) ? [...new Set(b.ops.filter(o => o === 'read' || o === 'post' || o === 'propose'))] : [];
      if (!rooms.length) return bad('at least one room id is required', 400);
      if (!ops.length) return bad('at least one op (read, post, propose) is required', 400);
      const ttl = b.ttl_sec === undefined ? 86400 : Number(b.ttl_sec);
      if (!Number.isInteger(ttl) || ttl < 60 || ttl > 2592000) return bad('ttl_sec must be 60..2592000', 400);
      await ensureSchema();
      const id = uid();
      const token = `cf-bot-${crypto.randomUUID()}`;
      const expiresAt = Date.now() + ttl * 1000;
      await db.prepare('INSERT INTO luno_bot_tokens (id, token_hash, bot_id, rooms_json, ops_json, expires_at, revoked, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, datetime(\'now\'))')
        .bind(id, await sha256Hex(token), bot.id, JSON.stringify(rooms), JSON.stringify(ops), expiresAt).run();
      await persistAudit(myId, 'bot.token_issue', bot.id, { token_id: id });
      return json({ id, token, bot_id: bot.id, rooms, ops, expires_at: expiresAt }, 201);
    }
    if ((m = p.match(/^admin\/bots\/([\w-]+)\/tokens\/([\w-]+)$/)) && method === 'DELETE') {
      const db = dbOf();
      if (!db) return json({ error: 'bot tokens require a configured database' }, 501);
      await ensureSchema();
      const done = await db.prepare('UPDATE luno_bot_tokens SET revoked = 1 WHERE id = ? AND bot_id = ?').bind(m[2], m[1]).run().catch(() => null);
      if (!done || !done.meta || Number(done.meta.changes) < 1) return json({ error: 'token not found' }, 404);
      await persistAudit(myId, 'bot.token_revoke', m[1], { token_id: m[2] });
      return json({ status: 'revoked', id: m[2] }, 200);
    }
    // L-17: allowlist management. The guard above already returned 403.
    if (p === 'admin/llm/allowlist' && method === 'GET') {
      const db = dbOf();
      if (!db) return json({ enabled: llmEnabled(), rooms: [], users: [] });
      await ensureSchema();
      const rows = (await db.prepare('SELECT kind, ref_id FROM luno_bot_allowlist').all().catch(() => ({ results: [] }))).results || [];
      return json({
        enabled: llmEnabled(),
        killed: await botKilled(),
        rooms: rows.filter(r => r.kind === 'room').map(r => r.ref_id),
        users: rows.filter(r => r.kind === 'user').map(r => r.ref_id)
      });
    }
    if (p === 'admin/llm/allowlist' && (method === 'POST' || method === 'DELETE')) {
      const db = dbOf();
      if (!db) return json({ error: 'allowlist requires a configured database' }, 501);
      const b = await readJson(request);
      const kind = String(b.kind || '');
      const refId = clip(String(b.ref_id || ''), 128);
      if ((kind !== 'room' && kind !== 'user') || !refId) return bad('kind must be room or user with a non-empty ref_id', 400);
      await ensureSchema();
      if (method === 'POST') {
        const done = await db.prepare('INSERT OR IGNORE INTO luno_bot_allowlist (kind, ref_id, created_at) VALUES (?, ?, datetime(\'now\'))').bind(kind, refId).run().catch(() => null);
        const added = done && done.meta && Number(done.meta.changes) > 0;
        if (added) await persistAudit(myId, 'llm.allowlist_add', refId, { kind });
        return json({ status: added ? 'added' : 'exists', kind, ref_id: refId }, added ? 201 : 200);
      }
      await db.prepare('DELETE FROM luno_bot_allowlist WHERE kind = ? AND ref_id = ?').bind(kind, refId).run();
      await persistAudit(myId, 'llm.allowlist_remove', refId, { kind });
      return json({ status: 'removed', kind, ref_id: refId }, 200);
    }
    // L-09: killswitch. Stopped halts enqueue (routing) and claims at once;
    // in-flight jobs may still complete so runners drain cleanly.
    if (p === 'admin/llm/kill' && method === 'PUT') {
      const db = dbOf();
      if (!db) return json({ error: 'killswitch requires a configured database' }, 501);
      const b = await readJson(request);
      if (typeof b.stopped !== 'boolean') return bad('stopped must be boolean', 400);
      await ensureSchema();
      await db.prepare('INSERT INTO luno_bot_config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = ?')
        .bind('kill', b.stopped ? '1' : '0', b.stopped ? '1' : '0').run();
      await persistAudit(myId, b.stopped ? 'llm.kill_on' : 'llm.kill_off', null);
      return json({ stopped: b.stopped }, 200);
    }
    if (p === 'admin/reports' && method === 'GET') {
      if (dbOf()) {
        await ensureSchema();
        const rows = (await dbOf().prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 100').all().catch(() => ({ results: [] }))).results || [];
        // E8: admins review reporter-disclosed text only, flagged as such —
        // sealed room content itself is never readable here.
        return json({ reports: rows.map(r => ({ id: r.id, reporter_id: r.reporter_id, subject_user_id: r.target_id, category: r.reason, details: r.details || '', e2ee_disclosed: !!r.e2ee_disclosed, state: r.status, created_at: r.created_at })) });
      }
      return json({ reports: adminReports.slice(0, 100) });
    }
    if (p === 'admin/telemetry' && method === 'GET') {
      const kind = url.searchParams.get('kind');
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
      if (!dbOf()) return json({ telemetry: [], counts: { error: 0, perf: 0 } });
      await ensureSchema();
      const where = kind === 'error' || kind === 'perf' ? 'WHERE kind = ?' : '';
      const args = kind === 'error' || kind === 'perf' ? [kind] : [];
      const rows = (await dbOf().prepare(`SELECT id, received_at, reporter, user_id, kind, name, message, stack, context_json, ms FROM luno_telemetry ${where} ORDER BY id DESC LIMIT ?`).bind(...args, limit).all().catch(() => ({ results: [] }))).results || [];
      const counts = { error: 0, perf: 0 };
      const crows = (await dbOf().prepare('SELECT kind, COUNT(*) n FROM luno_telemetry GROUP BY kind').all().catch(() => ({ results: [] }))).results || [];
      for (const r of crows) counts[r.kind] = Number(r.n) || 0;
      return json({ telemetry: rows, counts });
    }
    if (p === 'admin/audit-logs' && method === 'GET') {
      // F16: the D1 trail is the source of truth; memory covers no-DB mode.
      if (dbOf()) {
        await ensureSchema();
        const rows = (await dbOf().prepare('SELECT id, actor, action, target, detail, created_at FROM luno_audit ORDER BY id DESC LIMIT 100').all().catch(() => ({ results: [] }))).results || [];
        return json({ audit_logs: rows.map(r => ({ id: r.id, actor_user_id: r.actor, action: r.action, target_id: r.target, detail: r.detail, created_at: r.created_at })) });
      }
      return json({ audit_logs: auditLogs.slice(0, 100) });
    }
    if (p === 'admin/feature-flags' && method === 'GET') {
      return json({ feature_flags: await listFeatureFlags() });
    }
    if (p === 'admin/feature-flags' && method === 'PUT') {
      const b = await readJson(request);
      const key = clip(b.key, 60);
      if (!/^[a-z0-9_]{3,60}$/.test(key) || typeof b.enabled !== 'boolean') return bad('플래그 키(영문 소문자·숫자·_)와 enabled 값이 필요합니다');
      await saveFeatureFlag(key, b.enabled);
      await persistAudit(myId, `feature_flag.${b.enabled ? 'enable' : 'disable'}`, key);
      return json({ status: 'updated', feature_flags: await listFeatureFlags() });
    }
    // F28: admin-run retention purge (manual execution only, never cron).
    if (p === 'admin/retention/purge' && method === 'POST') {
      if (!dbOf()) return bad('retention purge requires a configured database', 503);
      const counts = await purgeExpiredData();
      await persistAudit(myId, 'retention.purge', 'retention', counts || {});
      return json({
        status: 'purged',
        purged: counts,
        retention_days: { ...RETENTION_DAYS, deleted_accounts_grace_days: Math.round(ACCOUNT_DELETE_GRACE_MS / 86400000) },
      });
    }
    // F29: instant blind (temporary; unhide restores). Hiding an attachment
    // deletes its bytes and blocklists the SHA-256 against re-upload.
    if ((p === 'admin/moderation/hide' || p === 'admin/moderation/unhide') && method === 'POST') {
      if (!dbOf()) return bad('moderation requires a configured database', 503);
      await ensureSchema();
      const b = await readJson(request);
      const type = clip(b.target_type, 30);
      const tid = clip(b.target_id, 120);
      if (!HIDE_TARGET_TYPES.includes(type)) return bad('target_type must be message, feed_post, community_post or attachment');
      if (!tid) return bad('target_id is required');
      if (p.endsWith('/unhide')) {
        if (type === 'attachment') return bad('삭제된 첨부는 복원할 수 없습니다');
        await dbOf().prepare('DELETE FROM luno_hidden_targets WHERE target_type = ? AND target_id = ?').bind(type, tid).run();
        await persistAudit(myId, 'moderation.unhide', tid, { target_type: type });
        return json({ status: 'visible', target_id: tid });
      }
      let row = null;
      if (type === 'message') row = await dbOf().prepare('SELECT id FROM luno_messages WHERE id = ?').bind(tid).first().catch(() => null);
      else if (type === 'feed_post') row = await dbOf().prepare('SELECT id FROM luno_timeline_posts WHERE id = ?').bind(tid).first().catch(() => null);
      else if (type === 'community_post') row = await dbOf().prepare('SELECT id FROM luno_community_posts WHERE id = ?').bind(tid).first().catch(() => null);
      else row = await dbOf().prepare('SELECT id, sha256 FROM attachments WHERE id = ?').bind(tid).first().catch(() => null)
        || await dbOf().prepare('SELECT id FROM luno_attachments WHERE id = ?').bind(tid).first().catch(() => null);
      if (!row) return bad('대상을 찾을 수 없습니다', 404);
      if (type === 'attachment') {
        const hash = row.sha256 || '';
        await deleteAttachmentEverywhere(tid);
        if (hash) await dbOf().prepare('INSERT OR IGNORE INTO luno_blocked_hashes (sha256, reason, blocked_by, created_at) VALUES (?, ?, ?, ?)').bind(hash, clip(b.reason, 300), myId, now()).run();
        await persistAudit(myId, 'moderation.attach_block', tid, { sha256: hash ? 'listed' : 'unknown' });
        return json({ status: 'blocked', target_id: tid });
      }
      await dbOf().prepare('INSERT OR REPLACE INTO luno_hidden_targets (target_type, target_id, hidden_by, reason, created_at) VALUES (?, ?, ?, ?, ?)').bind(type, tid, myId, clip(b.reason, 300), now()).run();
      await persistAudit(myId, 'moderation.hide', tid, { target_type: type });
      return json({ status: 'hidden', target_id: tid });
    }
    if (p === 'admin/moderation/actions' && method === 'POST') {
      const b = await readJson(request);
      const uidTarget = b.subject_user_id || b.user_id;
      let target = usersById.get(uidTarget);
      if (!target && dbOf()) target = await loadUserFromD1(uidTarget, undefined);
      if (!target || !['warn', 'suspend', 'ban', 'activate', 'dismiss', 'erase'].includes(b.action)) return bad('잘못된 제재 요청입니다');
      if (target.role === 'admin') return bad('관리자 계정에는 제재를 적용할 수 없습니다', 403);
      if (b.action === 'erase') {
        // F16: under-14 procedure — immediate F3 wipe, no 30-day grace.
        const reason = clip(b.reason, 300);
        if (!reason) return bad('삭제 사유를 입력하세요');
        await deleteAccountData(target.id);
        if (dbOf()) {
          await ensureSchema();
          await dbOf().prepare('DELETE FROM user_bans WHERE user_id = ?').bind(target.id).run();
        }
        await persistAudit(myId, 'moderation.erase', target.id, { reason });
      } else if (b.action === 'suspend' || b.action === 'ban') {
        // F16: suspend is temporary (default 30 days, 1..365); ban is
        // permanent (expires 0). Both kill every session immediately.
        const days = b.action === 'ban' ? 0 : Math.min(365, Math.max(1, Number(b.duration_days) || 30));
        const expires = days === 0 ? 0 : Date.now() + days * 86400000;
        target.state = 'suspended';
        await revokeOtherSessions(target.id, '', myId);
        if (dbOf()) {
          await ensureSchema();
          await dbOf().prepare("UPDATE users SET state = 'suspended' WHERE id = ?").bind(target.id).run();
          await dbOf().prepare('INSERT OR REPLACE INTO user_bans (user_id, reason, banned_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').bind(target.id, clip(b.reason, 300), myId, expires, now()).run();
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
        if (dbOf()) {
          await ensureSchema();
          await dbOf().prepare('UPDATE reports SET status = ? WHERE id = ?').bind(b.action === 'dismiss' ? 'dismissed' : 'resolved', b.report_id).run().catch(() => null);
        }
      }
      if (b.action !== 'erase') await persistAudit(myId, `moderation.${b.action}`, target.id, b.reason ? { reason: clip(b.reason, 300) } : undefined);
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
      const platform = ['web', 'android', 'ios'].includes(b.platform) ? b.platform : 'web';
      const deviceId = clip(b.device_id || '', 100);
      const list = pushTokens.get(myId) || [];
      const entry = {
        id: uid(),
        user_id: myId,
        token: tokenVal,
        platform,
        device_id: deviceId,
        created_at: now()
      };
      list.push(entry);
      pushTokens.set(myId, list);
      if (dbOf()) {
        await ensureSchema();
        await dbOf().prepare('INSERT INTO push_tokens (user_id, device_id, platform, token, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, device_id) DO UPDATE SET platform = excluded.platform, token = excluded.token, updated_at = excluded.updated_at').bind(myId, deviceId, platform, tokenVal, entry.created_at).run();
      }
      return json({ status: 'registered', id: entry.id }, 201);
    }
    if (method === 'DELETE') {
      // With a device_id only that device stops getting push (app logout);
      // without one every token of the caller is cleared (legacy behaviour).
      const b = await readJson(request);
      const deviceId = clip(new URL(request.url).searchParams.get('device_id') || b.device_id || '', 100);
      if (deviceId) {
        pushTokens.set(myId, (pushTokens.get(myId) || []).filter((t) => t.device_id !== deviceId));
      } else {
        pushTokens.delete(myId);
      }
      if (dbOf()) {
        await ensureSchema();
        if (deviceId) await dbOf().prepare('DELETE FROM push_tokens WHERE user_id = ? AND device_id = ?').bind(myId, deviceId).run();
        else await dbOf().prepare('DELETE FROM push_tokens WHERE user_id = ?').bind(myId).run();
      }
      return json({ status: 'cleared' });
    }
  }
  if (p === 'push-tokens/test' && method === 'POST') {
    const env = notifyEnv();
    if (env.PUSH_PROVIDER !== 'fcm' || !activePushProvider(env)) {
      return json({ error: 'Push delivery requires a configured provider-backed API', code: 'PUSH_NOT_CONFIGURED' }, 503);
    }
    if (!await rateLimit('rl:pushtest:' + myId, 5)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
    // Self-test: sender_id null so notify() does not filter the caller out.
    const out = await notify(env, [myId], { kind: 'message', conversation_id: '', sender_id: null, title: 'LUNO', body: '푸시 알림 테스트입니다' });
    return json({ status: 'queued', notified: out.notified.length });
  }
  // P1-4: Web Push subscription management (browser endpoints).
  if (p === 'push/vapid-key' && method === 'GET') {
    const key = notifyEnv().VAPID_PUBLIC_KEY;
    if (!key) return json({ error: 'web push not configured', code: 'VAPID_NOT_CONFIGURED' }, 503);
    return json({ public_key: key });
  }
  if (p === 'push/subscriptions' && (method === 'POST' || method === 'DELETE')) {
    if (!dbOf()) return bad('web push subscriptions need a database', 503);
    await ensureSchema();
    if (method === 'DELETE') {
      const b = await readJson(request);
      const endpoint = clip(new URL(request.url).searchParams.get('endpoint') || b.endpoint || '', 2000);
      if (!endpoint) return bad('endpoint가 필요합니다');
      await dbOf().prepare('DELETE FROM luno_webpush_subs WHERE endpoint = ? AND user_id = ?').bind(endpoint, myId).run();
      return json({ status: 'cleared' });
    }
    const b = await readJson(request);
    const endpoint = clip(b.endpoint || '', 2000);
    const p256dh = String((b.keys && b.keys.p256dh) || '');
    const auth = String((b.keys && b.keys.auth) || '');
    let pad = null, ad = null;
    try { pad = webpushB64uDecode(p256dh); ad = webpushB64uDecode(auth); } catch { return bad('keys 형식이 올바르지 않습니다'); }
    if (!endpoint.startsWith('https://') || pad.length !== 65 || pad[0] !== 0x04 || ad.length !== 16) {
      return bad('endpoint/keys 형식이 올바르지 않습니다');
    }
    // One browser, one owner: reassign on account switch.
    await dbOf().prepare('DELETE FROM luno_webpush_subs WHERE endpoint = ?').bind(endpoint).run();
    await dbOf().prepare('INSERT INTO luno_webpush_subs (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)').bind(endpoint, myId, p256dh, auth, now()).run();
    // Cap per user, oldest evicted (P1-2 lesson: no unbounded growth).
    await dbOf().prepare(`DELETE FROM luno_webpush_subs WHERE user_id = ? AND endpoint NOT IN (SELECT endpoint FROM luno_webpush_subs WHERE user_id = ? ORDER BY created_at DESC, endpoint DESC LIMIT ${WEBPUSH_MAX_SUBS_PER_USER})`).bind(myId, myId).run().catch(() => null);
    return json({ status: 'subscribed' }, 201);
  }
  if ((m = p.match(/^conversations\/([\w-]+)\/sync$/)) && method === 'GET') {
    const cid = resolveConversationId(m[1], myId);
    const conv = conversations.get(cid);
    if (!conv || !conv.members.includes(myId)) return bad('대화방을 찾을 수 없습니다', 404);
    if (userKind(me) === 'bot' && !botScopeAllows(me, 'read', cid)) return json({ error: 'forbidden' }, 403);
    if (userKind(me) === 'bot') await persistAudit(myId, 'bot.read', cid, { route: 'sync' });
    await hydrateRoomCursors(cid);
    const since = intIn(url.searchParams.get('since_sequence') || 0, 0, 1e9) || 0;
    const db = dbOf();
    let delta;
    if (db) {
      await ensureSchema();
      const { results } = await db.prepare("SELECT * FROM luno_messages WHERE conversation_id = ? AND sequence > ? AND id NOT IN (SELECT target_id FROM luno_hidden_targets WHERE target_type = 'message') ORDER BY sequence ASC LIMIT 501").bind(cid, since).all();
      delta = (results || []).map(rowToMessage);
    } else {
      delta = (messages.get(cid) || []).filter(x => x.sequence > since).sort((a, b) => a.sequence - b.sequence);
      const hidSync = await hiddenTargetIds('message', delta.map(x => x.id));
      delta = delta.filter(x => !hidSync.has(x.id));
    }
    const hasMore = delta.length > 500;
    delta = delta.slice(0, 500);
    if (db) await hydrateReactions(delta.map(x => x.id));
    await hydrateUsersByIds(delta.map(x => x.sender_id));
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
      if (!await rateLimit('rl:e2ee-put:' + myId, 60)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
      // E2: a well-formed bundle with a bad prekey signature is rejected.
      // Legacy bundles (no dotted identity) are stored as before.
      if (await e2eeVerifyPrekeySig(b.identity_key, b.signed_prekey, b.prekey_sig) === false) {
        return json({ error: 'invalid prekey signature', code: 'INVALID_PREKEY_SIG' }, 400);
      }
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
      // E2: an identity change on this device notifies every E2EE room.
      let prevIdentity = null;
      const kdb = dbOf();
      if (kdb) {
        await ensureSchema();
        const prev = await kdb.prepare('SELECT identity_key FROM e2ee_keys WHERE user_id = ? AND device_id = ?').bind(myId, m[1]).first().catch(() => null);
        if (prev) prevIdentity = prev.identity_key;
      } else {
        const mem = deviceKeys.get(m[1]);
        if (mem && mem.user_id === myId) prevIdentity = mem.identity_key;
      }
      deviceKeys.set(m[1], bundle);
      userKeys.set(myId, bundle);
      if (kdb) {
        await kdb.prepare('INSERT INTO e2ee_keys (user_id, device_id, identity_key, signed_prekey, prekey_sig, prekeys_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, device_id) DO UPDATE SET identity_key=excluded.identity_key, signed_prekey=excluded.signed_prekey, prekey_sig=excluded.prekey_sig, prekeys_json=excluded.prekeys_json, updated_at=excluded.updated_at')
          .bind(myId, m[1], bundle.identity_key, bundle.signed_prekey, bundle.prekey_sig, JSON.stringify(otks), bundle.updated_at).run();
      }
      // E9: first registration announces the new device too.
      if (prevIdentity && prevIdentity !== b.identity_key) await e2eeAnnounceKeyChange(myId, m[1], 'changed');
      else if (!prevIdentity) await e2eeAnnounceKeyChange(myId, m[1], 'added');
      return json({ status: 'keys_registered', device_id: m[1] });
    }
    if (method === 'DELETE') {
      // E2: only the owning user may delete a device's keys.
      const kdb = dbOf();
      if (kdb) {
        await ensureSchema();
        const row = await kdb.prepare('SELECT user_id FROM e2ee_keys WHERE device_id = ?').bind(m[1]).first().catch(() => null);
        if (!row) return json({ error: 'not found' }, 404);
        if (row.user_id !== myId) return json({ error: 'forbidden' }, 403);
        await kdb.prepare('DELETE FROM e2ee_keys WHERE user_id = ? AND device_id = ?').bind(myId, m[1]).run();
      } else {
        const mem = deviceKeys.get(m[1]);
        if (!mem) return json({ error: 'not found' }, 404);
        if (mem.user_id !== myId) return json({ error: 'forbidden' }, 403);
        deviceKeys.delete(m[1]);
        if (userKeys.get(myId)?.device_id === m[1]) userKeys.delete(myId);
      }
      if (deviceKeys.get(m[1])?.user_id === myId) deviceKeys.delete(m[1]);
      // E9: device removal notifies the owner's E2EE rooms.
      await e2eeAnnounceKeyChange(myId, m[1], 'removed');
      return json({ status: 'keys_deleted', device_id: m[1] });
    }
  }
  if ((m = p.match(/^users\/([\w-]+)\/keys$/)) && method === 'GET') {
    const targetId = m[1];
    if (!await rateLimit('rl:e2ee-get:' + myId, 300)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
    // E2: ?all=1 returns every device bundle (multi-device fanout), each
    // consuming one one-time prekey. Without it, the latest bundle only.
    const wantAll = url.searchParams.get('all') === '1';
    const kdb = dbOf();
    if (kdb) {
      await ensureSchema();
      if (wantAll) {
        const { results } = await kdb.prepare('SELECT * FROM e2ee_keys WHERE user_id = ? ORDER BY updated_at DESC').bind(targetId).all().catch(() => ({ results: [] }));
        const devices = [];
        for (const row of results || []) {
          let otks = [];
          try { otks = JSON.parse(row.prekeys_json || '[]'); } catch { otks = []; }
          const otk = otks.length ? otks.shift() : null;
          if (otk) await kdb.prepare('UPDATE e2ee_keys SET prekeys_json = ? WHERE user_id = ? AND device_id = ?').bind(JSON.stringify(otks), targetId, row.device_id).run();
          devices.push({ user_id: targetId, device_id: row.device_id, identity_key: row.identity_key, signed_prekey: row.signed_prekey, prekey_sig: row.prekey_sig || '', one_time_prekey: otk });
        }
        return json({ user_id: targetId, devices });
      }
      const row = await kdb.prepare('SELECT * FROM e2ee_keys WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1').bind(targetId).first();
      if (row) {
        let otks = [];
        try { otks = JSON.parse(row.prekeys_json || '[]'); } catch { otks = []; }
        const otk = otks.length ? otks.shift() : null;
        if (otk) await kdb.prepare('UPDATE e2ee_keys SET prekeys_json = ? WHERE user_id = ? AND device_id = ?').bind(JSON.stringify(otks), targetId, row.device_id).run();
        return json({ user_id: targetId, device_id: row.device_id, identity_key: row.identity_key, signed_prekey: row.signed_prekey, prekey_sig: row.prekey_sig || '', one_time_prekey: otk });
      }
    }
    if (wantAll) {
      const devices = [];
      for (const [did, b] of deviceKeys) {
        if (!b || b.user_id !== targetId) continue;
        const otks = Array.isArray(b.one_time_prekeys) ? b.one_time_prekeys : [];
        const otk = otks.length ? otks.shift() : null;
        devices.push({ user_id: targetId, device_id: did, identity_key: b.identity_key, signed_prekey: b.signed_prekey, prekey_sig: b.prekey_sig || '', one_time_prekey: otk });
      }
      return json({ user_id: targetId, devices });
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
  // E9: device lists without consuming one-time prekeys — for the safety
  // number screen and my-devices management. Own list or any user's list;
  // identity keys are public by design.
  if (((m = p.match(/^users\/([\w-]+)\/e2ee-devices$/)) || p === 'me/e2ee-devices') && method === 'GET') {
    if (!await rateLimit('rl:e2ee-devs:' + myId, 120)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
    const targetId = m ? m[1] : myId;
    const kdb = dbOf();
    if (kdb) {
      await ensureSchema();
      const { results } = await kdb.prepare('SELECT device_id, identity_key, updated_at FROM e2ee_keys WHERE user_id = ? ORDER BY updated_at DESC').bind(targetId).all().catch(() => ({ results: [] }));
      return json({ user_id: targetId, devices: (results || []).map(r => ({ device_id: r.device_id, identity_key: r.identity_key, updated_at: r.updated_at })) });
    }
    const devices = [];
    for (const [did, b] of deviceKeys) {
      if (!b || b.user_id !== targetId) continue;
      devices.push({ device_id: did, identity_key: b.identity_key, updated_at: b.updated_at });
    }
    return json({ user_id: targetId, devices });
  }
  // E6: sender-key parcels. Opaque relay for group E2EE: the dealer seals
  // one envelope per recipient device over 1:1 sessions; the server only
  // checks that both ends share the room.
  if (p === 'e2ee/sk' && (method === 'POST' || method === 'GET')) {
    if (!await rateLimit('rl:e2ee-sk:' + myId, 120)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
    if (method === 'POST') {
      const b = await readJson(request);
      const toUser = typeof b.to_user === 'string' ? b.to_user : '';
      const roomId = typeof b.room === 'string' ? b.room : '';
      const gen = Number.isInteger(b.gen) ? b.gen : -1;
      const envs = b.envelopes && typeof b.envelopes === 'object' ? b.envelopes : null;
      if (!toUser || !roomId || gen < 0 || !envs || !Object.keys(envs).length) return bad('to_user, room, gen, envelopes가 필요합니다');
      const conv = conversations.get(roomId) || await hydrateDurableConversation(roomId).catch(() => null);
      if (!conv || !(conv.members || []).includes(myId) || !(conv.members || []).includes(toUser)) {
        return json({ error: 'not a shared room' }, 403);
      }
      const id = uid();
      const at = now();
      const row = { id, to_user_id: toUser, from_user_id: myId, room_id: roomId, gen, payload_json: JSON.stringify(envs), created_at: at };
      const kdb = dbOf();
      if (kdb) {
        await ensureSchema();
        await kdb.prepare('INSERT INTO luno_sk_parcels (id, to_user_id, from_user_id, room_id, gen, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(id, toUser, myId, roomId, gen, row.payload_json, at).run();
      } else {
        skParcels.push(row);
      }
      return json({ status: 'parcel_stored', id }, 201);
    }
    // GET: my pending parcels (7-day pruning on read).
    const roomFilter = url.searchParams.get('room') || '';
    const cutoff = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const kdb = dbOf();
    if (kdb) {
      await ensureSchema();
      await kdb.prepare('DELETE FROM luno_sk_parcels WHERE to_user_id = ? AND created_at < ?').bind(myId, cutoff).run().catch(() => null);
      const q = roomFilter
        ? await kdb.prepare('SELECT * FROM luno_sk_parcels WHERE to_user_id = ? AND room_id = ? ORDER BY created_at').bind(myId, roomFilter).all().catch(() => ({ results: [] }))
        : await kdb.prepare('SELECT * FROM luno_sk_parcels WHERE to_user_id = ? ORDER BY created_at').bind(myId).all().catch(() => ({ results: [] }));
      return json({ parcels: (q.results || []).map(r => ({ id: r.id, from_user_id: r.from_user_id, room_id: r.room_id, gen: r.gen, envelopes: JSON.parse(r.payload_json), created_at: r.created_at })) });
    }
    const mine = skParcels.filter(r => r.to_user_id === myId && r.created_at >= cutoff && (!roomFilter || r.room_id === roomFilter));
    return json({ parcels: mine.map(r => ({ id: r.id, from_user_id: r.from_user_id, room_id: r.room_id, gen: r.gen, envelopes: JSON.parse(r.payload_json), created_at: r.created_at })) });
  }
  if ((m = p.match(/^e2ee\/sk\/([\w-]+)$/)) && method === 'DELETE') {
    const kdb = dbOf();
    if (kdb) {
      await ensureSchema();
      const gone = await kdb.prepare('DELETE FROM luno_sk_parcels WHERE id = ? AND to_user_id = ? RETURNING id').bind(m[1], myId).first().catch(() => null);
      if (!gone) return json({ error: 'not found' }, 404);
      return json({ status: 'parcel_deleted' });
    }
    const at = skParcels.findIndex(r => r.id === m[1] && r.to_user_id === myId);
    if (at < 0) return json({ error: 'not found' }, 404);
    skParcels.splice(at, 1);
    return json({ status: 'parcel_deleted' });
  }
  if (p === 'e2ee/backup' && (method === 'PUT' || method === 'GET' || method === 'DELETE')) {
    if (!await rateLimit('rl:e2ee-backup:' + myId, 30)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
    const bdb = dbOf();
    const bucket = mediaBucketOf();
    const r2key = `e2ee-backup/${myId}`;
    if (method === 'PUT') {
      const b = await readJson(request);
      const blob = b && b.blob;
      if (!e2eeBackupValid(blob)) return bad('blob {v:1, salt, iv, ct} required');
      const raw = JSON.stringify(blob);
      const byteLen = new TextEncoder().encode(raw).length;
      if (byteLen > E2EE_BACKUP_MAX_BYTES) return json({ error: 'backup too large (max 20MB)', code: 'BACKUP_TOO_LARGE' }, 413);
      if (!bucket && byteLen > E2EE_BACKUP_D1_MAX_BYTES) return json({ error: 'backup needs object storage for this size', code: 'BACKUP_TOO_LARGE' }, 413);
      const at = now();
      if (bucket) await bucket.put(r2key, raw, { httpMetadata: { contentType: 'application/json' } });
      if (bdb) {
        await ensureSchema();
        await bdb.prepare('INSERT INTO e2ee_backups (user_id, blob_json, byte_len, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET blob_json = excluded.blob_json, byte_len = excluded.byte_len, updated_at = excluded.updated_at')
          .bind(myId, bucket || byteLen > E2EE_BACKUP_D1_MAX_BYTES ? '' : raw, byteLen, at).run();
      } else {
        e2eeBackupBlobs.set(myId, { blob, byteLen, updatedAt: at });
      }
      await persistAudit(myId, 'e2ee.backup.store', myId, { bytes: byteLen });
      return json({ status: 'backup_stored', byte_len: byteLen, updated_at: at });
    }
    if (method === 'DELETE') {
      if (bucket) await bucket.delete(r2key).catch(() => {});
      if (bdb) {
        await ensureSchema();
        await bdb.prepare('DELETE FROM e2ee_backups WHERE user_id = ?').bind(myId).run();
      } else {
        e2eeBackupBlobs.delete(myId);
      }
      await persistAudit(myId, 'e2ee.backup.delete', myId);
      return json({ status: 'backup_deleted' });
    }
    // GET: own blob only; absent reads {backup: null}, never 404.
    if (bucket) {
      const obj = await bucket.get(r2key).catch(() => null);
      if (obj) {
        const raw = await obj.text();
        try {
          const blob = JSON.parse(raw);
          return json({ backup: blob, byte_len: new TextEncoder().encode(raw).length, updated_at: '' });
        } catch { return json({ backup: null }); }
      }
      return json({ backup: null });
    }
    if (bdb) {
      await ensureSchema();
      const row = await bdb.prepare('SELECT blob_json, byte_len, updated_at FROM e2ee_backups WHERE user_id = ?').bind(myId).first().catch(() => null);
      if (!row || !row.blob_json) return json({ backup: null });
      try {
        return json({ backup: JSON.parse(row.blob_json), byte_len: Number(row.byte_len) || 0, updated_at: row.updated_at || '' });
      } catch { return json({ backup: null }); }
    }
    const mem = e2eeBackupBlobs.get(myId);
    if (!mem) return json({ backup: null });
    return json({ backup: mem.blob, byte_len: mem.byteLen, updated_at: mem.updatedAt });
  }
  if (p === 'calls/ice-servers' && method === 'GET') {
    // N2-L: STUN always; TURN entries appear only when the operator sets the
    // TURN_* env vars (unset in this stage — same-Wi-Fi local calls only).
    const servers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ];
    const turnEnv = (typeof CURRENT_ENV !== 'undefined' && CURRENT_ENV) ? CURRENT_ENV : {};
    const turnUrls = String(turnEnv.TURN_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (turnUrls.length > 0 && typeof turnEnv.TURN_SECRET === 'string' && turnEnv.TURN_SECRET.length >= 16) {
      // coturn use-auth-secret (TURN REST API): per-user credentials valid for
      // 12 hours; the shared secret itself never leaves the worker.
      const username = `${Math.floor(Date.now() / 1000) + 12 * 3600}:${myId}`;
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(turnEnv.TURN_SECRET), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
      const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(username)));
      let bin = '';
      for (const x of sig) bin += String.fromCharCode(x);
      const credential = btoa(bin);
      for (const urls of turnUrls) servers.push({ urls, username, credential });
    } else if (turnUrls.length > 0 && turnEnv.TURN_USERNAME && turnEnv.TURN_CREDENTIAL) {
      for (const urls of turnUrls) {
        servers.push({ urls, username: turnEnv.TURN_USERNAME, credential: turnEnv.TURN_CREDENTIAL });
      }
    }
    return json({ ice_servers: servers });
  }
  if (p === 'calls/group/join' && method === 'POST') {
    const b = await readJson(request);
    const roomId = resolveConversationId(b.room_id || b.conversation_id, myId);
    if (!roomId) return bad('room_id가 필요합니다');
    // S6: only conversation members may join its group call. Memory first,
    // then the durable fallback for rooms hydrated on another isolate.
    let conv = conversations.get(roomId);
    if (!conv || !conv.members.includes(myId)) {
      conv = await hydrateDurableConversation(roomId).catch(() => null);
    }
    if (!conv || !conv.members.includes(myId)) return json({ error: 'conversation not found' }, 404);
    if (conv.official || conv.kind === 'official') return bad('공식계정 방에서는 그룹통화를 할 수 없습니다');
    // P0-5: the room Durable Object owns the seat set on every isolate.
    if (groupCallsBinding()) {
      let joined;
      try {
        joined = await groupRoomFetch(roomId, '/join', { user_id: myId, max: GROUP_CALL_MAX_PARTICIPANTS });
      } catch (err) {
        logx('error', 'group call join failed', { room_id: roomId, error: err && err.message ? err.message : String(err) });
        return json({ error: 'group call unavailable', code: 'GROUP_CALL_UNAVAILABLE' }, 503);
      }
      if (joined.status === 409) return json({ error: 'group call is full' }, 409);
      if (joined.status !== 201) return json({ error: 'group call unavailable', code: 'GROUP_CALL_UNAVAILABLE' }, 503);
      const seats = (joined.data && joined.data.participants) || [];
      await trackGroupCallSeat(myId, roomId);
      sendTo(seats, { type: 'call.group.user_joined', room_id: roomId, user_id: myId, user_name: me.display_name });
      await hydrateUsersByIds(seats);
      return json({ status: 'joined', room_id: roomId, participants: seats.map(id => userBrief(id)).filter(Boolean) }, 201);
    }
    if (!groupCallRooms.has(roomId)) groupCallRooms.set(roomId, new Set());
    const room = groupCallRooms.get(roomId);
    if (!room.has(myId) && room.size >= GROUP_CALL_MAX_PARTICIPANTS) return json({ error: 'group call is full' }, 409);
    room.add(myId);
    sendTo(Array.from(room), { type: 'call.group.user_joined', room_id: roomId, user_id: myId, user_name: me.display_name });
    return json({ status: 'joined', room_id: roomId, participants: Array.from(room).map(id => userBrief(id)) }, 201);
  }
  if (p === 'calls/group/signal' && method === 'POST') {
    const b = await readJson(request);
    const targetId = b.target_user_id;
    if (!targetId) return bad('target_user_id가 필요합니다');
    const roomId = resolveConversationId(b.room_id || b.conversation_id, myId);
    if (!roomId) return bad('room_id가 필요합니다');
    // P0-5: membership is checked against the room Durable Object.
    if (groupCallsBinding()) {
      let checked;
      try {
        checked = await groupRoomFetch(roomId, '/signal-check', { from_user_id: myId, target_user_id: targetId });
      } catch (err) {
        logx('error', 'group call signal failed', { room_id: roomId, error: err && err.message ? err.message : String(err) });
        return json({ error: 'group call unavailable', code: 'GROUP_CALL_UNAVAILABLE' }, 503);
      }
      if (checked.status === 404) return json({ error: 'call not found' }, 404);
      if (checked.status !== 200) return json({ error: 'not a participant of this call' }, 403);
      sendTo([targetId], { type: 'call.group.signal', from_user_id: myId, signal: b.signal, room_id: roomId });
      return json({ status: 'relayed' });
    }
    // S6: relay only between two participants of the same live call room.
    const room = groupCallRooms.get(roomId);
    if (!room) return json({ error: 'call not found' }, 404);
    if (!room.has(myId) || !room.has(targetId)) return json({ error: 'not a participant of this call' }, 403);
    sendTo([targetId], { type: 'call.group.signal', from_user_id: myId, signal: b.signal, room_id: roomId });
    return json({ status: 'relayed' });
  }
  if (p === 'calls/group/leave' && method === 'POST') {
    const b = await readJson(request);
    const roomId = resolveConversationId(b.room_id || b.conversation_id, myId);
    // P0-5: vacate the DO seat and the directory row (self-healing when
    // they drift); a leave stays a quiet no-op either way.
    if (groupCallsBinding()) {
      if (roomId) {
        await untrackGroupCallSeat(myId, roomId);
        try {
          const left = await groupRoomFetch(roomId, '/leave', { user_id: myId });
          if (left.status === 200 && left.data && left.data.left) {
            sendTo(left.data.participants || [], { type: 'call.group.user_left', room_id: roomId, user_id: myId });
          }
        } catch (err) {
          logx('error', 'group call leave failed', { room_id: roomId, error: err && err.message ? err.message : String(err) });
        }
      }
      return json({ status: 'left' });
    }
    if (roomId && groupCallRooms.has(roomId)) {
      const room = groupCallRooms.get(roomId);
      // S6: only a participant's leave fans out; anything else is a quiet no-op.
      if (room.has(myId)) {
        room.delete(myId);
        sendTo(Array.from(room), { type: 'call.group.user_left', room_id: roomId, user_id: myId });
      }
    }
    return json({ status: 'left' });
  }

  // ==========================================
  // PHASE 3: Voice STT & Message Unsend Recall
  // ==========================================
  if (p === 'ai/stt/languages' && method === 'GET') {
    const provider = activeSttProvider(CURRENT_ENV);
    if (!provider) return json({ configured: false, languages: [] });
    return json({ configured: true, engine: CURRENT_ENV.STT_PROVIDER, languages: provider.languages || [] });
  }
  if (p === 'ai/stt' && method === 'POST') {
    const provider = activeSttProvider(CURRENT_ENV);
    if (!provider) return json({ error: 'Speech transcription requires a configured provider-backed API', code: 'STT_NOT_CONFIGURED' }, 503);
    if (!await rateLimit('rl:stt:' + myId, STT_PER_MINUTE)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
    const rawBody = await request.text().catch(() => '');
    if (rawBody.length > STT_MAX_B64 + 4096) return bad('오디오가 너무 깁니다', 413);
    let b = {};
    try { const v = JSON.parse(rawBody || '{}'); if (v && typeof v === 'object') b = v; } catch { b = {}; }
    const audio = typeof b.audio_base64 === 'string' ? b.audio_base64 : '';
    const mime = typeof b.mime_type === 'string' ? b.mime_type.toLowerCase() : '';
    if (!audio || !/^[A-Za-z0-9+/=]+$/.test(audio)) return bad('오디오 데이터가 필요합니다');
    if (!mime.startsWith('audio/')) return bad('오디오 파일만 인식할 수 있습니다');
    if (audio.length > STT_MAX_B64) return bad('오디오가 너무 깁니다', 413);
    const lang = typeof b.lang === 'string' ? b.lang.trim().toLowerCase().slice(0, 10) : 'auto';
    let out;
    try {
      out = await provider.transcribe(CURRENT_ENV, audio, mime, lang);
    } catch {
      return json({ error: 'Speech transcription upstream failed', code: 'STT_UPSTREAM_ERROR' }, 502);
    }
    return json({ text: out.text, lang: out.lang, engine: out.engine });
  }

  // ==========================================
  if (p === 'ai/tts/voices' && method === 'GET') {
    const provider = activeTtsProvider(CURRENT_ENV);
    if (!provider) return json({ configured: false, voices: [] });
    return json({ configured: true, engine: CURRENT_ENV.TTS_PROVIDER, voices: provider.voices || [] });
  }
  if (p === 'ai/tts' && method === 'POST') {
    const provider = activeTtsProvider(CURRENT_ENV);
    if (!provider) return json({ error: 'Speech synthesis requires a configured provider-backed API', code: 'TTS_NOT_CONFIGURED' }, 503);
    if (!await rateLimit('rl:tts:' + myId, TTS_PER_MINUTE)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
    const rawBody = await request.text().catch(() => '');
    if (rawBody.length > TTS_MAX_CHARS + 4096) return bad('텍스트가 너무 깁니다', 413);
    let b = {};
    try { const v = JSON.parse(rawBody || '{}'); if (v && typeof v === 'object') b = v; } catch { b = {}; }
    const text = typeof b.text === 'string' ? b.text.trim() : '';
    if (!text) return bad('읽을 텍스트가 필요합니다');
    if (text.length > TTS_MAX_CHARS) return bad('텍스트가 너무 깁니다', 413);
    const voice = typeof b.voice === 'string' ? b.voice.trim().slice(0, 32) : '';
    const lang = typeof b.lang === 'string' ? b.lang.trim().toLowerCase().slice(0, 10) : 'auto';
    let out;
    try {
      out = await provider.synthesize(CURRENT_ENV, text, voice, lang);
    } catch {
      return json({ error: 'Speech synthesis upstream failed', code: 'TTS_UPSTREAM_ERROR' }, 502);
    }
    return json({ audio_base64: out.audio_base64, mime_type: out.mime_type, voice: out.voice, engine: out.engine });
  }
  // GCP Vision OCR: read the text in a photo the caller can see, optionally
  // translated through the active translate provider.
  if (p === 'ai/ocr' && method === 'POST') {
    if (!visionActive(CURRENT_ENV)) return json({ error: 'Image text recognition requires a configured provider-backed API', code: 'OCR_NOT_CONFIGURED' }, 503);
    if (!await rateLimit('rl:ocr:' + myId, STT_PER_MINUTE)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
    const b = await readJson(request);
    const att = typeof b.attachment_id === 'string' ? await loadAttachment(b.attachment_id) : null;
    if (!att || !conversations.get(att.conversation_id)?.members.includes(myId)) return bad('파일을 찾을 수 없습니다', 404);
    if (!String(att.mime || '').startsWith('image/') || att.mime === 'image/svg+xml') return bad('사진에서만 글자를 읽을 수 있습니다');
    let bin = '';
    const raw = att.bytes instanceof Uint8Array ? att.bytes : new Uint8Array(att.bytes || []);
    for (let i = 0; i < raw.length; i += 0x8000) bin += String.fromCharCode.apply(null, raw.subarray(i, i + 0x8000));
    let text = '';
    try {
      const r = await visionAnnotate(CURRENT_ENV, btoa(bin), 'TEXT_DETECTION');
      text = String((r.fullTextAnnotation && r.fullTextAnnotation.text) || '').trim();
    } catch {
      return json({ error: 'Image text recognition upstream failed', code: 'OCR_UPSTREAM_ERROR' }, 502);
    }
    const target = typeof b.target_lang === 'string' ? b.target_lang.trim().toLowerCase().slice(0, 10) : '';
    const out = { text, engine: 'google' };
    if (text && target) {
      const tp = activeTranslateProvider(CURRENT_ENV);
      if (tp) {
        try {
          const tr = await tp.translate(CURRENT_ENV, text.slice(0, 5000), target, 'auto');
          Object.assign(out, { translated: tr.translated, target_lang: target, source_lang: tr.source_lang });
        } catch { out.translate_error = 'TRANSLATE_UPSTREAM_ERROR'; }
      } else out.translate_error = 'TRANSLATE_NOT_CONFIGURED';
    }
    return json(out);
  }

  // PHASE 4: B2B Official Accounts & Webhooks
  // ==========================================
  if ((m = p.match(/^partner\/accounts\/([\w-]+)\/rich-menus$/))) {
    const aid = m[1];
    if (method === 'GET') {
      let menu = richMenus.get(aid);
      if (!menu && ownedResourcesDurable()) {
        await ensureSchema();
        const row = await dbOf().prepare('SELECT menu_json FROM luno_rich_menus WHERE account_id = ?').bind(aid).first().catch(() => null);
        if (row) {
          menu = parseJsonSafe(row.menu_json, null);
          if (menu) richMenus.set(aid, menu);
        }
      }
      if (!menu) menu = {
        id: `menu_${aid}`,
        account_id: aid,
        title: '공식 채널 기본 메뉴',
        layout: 'grid_2x3',
        size: { width: 1200, height: 800 },
        areas: [
          { bounds: { x: 0, y: 0, width: 400, height: 400 }, action: { type: 'message', text: '공식 공지사항' } },
          { bounds: { x: 400, y: 0, width: 400, height: 400 }, action: { type: 'message', text: '고객센터 상담' } },
          { bounds: { x: 800, y: 0, width: 400, height: 400 }, action: { type: 'uri', uri: publicBaseUrl() } },
          { bounds: { x: 0, y: 400, width: 600, height: 400 }, action: { type: 'message', text: '진행중 이벤트' } },
          { bounds: { x: 600, y: 400, width: 600, height: 400 }, action: { type: 'message', text: '자주 묻는 질문' } }
        ],
        tiles: [
          { id: 't1', label: '📢 공식 공지', icon: '📢', action: { type: 'message', text: '공지사항' } },
          { id: 't2', label: '💬 고객센터 상담', icon: '💬', action: { type: 'message', text: '상담' } },
          { id: 't3', label: '🌐 공식 웹사이트', icon: '🌐', action: { type: 'uri', uri: publicBaseUrl() } },
          { id: 't4', label: '🎁 진행중 이벤트', icon: '🎁', action: { type: 'message', text: '이벤트' } },
          { id: 't5', label: '❓ 자주 묻는 질문', icon: '❓', action: { type: 'message', text: '도움말' } },
          { id: 't6', label: '💳 LUNO Pay 혜택', icon: '💳', action: { type: 'message', text: '쿠폰' } }
        ]
      };
      return json({ rich_menu: menu });
    }
    if (method === 'POST') {
      const b = await readJson(request);
      const tiles = Array.isArray(b.tiles) ? b.tiles.slice(0, 12).map(t => ({
        id: clip(t.id, 20) || uid(),
        label: clip(t.label, 40),
        icon: clip(t.icon, 10),
        action: t.action && t.action.type === 'uri'
          ? { type: 'uri', uri: clip(t.action.uri, 2000) }
          : { type: 'message', text: clip(t.action ? t.action.text : '', 1000) }
      })) : [];
      const menu = { id: uid(), account_id: aid, title: clip(b.title, 100), layout: b.layout === 'grid_1x3' ? 'grid_1x3' : 'grid_2x3', tiles, enabled: b.enabled !== false, updated_at: now() };
      if (ownedResourcesDurable()) {
        await ensureSchema();
        await dbOf().prepare('INSERT INTO luno_rich_menus (account_id, menu_json, updated_at) VALUES (?, ?, ?) ON CONFLICT (account_id) DO UPDATE SET menu_json = excluded.menu_json, updated_at = excluded.updated_at').bind(aid, JSON.stringify(menu), menu.updated_at).run();
      }
      richMenus.set(aid, menu);
      return json({ rich_menu: menu, status: 'saved' }, 201);
    }
  }
  if ((m = p.match(/^partner\/accounts\/([\w-]+)\/bot-rules$/))) {
    const aid = m[1];
    if (method === 'GET') {
      await hydrateOaRules(aid);
      return json({ rules: oaBotRules.get(aid) || [] });
    }
    if (method === 'POST') {
      const b = await readJson(request);
      const rawKw = Array.isArray(b.keywords) ? b.keywords : String(b.keyword || '').split(',');
      const keywords = rawKw.map(k => String(k).trim()).filter(Boolean);
      const reply = clip(String(b.reply || b.response || ''), 1000);
      if (!keywords.length || !reply) return bad('키워드와 답변 내용을 입력하세요');
      await hydrateOaRules(aid);
      const rules = oaBotRules.get(aid) || [];
      const newRule = { id: uid(), keywords, reply, match_type: b.match_type === 'exact' ? 'exact' : 'contains', updated_at: now() };
      if (ownedResourcesDurable()) {
        await ensureSchema();
        await dbOf().prepare('INSERT INTO luno_oa_bot_rules (id, account_id, keywords_json, reply, match_type, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(newRule.id, aid, JSON.stringify(keywords), reply, newRule.match_type, newRule.updated_at).run();
      }
      rules.push(newRule);
      oaBotRules.set(aid, rules);
      return json({ rule: newRule, rules }, 201);
    }
  }
  if ((m = p.match(/^partner\/accounts\/([\w-]+)\/bot-rules\/([\w-]+)$/)) && method === 'DELETE') {
    const [_, aid, ruleId] = m;
    if (ownedResourcesDurable()) {
      await ensureSchema();
      await dbOf().prepare('DELETE FROM luno_oa_bot_rules WHERE id = ? AND account_id = ?').bind(ruleId, aid).run();
    }
    let rules = oaBotRules.get(aid) || [];
    rules = rules.filter(r => r.id !== ruleId);
    oaBotRules.set(aid, rules);
    return json({ status: 'deleted', rule_id: ruleId });
  }
  if ((m = p.match(/^developer\/apps\/([\w-]+)\/webhooks\/test$/)) && method === 'POST') {
    // F17: unknown apps and missing configs keep the pinned 503 shape (no
    // delivered field); a stored webhook gets a real signed test delivery.
    const app = await devAppById(m[1]);
    if (!app) return json({ error: 'Webhook delivery requires a configured delivery backend', code: 'WEBHOOK_DELIVERY_NOT_CONFIGURED' }, 503);
    if (app.owner_id !== myId) return json({ error: 'app forbidden' }, 403);
    let hook = Array.from(devWebhooks.values()).find(h => h.app_id === app.id) || null;
    if (!hook && ownedResourcesDurable()) {
      await ensureSchema();
      const r = await dbOf().prepare('SELECT * FROM luno_dev_webhooks WHERE app_id = ? ORDER BY created_at DESC LIMIT 1').bind(app.id).first().catch(() => null);
      if (r) { hook = { id: r.id, app_id: r.app_id, endpoint_url: r.endpoint_url, secret_hash: r.secret_hash }; devWebhooks.set(hook.id, hook); }
    }
    if (!hook) return json({ error: 'Webhook delivery requires a configured delivery backend', code: 'WEBHOOK_DELIVERY_NOT_CONFIGURED' }, 503);
    // The signing key is the stored secret hash (the plaintext secret is
    // shown once at registration and never persisted); the signature echoes
    // in the response so the operator can compare with what arrived.
    const payload = JSON.stringify({ event: 'luno.webhook_test', app_id: app.id, at: now() });
    const signature = 'sha256=' + await hmacSha256Hex(hook.secret_hash, payload);
    try {
      const res = await fetch(hook.endpoint_url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Luno-Event': 'luno.webhook_test', 'X-Luno-Signature': signature }, body: payload, signal: AbortSignal.timeout(5000) });
      return json({ delivered: true, status: res.status, signature });
    } catch (_) {
      return json({ error: 'webhook delivery failed', code: 'WEBHOOK_DELIVERY_FAILED' }, 503);
    }
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
    await hydrateSocialGraph(myId);
    const mine = Array.from(conversations.values()).filter(c => c.members.includes(myId));
    const myMsgs = [];
    for (const c of mine) {
      for (const m of messages.get(c.id) || []) {
        // E8: sealed bodies export as ciphertext, flagged — readable plaintext
        // comes from the device-side "export this device's chats" instead.
        if (m.sender_id === myId) myMsgs.push(m.kind === 'ciphertext' ? { ...m, sealed: true } : m);
      }
    }
    // F3: read records (cursors), device records (sessions), delete/manage
    // records (own audit trail + deletion state) ride the export.
    let cursors = [];
    let trail = [];
    if (dbOf()) {
      await ensureSchema();
      cursors = (await dbOf().prepare('SELECT conversation_id, sequence, updated_at FROM luno_read_cursors WHERE user_id = ?').bind(myId).all().catch(() => ({ results: [] }))).results || [];
      trail = (await dbOf().prepare('SELECT action, target, detail, created_at FROM luno_audit WHERE actor = ? ORDER BY id DESC LIMIT 200').bind(myId).all().catch(() => ({ results: [] }))).results || [];
    }
    return json({
      export_version: '1.2',
      e2ee_note: 'messages flagged sealed are ciphertext; export readable text from the device',
      exported_at: now(),
      user: publicUser(me),
      friends: friendIds(myId).map(id => publicUser(usersById.get(id))),
      conversations_count: mine.length,
      messages_count: myMsgs.length,
      messages: myMsgs,
      read_cursors: cursors,
      sessions: await listSessionsFor(myId, null),
      audit_trail: trail,
      deletion: { state: me.state || 'active', deleted_at: me.deleted_at || '', reason: me.deletion_reason || '' }
    });
  }
  if (p === 'me/delete-account' && method === 'POST') {
    const b = await readJson(request);
    const invalid = await checkDeletionBody(me, b);
    if (invalid) return invalid;
    const reason = b.reason === undefined || b.reason === null || b.reason === '' ? '' : String(b.reason);
    const stamped = await scheduleAccountDeletion(me, reason);
    await revokeOtherSessions(myId, '', myId);
    await persistAudit(myId, 'account.delete_request', myId, { reason });
    return json({ status: 'deletion_scheduled', message: '계정 삭제가 예약되었습니다. 30일 안에 로그인하면 복구됩니다.' });
  }

  return null;
}

async function leaveConversation(conv, myId, me) {
  conv.members = conv.members.filter(x => x !== myId);
  conv.admins = (conv.admins || []).filter(x => x !== myId);
  cMeta(conv.id, myId).hidden = true;
  await persistChatMeta(conv.id, myId);
  if (!conv.members.length) {
    if (mediaBucketOf()) await mediaBucketOf().delete(`conv/${conv.id}/avatar`).catch(() => {});
    await persistDurableConversation(conv);
    conversations.delete(conv.id);
    return json({ status: 'left' });
  }
  if (conv.owner_id === myId) { conv.owner_id = conv.members[0]; conv.admins = (conv.admins || []).filter(x => x !== conv.owner_id); }
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
    logx('error', 'd1 error', { error: e && e.message ? e.message : String(e) });
    return null;
  }
}

async function syncFromD1(db) {
  if (!db) return;
  try {
    // D7: boot no longer bulk-loads users/friends/blocks, so boot time stays
    // flat in table size. Each request lazily loads its own user
    // (getAuthUser), friendships (hydrateFriendships) and blocks (blockState
    // already queries D1 on a cache miss).
    await ensureSchema();
  } catch (err) {
    logx('error', 'd1 sync error', { error: err && err.message ? err.message : String(err) });
  }
}
async function hydrateSocialGraph(userId) {
  const db = dbOf();
  if (!db || !userId) return;
  await ensureSchema();
  let rows = null;
  if (!rolesTableAbsent) {
    try {
      const r = await db.prepare(
        `SELECT f.is_favorite AS fav, f.is_hidden AS hid, f.nickname AS nick, u.*, gr.role AS granted_role FROM friends f
         JOIN users u ON u.id = f.friend_id LEFT JOIN luno_user_roles gr ON gr.user_id = u.id
         WHERE f.user_id = ?`).bind(userId).all();
      rows = r.results || [];
    } catch (error) {
      if (!missingRolesTable(error)) throw error;
    }
  }
  if (!rows) {
    const r = await db.prepare(
      `SELECT f.is_favorite AS fav, f.is_hidden AS hid, f.nickname AS nick, u.* FROM friends f
       JOIN users u ON u.id = f.friend_id WHERE f.user_id = ?`).bind(userId).all();
    rows = r.results || [];
  }
  for (const row of rows) {
    friendships.set(`${userId}:${row.id}`, true);
    if (Number(row.fav)) fMeta(userId, row.id).favorite = true;
    if (Number(row.hid)) fMeta(userId, row.id).hidden = true;
    if (row.nick) fMeta(userId, row.id).nickname = row.nick;
    if (!usersById.has(row.id)) cacheUserRow(row, grantedRole(row.granted_role));
  }
  const blocks = await db.prepare('SELECT blocked_id FROM blocks WHERE blocker_id = ?').bind(userId).all().catch(() => null);
  for (const r of blocks?.results || []) fMeta(userId, r.blocked_id).blocked = true;
}

// The landing page is the static asset download.html. The asset layer would
// answer /download itself (it maps /download to download.html), so wrangler
// runs the worker first for these paths and the page is read through the
// ASSETS binding. Without the binding (tests, bare isolates) it is a redirect.
async function downloadPage(env, url) {
  if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
    try {
      const page = await env.ASSETS.fetch(new Request(url.origin + '/download'));
      if (page.ok) {
        const headers = new Headers(page.headers);
        headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
        return new Response(page.body, { status: 200, headers });
      }
    } catch { /* fall through to the redirect */ }
  }
  if (url.pathname === '/download.html') return new Response('download page unavailable', { status: 503 });
  return Response.redirect(url.origin + '/download.html', 302);
}
// Latest Android build served from the LUNO URL (/download). Bumped on every
// APK release (release checklist in memory); routes below stay unchanged.
const LATEST_ANDROID_BUILD = {
  platform: 'android',
  version: '2.0.0',
  build: 22,
  package: 'com.lunotalk.messenger',
  assets: [
    { abi: 'arm64-v8a', label: 'arm64', recommended: true, file: 'luno-messenger-arm64.apk', size_bytes: 44477190, sha256: '3E04A4C66AE9919CF5C3DEF8A58F7EA8BF7C98C1D2A13B95073FA81707D181AC', url: 'https://github.com/dnjstjq0824-byte/line/releases/download/v2.0.0-build22/luno-messenger-arm64.apk' },
    { abi: 'armeabi-v7a', label: 'arm32', file: 'luno-messenger-arm32.apk', size_bytes: 35530110, sha256: '322ACDB9AE0E668B2725C60EAB6F8BD6D095316B964FA7E841A049774627E1CA', url: 'https://github.com/dnjstjq0824-byte/line/releases/download/v2.0.0-build22/luno-messenger-arm32.apk' },
    { abi: 'x86_64', label: 'x86_64', file: 'luno-messenger-x86_64.apk', size_bytes: 50932482, sha256: '4F3CE4724A6ECF99D6AED36CAAEB4BC7656C94A7D1059AA60691B273295A8BF5', url: 'https://github.com/dnjstjq0824-byte/line/releases/download/v2.0.0-build22/luno-messenger-x86_64.apk' },
  ],
};

const READY_TABLES = ['users', 'wallets', 'luno_sessions', 'luno_messages', 'attachments', 'luno_read_cursors', 'luno_attachments', 'luno_ws_tickets', 'luno_audit'];
let booted = null;
function boot(env) {
  if (!booted) {
    const run = (async () => {
      ensureSeed(env);
      seedExtras();
      await hashPendingPasswords();
      if (env && env.DB) {
        await syncFromD1(env.DB);
        await ensureSchema();
        // D4: the demo openchat seed lives in D1 (DEMO_MODE isolates only).
        if (env.DEMO_MODE === 'true') await seedDemoRoom(env.DB);
      }
    })();
    booted = run;
    // A failed boot is retried by the next request instead of poisoning the isolate.
    run.catch(() => { if (booted === run) booted = null; });
  }
  return booted;
}
// See ensureSchema: the boot promise may belong to a request that ended.
async function bootInRequest(env) {
  try {
    await boot(env);
  } catch {
    booted = null;
    await boot(env);
  }
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
	if ((url.pathname === '/api/v1/store/orders' || url.pathname === '/api/v1/wallet/charge') && request.method === 'POST' && env.PAYMENTS_ENABLED !== 'true') {
	  return json({ error: 'payments unavailable: verified provider integration required', code: 'PAYMENTS_DISABLED' }, 503);
	}
    // Route the complete API to one persistent backend; never mix its identities
    // with the isolate-local demo or fall back to demo data on upstream failure.
    // lunotalk.com front page: the bare root picks the visitor's language.
    if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) return siteLangRedirect(request);
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
    // F21: Android App Links verification. Public by design (no boot,
    // no auth): the OS fetches this to bind the package to the host.
    // Audit P0-4: luno-release-2 (current prod, apksigner-verified) +
    // legacy release (installed base) + androiddebugkey (dev builds).
    if (url.pathname === '/.well-known/assetlinks.json' && request.method === 'GET') {
      return new Response(JSON.stringify([{
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.lunotalk.messenger',
          sha256_cert_fingerprints: [
            'F2:D7:2C:CC:80:54:A2:FA:EB:42:3F:18:5F:5F:F7:7B:A3:1D:EF:4B:90:2C:31:5E:07:1B:A8:D7:0B:4C:97:7C',
            '6D:CD:CD:38:DB:6A:48:5C:E9:99:FE:EC:9D:B5:8F:E5:CD:C7:80:63:16:AA:63:6A:56:90:8B:FD:F0:BA:64:F0',
            '15:09:C9:EE:A6:53:6E:9C:F4:9C:53:61:47:E0:66:27:0A:A9:B2:EC:93:C3:35:43:65:CF:2F:BD:D9:6C:BE:A9',
          ],
        },
      }]), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
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
    await bootInRequest(env);

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
    // E2: minimum native build. New clients send X-App-Build on every call;
    // below APP_MIN_BUILD they get 426 + the update feed stays open. Web and
    // headerless callers pass (old apps are contained by ciphertext
    // rejection + the C3 update nag instead).
    {
      const minBuild = Number.parseInt(String(env.APP_MIN_BUILD || '0'), 10) || 0;
      const buildHdr = request.headers.get('X-App-Build');
      const openApi = ['/api/v1/version', '/api/version', '/api/v1/app/latest', '/api/v1/legal'];
      if (minBuild > 0 && url.pathname.startsWith('/api/') && !openApi.includes(url.pathname) && buildHdr !== null) {
        const build = Number.parseInt(String(buildHdr), 10) || 0;
        if (build < minBuild) return json({ error: 'update required', code: 'APP_UPGRADE_REQUIRED', min_build: minBuild }, 426);
      }
    }

    // Health / Readyz / Metrics / Version
    if (url.pathname === '/api/v1/version' || url.pathname === '/api/version') {
      return json({ ...BUILD_INFO, payments_enabled: !!(env && env.PAYMENTS_ENABLED === 'true') });
    }
    // F24: current legal versions, public so signup screens (and tests) pin
    // the consent they submit to exactly what the gates demand.
    if (url.pathname === '/api/v1/legal' && request.method === 'GET') {
      return json({ terms_version: LEGAL_VERSIONS.terms, privacy_version: LEGAL_VERSIONS.privacy });
    }
    if (url.pathname === '/api/v1/app/latest' && request.method === 'GET') {
      const b = LATEST_ANDROID_BUILD;
      return json({ platform: b.platform, version: b.version, build: b.build, package: b.package, assets: b.assets });
    }
    if (url.pathname === '/api/v1/channel/slot' && request.method === 'GET') {
      const auth = await getAuthUser(request);
      if (!auth) return json({ error: 'unauthorized' }, 401);
      if (userKind(auth) === 'bot') return json({ error: 'forbidden' }, 403);
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
      if (userKind(auth) === 'bot') return json({ error: 'forbidden' }, 403);
      const b = await request.json().catch(() => ({}));
      const text = typeof b.text === 'string' ? b.text : '';
      const target = typeof b.target_lang === 'string' ? b.target_lang.trim().toLowerCase() : '';
      const source = typeof b.source_lang === 'string' ? b.source_lang.trim().toLowerCase() : '';
      if (!text.trim() || !target) return bad('번역할 텍스트와 대상 언어가 필요합니다', 400);
      if (text.length > TRANSLATE_MAX_CHARS) return json({ error: 'text too long', code: 'TEXT_TOO_LONG' }, 413);
      if (!await rateLimit('rl:trx:' + auth.id, TRANSLATE_PER_MINUTE)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
      const provider = activeTranslateProvider(env);
      if (!provider) return json({ error: 'Translation engine is not configured', code: 'TRANSLATE_NOT_CONFIGURED' }, 503);
      const hash = await sha256Hex(`${source || 'auto'}\n${target}\n${text}`);
      const hit = await translateCacheGet(hash, target);
      if (hit) return json({ translated: hit.translated, source_lang: hit.source_lang || source || 'auto', target_lang: target, engine: hit.engine || 'cache' });
      const day = await translateConsumeChars(auth.id, text.length);
      if (!day.ok) return json({ error: 'daily translation quota exceeded', code: 'QUOTA_EXCEEDED' }, 429);
      let out;
      try {
        out = await provider.translate(env, text, target, source || 'auto');
      } catch {
        return json({ error: 'Translation upstream failed', code: 'TRANSLATE_UPSTREAM_ERROR' }, 502);
      }
      await translateCachePut(hash, target, out.translated, out.source_lang, out.engine);
      return json({ translated: out.translated, source_lang: out.source_lang, target_lang: target, engine: out.engine });
    }
    if (url.pathname === '/api/v1/translate/languages' && request.method === 'GET') {
      const auth = await getAuthUser(request);
      if (!auth) return json({ error: 'unauthorized' }, 401);
      if (userKind(auth) === 'bot') return json({ error: 'forbidden' }, 403);
      const provider = activeTranslateProvider(env);
      if (!provider) return json({ configured: false, languages: [] });
      return json({ configured: true, engine: env.TRANSLATE_PROVIDER, languages: provider.languages || [] });
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
      // F22: per-isolate request/error counters (reset on evict) + durable
      // client-telemetry counts from D1.
      out.push('# HELP luno_requests_total Requests served by this isolate (resets on evict)');
      out.push('# TYPE luno_requests_total counter');
      for (const [r, n] of f22Requests) out.push(`luno_requests_total{route="${r}"} ${n}`);
      out.push('# HELP luno_errors_total Error responses served by this isolate (resets on evict)');
      out.push('# TYPE luno_errors_total counter');
      for (const [k, n] of f22Errors) {
        const sp = k.lastIndexOf(' ');
        out.push(`luno_errors_total{route="${k.slice(0, sp)}",code="${k.slice(sp + 1)}"} ${n}`);
      }
      try {
        const trows = (await mdb.prepare('SELECT kind, COUNT(*) n FROM luno_telemetry GROUP BY kind').all().catch(() => ({ results: [] }))).results || [];
        out.push('# HELP luno_telemetry_total Client telemetry rows (D1)');
        out.push('# TYPE luno_telemetry_total counter');
        for (const t of trows) out.push(`luno_telemetry_total{kind="${t.kind}"} ${Number(t.n || 0)}`);
      } catch { /* telemetry table missing pre-migration: skip */ }
      return new Response(out.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; version=0.0.4' } });
    }

    // WebSocket real-time connection upgrade
    if (url.pathname === '/api/v1/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }
      const ticket = url.searchParams.get('ticket');
      let grantedUserId = null;
      try {
        grantedUserId = await redeemWsTicket(ticket);
      } catch (err) {
        // F23: storage down is retryable (fresh ticket), not a logout.
        if (err && err.code === 'TICKET_STORAGE_DOWN') {
          return json({ error: 'ticket storage unavailable, retry with a fresh ticket', code: 'TICKET_STORAGE_DOWN' }, 503);
        }
        throw err;
      }
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
        // P0-5: a dropped socket vacates every group seat of its user on
        // all isolates (seat directory + room DOs); without the binding
        // the legacy local sweep inside the helper stands.
        groupCallSeatSweep(env, grant.userId).catch(() => {});
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
        const typoFix = emailDomainTypo(email);
        if (typoFix) return json({ error: `이메일 주소를 확인해 주세요. ${email.split('@')[1]} 대신 ${typoFix} 아닌가요?`, code: 'EMAIL_DOMAIN_TYPO', suggestion: `${email.split('@')[0]}@${typoFix}` }, 400);
        if (users.has(email)) return json({ error: 'account already exists' }, 409);
        if (env.DB) {
          await ensureSchema();
          // S3: memory only sees this isolate — D1 is authoritative, so an
          // address registered on another isolate still answers 409 here.
          if (await loadUserFromD1ByLogin(email)) return json({ error: 'account already exists' }, 409);
        }

        if (typeof body.password !== 'string' || body.password.length < 8) return json({ error: 'password must be at least 8 characters' }, 400);
        // S2: handles follow the profile rule (same regex as PATCH me) and are
        // stored lowercased. Reserved names are rejected outright.
        let handle = null;
        if (body.handle !== undefined && body.handle !== null && body.handle !== '') {
          handle = String(body.handle).toLowerCase();
          const rule = handleRuleError(handle);
          if (rule === 'shape') return json({ error: 'handle must be 3-20 lowercase letters, digits, _ or .' }, 400);
          if (rule === 'reserved') return json({ error: 'handle is not available' }, 409);
        }
        if (handle) {
          if (await handleTaken(handle)) return json({ error: 'handle is already taken' }, 409);
        } else {
          // Auto-generated handles retry on collision instead of clobbering.
          handle = await allocateHandle('user_');
          if (!handle) return json({ error: 'could not allocate a unique handle' }, 500);
        }
        // L-01: public signup always mints human accounts; body.kind is ignored.
        // F24: terms + privacy consent (current versions) and a 14+ birthdate
        // are mandatory, checked after the field validations so malformed
        // requests keep their original errors. The birthdate verifies age and
        // is never stored — only the confirmation bit survives, in luno_consents.
        if (!consentOfferedValid(body.consent)) {
          return json({ error: 'terms and privacy consent required', code: 'CONSENT_REQUIRED', current: { ...LEGAL_VERSIONS } }, 400);
        }
        const age = ageOnDate(body.birthdate, new Date().toISOString().slice(0, 10));
        if (age === null) return json({ error: 'birthdate required (YYYY-MM-DD)', code: 'BIRTHDATE_REQUIRED' }, 400);
        if (age < 14) return json({ error: 'you must be at least 14 years old to sign up', code: 'UNDERAGE' }, 403);
        // F1: strict verification only when a mail provider exists AND codes
        // can persist; otherwise registration auto-verifies (documented
        // dev-mode behavior — unenforceable checks fail open, never half-on).
        const needsVerify = !!verificationProvider(env) && !!env.DB;
        const newUser = {
          id: crypto.randomUUID(),
          email,
          display_name: body.display_name || email.split('@')[0],
          role: 'user',
          kind: 'user',
          email_verified: needsVerify ? 0 : 1,
          handle,
          bio: '',
          created_at: new Date().toISOString()
        };
        await setPassword(newUser, body.password);
        if (!newUser.pw_hash || !newUser.pw_salt) return json({ error: 'internal_error' }, 500);
        if (env.DB) {
          // Passwords are persisted only as PBKDF2 digests; writes are awaited so a redeploy never loses the account.
          // S2: plain INSERT is the final uniqueness defense — a concurrent
          // registration loses with 409 instead of replacing the row.
          try {
            await env.DB.prepare("INSERT INTO users (id, email, handle, password_hash, display_name, bio, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))")
              .bind(newUser.id, newUser.email, newUser.handle, encodePasswordHash(newUser), newUser.display_name, newUser.bio, newUser.email_verified).run();
          } catch (err) {
            if (/UNIQUE constraint|unique/i.test(String(err && err.message))) return json({ error: 'account already exists' }, 409);
            throw err;
          }
          await d1Run(env.DB, "INSERT OR IGNORE INTO wallets (user_id, balance, updated_at) VALUES (?, 0, datetime('now'))", newUser.id);
          if (needsVerify) {
            const code = newEmailCode();
            await env.DB.prepare('INSERT OR REPLACE INTO luno_email_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, datetime(\'now\'))')
              .bind(email, await sha256Hex(code), Date.now() + 15 * 60 * 1000).run();
            try {
              await sendVerificationMail(env, email, code);
            } catch {
              return json({ error: 'verification mail unavailable, try resend later', code: 'mail_unavailable' }, 503);
            }
          }
        }
        users.set(email, newUser);
        usersById.set(newUser.id, newUser);
        await saveConsent(newUser.id, { terms: LEGAL_VERSIONS.terms, privacy: LEGAL_VERSIONS.privacy, age14: 1, at: now() });
        return json({ id: newUser.id, email: newUser.email, display_name: newUser.display_name, email_verified: newUser.email_verified === 1 }, 201);
      }

      // 1b. Passkey login (email-first, public)
      if (p === 'passkeys/login/begin' && request.method === 'POST') {
        if (!await rateLimit('rl:pkloginb:' + (request.headers.get('CF-Connecting-IP') || 'unknown'), 60)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
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
        if (!await rateLimit('rl:pkloginf:' + (request.headers.get('CF-Connecting-IP') || 'unknown'), 60)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
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
          if (user.email_verified === 0) return json({ error: 'email not verified', code: 'EMAIL_NOT_VERIFIED' }, 403);
          const { token: ptoken, deviceId: pdevice, refreshToken: pre } = await createSession(user, request);
          return json({
            access_token: ptoken,
            ...(pre ? { refresh_token: pre } : {}),
            token_type: 'Bearer',
            expires_in: 900,
            user_id: user.id,
            role: user.role,
            device_id: pdevice,
          }, 200, pre ? { 'Set-Cookie': refreshCookie(pre, request, body.remember === false ? null : 30 * 86400) } : {});
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
        // F16: an expired temporary suspension lifts itself on next login.
        if (user && user.state === 'suspended' && dbOf() && await suspensionExpired(user.id)) {
          await healExpiredSuspension(user.id);
          user.state = 'active';
        }
        if (!user || user.state === 'suspended') {
          await recordLoginFailure(identifier, loginIp);
          return json({ error: 'invalid credentials' }, 401);
        }
        // F3: expired grace purges lazily (no cron); in-grace accounts
        // restore below, but only after the password verifies.
        if (user.state === 'deleted' && deletionExpired(user)) {
          await deleteAccountData(user.id);
          await recordLoginFailure(identifier, loginIp);
          return json({ error: 'invalid credentials' }, 401);
        }
        // L-01: bots authenticate with L-06 scope tokens only, never passwords.
        if (userKind(user) === 'bot') {
          await recordLoginFailure(identifier, loginIp);
          return json({ error: 'invalid credentials' }, 401);
        }
        if (dbOf() && await isBanned(user.id)) {
          await recordLoginFailure(identifier, loginIp);
          return json({ error: 'invalid credentials' }, 401);
        }
        if (!user.pw_hash || !user.pw_salt) {
          // S4: the row carries no PBKDF2 digest (legacy plaintext/sha256 row
          // or credential-less husk) — the owner must go through recovery.
          await recordLoginFailure(identifier, loginIp);
          return json({ error: 'password reset required', code: 'password_reset_required' }, 403);
        }
        if (REVOKED_LEGACY_PASSWORD_HASHES.has(await sha256Hex(body.password || ''))) {
          await recordLoginFailure(identifier, loginIp);
          return json({ error: 'invalid credentials' }, 401);
        }
        const valid = await checkPassword(user, body.password);
        if (!valid) {
          await recordLoginFailure(identifier, loginIp);
          return json({ error: 'invalid credentials' }, 401);
        }
        // F1: verified email required (checked after the password so the
        // gate never confirms whether an address exists).
        if (user.email_verified === 0) return json({ error: 'email not verified', code: 'EMAIL_NOT_VERIFIED' }, 403);
        // F24: a version bump re-gates login. The client may attach fresh
        // consent to the same request (one round trip); otherwise 403 with
        // the current versions. Grandfathered rows keep age14 unknown (null).
        const priorConsent = await loadConsent(user.id);
        if (!priorConsent || priorConsent.terms !== LEGAL_VERSIONS.terms || priorConsent.privacy !== LEGAL_VERSIONS.privacy) {
          if (consentOfferedValid(body.consent)) {
            await saveConsent(user.id, { terms: LEGAL_VERSIONS.terms, privacy: LEGAL_VERSIONS.privacy, age14: priorConsent ? priorConsent.age14 : null, at: now() });
          } else {
            return json({ error: 'updated terms consent required', code: 'CONSENT_STALE', current: { ...LEGAL_VERSIONS } }, 403);
          }
        }
        // F3: correct password inside grace restores the account.
        let recovered = false;
        if (user.state === 'deleted') {
          await restoreDeletion(user);
          recovered = true;
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
          device_id: deviceId,
          ...(recovered ? { recovered: true } : {})
        }, 200, refreshToken ? { 'Set-Cookie': refreshCookie(refreshToken, request, body.remember === false ? null : 30 * 86400) } : {});
      }
      // 2b. Auth: Refresh rotation (A-15). Single-use refresh tokens: each
      // successful call burns the presented token and mints a fresh pair on
      // the same session. Presenting an already-rotated token signals theft:
      // only the compromised session chain is revoked (rotation reuses the
      // session id, so the thief's rotated tokens die with it).
      if (p === 'auth/refresh' && request.method === 'POST') {
        if (!await rateLimit('rl:refresh:' + (request.headers.get('CF-Connecting-IP') || 'unknown'), 120)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
        const rbody = await request.json().catch(() => ({}));
        // F19: cookie-presented refreshes must look like XHR (JSON body),
        // never a cross-site form post. Body tokens (native clients) skip it.
        if (!rbody.refresh_token && (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
          return json({ error: 'forbidden' }, 403);
        }
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
        }, 200, { 'Set-Cookie': refreshCookie(newRefresh, request, rbody.remember === false ? null : 30 * 86400) });
      }


      // F22: client telemetry ingest (errors + perf). Authed so reports
      // attribute to a user; masked again here because clients err.
      if (p === 'telemetry' && request.method === 'POST') {
        const teleUser = await getAuthUser(request);
        if (!teleUser) return json({ error: 'unauthorized' }, 401);
        if (!await rateLimit('rl:telemetry:' + teleUser.id, 60)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
        const b = await readJson(request);
        const errors = Array.isArray(b.errors) ? b.errors.slice(0, 20) : [];
        const perf = Array.isArray(b.perf) ? b.perf.slice(0, 50) : [];
        if (!dbOf()) return json({ status: 'dropped', reason: 'no database' }, 202);
        await ensureSchema();
        const at = now();
        for (const e of errors.slice(0, 20)) {
          if (!e || typeof e !== 'object') continue;
          const ctx = e.context && typeof e.context === 'object' ? maskTelemetryValue(e.context) : {};
          await dbOf().prepare('INSERT INTO luno_telemetry (received_at, reporter, user_id, kind, name, message, stack, context_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(at, clip(b.reporter, 20) || 'unknown', teleUser.id, 'error', clip(f22ScrubText(e.name || ''), 120), clip(f22ScrubText(e.message || ''), 2000), clip(f22ScrubText(e.stack || ''), 4000), JSON.stringify(ctx).slice(0, 8000)).run().catch(() => null);
        }
        for (const e of perf.slice(0, 50)) {
          if (!e || typeof e !== 'object') continue;
          const ms = Number(e.ms);
          if (!Number.isSafeInteger(ms) || ms < 0 || ms > 3600000) continue;
          await dbOf().prepare('INSERT INTO luno_telemetry (received_at, reporter, user_id, kind, name, message, ms) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .bind(at, clip(b.reporter, 20) || 'unknown', teleUser.id, 'perf', clip(e.op, 120), '', ms).run().catch(() => null);
        }
        return json({ status: 'accepted' }, 202);
      }
      // 2c. Auth: password recovery (Go parity). Fails closed without a
      // configured mail sender: no challenge is created. With a sender, the
      // single-use secret is delivered out-of-band and the HTTP response
      // carries only the status and the challenge id, never the secret.
      // Challenges live in D1 when bound, memory otherwise.
      if (p === 'auth/recover' && request.method === 'POST') {
        if (!await rateLimit('rl:recover:' + (request.headers.get('CF-Connecting-IP') || 'unknown'), 60)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
        const body = await request.json().catch(() => ({}));
        const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
        if (!email.includes('@')) return json({ error: 'invalid email' }, 400);
        if (!env.RECOVERY_MAIL_PROVIDER) {
          return json({ error: 'password recovery unavailable: mail provider not configured', code: 'recovery_unavailable' }, 501);
        }
        // Unknown accounts answer exactly like known ones (fresh decoy id, no
        // mail, no row) so the endpoint never confirms whether an email exists.
        const quiet = () => json({ status: 'recovery_token_sent_if_account_exists', challenge_id: crypto.randomUUID() }, 202);
        let user = users.get(email) || Array.from(users.values()).find(u => u.email && u.email.toLowerCase() === email);
        if (dbOf()) {
          await ensureSchema();
          const fresh = await loadUserFromD1ByLogin(email);
          if (fresh) user = fresh;
        }
        // L-01: bots have no password to recover — same quiet shape, no challenge, no mail.
        if (!user || user.state === 'suspended' || user.state === 'deleted' || userKind(user) === 'bot') return quiet();
        const challengeId = crypto.randomUUID();
        const code = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().slice(0, 8);
        const codeHash = await sha256Hex(code);
        const expiresAt = Date.now() + 15 * 60 * 1000;
        try {
          await sendRecoveryMail(env, email, code);
        } catch {
          return json({ error: 'password recovery unavailable: mail provider not configured', code: 'recovery_unavailable' }, 501);
        }
        if (dbOf()) {
          await dbOf().prepare('INSERT INTO luno_recovery_challenges (id, user_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').bind(challengeId, user.id, codeHash, expiresAt, now()).run();
        } else {
          recoveryChallenges.set(challengeId, { userId: user.id, codeHash, expiresAt, consumedAt: 0 });
        }
        return json({ status: 'recovery_token_sent_if_account_exists', challenge_id: challengeId }, 202);
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
        // P1-20: consume the single-use challenge BEFORE changing the
        // password, so a concurrent verify loses instead of double-spending.
        if (dbOf()) {
          const done = await dbOf().prepare('UPDATE luno_recovery_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL').bind(Date.now(), challengeId).run();
          if (!done.meta.changes) return json({ error: 'recovery challenge already consumed' }, 409);
        } else {
          const entry = recoveryChallenges.get(challengeId);
          if (!entry || entry.consumedAt) return json({ error: 'recovery challenge already consumed' }, 409);
          entry.consumedAt = Date.now();
        }
        await setPassword(user, next);
        await persistPassword(user);
        await revokeOtherSessions(userId, '', userId);
        await revokeAllRefresh(userId, null);
        // F1: completing recovery proves inbox ownership, so it verifies the email too.
        if (dbOf()) {
          await dbOf().prepare('UPDATE users SET email_verified = 1 WHERE id = ?').bind(userId).run().catch(() => null);
        }
        user.email_verified = 1;
        await persistAudit(userId, 'password.recover', userId, {});
        return json({ status: 'password_reset' });
      }

      // F1: email verification. Codes are hash-stored, 15-minute, 5 tries;
      // responses never carry the code (F2 pins this for all drivers).
      if (p === 'auth/verify-email' && request.method === 'POST') {
        if (!await rateLimit('rl:verify:' + (request.headers.get('CF-Connecting-IP') || 'unknown'), 60)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
        const body = await request.json().catch(() => ({}));
        const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
        const code = typeof body.code === 'string' ? body.code.trim() : '';
        if (!email.includes('@') || !/^\d{6}$/.test(code)) return json({ error: 'invalid verification request' }, 400);
        if (!dbOf()) return json({ error: 'verification requires a configured database' }, 501);
        await ensureSchema();
        const row = await dbOf().prepare('SELECT code_hash, expires_at, attempts FROM luno_email_codes WHERE email = ?').bind(email).first();
        if (!row || Number(row.attempts) >= 5) return json({ error: 'invalid or expired code' }, 400);
        if (Number(row.expires_at) <= Date.now()) {
          await dbOf().prepare('DELETE FROM luno_email_codes WHERE email = ?').bind(email).run();
          return json({ error: 'invalid or expired code' }, 400);
        }
        if (row.code_hash !== await sha256Hex(code)) {
          await dbOf().prepare('UPDATE luno_email_codes SET attempts = attempts + 1 WHERE email = ?').bind(email).run();
          return json({ error: 'invalid or expired code' }, 400);
        }
        await dbOf().prepare('DELETE FROM luno_email_codes WHERE email = ?').bind(email).run();
        await dbOf().prepare('UPDATE users SET email_verified = 1, updated_at = datetime(\'now\') WHERE email = ?').bind(email).run();
        const u = users.get(email);
        if (u) u.email_verified = 1;
        return json({ status: 'verified' });
      }
      if (p === 'auth/verify-email/resend' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
        if (!email.includes('@')) return json({ error: 'invalid email' }, 400);
        if (!await rateLimit('rl:resend:' + email, 5)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
        const quiet = () => json({ status: 'sent' });
        if (!dbOf() || !verificationProvider(env)) return quiet();
        await ensureSchema();
        const user = await dbOf().prepare('SELECT email_verified FROM users WHERE email = ?').bind(email).first();
        if (!user || Number(user.email_verified) === 1) return quiet();
        const code = newEmailCode();
        await dbOf().prepare('INSERT OR REPLACE INTO luno_email_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, datetime(\'now\'))')
          .bind(email, await sha256Hex(code), Date.now() + 15 * 60 * 1000).run();
        try {
          await sendVerificationMail(env, email, code);
        } catch {
          return json({ error: 'verification mail unavailable, try again later', code: 'mail_unavailable' }, 503);
        }
        return quiet();
      }

      // 2.5 Auth: Phone Login
      if (p === 'auth/phone/send-code' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const phone = String(body.phone || '').trim().replace(/[^0-9+]/g, '');
        if (!phone || phone.length < 8) return bad('올바른 전화번호를 입력해주세요', 400);
        // F2: codes travel through the SMS driver only — never in a response.
        if (resolveSmsDriver(env) === 'none') return json({ error: 'phone login unavailable: SMS provider not configured' }, 501);
        const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
        phoneVerificationCodes.set(phone, { code, expires_at: Date.now() + 180000 });
        try {
          await sendSms(env, phone, code);
        } catch {
          phoneVerificationCodes.delete(phone);
          return json({ error: 'sms unavailable, try again later', code: 'sms_unavailable' }, 503);
        }
        return json({ status: 'sent', phone, expires_in: 180 });
      }
      if (p === 'auth/phone/verify' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const phone = String(body.phone || '').trim().replace(/[^0-9+]/g, '');
        const code = String(body.code || '').trim();
        // H1: 6-digit codes in a 3-minute window are guessable, so verify is
        // capped tighter than the house 60 and keyed per IP + number.
        if (!await rateLimit('rl:phonev:' + (request.headers.get('CF-Connecting-IP') || 'unknown') + ':' + phone, 30)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
        const entry = phoneVerificationCodes.get(phone);
        const isValid = !!entry && entry.code === code && Date.now() <= entry.expires_at;
        if (!isValid) {
          return bad('인증번호가 올바르지 않거나 만료되었습니다', 400);
        }
        phoneVerificationCodes.delete(phone);
        // F26: an authenticated caller binds the verified number to their own
        // account (strict E.164, single owner). Anonymous callers keep the
        // login-by-phone path below exactly as before.
        const binder = await getAuthUser(request);
        if (binder) {
          if (!E164_RE.test(phone)) return json({ error: '휴대폰 번호는 +8210... 형식이어야 합니다', code: 'E164_REQUIRED' }, 400);
          const ownedMem = Array.from(users.values()).some(u => u.id !== binder.id && (u.phone === phone || u.phone_number === phone));
          let ownedDb = null;
          if (dbOf()) {
            await ensureSchema();
            ownedDb = await dbOf().prepare('SELECT id FROM users WHERE phone_number = ? AND id != ?').bind(phone, binder.id).first().catch(() => null);
          }
          if (ownedMem || ownedDb) return json({ error: '이미 등록된 전화번호입니다', code: 'PHONE_TAKEN' }, 409);
          const secret = contactMatchSecret(env);
          const hmac = secret ? await hmacSha256Hex(secret, phone) : '';
          binder.phone = phone;
          binder.phone_verified = 1;
          binder.phone_hmac = hmac;
          if (dbOf()) {
            await ensureSchema();
            await dbOf().prepare('UPDATE users SET phone_number = ?, phone_verified = 1, phone_hmac = ? WHERE id = ?').bind(phone, hmac, binder.id).run();
          }
          await persistAudit(binder.id, 'phone.bind', binder.id, {});
          return json({ status: 'verified' });
        }
        const user = Array.from(users.values()).find(u => u.phone === phone);
        if (!user) return bad('가입되지 않은 전화번호입니다', 404);
        if (user.role === 'admin') return bad('관리자 계정은 전화번호로 로그인할 수 없습니다', 403);
        if (user.email_verified === 0) return json({ error: 'email not verified', code: 'EMAIL_NOT_VERIFIED' }, 403);
        const { token, deviceId, refreshToken: phoneRefresh } = await createSession(user, request);
        return json({
          status: 'authenticated',
          access_token: token,
          ...(phoneRefresh ? { refresh_token: phoneRefresh } : {}),
          user_id: user.id,
          role: user.role,
          device_id: deviceId
        }, 200, phoneRefresh ? { 'Set-Cookie': refreshCookie(phoneRefresh, request, body.remember === false ? null : 30 * 86400) } : {});
      }

      // 3. Auth: QR Login
      if (p === 'auth/qr/challenge' && request.method === 'POST') {
        // Creation rate limit (H1) doubles as H3's: 60/min per IP.
        if (!await rateLimit('rl:qrchall:' + (request.headers.get('CF-Connecting-IP') || 'unknown'), 60)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
        const { challId, qrToken } = await qrIssueChallenge();
        return json({ challenge_id: challId, qr_token: qrToken, expires_in: 180 }, 201);
      }
      if (p === 'auth/qr/approve' && request.method === 'POST') {
        const authUser = await getAuthUser(request);
        if (!authUser) return json({ error: 'unauthorized' }, 401);
        if (userKind(authUser) === 'bot') return json({ error: 'forbidden' }, 403);
        if (!await rateLimit('rl:qrappr:' + authUser.id, 60)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
        const body = await request.json().catch(() => ({}));
        const c = await qrGetChallenge(body.challenge_id);
        if (!c || c.token !== body.qr_token) return json({ error: 'invalid qr challenge' }, 400);
        const approved = await qrApproveChallenge(body.challenge_id, authUser.id);
        if (approved === 'expired') return bad('QR 코드가 만료되었습니다', 400);
        if (approved === 'missing') return json({ error: 'invalid qr challenge' }, 400);
        return json({ status: 'approved' });
      }
      if (p === 'auth/qr/poll' && request.method === 'POST') {
        // H1: the web client polls every 2.5s (24/min), so poll gets headroom.
        if (!await rateLimit('rl:qrpoll:' + (request.headers.get('CF-Connecting-IP') || 'unknown'), 120)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
        const body = await request.json().catch(() => ({}));
        const c = await qrGetChallenge(body.challenge_id);
        if (!c || c.token !== body.qr_token) return json({ error: 'invalid qr challenge' }, 401);
        if (Date.now() > c.expiresAt) {
          await qrDeleteChallenge(body.challenge_id);
          return bad('QR 코드가 만료되었습니다', 400);
        }
        if (c.status === 'authenticated') {
          // H3: the approver may live on another isolate — D1 fallback keeps
          // the poll working there instead of crashing on an undefined user.
          const u = Array.from(users.values()).find(usr => usr.id === c.user_id)
            || (dbOf() ? await loadUserFromD1(c.user_id) : null);
          if (!u) return bad('승인한 사용자를 찾을 수 없습니다', 400);
          if (u.email_verified === 0) return json({ error: 'email not verified', code: 'EMAIL_NOT_VERIFIED' }, 403);
          const { token, deviceId: qrDevice, refreshToken: qrRefresh } = await createSession(u, request);
          await qrDeleteChallenge(body.challenge_id); // Invalidate immediately upon consumption
          return json({ status: 'authenticated', access_token: token, ...(qrRefresh ? { refresh_token: qrRefresh } : {}), user_id: u.id, role: u.role, device_id: qrDevice }, 200, qrRefresh ? { 'Set-Cookie': refreshCookie(qrRefresh, request, body.remember === false ? null : 30 * 86400) } : {});
        }
        return json({ status: 'pending' }, 202);
      }

      // Build 18: "decline" on the lock-screen ring. The notification's
      // background isolate has no session; the per-call ring token (sent
      // only to the room's members) stands in for it, and only for this.
      const ringDecline = p.match(/^calls\/([\w-]+)\/ring-decline$/);
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

      // Versioned profile/room photo URLs load without a bearer token.
      if (request.method === 'GET') {
        const photo = await servePublicPhoto(p, url);
        if (photo) return photo;
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
        if (!await partnerAccountOwnedBy(partnerAccountRoute[1], authUser.id)) return json({ error: 'account forbidden' }, 403);
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
        if (!await rateLimit('rl:wstick:' + authUser.id, 60)) return json({ error: 'too many requests', code: 'RATE_LIMITED' }, 429);
        for (const [key, grant] of wsTickets) {
          if (grant.expiresAt <= Date.now()) wsTickets.delete(key);
        }
        const ticket = `wst-${crypto.randomUUID()}`;
        const ticketExpiresAt = Date.now() + 60000;
        wsTickets.set(ticket, { userId: authUser.id, expiresAt: ticketExpiresAt });
        // Also persist it, so the upgrade can be served by a different isolate.
        const persisted = await persistWsTicket(ticket, authUser.id, ticketExpiresAt).catch(err => {
          logx('error', 'ws ticket persist failed', { error: err && err.message ? err.message : String(err) });
          return false;
        });
        if (!persisted && dbOf()) {
          // F23: D1 is configured but the write failed. A memory-only ticket
          // would 401 on every other isolate, so fail here (503) and let the
          // client retry cleanly instead of minting a half-ticket.
          wsTickets.delete(ticket);
          return json({ error: 'ticket unavailable, retry', code: 'TICKET_STORAGE_DOWN' }, 503);
        }
        return json({ ticket, expires_in: 60 });
      }

      // All conversation subresources share the same membership boundary.
      const conversationPath = p.match(/^conversations\/([^/]+)(?:\/|$)/);
      if (conversationPath && conversationPath[1] !== 'read-all' && conversationPath[1] !== 'join') {
        ensureKeepMemo(authUser.id);
        if (isDemoUser(env, authUser.id)) ensureDemoConversationsForUser(authUser.id);
        const resolvedCid = resolveConversationId(conversationPath[1], authUser.id);
        await hydrateDurableConversation(resolvedCid);
        const conversation = conversations.get(resolvedCid);
        if (!conversation || !conversation.members.includes(authUser.id)) {
          return json({ error: 'conversation not found' }, 404);
        }
      }
      const callPath = p.match(/^calls\/([^/]+)(?:\/|$)/);
      // S6: calls/group/* is excluded here because it carries its own checks
      // inside extended(): join requires conversation membership, signal
      // requires both ends in the same live call room, leave fans out only
      // for participants. ice-servers stays public by design.
      if (callPath && !['ice-servers', 'group', 'incoming'].includes(callPath[1])) {
        const call = await loadCallSession(callPath[1]);
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

      // D2: duplicate reactions/pins/polls/albums handlers lived here. They were
      // unreachable (extended() answers these routes first, with membership
      // checks the duplicates lacked) and are removed; extended() is the one
      // impl. Saved-messages below is workerCore-only and stays, D1-backed.

      // Saved Messages (Keep) — D2: keep_items is authoritative, the Map is cache.
      if (p === 'saved-messages') {
        const kdb = dbOf();
        if (kdb) {
          await ensureSchema();
          await hydrateKeep(authUser.id);
        }
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const sid = crypto.randomUUID();
          const slist = savedMessages.get(authUser.id) || [];
          const smsg = { id: sid, body: body.body || '', kind: body.kind || 'text', created_at: new Date().toISOString() };
          slist.unshift(smsg);
          savedMessages.set(authUser.id, slist);
          if (kdb) await kdb.prepare('INSERT INTO keep_items (id, user_id, title, body, category, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(smsg.id, authUser.id, '', smsg.body, smsg.kind, smsg.created_at).run();
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
        const kdb = dbOf();
        if (kdb) {
          await ensureSchema();
          await hydrateKeep(authUser.id);
          await kdb.prepare('DELETE FROM keep_items WHERE id = ? AND user_id = ?').bind(sid, authUser.id).run();
        }
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
          conversation_id: callSessions.get(callSigMatch[1])?.conversation_id,
          from_user_id: authUser.id,
          signal_type: body.signal_type,
          sdp: body.sdp,
          // N2-L: relay ICE candidates too (web and app both trickle here);
          // without this only offer/answer SDP ever arrived.
          candidate: body.candidate
        });
        await storeCallSignal(callSigMatch[1], authUser.id, body);
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

      // D3: duplicate store handlers lived here. They were unreachable
      // (extended() answers these routes first) and are removed; extended()
      // is the one impl.

      // D4: the duplicate community/openchat handlers lived here. They were
      // unreachable (extended() answers these routes first, with room checks
      // the duplicates lacked) and are removed; extended() is the one impl.

      // 11. Partner Console
      if (p === 'partner/organizations') {
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const orgId = crypto.randomUUID();
          const org = { id: orgId, name: body.name || 'Partner Org', country: body.country || 'KR', owner_id: authUser.id, my_role: 'owner' };
          const accId = crypto.randomUUID();
          const acc = { id: accId, org_id: orgId, name: `${org.name} Official`, status: 'active' };
          if (ownedResourcesDurable()) {
            const db = dbOf(); await ensureSchema();
            await db.prepare('INSERT INTO luno_partner_orgs (id, name, country, owner_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(orgId, org.name, org.country, authUser.id, now()).run();
            await db.prepare('INSERT INTO luno_partner_accounts (id, org_id, name, status, created_at) VALUES (?, ?, ?, ?, ?)').bind(accId, orgId, acc.name, acc.status, now()).run();
          } else {
            partnerOrgs.set(orgId, org);
            partnerAccounts.set(accId, acc);
          }
          return json(org, 201);
        }
        if (ownedResourcesDurable()) {
          const db = dbOf(); await ensureSchema();
          const mine = authUser.role !== 'admin';
          const st = db.prepare(mine ? 'SELECT * FROM luno_partner_orgs WHERE owner_id = ?' : 'SELECT * FROM luno_partner_orgs');
          const { results } = await (mine ? st.bind(authUser.id).all() : st.all());
          return json({ organizations: (results || []).map(r => ({ id: r.id, name: r.name, country: r.country, owner_id: r.owner_id, my_role: 'owner' })) });
        }
        return json({ organizations: Array.from(partnerOrgs.values()).filter(org => authUser.role === 'admin' || org.owner_id === authUser.id) });
      }
      const partnerOrgAccMatch = p.match(/^partner\/organizations\/([a-zA-Z0-9_-]+)\/accounts$/);
      if (partnerOrgAccMatch) {
        const oid = partnerOrgAccMatch[1];
        let org = partnerOrgs.get(oid);
        if (!org && ownedResourcesDurable()) {
          const r = await dbOf().prepare('SELECT * FROM luno_partner_orgs WHERE id = ?').bind(oid).first().catch(() => null);
          if (r) org = { id: r.id, name: r.name, country: r.country, owner_id: r.owner_id };
        }
        if (!org) return json({ error: 'organization not found' }, 404);
        if (authUser.role !== 'admin' && org.owner_id !== authUser.id) return json({ error: 'organization forbidden' }, 403);
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const name = clip(body.name || '', 100);
          if (!name) return json({ error: 'name required' }, 400);
          const acc = { id: crypto.randomUUID(), org_id: oid, name, status: 'active' };
          if (ownedResourcesDurable()) {
            await ensureSchema();
            await dbOf().prepare('INSERT INTO luno_partner_accounts (id, org_id, name, status, created_at) VALUES (?, ?, ?, ?, ?)').bind(acc.id, oid, name, acc.status, now()).run();
          } else partnerAccounts.set(acc.id, acc);
          return json(acc, 201);
        }
        if (ownedResourcesDurable()) {
          await ensureSchema();
          const { results } = await dbOf().prepare('SELECT * FROM luno_partner_accounts WHERE org_id = ?').bind(oid).all();
          return json({ accounts: (results || []).map(r => ({ id: r.id, org_id: r.org_id, name: r.name, status: r.status })) });
        }
        return json({ accounts: Array.from(partnerAccounts.values()).filter(a => a.org_id === oid) });
      }
      const partnerTickMatch = p.match(/^partner\/accounts\/([a-zA-Z0-9_-]+)\/tickets$/);
      if (partnerTickMatch) {
        const aid = partnerTickMatch[1];
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const t = { id: crypto.randomUUID(), account_id: aid, contact_id: clip(body.contact_id || '', 100), priority: ['urgent', 'high', 'normal', 'low'].includes(body.priority) ? body.priority : 'normal', internal_note: clip(body.internal_note || '', 2000), status: 'open' };
          if (ownedResourcesDurable()) {
            await ensureSchema();
            await dbOf().prepare('INSERT INTO luno_partner_tickets (id, account_id, contact_id, priority, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(t.id, aid, t.contact_id, t.priority, t.internal_note, t.status, now()).run();
          } else {
            const tlist = partnerTickets.get(aid) || [];
            tlist.push(t);
            partnerTickets.set(aid, tlist);
          }
          return json(t, 201);
        }
        if (ownedResourcesDurable()) {
          await ensureSchema();
          const { results } = await dbOf().prepare('SELECT * FROM luno_partner_tickets WHERE account_id = ? ORDER BY created_at DESC').bind(aid).all().catch(() => ({ results: [] }));
          return json({ tickets: (results || []).map(r => ({ id: r.id, account_id: r.account_id, contact_id: r.contact_id, priority: r.priority, internal_note: r.note, status: r.status })) });
        }
        return json({ tickets: partnerTickets.get(aid) || [] });
      }
      const partnerCampMatch = p.match(/^partner\/accounts\/([a-zA-Z0-9_-]+)\/campaigns$/);
      if (partnerCampMatch) {
        const aid = partnerCampMatch[1];
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const camp = { id: crypto.randomUUID(), account_id: aid, name: clip(body.name || 'Campaign', 100), message_template: body.message_template && typeof body.message_template === 'object' ? body.message_template : null, status: 'scheduled' };
          if (ownedResourcesDurable()) {
            await ensureSchema();
            await dbOf().prepare('INSERT INTO luno_partner_campaigns (id, account_id, name, template_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(camp.id, aid, camp.name, JSON.stringify(camp.message_template), camp.status, now()).run();
          } else {
            const clist = partnerCampaigns.get(aid) || [];
            clist.push(camp);
            partnerCampaigns.set(aid, clist);
          }
          return json(camp, 201);
        }
        if (ownedResourcesDurable()) {
          await ensureSchema();
          const { results } = await dbOf().prepare('SELECT * FROM luno_partner_campaigns WHERE account_id = ? ORDER BY created_at DESC').bind(aid).all().catch(() => ({ results: [] }));
          return json({ campaigns: (results || []).map(r => ({ id: r.id, account_id: r.account_id, name: r.name, message_template: parseJsonSafe(r.template_json, null), status: r.status })) });
        }
        return json({ campaigns: partnerCampaigns.get(aid) || [] });
      }
      const partnerCouponMatch = p.match(/^partner\/accounts\/([a-zA-Z0-9_-]+)\/coupons$/);
      if (partnerCouponMatch) {
        const aid = partnerCouponMatch[1];
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const code = clip(body.code || '', 40);
          if (!code) return json({ error: 'code required' }, 400);
          const coupon = { id: crypto.randomUUID(), account_id: aid, code, max_redemptions: Number.isSafeInteger(body.max_redemptions) && body.max_redemptions > 0 ? Math.min(body.max_redemptions, 1000000) : 50, redeemed: 0 };
          if (ownedResourcesDurable()) {
            await ensureSchema();
            await dbOf().prepare('INSERT INTO luno_partner_coupons (id, account_id, code, max_redemptions, redeemed, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(coupon.id, aid, code, coupon.max_redemptions, 0, now()).run();
          } else {
            const colist = partnerCoupons.get(aid) || [];
            colist.push(coupon);
            partnerCoupons.set(aid, colist);
          }
          return json(coupon, 201);
        }
        if (ownedResourcesDurable()) {
          await ensureSchema();
          const { results } = await dbOf().prepare('SELECT * FROM luno_partner_coupons WHERE account_id = ? ORDER BY created_at DESC').bind(aid).all().catch(() => ({ results: [] }));
          return json({ coupons: results || [] });
        }
        return json({ coupons: partnerCoupons.get(aid) || [] });
      }

      // 12. Developer Console
      if (p === 'developer/organizations') {
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const name = clip(body.name || '', 100);
          if (!name) return json({ error: 'name required' }, 400);
          const org = { id: crypto.randomUUID(), name, owner_id: authUser.id, role: 'owner' };
          if (ownedResourcesDurable()) {
            await ensureSchema();
            await dbOf().prepare('INSERT INTO luno_dev_orgs (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)').bind(org.id, name, authUser.id, now()).run();
          } else devOrgs.set(org.id, org);
          return json(org, 201);
        }
        if (ownedResourcesDurable()) {
          await ensureSchema();
          const mine = authUser.role !== 'admin';
          const st = dbOf().prepare(mine ? 'SELECT * FROM luno_dev_orgs WHERE owner_id = ?' : 'SELECT * FROM luno_dev_orgs');
          const { results } = await (mine ? st.bind(authUser.id).all() : st.all());
          return json({ organizations: (results || []).map(r => ({ id: r.id, name: r.name, role: 'owner' })) });
        }
        const mine = Array.from(devOrgs.values()).filter(o => authUser.role === 'admin' || o.owner_id === authUser.id);
        if (mine.length || devOrgs.size) return json({ organizations: mine.map(o => ({ id: o.id, name: o.name, role: 'owner' })) });
        return json({ organizations: [{ id: 'dev-org-1', name: 'LUNO Dev Team' }] });
      }
      const devOrgAppsMatch = p.match(/^developer\/organizations\/([a-zA-Z0-9_-]+)\/apps$/);
      if (devOrgAppsMatch) {
        const org = await devOrgById(devOrgAppsMatch[1]);
        if (!org) return json({ error: 'organization not found' }, 404);
        if (authUser.role !== 'admin' && org.owner_id !== authUser.id) return json({ error: 'organization forbidden' }, 403);
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const name = clip(body.name || '', 100);
          if (!name) return json({ error: 'name required' }, 400);
          const secret = crypto.randomUUID();
          const app = { id: crypto.randomUUID(), org_id: org.id, owner_id: authUser.id, name, client_id: `cli_${crypto.randomUUID().slice(0, 8)}`, client_secret_hash: await sha256Hex(secret), status: 'active' };
          if (ownedResourcesDurable()) {
            await ensureSchema();
            await dbOf().prepare('INSERT INTO luno_dev_apps (id, org_id, owner_id, name, client_id, client_secret_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(app.id, org.id, authUser.id, name, app.client_id, app.client_secret_hash, app.status, now()).run();
          }
          devApps.set(app.id, app);
          return json({ id: app.id, org_id: org.id, name, client_id: app.client_id, status: app.status, client_secret_once: secret }, 201);
        }
        if (ownedResourcesDurable()) {
          await ensureSchema();
          const { results } = await dbOf().prepare('SELECT id, org_id, name, client_id, status FROM luno_dev_apps WHERE org_id = ?').bind(org.id).all().catch(() => ({ results: [] }));
          return json({ apps: results || [] });
        }
        return json({ apps: Array.from(devApps.values()).filter(a => a.org_id === org.id).map(({ client_secret, client_secret_hash, ...visible }) => visible) });
      }
      if (p === 'developer/apps') {
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const secret = crypto.randomUUID();
          const app = { id: crypto.randomUUID(), org_id: null, owner_id: authUser.id, name: body.name || 'Bot App', client_id: `cli_${crypto.randomUUID().slice(0, 8)}`, client_secret_hash: await sha256Hex(secret) };
          if (ownedResourcesDurable()) {
            await ensureSchema();
            await dbOf().prepare('INSERT INTO luno_dev_apps (id, org_id, owner_id, name, client_id, client_secret_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(app.id, null, authUser.id, app.name, app.client_id, app.client_secret_hash, 'active', now()).run();
          }
          devApps.set(app.id, app);
          const { client_secret_hash, ...visible } = app;
          return json({ ...visible, client_secret: secret }, 201);
        }
        if (ownedResourcesDurable()) {
          await ensureSchema();
          const mine = authUser.role !== 'admin';
          const st = dbOf().prepare(mine ? 'SELECT id, org_id, name, client_id, status FROM luno_dev_apps WHERE owner_id = ?' : 'SELECT id, org_id, name, client_id, status FROM luno_dev_apps');
          const { results } = await (mine ? st.bind(authUser.id).all() : st.all());
          return json({ apps: results || [] });
        }
        return json({ apps: Array.from(devApps.values()).filter(app => authUser.role === 'admin' || app.owner_id === authUser.id).map(({ client_secret, client_secret_hash, ...visible }) => visible) });
      }
      const devWebMatch = p.match(/^developer\/apps\/([a-zA-Z0-9_-]+)\/webhooks$/);
      if (devWebMatch && request.method === 'POST') {
        const app = await devAppById(devWebMatch[1]);
        if (!app) return json({ error: 'app not found' }, 404);
        if (app.owner_id !== authUser.id) return json({ error: 'app forbidden' }, 403);
        const body = await request.json().catch(() => ({}));
        const urlErr = httpsPublicUrlError(body.endpoint_url);
        if (urlErr) return json({ error: urlErr }, 400);
        if (!ownedResourcesDurable()) return json({ error: 'Durable webhook configuration storage is not implemented', code: 'WEBHOOK_STORAGE_NOT_CONFIGURED' }, 503);
        const secret = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
        const hook = { id: crypto.randomUUID(), app_id: app.id, endpoint_url: String(body.endpoint_url), secret_hash: await sha256Hex(secret) };
        await ensureSchema();
        await dbOf().prepare('INSERT INTO luno_dev_webhooks (id, app_id, endpoint_url, secret_hash, created_at) VALUES (?, ?, ?, ?, ?)').bind(hook.id, app.id, hook.endpoint_url, hook.secret_hash, now()).run();
        devWebhooks.set(hook.id, hook);
        return json({ id: hook.id, signing_secret_once: secret }, 201);
      }
      const devMiniMatch = p.match(/^developer\/apps\/([a-zA-Z0-9_-]+)\/miniapps$/);
      if (devMiniMatch) {
        const app = await devAppById(devMiniMatch[1]);
        if (!app) return json({ error: 'app not found' }, 404);
        if (app.owner_id !== authUser.id) return json({ error: 'app forbidden' }, 403);
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const originErr = httpsPublicUrlError(body.origin);
          if (originErr) return json({ error: originErr }, 400);
          const mini = { id: crypto.randomUUID(), app_id: app.id, origin: String(body.origin), manifest: body.manifest && typeof body.manifest === 'object' ? body.manifest : {} };
          if (ownedResourcesDurable()) {
            await ensureSchema();
            await dbOf().prepare('INSERT INTO luno_dev_miniapps (id, app_id, origin, manifest_json, created_at) VALUES (?, ?, ?, ?, ?)').bind(mini.id, app.id, mini.origin, JSON.stringify(mini.manifest), now()).run();
          }
          devMiniApps.set(mini.id, mini);
          return json(mini, 201);
        }
        if (ownedResourcesDurable()) {
          await ensureSchema();
          const { results } = await dbOf().prepare('SELECT * FROM luno_dev_miniapps WHERE app_id = ?').bind(app.id).all().catch(() => ({ results: [] }));
          return json({ miniapps: (results || []).map(r => ({ id: r.id, app_id: r.app_id, origin: r.origin, manifest: parseJsonSafe(r.manifest_json, {}) })) });
        }
        return json({ miniapps: Array.from(devMiniApps.values()).filter(m => m.app_id === app.id) });
      }

      // 13. Creator Console
      if (p === 'creator/profile') {
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const displayName = clip(body.display_name || '', 60);
          if (!displayName) return json({ error: 'display_name required' }, 400);
          if (ownedResourcesDurable()) {
            await ensureSchema();
            await dbOf().prepare('INSERT INTO luno_creator_profiles (user_id, display_name, updated_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at').bind(authUser.id, displayName, now()).run();
          }
          creatorProfiles.set(authUser.id, { user_id: authUser.id, display_name: displayName });
          return json({ id: authUser.id, display_name: displayName, verified: true });
        }
        if (ownedResourcesDurable()) {
          await ensureSchema();
          const r = await dbOf().prepare('SELECT display_name FROM luno_creator_profiles WHERE user_id = ?').bind(authUser.id).first().catch(() => null);
          if (r) return json({ id: authUser.id, display_name: r.display_name, verified: true });
        }
        const hit = creatorProfiles.get(authUser.id);
        if (hit) return json({ id: authUser.id, display_name: hit.display_name, verified: true });
        return json({ id: 'creator-1', display_name: authUser.display_name, verified: true });
      }
      const creatorItemMatch = p.match(/^creator\/packs\/([a-zA-Z0-9_-]+)\/stickers$/);
      if (creatorItemMatch) {
        const pack = await ownedRead('creator_pack', creatorItemMatch[1]);
        if (!pack) return json({ error: 'resource not found' }, 404);
        if (pack.owner_id !== authUser.id && authUser.role !== 'admin') return json({ error: 'resource forbidden' }, 403);
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const objectKey = clip(body.object_key || '', 300);
          if (!objectKey) return json({ error: 'object_key required' }, 400);
          const item = { id: crypto.randomUUID(), pack_id: pack.id, object_key: objectKey, kind: body.kind === 'animated' ? 'animated' : 'static', ordinal: Number.isSafeInteger(body.ordinal) ? body.ordinal : 0 };
          if (ownedResourcesDurable()) {
            await ensureSchema();
            await dbOf().prepare('INSERT INTO luno_creator_items (id, pack_id, object_key, kind, ordinal, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(item.id, pack.id, objectKey, item.kind, item.ordinal, now()).run();
          }
          creatorItems.set(item.id, item);
          return json(item, 201);
        }
        if (ownedResourcesDurable()) {
          await ensureSchema();
          const { results } = await dbOf().prepare('SELECT * FROM luno_creator_items WHERE pack_id = ? ORDER BY ordinal, created_at').bind(pack.id).all().catch(() => ({ results: [] }));
          return json({ stickers: results || [] });
        }
        return json({ stickers: Array.from(creatorItems.values()).filter(i => i.pack_id === pack.id) });
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
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const name = clip(body.name || '', 100);
          if (!name) return json({ error: 'name required' }, 400);
          const adv = { id: crypto.randomUUID(), organization_id: clip(body.organization_id || '', 100), name, owner_id: authUser.id, status: 'pending' };
          if (ownedResourcesDurable()) {
            await ensureSchema();
            await dbOf().prepare('INSERT INTO luno_ads_advertisers (id, organization_id, name, owner_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(adv.id, adv.organization_id, name, authUser.id, adv.status, now()).run();
          }
          adsAdvertisers.set(adv.id, adv);
          return json(adv, 201);
        }
        if (ownedResourcesDurable()) {
          await ensureSchema();
          const mine = authUser.role !== 'admin';
          const st = dbOf().prepare(mine ? 'SELECT * FROM luno_ads_advertisers WHERE owner_id = ?' : 'SELECT * FROM luno_ads_advertisers');
          const { results } = await (mine ? st.bind(authUser.id).all() : st.all());
          const rows = (results || []).map(r => ({ id: r.id, organization_id: r.organization_id, name: r.name, status: r.status }));
          if (rows.length) return json({ advertisers: rows });
          return json({ advertisers: [{ id: 'adv-1', company_name: 'LUNO Global Ads', status: 'verified' }] });
        }
        const mine = Array.from(adsAdvertisers.values()).filter(a => authUser.role === 'admin' || a.owner_id === authUser.id);
        if (mine.length) return json({ advertisers: mine });
        return json({ advertisers: [{ id: 'adv-1', company_name: 'LUNO Global Ads', status: 'verified' }] });
      }
      const adsGroupMatch = p.match(/^ads\/campaigns\/([a-zA-Z0-9_-]+)\/groups$/);
      if (adsGroupMatch) {
        const camp = await ownedRead('ad_campaign', adsGroupMatch[1]);
        if (!camp) return json({ error: 'resource not found' }, 404);
        if (camp.owner_id !== authUser.id && authUser.role !== 'admin') return json({ error: 'resource forbidden' }, 403);
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const name = clip(body.name || '', 100);
          if (!name) return json({ error: 'name required' }, 400);
          const group = { id: crypto.randomUUID(), campaign_id: camp.id, name, targeting: body.targeting && typeof body.targeting === 'object' ? body.targeting : {}, bid_minor: Number.isSafeInteger(body.bid_minor) && body.bid_minor >= 0 ? body.bid_minor : 0 };
          if (ownedResourcesDurable()) {
            await ensureSchema();
            await dbOf().prepare('INSERT INTO luno_ads_groups (id, campaign_id, name, targeting_json, bid_minor, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(group.id, camp.id, name, JSON.stringify(group.targeting), group.bid_minor, now()).run();
          }
          adsGroups.set(group.id, group);
          return json(group, 201);
        }
        if (ownedResourcesDurable()) {
          await ensureSchema();
          const { results } = await dbOf().prepare('SELECT * FROM luno_ads_groups WHERE campaign_id = ?').bind(camp.id).all().catch(() => ({ results: [] }));
          return json({ groups: (results || []).map(r => ({ id: r.id, campaign_id: r.campaign_id, name: r.name, targeting: parseJsonSafe(r.targeting_json, {}), bid_minor: r.bid_minor })) });
        }
        return json({ groups: Array.from(adsGroups.values()).filter(g => g.campaign_id === camp.id) });
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
        if (dbOf()) {
          await ensureSchema();
          // A database without the roles table (no grants yet) still lists every
          // account: the join is retried without it instead of returning nothing.
          let listed = await dbOf().prepare('SELECT u.id, u.email, u.display_name, u.state, r.role AS granted_role FROM users u LEFT JOIN luno_user_roles r ON r.user_id = u.id').all().catch(() => null);
          if (!listed) listed = await dbOf().prepare('SELECT id, email, display_name, state, NULL AS granted_role FROM users').all().catch(() => ({ results: [] }));
          const { results } = listed;
          const envAdmins = new Set(String(CURRENT_ENV?.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean));
          const out = (results || []).map(r => ({ id: r.id, email: r.email, display_name: r.display_name, role: envAdmins.has(r.id) ? 'admin' : grantedRole(r.granted_role), state: r.state || 'active' }));
          for (const u of users.values()) {
            if (!out.some(o => o.id === u.id)) out.push({ id: u.id, email: u.email, display_name: u.display_name, role: u.role, state: u.state || 'active' });
          }
          return json({ users: out });
        }
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
            // E8: sealed bodies are device-searchable only.
            if (m.kind === 'ciphertext') continue;
            if (String(m.body || '').toLowerCase().includes(q)) foundMsgs.push(m);
          }
        }
        return json({ messages: foundMsgs, users: [] });
      }

      // Unknown routes are real 404s; a placeholder 200 would masquerade as an implemented endpoint.
      return json({ error: 'not_found', path: p }, 404);
    }
    // Any other /api/ path (no v1 prefix, unknown version) is an API miss,
    // not a page: without this it fell through to the SPA as a 200 HTML.
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return json({ error: 'not_found', path: url.pathname }, 404);
    }

    // /download hands over the recommended APK itself (streamed from the
    // release asset, so nothing is stored here); the landing page with every
    // ABI stays at /download.html and is the fallback when the asset is
    // unreachable. Range passes through so an interrupted download resumes.
    if (url.pathname === '/download' || url.pathname === '/download/') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      const asset = LATEST_ANDROID_BUILD.assets.find(a => a.recommended) || LATEST_ANDROID_BUILD.assets[0];
      const range = request.headers.get('Range');
      let upstream = null;
      try {
        upstream = await fetch(asset.url, { method: request.method, redirect: 'follow', headers: range ? { Range: range } : {} });
      } catch { upstream = null; }
      if (!upstream || (upstream.status !== 200 && upstream.status !== 206)) {
        return downloadPage(env, url);
      }
      const headers = new Headers({
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="luno-messenger.apk"',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes'
      });
      const length = upstream.headers.get('content-length') || (upstream.status === 200 ? String(asset.size_bytes) : '');
      if (length) headers.set('Content-Length', length);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) headers.set('Content-Range', contentRange);
      return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
    }
    // Mobile APK Download Landing Page (every ABI + QR).
    if (['/download.html', '/app', '/mobile', '/apk'].includes(url.pathname)) {
      return downloadPage(env, url);
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

// P0-5: one Durable Object per group-call room (stub via
// env.GROUP_CALLS.idFromName(roomId)). The seat set is the only state:
// SQLite-backed so an evicted room reloads its seats instead of 404ing
// a live call. Relay fanout stays in the worker (sendTo -> UserSocketHub).
export class GroupCallRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.seats = null;
    this.started = null;
  }

  sql() {
    return this.state.storage.sql;
  }

  ensure() {
    this.sql().exec('CREATE TABLE IF NOT EXISTS seats (user_id TEXT PRIMARY KEY, joined_at INTEGER NOT NULL)');
    this.sql().exec('CREATE TABLE IF NOT EXISTS room_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    if (!this.seats) {
      const rows = this.sql().exec('SELECT user_id FROM seats ORDER BY joined_at, user_id').toArray();
      this.seats = new Set(rows.map((r) => r.user_id));
      const meta = this.sql().exec("SELECT v FROM room_meta WHERE k = 'started'").toArray();
      this.started = meta.length > 0;
    }
  }

  json(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  }

  async fetch(request) {
    const url = new URL(request.url);
    this.ensure();

    if (url.pathname === '/join' && request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const userId = String((b && b.user_id) || '');
      const max = Number((b && b.max) || 8);
      if (!userId) return this.json({ error: 'user_id required' }, 400);
      if (!this.seats.has(userId) && this.seats.size >= max) {
        return this.json({ error: 'group call is full' }, 409);
      }
      if (!this.seats.has(userId)) {
        this.sql().exec('INSERT OR IGNORE INTO seats (user_id, joined_at) VALUES (?, ?)', userId, Date.now());
        this.seats.add(userId);
      }
      if (!this.started) {
        // The room counts as started from the first join on, even after
        // every seat leaves — the legacy Map kept the empty room too.
        this.sql().exec("INSERT OR IGNORE INTO room_meta (k, v) VALUES ('started', '1')");
        this.started = true;
      }
      return this.json({ status: 'joined', participants: [...this.seats] }, 201);
    }

    if (url.pathname === '/signal-check' && request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const from = String((b && b.from_user_id) || '');
      const target = String((b && b.target_user_id) || '');
      if (!this.started) return this.json({ error: 'call not found' }, 404);
      if (!this.seats.has(from) || !this.seats.has(target)) {
        return this.json({ error: 'not a participant of this call' }, 403);
      }
      return this.json({ status: 'ok' });
    }

    if (url.pathname === '/leave' && request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const userId = String((b && b.user_id) || '');
      let left = false;
      if (userId && this.seats.has(userId)) {
        this.sql().exec('DELETE FROM seats WHERE user_id = ?', userId);
        this.seats.delete(userId);
        left = true;
      }
      return this.json({ status: 'left', left, participants: [...this.seats] });
    }

    if (url.pathname === '/participants' && request.method === 'GET') {
      return this.json({ participants: [...this.seats] });
    }

    return this.json({ error: 'not found' }, 404);
  }
}

// S1: test seam export (mock/log recovery-mail deliveries).
export { recoveryMailOutbox, verificationMailOutbox, smsOutbox };
export { QUOTA_UPLOADS_PER_DAY, QUOTA_UPLOAD_BYTES_PER_DAY, QUOTA_ROOMS_PER_DAY, quotaWouldExceed };
export { TRANSLATE_MAX_CHARS, TRANSLATE_PER_MINUTE, TRANSLATE_CHARS_PER_DAY, translateProviderCalls, registerTranslateProvider };
export { maskTelemetryValue, logSafe };
export { groupCallSeatSweep }; // P0-5: socket-close seat sweep (env, userId).
export { webpushEncrypt, webpushB64uDecode }; // P1-4: RFC 8291 vector test seam.
export default {
  async fetch(request, env, ctx) {
    CURRENT_ENV = env;
    CURRENT_CTX = ctx || null;
    // F22: every request gets an id. It rides the structured logs and the
    // x-request-id response header, so a client report pins a server trace.
    CURRENT_RID = uid().slice(0, 8);
    const route = f22RouteOf(new URL(request.url).pathname);
    f22Bump(f22Requests, route);
    const tag = (res) => {
      try {
        if (res && res.status >= 400) f22Bump(f22Errors, `${route} ${res.status}`);
      } catch { /* counters must never break the response */ }
      try { res.headers.set('x-request-id', CURRENT_RID); } catch { /* immutable (upstream/101): logs still carry the rid */ }
      return res;
    };
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
          return tag(await fetch(new Request(upstream, { redirect: 'manual' })));
        } catch {
          return tag(await withSecurityHeaders(request, await withCors(request, env, json({ error: 'backend unavailable' }, 502))));
        }
      }
      return tag(await withSecurityHeaders(request, await withCors(request, env, await workerCore.fetch(request, env, ctx))));
    } catch (err) {
      if (err?.code === 'CONVERSATION_CONFLICT') return tag(json({ error: err.message, code: err.code }, 409));
      logx('error', 'internal', { error: err instanceof Error ? (err.stack || err.message) : err });
      return tag(withCors(request, env, json({ error: 'internal_error' }, 500)));
    } finally {
      CURRENT_RID = '';
    }
  },

  // S1: the 2-minute PC-off cron (wrangler triggers). Dedicated to the
  // offline sweep; no other job may ride this handler.
  async scheduled(event, env, ctx) {
    CURRENT_ENV = env;
    CURRENT_CTX = ctx || null;
    CURRENT_RID = uid().slice(0, 8);
    try {
      await sweepOfflineBots();
    } catch (err) {
      logx('error', 'cron', { error: err instanceof Error ? (err.stack || err.message) : err });
    } finally {
      CURRENT_RID = '';
    }
  }
};
