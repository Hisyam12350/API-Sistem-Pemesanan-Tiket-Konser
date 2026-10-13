const supabase = require('../config/supabase');

const userModel = {
  async createUser({ username, email, password, role = 'Customer' }) {
    const { data, error } = await supabase
      .from('users')
      .insert([{ username, email, password, role }])
      .select('id, username, email, role, created_at')
      .single();

    if (error) throw error;
    return data;
  },

  async findUserByEmail(email) {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, password, role, created_at')
      .ilike('email', email)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async findUserById(id) {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, role, created_at')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getAllUsers() {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, role, created_at')
      .order('id', { ascending: true });

    if (error) throw error;
    return data;
  },

  async updateUser(id, { username, email, password, role }) {
    const updates = {};
    if (username) updates.username = username;
    if (email) updates.email = email;
    if (password) updates.password = password;
    if (role) updates.role = role;

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id, username, email, role, created_at')
      .single();

    if (error) throw error;
    return data;
  },

  async deleteUser(id) {
    const { data, error } = await supabase
      .from('users')
      .delete()
      .eq('id', id)
      .select('id, username, email')
      .single();

    if (error) throw error;
    return data;
  }
};

module.exports = userModel;