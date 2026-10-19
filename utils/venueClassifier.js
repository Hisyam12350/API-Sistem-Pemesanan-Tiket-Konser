// Klasifikasi otomatis venue hasil Google ke venue_types milik kita.
// Prioritas: (1) mapping tipe bawaan Google (paling akurat),
// lalu (2) pencocokan keyword pada nama + alamat.
// Mengembalikan { venue_type_id, venue_type_nama, sumber } atau null
// bila tidak dapat diklasifikasikan (admin wajib pilih manual).

// Mapping tipe Google Places -> nama_tipe di tabel venue_types
const GOOGLE_TYPE_MAP = {
  stadium: 'Stadion',
  convention_center: 'Indoor',
  auditorium: 'Indoor',
  performing_arts_theater: 'Indoor',
  movie_theater: 'Indoor',
  night_club: 'Indoor',
  amphitheater: 'Outdoor',
  amphitheatre: 'Outdoor',
  park: 'Outdoor',
  beach: 'Outdoor',
  campground: 'Outdoor',
  zoo: 'Outdoor',
  amusement_park: 'Outdoor',
};

// Fallback keyword (dicocokkan berurutan, yang pertama cocok menang)
const KEYWORD_RULES = [
  { tipe: 'Stadion', keywords: ['stadion', 'stadium', 'gelora'] },
  { tipe: 'Indoor', keywords: ['indoor', 'hall', 'convention', 'istora', 'gedung', 'aula', 'ballroom', 'jiexpo', 'ji expo', 'ice '] },
  { tipe: 'Lapangan', keywords: ['lapangan', 'gor '] },
  { tipe: 'Outdoor', keywords: ['outdoor', 'pantai', 'beach', 'parkir', 'taman', 'alun-alun', 'alun alun'] },
];

function classifyVenue({ googleTypes = [], name = '', address = '' }, tipeList = []) {
  const byName = {};
  for (const t of tipeList) byName[String(t.nama_tipe).toLowerCase()] = t.id;

  const pick = (namaTipe, sumber) => {
    const id = byName[String(namaTipe).toLowerCase()];
    if (!id) return null;
    return { venue_type_id: id, venue_type_nama: namaTipe, sumber };
  };

  // 1. Mapping dari tipe bawaan Google
  for (const gt of googleTypes) {
    const mapped = GOOGLE_TYPE_MAP[String(gt).toLowerCase()];
    if (mapped) {
      const found = pick(mapped, 'google_types');
      if (found) return found;
    }
  }

  // 2. Fallback keyword pada nama + alamat
  const haystack = (String(name) + ' ' + String(address)).toLowerCase();
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (haystack.includes(kw)) {
        const found = pick(rule.tipe, 'keyword');
        if (found) return found;
      }
    }
  }

  return null;
}

module.exports = { classifyVenue, GOOGLE_TYPE_MAP, KEYWORD_RULES };
