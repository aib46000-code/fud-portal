'use strict';
/**
 * Question Model – FUD Portal (async sqlite3)
 */
const { run, get, all } = require('../database/db');

const QuestionModel = {

  async findById(id) {
    return get('SELECT * FROM questions WHERE id = ?', [id]);
  },

  async findByTestId(test_id, { includeInactive=false }={}) {
    const cond = includeInactive ? '' : 'AND is_active=1';
    return all(`SELECT * FROM questions WHERE test_id=? ${cond} ORDER BY order_index ASC`, [test_id]);
  },

  /** Returns questions WITHOUT correct_answer/explanation – for live exam */
  async findForExam(test_id, { randomize=false }={}) {
    const rows = await all(`
      SELECT id, test_id, question_text, question_type,
             option_a, option_b, option_c, option_d, marks, order_index
      FROM questions
      WHERE test_id=? AND is_active=1
      ORDER BY ${randomize ? 'RANDOM()' : 'order_index ASC'}`, [test_id]);
    return rows;
  },

  async create(data) {
    const r = await run(`
      INSERT INTO questions
        (test_id, question_text, question_type, option_a, option_b, option_c, option_d,
         correct_answer, explanation, marks, order_index)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        data.test_id, data.question_text, data.question_type||'mcq',
        data.option_a||null, data.option_b||null, data.option_c||null, data.option_d||null,
        data.correct_answer, data.explanation||null,
        data.marks||1, data.order_index||0,
      ]
    );
    return r.lastID;
  },

  async bulkCreate(test_id, questions) {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await run(`
        INSERT INTO questions
          (test_id, question_text, question_type, option_a, option_b, option_c, option_d,
           correct_answer, explanation, marks, order_index)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          test_id, q.question_text, q.question_type||'mcq',
          q.option_a||null, q.option_b||null, q.option_c||null, q.option_d||null,
          q.correct_answer, q.explanation||null,
          q.marks||1, q.order_index !== undefined ? q.order_index : i,
        ]
      );
    }
    return questions.length;
  },

  async update(id, fields) {
    const allowed = ['question_text','question_type','option_a','option_b','option_c','option_d',
                     'correct_answer','explanation','marks','order_index','is_active'];
    const sets = [], vals = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) { sets.push(`${key}=?`); vals.push(fields[key]); }
    }
    if (!sets.length) return { changes: 0 };
    vals.push(id);
    return run(`UPDATE questions SET ${sets.join(',')} WHERE id=?`, vals);
  },

  async delete(id)          { return run('DELETE FROM questions WHERE id=?', [id]); },
  async deleteByTestId(tid) { return run('DELETE FROM questions WHERE test_id=?', [tid]); },

  async countByTestId(test_id) {
    const r = await get('SELECT COUNT(*) as count FROM questions WHERE test_id=? AND is_active=1', [test_id]);
    return r?.count || 0;
  },

  /** Get questions WITH answers for review after submission */
  async findForReview(test_id) {
    return all(`
      SELECT id, question_text, question_type,
             option_a, option_b, option_c, option_d,
             correct_answer, explanation, marks, order_index
      FROM questions
      WHERE test_id=? AND is_active=1
      ORDER BY order_index ASC`, [test_id]);
  },
};

module.exports = QuestionModel;
