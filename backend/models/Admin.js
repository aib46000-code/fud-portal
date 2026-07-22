'use strict';
/**
 * Admin Model – FUD Portal (async sqlite3)
 */
const { run, get, all } = require('../database/db');

const AdminModel = {

  async findByUserId(user_id) {
    return get('SELECT * FROM admins WHERE user_id = ?', [user_id]);
  },

  async findByStaffId(staff_id) {
    return get('SELECT * FROM admins WHERE staff_id = ? COLLATE NOCASE', [staff_id]);
  },

  async findById(id) {
    return get(
      `SELECT a.*, u.email, u.role, u.is_active, u.last_login, u.created_at
       FROM admins a JOIN users u ON u.id = a.user_id WHERE a.id = ?`, [id]
    );
  },

  async create({ user_id, full_name, staff_id, department = null, phone = null,
                 permissions = '["dashboard"]', is_super = 0 }) {
    const result = await run(
      `INSERT INTO admins (user_id, full_name, staff_id, department, phone, permissions, is_super)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, full_name, staff_id, department, phone, permissions, is_super ? 1 : 0]
    );
    return result.lastID;
  },

  async update(id, fields) {
    const allowed = ['full_name','staff_id','department','phone','avatar_url','permissions','is_super'];
    const sets = [], vals = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = ?`);
        vals.push(typeof fields[key] === 'object' ? JSON.stringify(fields[key]) : fields[key]);
      }
    }
    if (!sets.length) return { changes: 0 };
    vals.push(id);
    return run(`UPDATE admins SET ${sets.join(', ')} WHERE id = ?`, vals);
  },

  async list({ page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const rows = await all(
      `SELECT a.*, u.email, u.role, u.is_active, u.last_login
       FROM admins a JOIN users u ON u.id = a.user_id
       ORDER BY a.is_super DESC, a.full_name ASC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const countRow = await get('SELECT COUNT(*) as count FROM admins');
    return { rows, total: countRow.count, page, limit };
  },

  async hasPermission(user_id, permission) {
    const admin = await get('SELECT permissions FROM admins WHERE user_id = ?', [user_id]);
    if (!admin) return false;
    const perms = JSON.parse(admin.permissions || '[]');
    return perms.includes('all') || perms.includes(permission);
  },

  async staffIdExists(staff_id) {
    const row = await get('SELECT 1 as ex FROM admins WHERE staff_id = ? COLLATE NOCASE', [staff_id]);
    return !!row;
  },

  async delete(id) {
    return run('DELETE FROM admins WHERE id = ?', [id]);
  },
};

module.exports = AdminModel;
