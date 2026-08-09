'use strict';
/**
 * Error Handler Middleware – FUD Portal
 * Central error handler – catches all thrown errors and returns clean JSON.
 */
const logger = require('../utils/logger');

module.exports = function errorHandler(err, req, res, next) {
  console.error("========== [L] GLOBAL ERROR HANDLER ==========");
  console.error("METHOD:", req.method);
  console.error("URL:", req.originalUrl);
  console.error("STATUS (before):", res.statusCode);
  console.error("ERROR MESSAGE:", err.message);
  console.error("STACK:", err.stack);
  
  // Log the full error
  logger.error(`${req.method} ${req.originalUrl} → ${err.message}`, { stack: err.stack });

  // Multer file-size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: `File too large. Maximum allowed size is ${process.env.MAX_FILE_SIZE_MB || 10}MB`,
    });
  }

  // Multer unexpected field
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ success: false, message: 'Unexpected file field' });
  }

  // SQLite unique constraint
  if (err.message && err.message.includes('UNIQUE constraint failed')) {
    const field = err.message.split('.').pop();
    return res.status(409).json({ success: false, message: `${field} already exists` });
  }

  // SQLite FK violation
  if (err.message && err.message.includes('FOREIGN KEY constraint failed')) {
    return res.status(400).json({ success: false, message: 'Referenced resource does not exist' });
  }

  // Custom app errors (thrown with err.statusCode)
  if (err.statusCode) {
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }

  // Default 500
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};
