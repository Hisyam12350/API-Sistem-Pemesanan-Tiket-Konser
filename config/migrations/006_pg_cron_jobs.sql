-- Enable pg_cron extension (Supabase sudah support)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Cleanup expired seat locks setiap 5 menit
SELECT cron.schedule(
  'cleanup-expired-seat-locks',
  '*/5 * * * *',
  $$
  UPDATE seats
  SET status_kursi = 'available',
      locked_until = NULL,
      locked_by = NULL
  WHERE status_kursi = 'locked'
    AND locked_until < NOW();
  $$
);

-- 2. Expire pending orders setiap 5 menit
SELECT cron.schedule(
  'expire-pending-orders',
  '*/5 * * * *',
  $$
  UPDATE orders
  SET status_order = 'expired'
  WHERE status_order = 'pending'
    AND batas_waktu_bayar < NOW();
  $$
);