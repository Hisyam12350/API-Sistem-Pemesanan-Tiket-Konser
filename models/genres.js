const supabase = require('../config/supabase.js');

const SELECT_COLUMNS = 'id, nama_genre, deskripsi, created_at';

const Genre = {
  async getAllGenres() {
    const { data, error } = await supabase
      .from('genres')
      .select(SELECT_COLUMNS)
      .order('id', { ascending: true });
    if (error) throw error;
    return data;
  },

  async getGenreById(id) {
    const { data, error } = await supabase
      .from('genres')
      .select(SELECT_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async createGenre({ nama_genre, deskripsi }) {
    const { data, error } = await supabase
      .from('genres')
      .insert([{ nama_genre: nama_genre, deskripsi: deskripsi || null }])
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },

  async updateGenre(id, { nama_genre, deskripsi }) {
    const updates = {};
    if (nama_genre !== undefined) updates.nama_genre = nama_genre;
    if (deskripsi !== undefined) updates.deskripsi = deskripsi;

    const { data, error } = await supabase
      .from('genres')
      .update(updates)
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async deleteGenre(id) {
    const { data, error } = await supabase
      .from('genres')
      .delete()
      .eq('id', id)
      .select('id, nama_genre')
      .maybeSingle();
    if (error) throw error;
    return data;
  },
};

module.exports = Genre;