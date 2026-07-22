'use strict';
/**
 * Student Model – FUD Portal (async sqlite3)
 */
const { run, get, all } = require('../database/db');

const StudentModel = {

  async findByUserId(user_id) {
    return get('SELECT * FROM students WHERE user_id = ?', [user_id]);
  },

  async findByMatricNo(matric_no) {
    return get('SELECT * FROM students WHERE matric_no = ? COLLATE NOCASE', [matric_no]);
  },

  async findById(id) {
    return get(
      `SELECT s.*, u.email, u.is_active, u.is_verified, u.last_login
       FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = ?`, [id]
    );
  },

  async create({ user_id, matric_no, full_name, department, faculty, level = '100',
                 gender = 'male', phone = null, date_of_birth = null,
                 state_of_origin = null, address = null }) {
    const result = await run(
      `INSERT INTO students (user_id, matric_no, full_name, department, faculty, level, gender, phone, date_of_birth, state_of_origin, address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, matric_no, full_name, department, faculty, level, gender, phone, date_of_birth, state_of_origin, address]
    );
    return result.lastID;
  },

  async update(id, fields) {
    const allowed = ['full_name','department','faculty','level','gender','phone',
                     'date_of_birth','state_of_origin','address','avatar_url','gpa','is_graduated'];
    const sets = [], vals = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) { sets.push(`${key} = ?`); vals.push(fields[key]); }
    }
    if (!sets.length) return { changes: 0 };
    vals.push(id);
    return run(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`, vals);
  },

  async list({ page = 1, limit = 20, department = null, faculty = null, level = null, search = null } = {}) {
    const offset = (page - 1) * limit;
    let where = 'WHERE 1=1';
    const params = [];
    if (department) { where += ' AND s.department = ?'; params.push(department); }
    if (faculty)    { where += ' AND s.faculty = ?';    params.push(faculty); }
    if (level)      { where += ' AND s.level = ?';      params.push(level); }
    if (search)     { where += ' AND (s.full_name LIKE ? OR s.matric_no LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    const rows = await all(
      `SELECT s.*, u.email, u.is_active FROM students s JOIN users u ON u.id = s.user_id
       ${where} ORDER BY s.full_name ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const countRow = await get(
      `SELECT COUNT(*) as count FROM students s JOIN users u ON u.id = s.user_id ${where}`, params
    );
    return { rows, total: countRow.count, page, limit };
  },

  async matricNoExists(matric_no) {
    const row = await get('SELECT 1 as ex FROM students WHERE matric_no = ? COLLATE NOCASE', [matric_no]);
    return !!row;
  },

  async delete(id) {
    return run('DELETE FROM students WHERE id = ?', [id]);
  },

  async getStats() {
    return get(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN is_graduated = 1 THEN 1 ELSE 0 END) as graduated,
             COUNT(DISTINCT department) as departments,
             COUNT(DISTINCT faculty) as faculties
      FROM students`
    );
  },
};

module.exports = StudentModel;
