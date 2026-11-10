-- 009_searchable_by_id.sql — ID friend-add discoverability toggle.
-- Fresh databases already carry this column via 001_all_phases.sql;
-- this file upgrades pre-existing databases. Replay-safe (IF NOT EXISTS).
ALTER TABLE identity.user_settings ADD COLUMN IF NOT EXISTS searchable_by_id BOOLEAN NOT NULL DEFAULT true;
