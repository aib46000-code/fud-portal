'use strict';
/**
 * Test Model – FUD Portal (async sqlite3)
 */
const { run, get, all } = require('../database/db');

const TestModel = {

  async findById(id) {
    return get(`
      SELECT t.*,
             u.email as creator_email,
             COALESCE(a.full_name, u.email) as creator_name,
             (SELECT COUNT(*) FROM questions WHERE test_id = t.id AND is_active = 1) as question_count,
             (SELECT COUNT(*) FROM results    WHERE test_id = t.id AND submitted_at IS NOT NULL) as attempt_count
      FROM tests t
      JOIN users u ON u.id = t.created_by
      LEFT JOIN admins a ON a.user_id = t.created_by
      WHERE t.id = ?`, [id]);
  },

  async create(data) {
    const r = await run(`
      INSERT INTO tests
        (title, description, subject, course_code, semester, academic_year, test_type,
         duration_mins, total_marks, pass_mark, instructions,
         target_level, target_dept, starts_at, ends_at, is_active, is_published, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,?)`,
      [
        data.title,
        data.description   || '',
        data.subject       || '',
        data.course_code   || '',
        data.semester      || '',
        data.academic_year || '',
        data.test_type     || 'mcq',
        data.duration_mins || 60,
        data.total_marks   || 100,
        data.pass_mark     || 50,
        data.instructions  || '',
        data.target_level  || '',
        data.target_dept   || '',
        data.starts_at     || null,
        data.ends_at       || null,
        data.created_by,
      ]
    );
    return r.lastID;
  },

  async update(id, fields) {
    const allowed = ['title','description','subject','course_code','semester','academic_year',
                     'test_type','duration_mins','total_marks','pass_mark','instructions',
                     'target_level','target_dept','starts_at','ends_at','is_active','is_published'];
    const sets = [], vals = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) { sets.push(`${key} = ?`); vals.push(fields[key]); }
    }
    if (!sets.length) return { changes: 0 };
    sets.push('updated_at = CURRENT_TIMESTAMP');
    vals.push(id);
    return run(`UPDATE tests SET ${sets.join(', ')} WHERE id = ?`, vals);
  },

  async list({ page=1, limit=20, subject=null, is_active=null, is_published=null, created_by=null, search=null }={}) {
    const offset = (page-1)*limit;
    let where = 'WHERE 1=1';
    const params = [];
    if (subject)     { where += ' AND t.subject = ?';       params.push(subject); }
    if (is_active    !== null) { where += ' AND t.is_active = ?';    params.push(is_active); }
    if (is_published !== null) { where += ' AND t.is_published = ?'; params.push(is_published); }
    if (created_by)  { where += ' AND t.created_by = ?';   params.push(created_by); }
    if (search)      { where += ' AND (t.title LIKE ? OR t.subject LIKE ? OR t.course_code LIKE ?)';
                       params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    const rows = await all(`
      SELECT t.id, t.title, t.subject, t.course_code, t.test_type, t.duration_mins,
             t.total_marks, t.pass_mark, t.is_active, t.is_published,
             t.starts_at, t.ends_at, t.created_at, t.target_level, t.target_dept, t.semester,
             (SELECT COUNT(*) FROM questions WHERE test_id=t.id AND is_active=1) as question_count,
             (SELECT COUNT(*) FROM results    WHERE test_id=t.id AND submitted_at IS NOT NULL) as attempt_count
      FROM tests t ${where}
      ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]);

    const countRow = await get(`SELECT COUNT(*) as count FROM tests t ${where}`, params);
    return { rows, total: countRow.count, page, limit };
  },

  async publish(id)    { return run('UPDATE tests SET is_published=1, is_active=1, updated_at=CURRENT_TIMESTAMP WHERE id=?', [id]); },
  async unpublish(id)  { return run('UPDATE tests SET is_published=0, is_active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?', [id]); },
  async delete(id)     { return run('DELETE FROM tests WHERE id=?', [id]); },

  async getStats() {
    return get(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN is_active=1    THEN 1 ELSE 0 END) as active,
             SUM(CASE WHEN is_published=1 THEN 1 ELSE 0 END) as published,
             COUNT(DISTINCT subject)                          as subjects
      FROM tests`);
  },
};

module.exports = TestModel;
