const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
// Backend memakai SECRET key (service role) yang melewati RLS. Sengaja TIDAK ada fallback ke
// publishable key: dengan RLS aktif, key itu hanya akan menghasilkan data kosong secara diam-diam.
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL dan SUPABASE_SECRET_KEY wajib di-set di file .env.');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
});

module.exports = supabase;
