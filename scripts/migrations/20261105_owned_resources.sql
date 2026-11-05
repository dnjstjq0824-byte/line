-- Prepared for isolated local validation. Production changes require approval.
CREATE TABLE IF NOT EXISTS luno_owned_resources (
  kind TEXT NOT NULL CHECK (kind IN ('creator_pack','ad_campaign')),
  id TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(kind,id)
);
CREATE INDEX IF NOT EXISTS idx_luno_owned_owner ON luno_owned_resources(kind,owner_id,id);
-- Keep records on rollback. No automatic ownership inference/backfill of seed data.
