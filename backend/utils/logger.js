'use strict';
/**
 * Winston Logger – FUD Portal
 */
const path    = require('path');
const winston = require('winston');
const fs      = require('fs');

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

let logDirReady = false;
try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  logDirReady = true;
} catch (err) {
  console.error(`[Logger] Cannot create log directory "${LOG_DIR}": ${err.message}. File logging disabled.`);
}

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`;
});

const transports = [];

if (logDirReady) {
  transports.push(
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
  );
}

transports.push(
  new winston.transports.Console({
    format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports,
});

module.exports = logger;
