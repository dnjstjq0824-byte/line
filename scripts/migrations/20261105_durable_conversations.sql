-- Local/staging preparation only. Production application requires separate PO approval.
-- Additive: existing messages, conversations and namespace history are preserved.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS luno_conversations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('direct','group')),
  title TEXT NOT NULL,
  notice TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  owner_id TEXT NOT NULL REFERENCES users(id),
  direct_key TEXT UNIQUE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  mutation_token TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS luno_conversation_members (
  conversation_id TEXT NOT NULL REFERENCES luno_conversations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner','member')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_luno_members_user ON luno_conversation_members(user_id,conversation_id);
-- No automatic legacy backfill: seed/demo/OA identities require a separate mapping.
-- Rollback disables DURABLE_CONVERSATIONS but keeps these tables and all rows.
-- Do not delete metadata after messages have referenced these conversation IDs.
