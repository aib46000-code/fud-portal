'use strict';
/**
 * Media Model – FUD Portal
 * Async sqlite3 (promise-wrapped) — consistent with rest of codebase.
 */
const { run, get, all } = require('../database/db');

const MediaModel = {

  async create({ uuid, original_name, stored_name, mime_type, size_bytes,
                 file_path, url, category = 'general', uploaded_by, is_public = 0,
                 visibility = 'private', faculty = null, department = null, level = null, 
                 semester = null, course_code = null, subject_id = null,
                 status = 'pending', approved_by = null, approved_at = null }) {
    const r = await run(`
      INSERT INTO media
        (uuid, original_name, stored_name, mime_type, size_bytes, file_path, url,
         category, uploaded_by, is_public, visibility, faculty, department, level,
         semester, course_code, subject_id, status, approved_by, approved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid, original_name, stored_name, mime_type, size_bytes, file_path, url,
       category, uploaded_by, is_public ? 1 : 0, visibility, faculty, department, level,
       semester, course_code, subject_id, status, approved_by, approved_at]
    );
    return r.lastID;
  },

  async findById(id) {
    return get(`
      SELECT m.*, u.email AS uploader_email,
             COALESCE(p.full_name, u.email) AS uploader_name
      FROM   media m
      JOIN   users u ON u.id = m.uploaded_by
      LEFT   JOIN students p ON p.user_id = u.id
      WHERE  m.id = ?`, [id]);
  },

  async findByUUID(uuid) {
    return get('SELECT * FROM media WHERE uuid = ?', [uuid]);
  },

  async list({ page = 1, limit = 20, category = null, mime_prefix = null,
               uploaded_by = null, search = null, is_public = null, status = null, or_uploaded_by = null } = {}) {
    const offset = (page - 1) * limit;
    let where = 'WHERE 1=1';
    const params = [];

    if (category)    { where += ' AND m.category = ?';          params.push(category); }
    if (mime_prefix) { where += ' AND m.mime_type LIKE ?';       params.push(mime_prefix + '%'); }
    if (uploaded_by) { where += ' AND m.uploaded_by = ?';        params.push(uploaded_by); }
    
    if (or_uploaded_by && is_public !== null && status) {
      where += ' AND ((m.is_public = ? AND m.status = ?) OR m.uploaded_by = ?)';
      params.push(is_public, status, or_uploaded_by);
    } else {
      if (is_public !== null) { where += ' AND m.is_public = ?';   params.push(is_public); }
      if (status) { where += ' AND m.status = ?'; params.push(status); }
    }
    if (search)      {
      where += ' AND (m.original_name LIKE ? OR m.category LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const rows = await all(`
      SELECT m.*,
             u.email AS uploader_email,
             COALESCE(p.full_name, u.email) AS uploader_name
      FROM   media m
      JOIN   users u ON u.id = m.uploaded_by
      LEFT   JOIN students p ON p.user_id = u.id
      ${where}
      ORDER  BY m.created_at DESC
      LIMIT  ? OFFSET ?`, [...params, limit, offset]);

    const cnt = await get(`SELECT COUNT(*) AS c FROM media m ${where}`, params);

    return { rows, total: cnt?.c || 0, page, limit };
  },

  async delete(id) {
    return run('DELETE FROM media WHERE id = ?', [id]);
  },

  async bulkDelete(ids) {
    if (!ids.length) return;
    const placeholders = ids.map(() => '?').join(',');
    return run(`DELETE FROM media WHERE id IN (${placeholders})`, ids);
  },

  async getStats(uploaded_by = null) {
    const where  = uploaded_by ? 'WHERE uploaded_by = ?' : '';
    const params = uploaded_by ? [uploaded_by] : [];
    const rows = await all(`
      SELECT category,
             COUNT(*)         AS file_count,
             SUM(size_bytes)  AS total_bytes
      FROM   media ${where}
      GROUP  BY category`, params);
    const total = await get(`SELECT COUNT(*) AS c, SUM(size_bytes) AS bytes FROM media ${where}`, params);
    return { by_category: rows, total_files: total?.c || 0, total_bytes: total?.bytes || 0 };
  },

  async setPublic(id, is_public) {
    return run('UPDATE media SET is_public = ? WHERE id = ?', [is_public ? 1 : 0, id]);
  },
};

module.exports = MediaModel;
