-- =====================================================================
-- Migration 007: Security hardening
-- Tujuan:
--   1. Satu kursi tidak boleh punya lebih dari satu tiket AKTIF
--      (mencegah tiket ganda saat webhook Midtrans & polling berjalan bersamaan).
--   2. Aktifkan Row Level Security (RLS) di SEMUA tabel public.
--      Tanpa RLS, siapa pun yang memegang publishable/anon key Supabase bisa membaca
--      (bahkan menulis) tabel -- termasuk `users` yang berisi hash password -- lewat PostgREST.
--
-- PENTING: jalankan migrasi ini SEBELUM men-deploy kode backend versi baru,
--          karena kode baru memakai ON CONFLICT (seat_id) pada tabel tickets.
-- Cara pakai: jalankan seluruh isi file ini di Supabase SQL Editor.
-- Aman dijalankan berulang (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bersihkan duplikat lama (jika ada) sebelum membuat unique index.
--    Untuk tiap kursi yang punya >1 tiket aktif, tiket dengan id terkecil dipertahankan,
--    sisanya ditandai 'cancelled'. (Tidak ada data yang dihapus.)
--    Periksa dulu hasilnya bila sudah ada tiket yang di-scan:
--      SELECT seat_id, array_agg(id ORDER BY id) AS ticket_ids, array_agg(status_tiket ORDER BY id)
--      FROM tickets WHERE status_tiket <> 'cancelled' AND seat_id IS NOT NULL
--      GROUP BY seat_id HAVING count(*) > 1;
-- ---------------------------------------------------------------------
UPDATE tickets t
   SET status_tiket = 'cancelled'
 WHERE t.status_tiket <> 'cancelled'
   AND t.seat_id IS NOT NULL
   AND EXISTS (
         SELECT 1 FROM tickets t2
          WHERE t2.seat_id = t.seat_id
            AND t2.status_tiket <> 'cancelled'
            AND t2.id < t.id
       );

-- ---------------------------------------------------------------------
-- 2. Unique index parsial: 1 kursi = maksimal 1 tiket yang belum dibatalkan.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_tickets_active_seat
  ON tickets (seat_id)
  WHERE status_tiket <> 'cancelled';

-- ---------------------------------------------------------------------
-- 3. Row Level Security.
--    Backend memakai SUPABASE_SECRET_KEY (service role) dan koneksi `pg` (role postgres),
--    keduanya melewati RLS, jadi aplikasi tetap berjalan normal.
--    Sengaja TIDAK ada policy untuk anon/authenticated => akses langsung via PostgREST ditolak.
--    Jika suatu saat frontend perlu membaca tabel tertentu langsung, buat policy SELECT
--    yang spesifik untuk tabel itu (jangan pernah untuk `users`, `payments`, `tickets`, `orders`).
-- ---------------------------------------------------------------------
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues             ENABLE ROW LEVEL SECURITY;
ALTER TABLE genres             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE seats              ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_seats   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets            ENABLE ROW LEVEL SECURITY;

-- Verifikasi (harus menampilkan rls_enabled = true untuk semua baris):
--   SELECT relname, relrowsecurity AS rls_enabled
--   FROM pg_class
--   WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
--   ORDER BY relname;
