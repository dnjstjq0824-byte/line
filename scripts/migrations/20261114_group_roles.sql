-- F6 group roles: widen the member role CHECK to admit 'admin'.
-- Local/staging preparation only. Production application requires separate PO approval.
-- Additive: existing memberships are preserved with their roles and join order.
PRAGMA foreign_keys = OFF;
ALTER TABLE luno_conversation_members RENAME TO luno_conversation_members_legacy;
CREATE TABLE luno_conversation_members (
  conversation_id TEXT NOT NULL REFERENCES luno_conversations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner','member','admin')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id,user_id)
);
INSERT INTO luno_conversation_members (conversation_id, user_id, role, joined_at)
  SELECT conversation_id, user_id, role, joined_at FROM luno_conversation_members_legacy;
DROP TABLE luno_conversation_members_legacy;
CREATE INDEX IF NOT EXISTS idx_luno_members_user ON luno_conversation_members(user_id,conversation_id);
PRAGMA foreign_keys = ON;
