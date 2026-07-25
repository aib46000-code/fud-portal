'use strict';
/**
 * Rate Limiter Middleware – FUD Portal
 * Security hardened:
 *   - Auth limiter: 10 attempts per 15min (not multiplied in dev)
 *   - All limiters use IP + User-Agent fingerprint
 *   - Skip health check endpoint
 */
const rateLimit = require('express-rate-limit');

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '300000', 10); // 5 min

// Shared key generator: IP + trimmed User-Agent
function keyGenerator(req) {
  const ua = (req.get('User-Agent') || '').slice(0, 64);
  return `${req.ip}::${ua}`;
}

// ── General API Limiter ───────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs,
  max:             parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '200', 10),
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator,
  skip: (req) => req.path === '/api/health',
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

// ── Auth Route Limiter (stricter – NO dev multiplier) ─────────────────────────
const authLimiter = rateLimit({
  windowMs,
  max:             parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10),
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many login attempts. Please wait 5 minutes.' },
});

// ── Upload Limiter ────────────────────────────────────────────────────────────
const uploadLimiter = rateLimit({
  windowMs,
  max:             parseInt(process.env.UPLOAD_RATE_LIMIT_MAX || '20', 10),
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator,
  message: { success: false, message: 'Upload limit reached. Please try again later.' },
});

module.exports = { apiLimiter, authLimiter, uploadLimiter };
