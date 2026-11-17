const pino = require('pino');
const pinoHttp = require('pino-http');

// Logger JSON (pino). Header Authorization/Cookie dan password TIDAK boleh masuk log:
// token JWT di log = siapa pun yang bisa membaca log bisa menyamar jadi user.
const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.signature_key',
      '*.token'
    ],
    censor: '[REDACTED]'
  }
});

// Log request otomatis. Hanya method+url+status yang dicatat (tanpa body).
const loggerMiddleware = pinoHttp({
  logger,
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode })
  }
});

module.exports = {
  logger,
  loggerMiddleware,
  level: logger.level,
  info: (...args) => logger.info(...args),
  warn: (...args) => logger.warn(...args),
  error: (...args) => logger.error(...args)
};
