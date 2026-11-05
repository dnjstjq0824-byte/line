-- Explicit, additive baseline matching existing LUNO_SCHEMA.
-- Prepared for local/staging only; production application requires approval.
CREATE TABLE IF NOT EXISTS luno_sessions (
    token_hash TEXT PRIMARY KEY, session_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT,
    device_name TEXT, platform TEXT, ip TEXT, created_at TEXT NOT NULL, last_seen_at TEXT,
    revoked_at TEXT, revoked_by TEXT);

CREATE UNIQUE INDEX IF NOT EXISTS idx_luno_sessions_sid ON luno_sessions(session_id);

CREATE INDEX IF NOT EXISTS idx_luno_sessions_user ON luno_sessions(user_id);

CREATE TABLE IF NOT EXISTS luno_messages (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL, client_id TEXT,
    sequence INTEGER NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', metadata TEXT,
    reply_to TEXT, created_at TEXT NOT NULL, unsent INTEGER NOT NULL DEFAULT 0, edited_at TEXT);

CREATE UNIQUE INDEX IF NOT EXISTS idx_luno_messages_seq ON luno_messages(conversation_id, sequence);

CREATE TABLE IF NOT EXISTS luno_read_cursors (
    conversation_id TEXT NOT NULL, user_id TEXT NOT NULL, sequence INTEGER NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY (conversation_id, user_id));

CREATE TABLE IF NOT EXISTS luno_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, action TEXT NOT NULL, target TEXT, detail TEXT, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS luno_ws_tickets (
    ticket TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS idx_luno_ws_tickets_exp ON luno_ws_tickets(expires_at);

CREATE TABLE IF NOT EXISTS luno_attachments (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL,
    mime TEXT NOT NULL, size INTEGER NOT NULL, b64 TEXT NOT NULL, created_at TEXT NOT NULL);
