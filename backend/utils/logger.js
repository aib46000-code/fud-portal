'use strict';
/**
 * Winston Logger – FUD Portal
 */
const path    = require('path');
const winston = require('winston');
const fs      = require('fs');

const LOG_DIR = path.resolve(process.cwd(), process.env.LOG_DIR || process.env.LOG_PATH || './logs');
try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (err) {
  console.error('[Diagnostics] Failed to create log directory:', err.message);
}

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    }),
  ],
});

logger.add(new winston.transports.Console({
  format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
}));

module.exports = logger;
