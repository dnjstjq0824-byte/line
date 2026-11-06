-- Additive indexes for the hottest D1 read paths (also created by LUNO_SCHEMA at runtime).
-- Idempotent; safe to apply to production at any time. Rollback: DROP INDEX the two names.

-- hydrateCursors: SELECT ... FROM luno_read_cursors WHERE user_id = ?
-- The (conversation_id, user_id) primary key cannot serve a user_id-only filter,
-- so every call scanned the whole table.
CREATE INDEX IF NOT EXISTS idx_luno_read_cursors_user ON luno_read_cursors(user_id);

-- listSessionsFor: WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC
-- Reads only the user's live sessions instead of every revoked one as well.
CREATE INDEX IF NOT EXISTS idx_luno_sessions_user_active ON luno_sessions(user_id, created_at) WHERE revoked_at IS NULL;
