-- 008_passkeys.sql — WebAuthn credentials + ceremony challenges.
-- Fresh databases already carry these tables via 001_all_phases.sql;
-- this file upgrades pre-existing databases. Replay-safe (IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS identity.passkey_credentials (
 id TEXT PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
 credential TEXT NOT NULL,
 name TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS passkey_credentials_user_idx ON identity.passkey_credentials(user_id);
CREATE TABLE IF NOT EXISTS identity.passkey_challenges (
 challenge TEXT PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL,
 session TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS passkey_challenges_user_idx ON identity.passkey_challenges(user_id);
