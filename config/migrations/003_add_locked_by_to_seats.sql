ALTER TABLE seats ADD COLUMN IF NOT EXISTS locked_by INT8 REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_seats_locked_by ON seats(locked_by);
