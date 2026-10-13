const supabase = require('../config/supabase.js');

// Kolom yang aman dikembalikan ke klien
const SELECT_COLUMNS = 'id, kategori_id, nomor_kursi, status_kursi, locked_until, created_at';

const Seat = {
  // Ambil semua kursi untuk satu kategori, diurutkan berdasarkan nomor kursi.
  async getSeatsByCategory(kategoriId) {
    const { data, error } = await supabase
      .from('seats')
      .select(SELECT_COLUMNS)
      .eq('kategori_id', kategoriId)
      .order('nomor_kursi', { ascending: true });

    if (error) throw error;
    return data;
  },

  // Ambil satu kursi berdasarkan ID
  async getSeatById(id) {
    const { data, error } = await supabase
      .from('seats')
      .select(SELECT_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Ambil daftar nomor kursi yang sudah ada di sebuah kategori (untuk cek duplikat)
  async getSeatNumbersByCategory(kategoriId) {
    const { data, error } = await supabase
      .from('seats')
      .select('nomor_kursi')
      .eq('kategori_id', kategoriId);

    if (error) throw error;
    return data.map((row) => row.nomor_kursi);
  },

  // Insert banyak kursi sekaligus (batch)
  async generateSeats(kategoriId, seatNumbers) {
    const rows = seatNumbers.map((nomor) => ({ kategori_id: kategoriId, nomor_kursi: nomor }));
    const { data, error } = await supabase
      .from('seats')
      .insert(rows)
      .select(SELECT_COLUMNS)
      .order('id', { ascending: true });

    if (error) throw error;
    return data;
  },

  // Lock satu kursi secara ATOMIK.
  // UPDATE ... WHERE id = ? AND status_kursi = 'available'
  // Jika kursi sudah 'locked'/'booked', tidak ada baris yang ter-update -> data null.
  // Ini mencegah 2 user merebut kursi yang sama (aman dari race condition di level DB).
  async lockSeat(seatId, lockedUntil) {
    const { data, error } = await supabase
      .from('seats')
      .update({ status_kursi: 'locked', locked_until: lockedUntil })
      .eq('id', seatId)
      .eq('status_kursi', 'available')
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error) throw error;
    return data; // null jika gagal lock (sudah tidak available)
  },

  // Buka lock satu kursi (hanya jika statusnya 'locked').
  async unlockSeat(seatId) {
    const { data, error } = await supabase
      .from('seats')
      .update({ status_kursi: 'available', locked_until: null })
      .eq('id', seatId)
      .eq('status_kursi', 'locked')
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error) throw error;
    return data; // null jika bukan 'locked'
  }
};

module.exports = Seat;
