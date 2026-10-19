// Proxy Google Places API (New). API key TIDAK PERNAH dikirim ke frontend;
// frontend memanggil endpoint backend, backend yang memanggil Google.
const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS_URL = 'https://places.googleapis.com/v1/places/';

function getApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY;
}

function assertKey() {
  if (!getApiKey()) {
    const err = new Error('GOOGLE_MAPS_API_KEY belum diset di .env. Hubungi admin untuk mengaktifkannya.');
    err.statusCode = 503;
    throw err;
  }
}

function errStatus(res, fallback) {
  return res.status === 401 || res.status === 403 ? 502 : fallback;
}

// Autocomplete: ketikan user -> maks 5 saran (placeId + label + tipe)
async function autocomplete({ input, sessionToken, languageCode = 'id' }) {
  assertKey();
  const res = await fetch(AUTOCOMPLETE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': getApiKey() },
    body: JSON.stringify({ input, languageCode, sessionToken, includedRegionCodes: ['ID'] }),
  });
  if (!res.ok) {
    const err = new Error('Gagal mencari tempat di Google Maps (status ' + res.status + ').');
    err.statusCode = errStatus(res, 502);
    throw err;
  }
  const json = await res.json();
  return (json.suggestions || [])
    .filter((s) => s && s.placePrediction)
    .map((s) => ({
      place_id: s.placePrediction.placeId,
      label: s.placePrediction.text ? s.placePrediction.text.text : null,
      types: s.placePrediction.types || [],
    }))
    .filter((s) => s.place_id);
}

// Details: place_id -> detail (nama, alamat, koordinat, komponen, tipe, foto)
async function getPlaceDetails(placeId, languageCode = 'id') {
  assertKey();
  const url = DETAILS_URL + encodeURIComponent(placeId);
  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': getApiKey(),
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,types,addressComponents,photos',
    },
  });
  if (!res.ok) {
    const err = new Error('Gagal mengambil detail tempat dari Google Maps (status ' + res.status + ').');
    err.statusCode = errStatus(res, 502);
    throw err;
  }
  const d = await res.json();
  const comp = Array.isArray(d.addressComponents)
    ? (d.addressComponents.find((c) => Array.isArray(c.types) && (c.types.includes('administrative_area_level_2') || c.types.includes('locality'))) || {})
    : {};
  return {
    place_id: d.id || placeId,
    nama: d.displayName && d.displayName.text ? d.displayName.text : null,
    alamat: d.formattedAddress || null,
    kota: comp.longText || comp.shortText || null,
    latitude: d.location ? d.location.latitude : null,
    longitude: d.location ? d.location.longitude : null,
    types: d.types || [],
    foto_ref: d.photos && d.photos[0] ? d.photos[0].name : null,
  };
}

module.exports = { autocomplete, getPlaceDetails };
