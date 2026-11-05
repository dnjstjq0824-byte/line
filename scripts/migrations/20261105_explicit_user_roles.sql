-- Prepared only. Production application and administrator provisioning require PO approval.
-- Idempotent and additive. Never infer grants from email or copy legacy session roles.
CREATE TABLE IF NOT EXISTS luno_user_roles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'admin', 'partner', 'developer', 'creator', 'ads')),
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS luno_role_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  old_role TEXT,
  new_role TEXT NOT NULL,
  recorded_actor TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS luno_role_grant_audit AFTER INSERT ON luno_user_roles
BEGIN
  INSERT INTO luno_role_events(user_id,old_role,new_role,recorded_actor,occurred_at)
  VALUES(NEW.user_id,NULL,NEW.role,NEW.approved_by,NEW.approved_at);
END;
CREATE TRIGGER IF NOT EXISTS luno_role_change_audit AFTER UPDATE ON luno_user_roles
BEGIN
  INSERT INTO luno_role_events(user_id,old_role,new_role,recorded_actor,occurred_at)
  VALUES(NEW.user_id,OLD.role,NEW.role,NEW.approved_by,NEW.approved_at);
END;
CREATE TRIGGER IF NOT EXISTS luno_role_no_delete BEFORE DELETE ON luno_user_roles
BEGIN SELECT RAISE(ABORT,'Revoke by assigning user with explicit approval metadata'); END;
CREATE TRIGGER IF NOT EXISTS luno_role_events_no_update BEFORE UPDATE ON luno_role_events
BEGIN SELECT RAISE(ABORT,'Role history is append only'); END;
CREATE TRIGGER IF NOT EXISTS luno_role_events_no_delete BEFORE DELETE ON luno_role_events
BEGIN SELECT RAISE(ABORT,'Role history is append only'); END;
-- No automatic administrator grant. The authorized operator must verify the
-- immutable user_id and provision an explicitly approved assignment separately.
-- Rollback: keep this table and its audit fields. Reverting to email-derived
-- authorization is unsafe. Revoke a grant by setting role='user' under approval.
