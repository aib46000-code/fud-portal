'use strict';
/**
 * Notification Model – FUD Portal
 * Async sqlite3 version (uses Promise wrappers from db.js)
 */
const { run, get, all } = require('../database/db');

const NotificationModel = {

  // ── Create single notification ───────────────────────────────────────────────
  async create({ user_id, title, message, type = 'info', link = null, expires_at = null }) {
    const result = await run(
      `INSERT INTO notifications (user_id, title, message, type, link, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user_id, title, message, type, link, expires_at]
    );
    return result.lastID;
  },

  // ── Broadcast to multiple users ──────────────────────────────────────────────
  async broadcast(user_ids, { title, message, type = 'announcement', link = null }) {
    for (const uid of user_ids) {
      await run(
        `INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)`,
        [uid, title, message, type, link]
      );
    }
    return user_ids.length;
  },

  // ── List for a user (with optional filter) ───────────────────────────────────
  async listByUser(user_id, { page = 1, limit = 20, unread_only = false, type = null } = {}) {
    const offset = (page - 1) * limit;
    let cond = '';
    const params = [user_id];
    if (unread_only)  { cond += ' AND is_read = 0'; }
    if (type)         { cond += ' AND type = ?'; params.push(type); }

    const rows = await all(
      `SELECT * FROM notifications
       WHERE user_id = ? ${cond}
       AND (expires_at IS NULL OR expires_at > datetime('now'))
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const countRow = await get(
      `SELECT COUNT(*) as count FROM notifications
       WHERE user_id = ? ${cond}
       AND (expires_at IS NULL OR expires_at > datetime('now'))`,
      params
    );
    const unreadRow = await get(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`,
      [user_id]
    );
    return { rows, total: countRow.count, page, limit, unread_count: unreadRow.count };
  },

  // ── Unread count ─────────────────────────────────────────────────────────────
  async unreadCount(user_id) {
    const row = await get(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`,
      [user_id]
    );
    return row.count;
  },

  // ── Mark single as read ──────────────────────────────────────────────────────
  async markRead(id, user_id) {
    return run(
      `UPDATE notifications SET is_read = 1, read_at = datetime('now') WHERE id = ? AND user_id = ?`,
      [id, user_id]
    );
  },

  // ── Mark all as read ─────────────────────────────────────────────────────────
  async markAllRead(user_id) {
    return run(
      `UPDATE notifications SET is_read = 1, read_at = datetime('now') WHERE user_id = ? AND is_read = 0`,
      [user_id]
    );
  },

  // ── Delete ───────────────────────────────────────────────────────────────────
  async delete(id, user_id) {
    return run(`DELETE FROM notifications WHERE id = ? AND user_id = ?`, [id, user_id]);
  },

  // ── Purge expired ────────────────────────────────────────────────────────────
  async purgeExpired() {
    return run(
      `DELETE FROM notifications WHERE expires_at IS NOT NULL AND expires_at < datetime('now')`
    );
  },
};

module.exports = NotificationModel;
