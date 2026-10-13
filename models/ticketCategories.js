const supabase = require('../config/supabase.js');

// Kolom yang aman dikembalikan ke klien
const SELECT_COLUMNS = 'id, event_id, nama_kategori, harga, kuota_total, kuota_tersedia, created_at';

const TicketCategory = {
  // Ambil semua kategori. Bisa difilter per event lewat opsional eventId.
  async getAllCategories(eventId = null) {
    let query = supabase
      .from('ticket_categories')
      .select(SELECT_COLUMNS)
      .order('harga', { ascending: true });

    if (eventId !== null && eventId !== undefined) {
      query = query.eq('event_id', eventId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  // Ambil satu kategori berdasarkan ID
  async getCategoryById(id) {
    const { data, error } = await supabase
      .from('ticket_categories')
      .select(SELECT_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Buat kategori baru. Saat dibuat, kuota_tersedia = kuota_total.
  async createCategory({ event_id, nama_kategori, harga, kuota_total }) {
    const { data, error } = await supabase
      .from('ticket_categories')
      .insert([
        {
          event_id,
          nama_kategori,
          harga,
          kuota_total,
          kuota_tersedia: kuota_total
        }
      ])
      .select(SELECT_COLUMNS)
      .single();

    if (error) throw error;
    return data;
  },

  // Update kategori. Hanya field yang dikirim yang diperbarui.
  // Catatan: kuota_tersedia idealnya ditrack otomatis oleh trigger saat
  // ada order, jadi admin umumnya hanya mengubah kuota_total.
  async updateCategory(id, { nama_kategori, harga, kuota_total }) {
    const updates = {};
    if (nama_kategori !== undefined) updates.nama_kategori = nama_kategori;
    if (harga !== undefined) updates.harga = harga;
    if (kuota_total !== undefined) updates.kuota_total = kuota_total;

    const { data, error } = await supabase
      .from('ticket_categories')
      .update(updates)
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Hapus kategori berdasarkan ID
  async deleteCategory(id) {
    const { data, error } = await supabase
      .from('ticket_categories')
      .delete()
      .eq('id', id)
      .select('id, nama_kategori')
      .maybeSingle();

    if (error) throw error;
    return data;
  }
};

module.exports = TicketCategory;
