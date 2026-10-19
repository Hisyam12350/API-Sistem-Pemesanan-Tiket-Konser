const supabase = require('../config/supabase.js');

const SELECT_COLUMNS = 'id, nama_tipe, deskripsi, ikon, created_at';

const VenueType = {
  async getAllTypes() {
    const { data, error } = await supabase
      .from('venue_types')
      .select(SELECT_COLUMNS)
      .order('id', { ascending: true });
    if (error) throw error;
    return data;
  },

  async getTypeById(id) {
    const { data, error } = await supabase
      .from('venue_types')
      .select(SELECT_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async createType({ nama_tipe, deskripsi, ikon }) {
    const { data, error } = await supabase
      .from('venue_types')
      .insert([{ nama_tipe, deskripsi: deskripsi || null, ikon: ikon || null }])
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },

  async deleteType(id) {
    const { data, error } = await supabase
      .from('venue_types')
      .delete()
      .eq('id', id)
      .select('id, nama_tipe')
      .maybeSingle();
    if (error) throw error;
    return data;
  },
};

module.exports = VenueType;
