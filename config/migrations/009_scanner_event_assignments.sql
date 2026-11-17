-- Assign Scanner accounts to the events they are allowed to check in.
CREATE TABLE IF NOT EXISTS scanner_event_assignments (
  scanner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  assigned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scanner_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_scanner_event_assignments_event_id
  ON scanner_event_assignments (event_id);

ALTER TABLE scanner_event_assignments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION revoke_scanner_event_assignments_on_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role = 'Scanner' AND NEW.role <> 'Scanner' THEN
    DELETE FROM scanner_event_assignments WHERE scanner_id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_revoke_scanner_event_assignments ON users;
CREATE TRIGGER trigger_revoke_scanner_event_assignments
AFTER UPDATE OF role ON users
FOR EACH ROW
EXECUTE FUNCTION revoke_scanner_event_assignments_on_role_change();