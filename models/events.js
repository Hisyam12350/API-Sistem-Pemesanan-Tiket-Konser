const supabase = require('../config/supabase.js');

const Event = {
  async createEvents({ nama_event, lokasi, waktu_event, banner_url, status = 'upcoming', venue_id, deskripsi, detail_lokasi }) {
    const { data, error } = await supabase
      .from('events')
      .insert([{
        nama_event,
        lokasi,
        waktu_event,
        banner_url,
        status,
        venue_id: venue_id !== undefined ? venue_id : null,
        deskripsi: deskripsi !== undefined ? deskripsi : null,
        detail_lokasi: detail_lokasi !== undefined ? detail_lokasi : null,
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getAllEvents() {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;
    return data;
  },

  async getEventById(id) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Detail event + info venue (untuk Step 1: tampilkan nama & alamat venue terpilih)
  async getEventWithVenue(id) {
    const { data, error } = await supabase
      .from('events')
      .select('*, venues(id, nama_venue, alamat, kota, kapasitas, latitude, longitude, venue_type_id)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async updateEvents(id, { nama_event, lokasi, waktu_event, banner_url, status, venue_id, deskripsi, detail_lokasi }) {
    const updates = {};
    if (nama_event !== undefined) updates.nama_event = nama_event;
    if (lokasi !== undefined) updates.lokasi = lokasi;
    if (waktu_event !== undefined) updates.waktu_event = waktu_event;
    if (banner_url !== undefined) updates.banner_url = banner_url;
    if (status !== undefined) updates.status = status;
    if (venue_id !== undefined) updates.venue_id = venue_id;
    if (deskripsi !== undefined) updates.deskripsi = deskripsi;
    if (detail_lokasi !== undefined) updates.detail_lokasi = detail_lokasi;

    const { data, error } = await supabase
      .from('events')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async deleteEvents(id) {
    const { data, error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  },
};

module.exports = Event;
