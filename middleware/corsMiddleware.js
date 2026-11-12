const cors = require('cors');

function corsMiddleware() {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];
  
  const isDev = process.env.NODE_ENV !== 'production';

  const corsOptions = {
    origin: function (origin, callback) {
      // Izinkan requests tanpa origin (seperti mobile apps, curl, postman)
      if (!origin) return callback(null, true);
      
      // Whitelist explisit
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Di mode development/test, izinkan port lokal dinamis (localhost, 127.0.0.1, 10.0.2.2 emulator)
      if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      
      // Tolak origin dengan aman (browser akan memblokir tanpa server melempar 500 error)
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  };
  
  return cors(corsOptions);
}

module.exports = corsMiddleware;