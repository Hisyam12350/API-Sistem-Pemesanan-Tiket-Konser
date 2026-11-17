require('dotenv').config();

// SATU SUMBER KEBENARAN untuk JWT.
// JWT_SECRET WAJIB di-set di .env. Tidak ada nilai fallback: secret yang tertanam di kode
// bisa dibaca siapa pun yang melihat repo, lalu dipakai untuk memalsukan token Admin/SuperAdmin.
const KNOWN_WEAK_SECRETS = [
  'supersecretkey_tiket_konser_ukk_2026', // fallback lama yang pernah ada di kode ini
  'ganti_dengan_string_acak_yang_panjang_dan_rahasia', // placeholder dari .env.example
  'rahasia_string_jwt_anda_yang_sangat_panjang_dan_aman' // placeholder dari README
];

const secret = process.env.JWT_SECRET;

if (!secret) {
  throw new Error(
    'JWT_SECRET belum di-set. Isi di file .env dengan string acak minimal 32 karakter. ' +
    'Contoh membuatnya: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
}
if (KNOWN_WEAK_SECRETS.includes(secret)) {
  throw new Error('JWT_SECRET masih memakai nilai contoh/lama yang sudah diketahui publik. Ganti dengan string acak baru.');
}
if (secret.length < 32) {
  throw new Error('JWT_SECRET terlalu pendek. Gunakan minimal 32 karakter acak.');
}

const JWT_SECRET = secret;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

module.exports = { JWT_SECRET, JWT_EXPIRES_IN };
