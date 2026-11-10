-- Phase 2 R2 cutover for attachments (2026-11-10, A-20/B-3).
-- Idempotent: safe to execute repeatedly (CREATE/INDEX IF NOT EXISTS).
-- Bytes move to the R2 bucket bound as MEDIA_BUCKET (bucket: luno-media);
-- D1 keeps metadata only. luno_attachments (base64) is legacy read-only:
-- the worker serves pre-cutover rows from it but never writes new ones.
-- The `name` column on pre-existing `attachments` tables is applied by the
-- worker's pragma-guarded ensure (LUNO_SCHEMA_PHASE1_COLS in cf_worker.js).

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  object_key TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  uploader_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_conv ON attachments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_attachments_uploader ON attachments(uploader_id);
