'use strict';
/**
 * Response Helpers – FUD Portal
 */

module.exports = {
  success(res, data = {}, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({ success: true, message, data });
  },

  created(res, data = {}, message = 'Created successfully') {
    return res.status(201).json({ success: true, message, data });
  },

  paginated(res, { rows, total, page, limit, unread_count }, message = 'Success') {
    const body = { rows, total, page, limit };
    if (unread_count !== undefined) body.unread_count = unread_count;
    return res.status(200).json({
      success: true, message,
      data: body,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  },

  error(res, message = 'An error occurred', statusCode = 500, errors = null) {
    const body = { success: false, message };
    if (errors) body.errors = errors;
    return res.status(statusCode).json(body);
  },

  notFound(res, message = 'Resource not found') {
    return res.status(404).json({ success: false, message });
  },

  unauthorized(res, message = 'Unauthorized') {
    return res.status(401).json({ success: false, message });
  },

  forbidden(res, message = 'Forbidden') {
    return res.status(403).json({ success: false, message });
  },

  validationError(res, errors) {
    // SECURITY: Strip raw `value` from errors to prevent reflecting user input (XSS)
    const safeErrors = (errors || []).map(function(e) {
      return { field: e.path || e.param, message: e.msg, type: e.type };
    });
    return res.status(422).json({ success: false, message: 'Validation failed', errors: safeErrors });
  },
};
