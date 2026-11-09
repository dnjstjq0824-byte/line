-- 007_user_birthday.sql — MM-DD birthdays on identity.users.
-- Fresh databases already carry this column via 001_all_phases.sql;
-- this file upgrades pre-existing databases. Replay-safe (IF NOT EXISTS).
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS birthday TEXT NOT NULL DEFAULT '';
