-- Phase 1 security + persistence tables (2026-11-10).
-- Idempotent: safe to execute repeatedly (CREATE/INDEX IF NOT EXISTS).
-- Column extensions to pre-existing tables are applied by the worker's
-- pragma-guarded ensure (see LUNO_SCHEMA_PHASE1_COLS in cf_worker.js);
-- pure SQL has no guarded ADD COLUMN, so they live in code, not here.
-- Legacy lookalikes (notes, events, message_reactions, luno_audit,
-- option1/option2 polls columns) are left untouched and deprecated;
-- new code uses only the canonical tables below.

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT,
  expires_at INTEGER NOT NULL,
  revoked INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_key ON login_attempts(key, created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);

CREATE TABLE IF NOT EXISTS user_bans (
  user_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT '',
  banned_by TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor);

CREATE TABLE IF NOT EXISTS e2ee_keys (
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  identity_key TEXT NOT NULL DEFAULT '',
  signed_prekey TEXT NOT NULL DEFAULT '',
  prekeys_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, device_id)
);

CREATE TABLE IF NOT EXISTS push_tokens (
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, device_id)
);

CREATE TABLE IF NOT EXISTS conversation_notes (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversation_notes_conv ON conversation_notes(conversation_id);

CREATE TABLE IF NOT EXISTS conversation_events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversation_events_conv ON conversation_events(conversation_id);

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (poll_id, option_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);

CREATE TABLE IF NOT EXISTS reactions (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS call_logs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  caller_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'voice',
  started_at TEXT NOT NULL,
  ended_at TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ended'
);
CREATE INDEX IF NOT EXISTS idx_call_logs_conv ON call_logs(conversation_id);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  object_key TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  uploader_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_conv ON attachments(conversation_id);
