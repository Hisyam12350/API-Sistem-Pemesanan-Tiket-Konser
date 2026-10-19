const supabase = require('../config/supabase.js');

const SELECT_COLUMNS = 'id, venue_type_id, nama_venue, alamat, kota, kapasitas, gambar_url, google_place_id, latitude, longitude, sumber_data, terakhir_sinkron, created_at';

// Escape karakter LIKE/ILIKE (%, _, backslash) agar input search tidak bocor jadi pola
function escapeLike(s) {
  return String(s).replace(/([\\%_])/g, '\\$1');
}

const Venue = {
  // Filter kategori (venue_type_id) + search (nama/alamat/kota, ILIKE aman) + kota + pagination
  // Mengembalikan { data, pagination } agar frontend bisa render search bar + halaman
  async getVenues({ venue_type_id, search, kota, page = 1, limit = 20 }) {
    let query = supabase.from('venues').select(SELECT_COLUMNS, { count: 'exact' });

    if (venue_type_id) query = query.eq('venue_type_id', venue_type_id);
    if (kota) query = query.ilike('kota', '%' + escapeLike(kota) + '%');
    if (search) {
      const q = escapeLike(search);
      query = query.or('nama_venue.ilike.%' + q + '%,alamat.ilike.%' + q + '%,kota.ilike.%' + q + '%');
    }

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const from = (safePage - 1) * safeLimit;

    const { data, error, count } = await query
      .order('nama_venue', { ascending: true })
      .range(from, from + safeLimit - 1);
    if (error) throw error;

    const total = count || 0;
    return {
      data,
      pagination: { page: safePage, limit: safeLimit, total, total_pages: Math.ceil(total / safeLimit) },
    };
  },

  async getVenueById(id) {
    const { data, error } = await supabase
      .from('venues')
      .select(SELECT_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async findByGooglePlaceId(placeId) {
    const { data, error } = await supabase
      .from('venues')
      .select(SELECT_COLUMNS)
      .eq('google_place_id', placeId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async createVenue({ venue_type_id, nama_venue, alamat, kota, kapasitas, gambar_url, google_place_id, latitude, longitude, sumber_data }) {
    const { data, error } = await supabase
      .from('venues')
      .insert([{
        venue_type_id,
        nama_venue,
        alamat,
        kota: kota || null,
        kapasitas: kapasitas !== undefined ? kapasitas : null,
        gambar_url: gambar_url || null,
        google_place_id: google_place_id || null,
        latitude: latitude !== undefined ? latitude : null,
        longitude: longitude !== undefined ? longitude : null,
        sumber_data: sumber_data || 'manual',
        terakhir_sinkron: google_place_id ? new Date().toISOString() : null,
      }])
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },

  async updateVenue(id, { venue_type_id, nama_venue, alamat, kota, kapasitas, gambar_url }) {
    const updates = {};
    if (venue_type_id !== undefined) updates.venue_type_id = venue_type_id;
    if (nama_venue !== undefined) updates.nama_venue = nama_venue;
    if (alamat !== undefined) updates.alamat = alamat;
    if (kota !== undefined) updates.kota = kota;
    if (kapasitas !== undefined) updates.kapasitas = kapasitas;
    if (gambar_url !== undefined) updates.gambar_url = gambar_url;

    const { data, error } = await supabase
      .from('venues')
      .update(updates)
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async deleteVenue(id) {
    const { data, error } = await supabase
      .from('venues')
      .delete()
      .eq('id', id)
      .select('id, nama_venue')
      .maybeSingle();
    if (error) throw error;
    return data;
  },
};

module.exports = Venue;
