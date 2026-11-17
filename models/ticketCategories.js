const supabase = require('../config/supabase.js');
const pool = require('../config/db.js');

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
  // Mengubah kuota_total ikut menyesuaikan kuota_tersedia (tersedia = total - terjual/ditahan), dalam satu
  // transaksi dengan row lock. Sebelumnya kuota_tersedia tidak ikut berubah sehingga kuota bisa "bocor".
  // Kuota baru tidak boleh lebih kecil dari jumlah yang sudah terjual/ditahan -> error 409.
  async updateCategory(id, { nama_kategori, harga, kuota_total }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query(
        'SELECT id, kuota_total, kuota_tersedia FROM ticket_categories WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (cur.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const row = cur.rows[0];
      const used = Number(row.kuota_total) - Number(row.kuota_tersedia);
      let newTotal = row.kuota_total;
      let newAvail = row.kuota_tersedia;
      if (kuota_total !== undefined) {
        if (Number(kuota_total) < used) {
          const err = new Error(`kuota_total tidak boleh kurang dari jumlah tiket yang sudah terjual/ditahan (${used}).`);
          err.status = 409;
          throw err;
        }
        newTotal = Number(kuota_total);
        newAvail = newTotal - used;
      }

      const res = await client.query(
        `UPDATE ticket_categories
            SET nama_kategori = COALESCE($2, nama_kategori),
                harga = COALESCE($3, harga),
                kuota_total = $4,
                kuota_tersedia = $5
          WHERE id = $1
      RETURNING ${SELECT_COLUMNS}`,
        [
          id,
          nama_kategori === undefined ? null : nama_kategori,
          harga === undefined ? null : harga,
          newTotal,
          newAvail
        ]
      );
      await client.query('COMMIT');
      return res.rows[0];
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) { /* abaikan */ }
      throw err;
    } finally {
      client.release();
    }
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
