'use strict';
/**
 * Require Password Change Middleware – FUD Portal
 *
 * Intercepts requests from users who have force_password_change = 1.
 * Works standalone – extracts JWT from Authorization header itself,
 * so it can run at server level without depending on authMiddleware order.
 *
 * Blocks ALL routes except the auth change-password, logout, and me endpoints.
 */
const jwt        = require('jsonwebtoken');
const UserModel  = require('../models/User');

// Routes force-change users are ALLOWED to access (exact match or prefix)
const ALLOWED_PREFIXES = [
  '/api/auth/',     // all /api/auth/* routes are allowed (logout, change-password, me, refresh)
];

module.exports = async function requirePasswordChange(req, res, next) {
  try {
    // Extract Bearer token
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Bearer ')) return next(); // No token → let other middleware handle

    const token = authHeader.slice(7);
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'fud_portal_secret_change_me');
    } catch {
      return next(); // Invalid token → let authMiddleware handle the 401
    }

    // Check if this is a whitelisted path (all /api/auth/ routes are allowed)
    const url = req.originalUrl || req.path;
    if (ALLOWED_PREFIXES.some(p => url.startsWith(p))) return next();

    // Fetch user to check force_password_change flag
    const user = await UserModel.findById(decoded.id);
    if (!user) return next();

    if (user.force_password_change) {
      return res.status(403).json({
        success:               false,
        force_password_change: true,
        message:               'You must change your password before accessing this resource.',
        redirect:              '/api/auth/change-password',
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};
