-- F16 feature flags: D1-backed admin flags (seeds stay the default overlay).
-- Local/staging preparation only. Production application requires separate PO approval.
-- Additive: CREATE TABLE IF NOT EXISTS, no existing data touched.
CREATE TABLE IF NOT EXISTS luno_feature_flags (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
