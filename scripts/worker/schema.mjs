// Worker module: D1 DDL (P2 monolith split). Frozen strings; ensure* stays
// in cf_worker.js because schemaReady/dbOf are per-isolate (cold-start journey).

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

export { LUNO_SCHEMA, LUNO_SCHEMA_BASE, LUNO_SCHEMA_PHASE1, LUNO_SCHEMA_PHASE1_COLS };
