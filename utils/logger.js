const pino = require('pino');
const pinoHttp = require('pino-http');

// Basic pino logger ke console dengan format JSON
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // format JSON secara default di pino
});

// Attach pinoHttp ke Express untuk request auto-logging
const loggerMiddleware = pinoHttp({
  logger,
  autoTranspire: true,
  serializers: pino.HttpSerializers
});

// Export pino logger instance and its methods
// Gunakan logging langsung melalui logger.object untuk menghindari 
// masalah this[writeSym] di Node.js v24
module.exports = {
  logger,
  loggerMiddleware,
  // Export level constants untuk kemudahan penamaan level
  level: logger.level,
  // Metode logging yang bisa langsung digunakan
  info: (...args) => logger.info(...args),
  warn: (...args) => logger.warn(...args),
  error: (...args) => logger.error(...args)
};