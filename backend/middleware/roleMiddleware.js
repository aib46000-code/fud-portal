'use strict';
/**
 * Role Middleware – FUD Portal
 * Guards routes to allowed roles only.
 * Usage: roleMiddleware('admin', 'superadmin')
 */
const { forbidden } = require('../utils/response');

module.exports = function roleMiddleware(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return forbidden(res, 'Not authenticated');
    if (!allowedRoles.includes(req.user.role)) {
      return forbidden(res, `Access denied. Required role: ${allowedRoles.join(' or ')}`);
    }
    next();
  };
};
