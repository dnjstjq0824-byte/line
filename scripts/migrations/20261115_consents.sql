-- F24 terms consent: D1 table behind legal consent records.
-- Local/staging preparation only. Production application requires separate PO approval.
-- Additive: CREATE TABLE IF NOT EXISTS, no existing data touched.
-- Same shape as ensureSchema in scripts/cf_worker.js.
-- age14_confirmed NULL means grandfathered (consented to versions, age never
-- verified at signup). The verification birthdate is never stored anywhere.
CREATE TABLE IF NOT EXISTS luno_consents (
  user_id TEXT PRIMARY KEY, terms_version TEXT NOT NULL, privacy_version TEXT NOT NULL, age14_confirmed INTEGER, consented_at TEXT NOT NULL, updated_at TEXT NOT NULL);
