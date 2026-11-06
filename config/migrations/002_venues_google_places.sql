-- =====================================================================
-- Migration 002: Venue & Tempat Event (Step 1 Pemilihan Tempat)
-- Tujuan:
--   1. Tabel master venue_types (Stadion, Indoor, Outdoor, Lapangan...)
--      + seed 4 tipe dasar (idempotent).
--   2. Tabel venues: daftar tempat konser (input alamat manual).
--   3. Kolom baru di events: venue_id (nullable), deskripsi,
--      detail_lokasi; kolom lokasi jadi opsional (diisi otomatis dari
--      venue bila kosong oleh backend).
--   4. Index untuk filter kategori + search alamat/kota.
--
-- Cara pakai: jalankan seluruh isi file ini di Supabase SQL Editor.
-- Aman dijalankan berulang (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabel master: venue_types
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venue_types (
  id BIGSERIAL PRIMARY KEY,
  nama_tipe TEXT UNIQUE NOT NULL,
  deskripsi TEXT,
  ikon TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed 4 tipe dasar (ON CONFLICT agar idempotent)
INSERT INTO venue_types (nama_tipe, deskripsi, ikon) VALUES
  ('Stadion', 'Stadion terbuka berkapasitas besar dengan tribun penonton', 'trophy'),
  ('Indoor', 'Gedung atau aula tertutup (convention hall, istora, dsb.)', 'building-2'),
  ('Outdoor', 'Area terbuka tanpa atap permanen (pantai, parkir, taman)', 'tent'),
  ('Lapangan', 'Lapangan olahraga atau area terbuka dengan panggung sementara', 'flag')
ON CONFLICT (nama_tipe) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Tabel venues
--    - venue_type_id RESTRICT: tipe yang masih dipakai tak bisa dihapus.
--    - Alamat, kota, kapasitas diisi secara manual oleh admin.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venues (
  id BIGSERIAL PRIMARY KEY,
  venue_type_id INT8 NOT NULL REFERENCES venue_types(id) ON DELETE RESTRICT,
  nama_venue TEXT NOT NULL,
  alamat TEXT NOT NULL,
  kota TEXT,
  kapasitas INT,
  gambar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 3. Kolom baru di events (semua opsional -> aman untuk data lama)
-- ---------------------------------------------------------------------
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_id INT8 REFERENCES venues(id) ON DELETE RESTRICT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS deskripsi TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS detail_lokasi TEXT;

-- lokasi jadi opsional: bila kosong, backend mengisinya otomatis dari venue
ALTER TABLE events ALTER COLUMN lokasi DROP NOT NULL;

-- ---------------------------------------------------------------------
-- 4. Tabel master: genres (genre musik konser)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS genres (
  id BIGSERIAL PRIMARY KEY,
  nama_genre TEXT UNIQUE NOT NULL,
  deskripsi TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed genre dasar (idempotent)
INSERT INTO genres (nama_genre, deskripsi) VALUES
  ('Rock', 'Musik rock dan varian'),
  ('Pop', 'Musik pop kontemporer'),
  ('Jazz', 'Musik jazz dan fusinya'),
  ('Klasik', 'Musik klasik dan orkestra'),
  ('Dangdut', 'Musik dangdut Indonesia'),
  ('Hip Hop', 'Musik hip hop dan rap'),
  ('EDM', 'Musik elektronik dan EDM'),
  ('R&B', 'Musik rhythm and blues')
ON CONFLICT (nama_genre) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. Tambah genre_id di events (opsional -> aman untuk data lama)
-- ---------------------------------------------------------------------
ALTER TABLE events ADD COLUMN IF NOT EXISTS genre_id INT8 REFERENCES genres(id) ON DELETE SET NULL;

-- Index untuk filter genre
CREATE INDEX IF NOT EXISTS idx_events_genre_id ON events(genre_id);