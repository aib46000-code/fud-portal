'use strict';
/**
 * User Model – FUD Portal (async sqlite3)
 * Covers all auth-related user operations.
 */
const { run, get, all } = require('../database/db');

const UserModel = {

  // ─── Finders ───────────────────────────────────────────────────────────────

  async findById(id) {
    return get(
      `SELECT id, email, role, is_active, is_verified, force_password_change,
              last_login, login_count, failed_attempts, locked_until, created_at, updated_at
       FROM users WHERE id = ?`, [id]
    );
  },

  /** Includes password_hash – ONLY use for auth checks */
  async findByEmail(email) {
    return get('SELECT * FROM users WHERE email = ? COLLATE NOCASE LIMIT 1', [email]);
  },

  async findWithProfile(id) {
    const user = await get(
      `SELECT id, email, role, is_active, is_verified, force_password_change,
              last_login, login_count, failed_attempts, locked_until, created_at, updated_at
       FROM users WHERE id = ?`, [id]
    );
    if (!user) return null;
    if (user.role === 'student') {
      user.profile = await get('SELECT * FROM students WHERE user_id = ?', [id]);
    } else {
      user.profile = await get('SELECT * FROM admins WHERE user_id = ?', [id]);
    }
    return user;
  },

  async findByVerifyToken(token) {
    return get(
      `SELECT * FROM users WHERE verify_token = ? AND verify_token_expires > datetime('now') LIMIT 1`,
      [token]
    );
  },

  // ─── Create ────────────────────────────────────────────────────────────────

  async create({ email, password_hash, role = 'student', is_verified = 0,
                 verify_token = null, verify_token_expires = null }) {
    const result = await run(
      `INSERT INTO users
         (email, password_hash, role, is_active, is_verified, verify_token, verify_token_expires)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
      [email, password_hash, role, is_verified, verify_token, verify_token_expires]
    );
    return result.lastID;
  },

  // ─── Password ──────────────────────────────────────────────────────────────

  async updatePassword(id, password_hash) {
    return run(
      `UPDATE users SET password_hash = ?, force_password_change = 0,
                        failed_attempts = 0, locked_until = NULL
       WHERE id = ?`,
      [password_hash, id]
    );
  },

  // ─── Login Tracking ────────────────────────────────────────────────────────

  async recordLogin(id) {
    return run(
      `UPDATE users SET last_login = datetime('now'), login_count = login_count + 1,
                        failed_attempts = 0, locked_until = NULL
       WHERE id = ?`,
      [id]
    );
  },

  /** Increment failed attempts. Lock account after 5 failures for 5 minutes. */
  async recordFailedLogin(id) {
    const user = await get('SELECT failed_attempts FROM users WHERE id = ?', [id]);
    const attempts = (user?.failed_attempts || 0) + 1;
    const locked_until = attempts >= 5
      ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
      : null;
    return run(
      'UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?',
      [attempts, locked_until, id]
    );
  },

  async resetFailedAttempts(id) {
    return run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [id]);
  },

  // ─── Flags ─────────────────────────────────────────────────────────────────

  async setActive(id, is_active) {
    return run('UPDATE users SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, id]);
  },

  async verify(id) {
    return run(
      `UPDATE users SET is_verified = 1, verify_token = NULL, verify_token_expires = NULL WHERE id = ?`,
      [id]
    );
  },

  async setForcePasswordChange(id, flag = true) {
    return run('UPDATE users SET force_password_change = ? WHERE id = ?', [flag ? 1 : 0, id]);
  },

  async setVerifyToken(id, token, expiresAt) {
    return run(
      'UPDATE users SET verify_token = ?, verify_token_expires = ? WHERE id = ?',
      [token, expiresAt, id]
    );
  },

  // ─── List / Search ─────────────────────────────────────────────────────────

  async list({ page = 1, limit = 20, role = null, search = null, is_active = null } = {}) {
    const offset = (page - 1) * limit;
    let where = 'WHERE 1=1';
    const params = [];
    if (role)               { where += ' AND role = ?';      params.push(role); }
    if (search)             { where += ' AND (u.email LIKE ? OR s.full_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (is_active !== null) { where += ' AND u.is_active = ?'; params.push(is_active ? 1 : 0); }

    // Join with students/admins to get full_name in search
    const rows = await all(
      `SELECT u.id, u.email, u.role, u.is_active, u.is_verified, u.force_password_change,
              u.last_login, u.login_count, u.created_at,
              COALESCE(s.full_name, a.full_name) as full_name,
              s.matric_no, s.department as dept, s.faculty,
              a.staff_id
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN admins   a ON a.user_id = u.id
       ${where.replace('WHERE 1=1', 'WHERE 1=1').replace('u.email', 'u.email')}
       ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Shape into expected profile format
    const shaped = rows.map(r => ({
      id: r.id, email: r.email, role: r.role,
      is_active: !!r.is_active, is_verified: !!r.is_verified,
      force_password_change: !!r.force_password_change,
      last_login: r.last_login, created_at: r.created_at,
      profile: { full_name: r.full_name, matric_no: r.matric_no,
                 staff_id: r.staff_id, department: r.dept, faculty: r.faculty },
    }));

    const countRow = await get(
      `SELECT COUNT(*) as count FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN admins   a ON a.user_id = u.id
       ${where}`,
      params
    );
    return { rows: shaped, total: countRow.count, page, limit };
  },

  // ─── Activity Log for a User ─────────────────────────────────────────────
  async getActivity(userId, { limit = 15 } = {}) {
    return all(
      `SELECT action, ip_address, user_agent, description, created_at
       FROM activity_logs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit]
    );
  },

  // ─── Delete ────────────────────────────────────────────────────────────────

  async delete(id) {
    return run('DELETE FROM users WHERE id = ?', [id]);
  },

  async emailExists(email) {
    const row = await get('SELECT 1 as ex FROM users WHERE email = ? COLLATE NOCASE', [email]);
    return !!row;
  },
};

module.exports = UserModel;
