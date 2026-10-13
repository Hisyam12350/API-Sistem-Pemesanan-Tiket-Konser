const supabase = require('../config/supabase');

const storageService = {
  /**
   * Upload file dari Multer req.file ke Supabase Storage
   * @param {Object} file - Object req.file dari Multer
   * @param {string} bucketName - Nama bucket di Supabase Storage (default: 'events')
   * @param {string} folder - Subfolder di dalam bucket (default: 'banners')
   * @returns {Promise<string>} Public URL file yang di-upload
   */
  async uploadFile(file, bucketName = 'banner konser', folder = 'banners') {
    if (!file) return null;

    const fileExt = file.originalname.split('.').pop();
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true
      });

    if (error) {
      console.error('Supabase Storage Upload Error:', error);
      throw new Error(`Gagal mengupload gambar ke Supabase Storage: ${error.message}`);
    }

    // Mengambil Public URL dari Supabase Storage
    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  },

  /**
   * Hapus file dari Supabase Storage berdasarkan Public URL
   * @param {string} publicUrl 
   * @param {string} bucketName 
   */
  async deleteFile(publicUrl, bucketName = 'events') {
    if (!publicUrl) return;

    try {
      const urlParts = publicUrl.split(`/${bucketName}/`);
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        await supabase.storage.from(bucketName).remove([filePath]);
      }
    } catch (err) {
      console.error('Gagal menghapus file lama dari Supabase Storage:', err);
    }
  }
};

module.exports = storageService;
