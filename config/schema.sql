-- 1. Hapus jika ada yang lama
DROP TABLE IF EXISTS tickets, payments, order_item_seats, order_items, orders, seats, ticket_categories, events, users CASCADE;
DROP TYPE IF EXISTS Role, event_status, order_status, payment_status, ticket_status, seat_status CASCADE;

-- 2. Buat Tipe Enum
CREATE TYPE Role AS ENUM ('SuperAdmin', 'Admin', 'Customer', 'Scanner');
CREATE TYPE event_status AS ENUM ('upcoming', 'ongoing', 'completed');
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'expired', 'cancelled');
CREATE TYPE payment_status AS ENUM ('pending', 'success', 'expired', 'failed');
CREATE TYPE ticket_status AS ENUM ('active', 'scanned', 'cancelled');
CREATE TYPE seat_status AS ENUM ('available', 'locked', 'booked');

-- 3. Buat Tabel
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  email VARCHAR UNIQUE NOT NULL,
  password VARCHAR NOT NULL,
  role Role DEFAULT 'Customer',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  nama_event TEXT NOT NULL,
  lokasi TEXT NOT NULL,
  waktu_event TIMESTAMPTZ NOT NULL,
  banner_url TEXT,
  status event_status DEFAULT 'upcoming',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ticket_categories (
  id BIGSERIAL PRIMARY KEY,
  event_id INT8 REFERENCES events(id) ON DELETE CASCADE,
  nama_kategori TEXT NOT NULL,
  harga NUMERIC NOT NULL,
  kuota_total INT4 NOT NULL,
  kuota_tersedia INT4 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE seats (
  id BIGSERIAL PRIMARY KEY,
  kategori_id INT8 REFERENCES ticket_categories(id) ON DELETE CASCADE,
  nomor_kursi VARCHAR(50) NOT NULL,
  status_kursi seat_status DEFAULT 'available',
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  cutsomer_id INT8 REFERENCES users(id) ON DELETE RESTRICT, -- Sesuai nama kolom di Supabase (cutsomer_id)
  total_pembayaran NUMERIC DEFAULT 0,
  status_order order_status DEFAULT 'pending',
  batas_waktu_bayar TIMESTAMPTZ NOT NULL, -- Diisi dari Backend (NOW() + 15 menit)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id INT8 REFERENCES orders(id) ON DELETE CASCADE,
  kategori_id INT8 REFERENCES ticket_categories(id) ON DELETE RESTRICT,
  jumlah INT4 NOT NULL,
  harga_satuan NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Junction: mencatat kursi spesifik yang dipilih untuk setiap order_item.
-- UNIQUE(seat_id) menjamin satu kursi tidak bisa masuk 2 order aktif.
CREATE TABLE order_item_seats (
  id BIGSERIAL PRIMARY KEY,
  order_item_id INT8 NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  seat_id INT8 NOT NULL REFERENCES seats(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_order_item_seat UNIQUE (seat_id)
);

CREATE TABLE payments (
  id BIGSERIAL PRIMARY KEY,
  order_id INT8 REFERENCES orders(id) ON DELETE CASCADE,
  transaction_id TEXT UNIQUE,
  payment_method TEXT,
  amount NUMERIC NOT NULL,
  status payment_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tickets (
  id BIGSERIAL PRIMARY KEY,
  order_id INT8 REFERENCES orders(id) ON DELETE CASCADE,
  kategori_id INT8 REFERENCES ticket_categories(id) ON DELETE RESTRICT,
  seat_id INT8 REFERENCES seats(id) ON DELETE SET NULL,
  kode_unik TEXT UNIQUE NOT NULL,
  status_tiket ticket_status DEFAULT 'active',
  scanned_at TIMESTAMPTZ,
  scanned_by INT8 REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ========================================================================================

CREATE OR REPLACE FUNCTION kurangi_kuota_tiket() 
RETURNS TRIGGER AS $$
DECLARE
  v_kuota INT;
BEGIN
  -- FOR UPDATE akan mengunci baris data ini selama sepersekian milidetik.
  -- Ini MENCEGAH 2 orang checkout tiket terakhir di milidetik yang sama.
  SELECT kuota_tersedia INTO v_kuota 
  FROM ticket_categories 
  WHERE id = NEW.kategori_id 
  FOR UPDATE;

  -- Cek apakah kuota masih cukup
  IF v_kuota < NEW.jumlah THEN
    RAISE EXCEPTION 'Maaf, kuota tiket tidak mencukupi atau sudah habis!';
  END IF;

  -- Jika aman, kurangi kuota
  UPDATE ticket_categories 
  SET kuota_tersedia = kuota_tersedia - NEW.jumlah 
  WHERE id = NEW.kategori_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_kurangi_kuota
BEFORE INSERT ON order_items
FOR EACH ROW
EXECUTE FUNCTION kurangi_kuota_tiket();

-- =========================================================================


CREATE OR REPLACE FUNCTION hitung_total_pembayaran_tiket() 
RETURNS TRIGGER AS $$
DECLARE
  v_order_id INT8;
BEGIN
  IF TG_OP = 'DELETE' THEN 
    v_order_id := OLD.order_id;
  ELSE 
    v_order_id := NEW.order_id; 
  END IF;

  UPDATE orders
  SET total_pembayaran = COALESCE((SELECT SUM(jumlah * harga_satuan) FROM order_items WHERE order_id = v_order_id), 0)
  WHERE id = v_order_id;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_kalkulasi_total_tiket
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW
EXECUTE FUNCTION hitung_total_pembayaran_tiket();


-- ====================================================================


CREATE OR REPLACE FUNCTION kembalikan_kuota_batal()
RETURNS TRIGGER AS $$
BEGIN
  -- Mengecek apakah status order BARU SAJA diubah menjadi 'expired' atau 'cancelled'
  IF (NEW.status_order = 'expired' OR NEW.status_order = 'cancelled') AND
     (OLD.status_order IS NULL OR (OLD.status_order != 'expired' AND OLD.status_order != 'cancelled')) THEN

    -- 1. Kembalikan kuota ke tabel ticket_categories
    UPDATE ticket_categories
    SET kuota_tersedia = kuota_tersedia + oi.jumlah
    FROM order_items oi
    WHERE oi.kategori_id = ticket_categories.id
      AND oi.order_id = NEW.id;

    -- 2. Bebaskan kursi yang dipegang order ini (unlock dari junction order_item_seats)
    UPDATE seats
    SET status_kursi = 'available', locked_until = NULL
    FROM order_item_seats ois
    JOIN order_items oi ON oi.id = ois.order_item_id
    WHERE ois.seat_id = seats.id
      AND oi.order_id = NEW.id;

    -- 3. Hapus penjataan kursi agar bisa dipesan user lain (menjaga UNIQUE seat_id)
    DELETE FROM order_item_seats
    USING order_items oi
    WHERE order_item_seats.order_item_id = oi.id
      AND oi.order_id = NEW.id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_kembalikan_kuota
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION kembalikan_kuota_batal();

-- ====================================================================

-- Index untuk performa query
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(cutsomer_id);
CREATE INDEX IF NOT EXISTS idx_seats_kategori_id ON seats(kategori_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_ois_order_item_id ON order_item_seats(order_item_id);