-- Migration 004: payments Midtrans Snap columns
ALTER TABLE payments ADD COLUMN IF NOT EXISTS snap_token TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS redirect_url TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS midtrans_order_id TEXT;
CREATE INDEX IF NOT EXISTS idx_payments_midtrans_order_id ON payments(midtrans_order_id);
-- also allow lookup by transaction_id already unique
