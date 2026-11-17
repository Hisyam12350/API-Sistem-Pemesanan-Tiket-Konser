-- =====================================================================
-- Migration 008: aturan bisnis & hardening (lanjutan 007)
--   1. payment_status 'refunded' + kolom payments.needs_refund (bayar terlambat / perlu refund manual)
--   2. Email user dinormalisasi huruf kecil + unique index case-insensitive
--   3. Constraint data (harga/kuota/jumlah tidak boleh negatif/ngawur) -- NOT VALID agar data lama tidak menggagalkan migrasi
--   4. Trigger pengembalian kuota juga membersihkan locked_by
--   5. Fungsi pembersih lock kursi yang AMAN (tidak melepas kursi milik order pending) + fungsi status event otomatis
--   6. Jadwal pg_cron diperbarui (dilewati otomatis bila pg_cron tidak tersedia)
--
-- Urutan deploy: jalankan 001..007 (sudah), lalu file ini, BARU deploy kode backend baru.
-- Aman dijalankan berulang (idempotent). Jalankan di Supabase SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Refund / pembayaran terlambat
--    (ADD VALUE tidak boleh dipakai di transaksi yang sama; di file ini nilainya tidak dipakai.)
-- ---------------------------------------------------------------------
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'refunded';

ALTER TABLE payments ADD COLUMN IF NOT EXISTS needs_refund BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_payments_needs_refund ON payments (id) WHERE needs_refund;

-- Satu order hanya boleh punya SATU pembayaran 'pending' (mencegah dua transaksi Midtrans untuk order yang sama
-- saat user menekan tombol bayar dua kali bersamaan).
DO $$
BEGIN
  -- Rapikan dulu duplikat pending lama: sisakan yang terbaru, sisanya ditandai failed.
  UPDATE payments p SET status = 'failed'
   WHERE p.status = 'pending'
     AND EXISTS (SELECT 1 FROM payments p2 WHERE p2.order_id = p.order_id AND p2.status = 'pending' AND p2.id > p.id);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_pending_per_order ON payments (order_id) WHERE status = 'pending';
END $$;

-- ---------------------------------------------------------------------
-- 2. Email: huruf kecil + unik tanpa membedakan besar/kecil
--    Jika ada email yang kembar setelah dijadikan huruf kecil, normalisasi DILEWATI (dicatat NOTICE)
--    dan harus dirapikan manual:
--      SELECT lower(email), array_agg(id) FROM users GROUP BY 1 HAVING count(*) > 1;
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users GROUP BY lower(email) HAVING count(*) > 1) THEN
    RAISE NOTICE 'Ada email kembar (beda huruf besar/kecil). Normalisasi email dilewati; rapikan manual lalu jalankan ulang migrasi ini.';
  ELSE
    UPDATE users SET email = lower(email) WHERE email <> lower(email);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (lower(email));
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. Constraint data (NOT VALID: berlaku untuk data baru; data lama tidak diperiksa sehingga migrasi tidak gagal.
--    Setelah data lama dirapikan: ALTER TABLE ... VALIDATE CONSTRAINT <nama>;)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ticket_categories_harga') THEN
    ALTER TABLE ticket_categories ADD CONSTRAINT chk_ticket_categories_harga CHECK (harga >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ticket_categories_kuota') THEN
    ALTER TABLE ticket_categories ADD CONSTRAINT chk_ticket_categories_kuota
      CHECK (kuota_total > 0 AND kuota_tersedia >= 0 AND kuota_tersedia <= kuota_total) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_items_jumlah') THEN
    ALTER TABLE order_items ADD CONSTRAINT chk_order_items_jumlah CHECK (jumlah > 0 AND harga_satuan >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payments_amount') THEN
    ALTER TABLE payments ADD CONSTRAINT chk_payments_amount CHECK (amount >= 0) NOT VALID;
  END IF;
END $$;

-- Nomor kursi unik per kategori. Sebelumnya hanya dicek di aplikasi sehingga dua request generate bersamaan
-- bisa membuat kursi kembar. Bila sudah ada kursi kembar, index DILEWATI (NOTICE) dan harus dirapikan manual:
--   SELECT kategori_id, nomor_kursi, array_agg(id) FROM seats GROUP BY 1,2 HAVING count(*) > 1;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM seats GROUP BY kategori_id, nomor_kursi HAVING count(*) > 1) THEN
    RAISE NOTICE 'Ada kursi kembar (kategori_id + nomor_kursi sama). Index unik dilewati; rapikan manual lalu jalankan ulang migrasi ini.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_seats_kategori_nomor ON seats (kategori_id, nomor_kursi);
  END IF;
END $$;

-- Index untuk query yang sering dipakai (kedaluwarsa order, kursi per kategori, tiket per order)
CREATE INDEX IF NOT EXISTS idx_orders_pending_deadline ON orders (batas_waktu_bayar) WHERE status_order = 'pending';
CREATE INDEX IF NOT EXISTS idx_seats_locked_until ON seats (locked_until) WHERE status_kursi = 'locked';
CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON tickets (order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_kategori_id ON tickets (kategori_id);
CREATE INDEX IF NOT EXISTS idx_tickets_scanned_by ON tickets (scanned_by) WHERE status_tiket = 'scanned';

-- ---------------------------------------------------------------------
-- 4. Trigger pengembalian kuota: ikut membersihkan locked_by saat kursi dibebaskan
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION kembalikan_kuota_batal()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status_order = 'expired' OR NEW.status_order = 'cancelled') AND
     (OLD.status_order IS NULL OR (OLD.status_order != 'expired' AND OLD.status_order != 'cancelled')) THEN

    UPDATE ticket_categories
       SET kuota_tersedia = kuota_tersedia + oi.jumlah
      FROM order_items oi
     WHERE oi.kategori_id = ticket_categories.id
       AND oi.order_id = NEW.id;

    UPDATE seats
       SET status_kursi = 'available', locked_until = NULL, locked_by = NULL
      FROM order_item_seats ois
      JOIN order_items oi ON oi.id = ois.order_item_id
     WHERE ois.seat_id = seats.id
       AND oi.order_id = NEW.id;

    DELETE FROM order_item_seats
     USING order_items oi
     WHERE order_item_seats.order_item_id = oi.id
       AND oi.order_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 5. Fungsi pemeliharaan
--    release_stale_seat_locks: lepas lock yang habis waktunya, TAPI jangan menyentuh kursi yang dipegang
--    order pending (job lama melepasnya sehingga kursi order yang belum dibayar bisa diambil orang lain).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION release_stale_seat_locks()
RETURNS INTEGER AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE seats s
     SET status_kursi = 'available', locked_until = NULL, locked_by = NULL
   WHERE s.status_kursi = 'locked'
     AND s.locked_until < NOW()
     AND NOT EXISTS (SELECT 1 FROM order_item_seats ois WHERE ois.seat_id = s.id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION expire_pending_orders()
RETURNS INTEGER AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE orders SET status_order = 'expired'
   WHERE status_order = 'pending' AND batas_waktu_bayar < NOW();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

--    update_event_status: upcoming -> ongoing saat acara mulai, ongoing -> completed 24 jam kemudian.
--    (Hanya maju; status yang diubah admin manual ke 'completed' tidak dikembalikan.)
CREATE OR REPLACE FUNCTION update_event_status()
RETURNS INTEGER AS $$
DECLARE n1 INTEGER; n2 INTEGER;
BEGIN
  UPDATE events SET status = 'completed'
   WHERE status IN ('upcoming', 'ongoing') AND waktu_event < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS n1 = ROW_COUNT;
  UPDATE events SET status = 'ongoing'
   WHERE status = 'upcoming' AND waktu_event <= NOW();
  GET DIAGNOSTICS n2 = ROW_COUNT;
  RETURN n1 + n2;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 6. Jadwal pg_cron (dilewati bila pg_cron tidak tersedia, mis. di database lokal)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron tidak tersedia, penjadwalan dilewati: %', SQLERRM;
    RETURN;
  END;

  PERFORM cron.schedule('cleanup-expired-seat-locks', '*/5 * * * *', 'SELECT release_stale_seat_locks();');
  PERFORM cron.schedule('expire-pending-orders',      '*/5 * * * *', 'SELECT expire_pending_orders();');
  PERFORM cron.schedule('update-event-status',        '*/10 * * * *', 'SELECT update_event_status();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Penjadwalan pg_cron dilewati: %', SQLERRM;
END $$;
