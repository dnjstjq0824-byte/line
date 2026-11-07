-- 006_friend_pin_prefs.sql — friend favorites + conversation pins.
-- Fresh databases already carry these columns via 001_all_phases.sql;
-- this file upgrades pre-existing databases. Replay-safe (IF NOT EXISTS).
ALTER TABLE social.friendships ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE chat.conversation_members ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
