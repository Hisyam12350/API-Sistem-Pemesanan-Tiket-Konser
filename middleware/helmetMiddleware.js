const helmet = require('helmet');

// Memakai helmet sungguhan (sebelumnya header ditulis manual dan 'Referrer-Policy: unsafe-url'
// justru membocorkan URL lengkap ke situs lain). Default helmet: HSTS, nosniff, frame-ancestors,
// Referrer-Policy: no-referrer, CSP dasar, dsb.
// Cross-Origin-Resource-Policy dibuat 'cross-origin' karena API ini dipanggil dari frontend/app di origin lain.
module.exports = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
});
