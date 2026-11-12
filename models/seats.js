const supabase = require('../config/supabase.js');

const SELECT_COLUMNS = 'id, kategori_id, nomor_kursi, status_kursi, locked_until, locked_by, created_at';

const Seat = {
  async getSeatsByCategory(kategoriId) {
    // Bebaskan kursi yang locked tetapi locked_until sudah kadaluwarsa
    await supabase
      .from('seats')
      .update({ status_kursi: 'available', locked_until: null, locked_by: null })
      .eq('kategori_id', kategoriId)
      .eq('status_kursi', 'locked')
      .lt('locked_until', new Date().toISOString());

    const { data, error } = await supabase
      .from('seats')
      .select(SELECT_COLUMNS)
      .eq('kategori_id', kategoriId)
      .order('nomor_kursi', { ascending: true });

    if (error) throw error;
    return data;
  },

  async getSeatById(id) {
    const { data, error } = await supabase
      .from('seats')
      .select(SELECT_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getSeatNumbersByCategory(kategoriId) {
    const { data, error } = await supabase
      .from('seats')
      .select('nomor_kursi')
      .eq('kategori_id', kategoriId);

    if (error) throw error;
    return data.map((row) => row.nomor_kursi);
  },

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

  async lockSeat(seatId, lockedUntil, lockedBy = null) {
    // Bebaskan kursi ini jika sedang locked tapi sudah kadaluwarsa
    await supabase
      .from('seats')
      .update({ status_kursi: 'available', locked_until: null, locked_by: null })
      .eq('id', seatId)
      .eq('status_kursi', 'locked')
      .lt('locked_until', new Date().toISOString());

    const { data, error } = await supabase
      .from('seats')
      .update({ status_kursi: 'locked', locked_until: lockedUntil, locked_by: lockedBy })
      .eq('id', seatId)
      .eq('status_kursi', 'available')
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async unlockSeat(seatId, userId = null) {
    let query = supabase
      .from('seats')
      .update({ status_kursi: 'available', locked_until: null, locked_by: null })
      .eq('id', seatId)
      .eq('status_kursi', 'locked');

    if (userId !== null && userId !== undefined) {
      query = query.eq('locked_by', userId);
    }

    const { data, error } = await query.select(SELECT_COLUMNS).maybeSingle();
    if (error) throw error;
    return data;
  }
};

module.exports = Seat;