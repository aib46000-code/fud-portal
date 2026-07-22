'use strict';
/**
 * Auth Middleware – FUD Portal
 * Verifies JWT access token on every protected route.
 * Security: sanitizes User-Agent to prevent log injection
 */
const { verifyAccess } = require('../utils/jwtHelper');
const { unauthorized }  = require('../utils/response');
const UserModel         = require('../models/User');

module.exports = async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return unauthorized(res, 'No token provided');
    }

    // SECURITY: Sanitize token extraction — exactly 7 chars for "Bearer "
    const token   = authHeader.slice(7).trim();
    if (!token)   return unauthorized(res, 'No token provided');

    const decoded = verifyAccess(token);

    // Re-fetch user to ensure they still exist & are active
    const user = await UserModel.findById(decoded.id);
    if (!user) return unauthorized(res, 'User not found');
    if (!user.is_active) return unauthorized(res, 'Account is deactivated');

    req.user = { id: user.id, email: user.email, role: user.role };

    // Sanitize User-Agent for safe logging (prevent log injection)
    req.safeUserAgent = (req.get('User-Agent') || 'unknown').replace(/[\r\n\t]/g, ' ').slice(0, 256);

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return unauthorized(res, 'Token expired');
    if (err.name === 'JsonWebTokenError')  return unauthorized(res, 'Invalid token');
    return unauthorized(res, 'Authentication failed');
  }
};
