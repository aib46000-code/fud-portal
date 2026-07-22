'use strict';
/**
 * Notification Controller – FUD Portal
 */
const NotifModel = require('../models/Notification');
const UserModel  = require('../models/User');
const R = require('../utils/response');

// ── List (self) ────────────────────────────────────────────────────────────────
exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, unread_only, is_read, type } = req.query;
    // Support both unread_only (legacy) and is_read=false (new)
    const unreadFilter =
      unread_only === '1' || unread_only === 'true' ||
      is_read === 'false' || is_read === '0';

    const result = await NotifModel.listByUser(req.user.id, {
      page: +page, limit: +limit,
      unread_only: unreadFilter,
      type: type || null,
    });
    return R.paginated(res, result, 'Notifications fetched');
  } catch (err) { next(err); }
};

// ── Unread count ───────────────────────────────────────────────────────────────
exports.unreadCount = async (req, res, next) => {
  try {
    const count = await NotifModel.unreadCount(req.user.id);
    return R.success(res, { count }, 'Unread count');
  } catch (err) { next(err); }
};

// ── Mark single read ───────────────────────────────────────────────────────────
exports.markRead = async (req, res, next) => {
  try {
    await NotifModel.markRead(+req.params.id, req.user.id);
    return R.success(res, {}, 'Marked as read');
  } catch (err) { next(err); }
};

// ── Mark all read ──────────────────────────────────────────────────────────────
exports.markAllRead = async (req, res, next) => {
  try {
    const result = await NotifModel.markAllRead(req.user.id);
    return R.success(res, { updated: result.changes || 0 }, 'All notifications marked as read');
  } catch (err) { next(err); }
};

// ── Delete ─────────────────────────────────────────────────────────────────────
exports.delete = async (req, res, next) => {
  try {
    await NotifModel.delete(+req.params.id, req.user.id);
    return R.success(res, {}, 'Notification deleted');
  } catch (err) { next(err); }
};

// ── Admin: broadcast ───────────────────────────────────────────────────────────
// Accepts { title, message, type, role, user_ids }
// If role provided: fetches all users with that role
// If user_ids array provided: uses those
// Default (no role/user_ids): broadcasts to ALL users
exports.broadcast = async (req, res, next) => {
  try {
    const { title, message, type = 'announcement', link, role, user_ids } = req.body;
    if (!title || !message) {
      return R.error(res, 'title and message are required', 400);
    }

    let targetIds = [];

    if (Array.isArray(user_ids) && user_ids.length) {
      targetIds = user_ids;
    } else {
      // Fetch users by role (or all)
      const { rows } = await UserModel.list({ limit: 5000, role: role || null });
      targetIds = rows.map(u => u.id);
    }

    if (!targetIds.length) {
      return R.error(res, 'No target users found', 400);
    }

    await NotifModel.broadcast(targetIds, { title, message, type, link });
    return R.success(res, { sent: targetIds.length }, `Broadcast sent to ${targetIds.length} user${targetIds.length !== 1 ? 's' : ''}`);
  } catch (err) { next(err); }
};
