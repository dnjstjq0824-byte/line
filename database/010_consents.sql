-- 010_consents.sql: F24 legal consent records (PostgreSQL).
-- Same shape as identity.consents in 001_all_phases.sql.
CREATE TABLE IF NOT EXISTS identity.consents (
 user_id UUID PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
 terms_version TEXT NOT NULL, privacy_version TEXT NOT NULL,
 age14_confirmed BOOLEAN,
 consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
