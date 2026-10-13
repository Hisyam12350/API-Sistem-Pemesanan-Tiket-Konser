-- =====================================================================
-- Migration 001: Pemesanan Kursi Spesifik (Order Item Seats)
-- Tujuan:
--   1. Menambah tabel junction order_item_seats untuk mencatat kursi
--      spesifik yang dipilih customer pada setiap order_item.
--   2. Mengubah trigger kembalikan_kuota_batal agar membebaskan kursi
--      berdasarkan order_item_seats (bukan tickets), karena tickets
--      baru dibuat SETELAH pembayaran. Ini mencegah kursi "locked"
--      tidak pernah ter-unlock saat order expired/cancelled.
--   3. Menambah index untuk performa query.
--
-- Cara pakai: jalankan seluruh isi file ini di Supabase SQL Editor.
-- Aman dijalankan berulang (idempotent) kecuali pada INSERT data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabel junction: order_item_seats
--    UNIQUE(seat_id) menjamin satu kursi tidak bisa masuk 2 order aktif.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_item_seats (
  id BIGSERIAL PRIMARY KEY,
  order_item_id INT8 NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  seat_id INT8 NOT NULL REFERENCES seats(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_order_item_seat UNIQUE (seat_id)
);

-- ---------------------------------------------------------------------
-- 2. Update trigger kembalikan_kuota_batal (versi baru)
--    Signature tetap RETURNS TRIGGER, sehingga CREATE OR REPLACE cukup.
--    Trigger lama (trigger_kembalikan_kuota) otomatis memakai versi ini.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION kembalikan_kuota_batal()
RETURNS TRIGGER AS $$
BEGIN
  -- Hanya jalan saat status BARU SAJA berubah menjadi 'expired' atau 'cancelled'
  IF (NEW.status_order = 'expired' OR NEW.status_order = 'cancelled') AND
     (OLD.status_order IS NULL OR (OLD.status_order != 'expired' AND OLD.status_order != 'cancelled')) THEN

    -- 1. Kembalikan kuota tiket ke tabel ticket_categories
    UPDATE ticket_categories
    SET kuota_tersedia = kuota_tersedia + oi.jumlah
    FROM order_items oi
    WHERE oi.kategori_id = ticket_categories.id
      AND oi.order_id = NEW.id;

    -- 2. Bebaskan kursi yang dipegang order ini (unlock dari junction)
    UPDATE seats
    SET status_kursi = 'available', locked_until = NULL
    FROM order_item_seats ois
    JOIN order_items oi ON oi.id = ois.order_item_id
    WHERE ois.seat_id = seats.id
      AND oi.order_id = NEW.id;

    -- 3. Hapus penjataan kursi agar bisa dipesan user lain (menjaga UNIQUE)
    DELETE FROM order_item_seats
    USING order_items oi
    WHERE order_item_seats.order_item_id = oi.id
      AND oi.order_id = NEW.id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Pastikan trigger tetap terpasang (idempotent)
DROP TRIGGER IF EXISTS trigger_kembalikan_kuota ON orders;
CREATE TRIGGER trigger_kembalikan_kuota
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION kembalikan_kuota_batal();

-- ---------------------------------------------------------------------
-- 3. Index performa
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(cutsomer_id);
CREATE INDEX IF NOT EXISTS idx_seats_kategori_id ON seats(kategori_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_ois_order_item_id ON order_item_seats(order_item_id);
