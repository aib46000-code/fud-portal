'use strict';
/**
 * Result Model – FUD Portal (async sqlite3)
 */
const { run, get, all } = require('../database/db');

const ResultModel = {

  async findById(id) {
    return get(`
      SELECT r.*, t.title as test_title, t.subject, t.course_code,
             t.duration_mins, t.pass_mark, t.total_marks as test_total_marks,
             s.full_name as student_name, s.matric_no, u.email as student_email
      FROM results r
      JOIN tests    t ON t.id = r.test_id
      JOIN students s ON s.id = r.student_id
      JOIN users    u ON u.id = s.user_id
      WHERE r.id = ?`, [id]);
  },

  async findByTestAndStudent(test_id, student_id) {
    return get(`
      SELECT * FROM results WHERE test_id=? AND student_id=?
      ORDER BY attempt_number DESC LIMIT 1`, [test_id, student_id]);
  },

  /** Find an in-progress session (no submitted_at) */
  async findActiveSession(test_id, student_id) {
    return get(`
      SELECT * FROM results
      WHERE test_id=? AND student_id=? AND submitted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`, [test_id, student_id]);
  },

  async create(data) {
    const r = await run(`
      INSERT INTO results
        (test_id, student_id, score, total_marks, percentage, grade, passed,
         answers, time_spent_secs, attempt_number, ip_address, started_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        data.test_id, data.student_id,
        data.score||0, data.total_marks, data.percentage||0,
        data.grade||'F', data.passed||0,
        data.answers||'{}', data.time_spent_secs||0,
        data.attempt_number||1, data.ip_address||null,
        data.started_at||new Date().toISOString(),
      ]
    );
    return r.lastID;
  },

  /** Save progress without submitting (auto-save) */
  async saveProgress(id, { answers, time_spent_secs, violations_count, anti_cheat_logs }) {
    return run(`
      UPDATE results SET answers=?, time_spent_secs=?, violations_count=?, anti_cheat_logs=? WHERE id=?`,
      [typeof answers==='string'?answers:JSON.stringify(answers), time_spent_secs, violations_count, anti_cheat_logs, id]);
  },

  /** Final submit */
  async submit(id, { score, percentage, grade, passed, answers, time_spent_secs }) {
    return run(`
      UPDATE results
      SET score=?, percentage=?, grade=?, passed=?,
          answers=?, time_spent_secs=?, submitted_at=CURRENT_TIMESTAMP
      WHERE id=?`,
      [score, percentage, grade, passed?1:0,
       typeof answers==='string'?answers:JSON.stringify(answers),
       time_spent_secs, id]);
  },

  async listByTest(test_id, { page=1, limit=50 }={}) {
    const offset = (page-1)*limit;
    const rows = await all(`
      SELECT r.id, r.score, r.percentage, r.grade, r.passed, r.submitted_at,
             r.attempt_number, r.time_spent_secs,
             s.full_name, s.matric_no
      FROM results r JOIN students s ON s.id=r.student_id
      WHERE r.test_id=? AND r.submitted_at IS NOT NULL
      ORDER BY r.percentage DESC LIMIT ? OFFSET ?`, [test_id, limit, offset]);
    const countRow = await get('SELECT COUNT(*) as count FROM results WHERE test_id=? AND submitted_at IS NOT NULL', [test_id]);
    return { rows, total: countRow.count, page, limit };
  },

  async listByStudent(student_id, { page=1, limit=20 }={}) {
    const offset = (page-1)*limit;
    const rows = await all(`
      SELECT r.id, r.score, r.percentage, r.grade, r.passed, r.submitted_at,
             r.attempt_number, r.time_spent_secs,
             t.title, t.subject, t.course_code, t.total_marks, t.pass_mark
      FROM results r JOIN tests t ON t.id=r.test_id
      WHERE r.student_id=? AND r.submitted_at IS NOT NULL
      ORDER BY r.submitted_at DESC LIMIT ? OFFSET ?`, [student_id, limit, offset]);
    const countRow = await get('SELECT COUNT(*) as count FROM results WHERE student_id=? AND submitted_at IS NOT NULL', [student_id]);
    return { rows, total: countRow.count, page, limit };
  },

  async getTestStats(test_id) {
    return get(`
      SELECT
        COUNT(*)                                                  as attempts,
        ROUND(AVG(percentage),2)                                  as avg_percentage,
        ROUND(MAX(percentage),2)                                  as highest,
        ROUND(MIN(percentage),2)                                  as lowest,
        SUM(CASE WHEN passed=1 THEN 1 ELSE 0 END)                as passed_count,
        SUM(CASE WHEN passed=0 THEN 1 ELSE 0 END)                as failed_count,
        ROUND(AVG(time_spent_secs),0)                            as avg_time_secs
      FROM results WHERE test_id=? AND submitted_at IS NOT NULL`, [test_id]);
  },

  async delete(id) { return run('DELETE FROM results WHERE id=?', [id]); },
};

module.exports = ResultModel;
