-- F22 monitoring: D1 table behind client telemetry ingest.
-- Local/staging preparation only. Production application requires separate PO approval.
-- Additive: CREATE TABLE IF NOT EXISTS, no existing data touched.
-- Same shape as ensureSchema in scripts/cf_worker.js.
CREATE TABLE IF NOT EXISTS luno_telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT, received_at TEXT NOT NULL, reporter TEXT NOT NULL DEFAULT '', user_id TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', stack TEXT NOT NULL DEFAULT '', context_json TEXT NOT NULL DEFAULT '{}', ms INTEGER);
CREATE INDEX IF NOT EXISTS idx_luno_telemetry_kind ON luno_telemetry(kind,received_at);
