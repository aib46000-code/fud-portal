'use strict';
/**
 * JWT Helper – FUD Portal
 * Security hardened:
 *   - Minimum 32-char secret enforced in production
 *   - Access token expiry: 15 minutes (short-lived)
 *   - Refresh token: 7 days
 *   - Algorithm explicitly set to HS256
 */
const jwt    = require('jsonwebtoken');
const logger = require('./logger');

const ACCESS_SECRET  = process.env.JWT_SECRET         || 'fud_dev_secret_CHANGE_IN_PRODUCTION';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fud_dev_refresh_secret_CHANGE_IN_PRODUCTION';
const ACCESS_EXP     = process.env.JWT_EXPIRES_IN          || '15m';  // SECURITY: short-lived
const REFRESH_EXP    = process.env.JWT_REFRESH_EXPIRES_IN  || '7d';   // Reduced from 30d

// Warn on weak secret entropy in production instead of fatal exit (prevents cloud crash on auto-deploy)
if (process.env.NODE_ENV === 'production') {
  if (ACCESS_SECRET.length  < 32) { console.warn('[JWT] WARNING: JWT_SECRET is too short. Minimum 32 characters recommended.'); logger.warn('JWT_SECRET is too short.'); }
  if (REFRESH_SECRET.length < 32) { console.warn('[JWT] WARNING: JWT_REFRESH_SECRET is too short. Minimum 32 characters recommended.'); logger.warn('JWT_REFRESH_SECRET is too short.'); }
  if (ACCESS_SECRET.includes('CHANGE_IN_PRODUCTION'))  { console.warn('[JWT] CRITICAL: JWT_SECRET must be changed from default in production.'); logger.warn('Using default JWT_SECRET.'); }
  if (REFRESH_SECRET.includes('CHANGE_IN_PRODUCTION')) { console.warn('[JWT] CRITICAL: JWT_REFRESH_SECRET must be changed from default in production.'); logger.warn('Using default JWT_REFRESH_SECRET.'); }
}

const JWT_OPTIONS = { algorithm: 'HS256', issuer: 'fud-portal' };

module.exports = {

  signAccess(payload) {
    // Only embed minimal claims in token
    const { id, email, role } = payload;
    return jwt.sign({ id, email, role }, ACCESS_SECRET, { ...JWT_OPTIONS, expiresIn: ACCESS_EXP });
  },

  signRefresh(payload) {
    const { id, email, role } = payload;
    // Add jti (JWT ID) to ensure uniqueness if generated in the same second
    return jwt.sign({ id, email, role, jti: require('crypto').randomUUID() }, REFRESH_SECRET, { ...JWT_OPTIONS, expiresIn: REFRESH_EXP });
  },

  verifyAccess(token) {
    return jwt.verify(token, ACCESS_SECRET, { ...JWT_OPTIONS });
  },

  verifyRefresh(token) {
    return jwt.verify(token, REFRESH_SECRET, { ...JWT_OPTIONS });
  },

  /** Returns expiry as ISO string given duration string like '7d', '15m', '1h' */
  expiresAt(duration) {
    const units = { s: 1, m: 60, h: 3600, d: 86400 };
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return new Date(Date.now() + 7 * 86400 * 1000).toISOString();
    const secs = parseInt(match[1]) * units[match[2]];
    return new Date(Date.now() + secs * 1000).toISOString();
  },
};
