'use strict';
/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  Test Controller – FUD Portal CBT System                     ║
 * ║  Full CRUD, CBT session management, auto-score, review       ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
const { validationResult } = require('express-validator');
const TestModel     = require('../models/Test');
const QuestionModel = require('../models/Question');
const ResultModel   = require('../models/Result');
const StudentModel  = require('../models/Student');
const NotifModel    = require('../models/Notification');
const { logActivity, get, run, all: dbAll } = require('../database/db');
const R            = require('../utils/response');
const emailService = require('../services/emailService');
const logger       = require('../utils/logger');

// ══════════════════════════════════════════════════════════════════
// HELPER: grade from percentage
// ══════════════════════════════════════════════════════════════════
function assignGrade(pct) {
  if (pct >= 70) return 'A';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 45) return 'D';
  if (pct >= 40) return 'E';
  return 'F';
}

// ══════════════════════════════════════════════════════════════════
// TESTS – CRUD
// ══════════════════════════════════════════════════════════════════
exports.createTest = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return R.validationError(res, errors.array());

    const data   = { ...req.body, created_by: req.user.id };
    if (data.randomize !== undefined) {
      data.randomize_questions = data.randomize;
    }
    const testId = await TestModel.create(data);
    await logActivity({ userId: req.user.id, action: 'CREATE_TEST', entityType: 'test',
      entityId: testId, description: `Created: ${data.title}`, ipAddress: req.ip });

    // If subject bank is selected, copy questions from question_bank
    const bankSubjectId = req.body.bank_subject_id || req.body.subject_id;
    if (bankSubjectId) {
      const bankQuestions = await dbAll('SELECT * FROM question_bank WHERE subject_id = ?', [bankSubjectId]);
      if (bankQuestions && bankQuestions.length > 0) {
        await QuestionModel.bulkCreate(testId, bankQuestions);
        await recalcTotalMarks(testId);
      }
    }

    const test = await TestModel.findById(testId);
    return R.created(res, test, 'Test created successfully');
  } catch (err) { next(err); }
};

exports.listTests = async (req, res, next) => {
  try {
    const { page=1, limit=20, subject, is_active, is_published, search } = req.query;
    const filters = { page:+page, limit:+limit, subject, search };

    if (req.user.role === 'student') {
      filters.is_published = 1;
      filters.is_active    = 1;
    } else {
      if (is_active    !== undefined) filters.is_active    = +is_active;
      if (is_published !== undefined) filters.is_published = +is_published;
    }

    const result = await TestModel.list(filters);
    return R.paginated(res, result, 'Tests fetched');
  } catch (err) { next(err); }
};

exports.getTest = async (req, res, next) => {
  try {
    const test = await TestModel.findById(+req.params.id);
    if (!test) return R.notFound(res, 'Test not found');
    return R.success(res, test);
  } catch (err) { next(err); }
};

exports.updateTest = async (req, res, next) => {
  try {
    const testId = +req.params.id;
    const test = await TestModel.findById(testId);
    if (!test) return R.notFound(res, 'Test not found');

    const updateData = { ...req.body };
    if (updateData.randomize !== undefined) {
      updateData.randomize_questions = updateData.randomize;
    }

    await TestModel.update(testId, updateData);
    await logActivity({ userId: req.user.id, action: 'UPDATE_TEST', entityType: 'test',
      entityId: testId, description: `Updated: ${test.title}`, ipAddress: req.ip });

    // If subject bank is changed/supplied, and the test currently has 0 questions, copy them
    const bankSubjectId = req.body.bank_subject_id || req.body.subject_id;
    if (bankSubjectId && bankSubjectId !== test.bank_subject_id) {
      const currentQCount = await QuestionModel.countByTestId(testId);
      if (currentQCount === 0) {
        const bankQuestions = await dbAll('SELECT * FROM question_bank WHERE subject_id = ?', [bankSubjectId]);
        if (bankQuestions && bankQuestions.length > 0) {
          await QuestionModel.bulkCreate(testId, bankQuestions);
          await recalcTotalMarks(testId);
        }
      }
    }

    const updated = await TestModel.findById(testId);
    return R.success(res, updated, 'Test updated');
  } catch (err) { next(err); }
};

exports.deleteTest = async (req, res, next) => {
  try {
    const test = await TestModel.findById(+req.params.id);
    if (!test) return R.notFound(res, 'Test not found');
    await TestModel.delete(+req.params.id);
    await logActivity({ userId: req.user.id, action: 'DELETE_TEST', entityType: 'test',
      entityId: +req.params.id, description: `Deleted: ${test.title}`, ipAddress: req.ip });
    return R.success(res, {}, 'Test deleted');
  } catch (err) { next(err); }
};

exports.publishTest = async (req, res, next) => {
  try {
    const test = await TestModel.findById(+req.params.id);
    if (!test) return R.notFound(res, 'Test not found');
    const qCount = await QuestionModel.countByTestId(+req.params.id);
    if (qCount === 0) return R.error(res, 'Cannot publish a test with no questions', 400);
    await TestModel.publish(+req.params.id);
    await logActivity({ userId: req.user.id, action: 'PUBLISH_TEST', entityType: 'test',
      entityId: +req.params.id, description: `Published: ${test.title}`, ipAddress: req.ip });

    // Send exam notification emails to eligible students (non-blocking)
    setImmediate(async () => {
      try {
        let sql = `SELECT u.email AS email_to, s.full_name FROM users u
                   JOIN students s ON s.user_id = u.id
                   WHERE u.is_active = 1 AND u.role = 'student'`;
        const params = [];
        if (test.target_dept) { sql += ' AND s.department = ?'; params.push(test.target_dept); }
        if (test.target_level) { sql += ' AND s.level = ?'; params.push(test.target_level); }
        const rows = await dbAll(sql, params);
        const recipients = rows.map(r => ({ to: r.email_to, full_name: r.full_name }));
        if (recipients.length) {
          await emailService.sendExamNotification({
            recipients,
            testData: {
              test_title:    test.title,
              subject:       test.subject,
              course_code:   test.course_code,
              duration_mins: test.duration_mins,
              pass_mark:     test.pass_mark,
              total_marks:   test.total_marks,
              starts_at:     test.starts_at,
              ends_at:       test.ends_at,
              instructions:  test.instructions,
            },
          });
          logger.info(`[Email] Exam notification queued for ${recipients.length} student(s): ${test.title}`);
        }
      } catch (e) { logger.warn('[Email] Exam notification failed:', e.message); }
    });

    return R.success(res, {}, 'Test published');
  } catch (err) { next(err); }
};


exports.unpublishTest = async (req, res, next) => {
  try {
    const test = await TestModel.findById(+req.params.id);
    if (!test) return R.notFound(res, 'Test not found');
    await TestModel.unpublish(+req.params.id);
    await logActivity({ userId: req.user.id, action: 'UNPUBLISH_TEST', entityType: 'test',
      entityId: +req.params.id, description: `Unpublished: ${test.title}`, ipAddress: req.ip });
    return R.success(res, {}, 'Test unpublished');
  } catch (err) { next(err); }
};

exports.testStats = async (req, res, next) => {
  try {
    const stats = await TestModel.getStats();
    return R.success(res, stats, 'Test stats');
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════
// QUESTIONS – CRUD
// ══════════════════════════════════════════════════════════════════
exports.addQuestion = async (req, res, next) => {
  try {
    const test = await TestModel.findById(+req.params.id);
    if (!test) return R.notFound(res, 'Test not found');
    if (!req.body.question_text || !req.body.correct_answer) {
      return R.error(res, 'question_text and correct_answer are required', 400);
    }
    const count  = await QuestionModel.countByTestId(+req.params.id);
    const data   = { ...req.body, test_id:+req.params.id, order_index: req.body.order_index??count };
    const qId    = await QuestionModel.create(data);
    const q      = await QuestionModel.findById(qId);

    // Recalculate total_marks automatically
    await recalcTotalMarks(+req.params.id);

    return R.created(res, q, 'Question added');
  } catch (err) { next(err); }
};

exports.bulkAddQuestions = async (req, res, next) => {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions) || !questions.length) return R.error(res, 'questions[] required', 400);
    if (questions.length > 200) return R.error(res, 'Maximum 200 questions per bulk insert', 400);
    await QuestionModel.bulkCreate(+req.params.id, questions);
    await recalcTotalMarks(+req.params.id);
    const created = await QuestionModel.findByTestId(+req.params.id);
    return R.success(res, { questions: created, count: created.length }, `${questions.length} questions added`);
  } catch (err) { next(err); }
};

exports.listQuestions = async (req, res, next) => {
  try {
    const isAdmin = ['admin','superadmin','staff'].includes(req.user.role);
    const questions = isAdmin
      ? await QuestionModel.findByTestId(+req.params.id)
      : await QuestionModel.findForExam(+req.params.id);
    return R.success(res, questions);
  } catch (err) { next(err); }
};

exports.updateQuestion = async (req, res, next) => {
  try {
    await QuestionModel.update(+req.params.qid, req.body);
    await recalcTotalMarks(+req.params.id);
    const q = await QuestionModel.findById(+req.params.qid);
    return R.success(res, q, 'Question updated');
  } catch (err) { next(err); }
};

exports.deleteQuestion = async (req, res, next) => {
  try {
    await QuestionModel.delete(+req.params.qid);
    await recalcTotalMarks(+req.params.id);
    return R.success(res, {}, 'Question deleted');
  } catch (err) { next(err); }
};

async function recalcTotalMarks(testId) {
  const r = await get('SELECT COALESCE(SUM(marks),0) as total FROM questions WHERE test_id=? AND is_active=1', [testId]);
  if (r?.total > 0) await run('UPDATE tests SET total_marks=? WHERE id=?', [r.total, testId]);
}

// ══════════════════════════════════════════════════════════════════
// CBT SESSION – Start / Continue / Auto-save / Submit
// ══════════════════════════════════════════════════════════════════

/**
 * POST /api/tests/:id/start
 * Starts or resumes a CBT session for a student.
 * Returns: test info + questions (no answers) + session state
 */
exports.startTest = async (req, res, next) => {
  try {
    const testId  = +req.params.id;
    const test    = await TestModel.findById(testId);
    if (!test)                return R.notFound(res, 'Test not found');
    if (!test.is_published)   return R.error(res, 'This test is not available', 403);
    if (!test.is_active)      return R.error(res, 'This test is currently inactive', 403);

    // Phase 5: Check early access and late entry windows
    const now = new Date();
    if (test.starts_at) {
       const startsAt = new Date(test.starts_at);
       if (now < startsAt) {
         return R.error(res, `Test is not yet open. It opens at ${startsAt.toLocaleString()}`, 403);
       }
       if (test.late_entry_mins > 0) {
         const lateEntryEnd = new Date(startsAt.getTime() + test.late_entry_mins * 60000);
         if (now > lateEntryEnd) {
           return R.error(res, `Late entry window has closed. The test started at ${startsAt.toLocaleString()}`, 403);
         }
       }
    }
    if (test.ends_at && new Date(test.ends_at) < now) {
      return R.error(res, 'This test has ended', 403);
    }

    const student = await StudentModel.findByUserId(req.user.id);
    if (!student) return R.error(res, 'Student profile not found', 404);

    const { get, run } = require('../database/db');

    // Phase 5: Max Attempts
    const maxAttempts = test.max_attempts || 1;
    const pastAttempts = await get(`SELECT COUNT(*) as c FROM exam_attempts WHERE test_id = ? AND student_id = ?`, [testId, student.id]);
    
    let questions = [];
    const dbAll = require('../database/db').all;
    const dbRun = require('../database/db').run;

    // Check for existing active session (resume)
    let session = await ResultModel.findActiveSession(testId, student.id);
    let isResume = false;

    if (session) {
      // Load assigned questions for resume
      if (session.assigned_questions) {
         try {
            const assignedIds = JSON.parse(session.assigned_questions);
            if (assignedIds && assignedIds.length > 0) {
              const placeholders = assignedIds.map(() => '?').join(',');
              questions = await dbAll(`SELECT * FROM questions WHERE id IN (${placeholders})`, assignedIds);
            }
         } catch(e) {}
      }
      if (!questions.length) {
         questions = await dbAll(`SELECT * FROM questions WHERE test_id = ?`, [testId]);
      }
      isResume = true;
      // Check if session expired
      const elapsed = Math.floor((now - new Date(session.started_at)) / 1000);
      if (elapsed >= test.duration_mins * 60) {
        await autoSubmitSession(session, test, student);
        return R.error(res, 'Your test session has expired and was auto-submitted', 410);
      }
    } else {
      if (pastAttempts.c >= maxAttempts) {
        return R.error(res, `You have reached the maximum allowed attempts (${maxAttempts}) for this test`, 403);
      }

      // Phase 5: Token Validation
      let usedToken = null;
      if (test.token_required) {
        const providedToken = req.body.token;
        if (!providedToken) return R.error(res, 'An exam token is required to start this test', 403);
        const tokenRec = await get(`SELECT * FROM test_tokens WHERE token = ? AND test_id = ? AND is_active = 1`, [providedToken, testId]);
        if (!tokenRec) return R.error(res, 'Invalid or inactive exam token', 403);
        if (tokenRec.expires_at && new Date(tokenRec.expires_at) < now) return R.error(res, 'Exam token has expired', 403);
        if (tokenRec.used_attempts >= tokenRec.max_attempts) return R.error(res, 'Exam token usage limit exceeded', 403);
        
        await run(`UPDATE test_tokens SET used_attempts = used_attempts + 1 WHERE id = ?`, [tokenRec.id]);
        usedToken = providedToken;
      }

      // Phase 5: Register in exam_sessions tracker
      await run(`INSERT INTO exam_sessions (test_id, student_id, token_used, status) VALUES (?, ?, ?, 'active')`, [testId, student.id, usedToken]);

      // Create new session
      const attempt_number = pastAttempts.c + 1;
      const sessionId = await ResultModel.create({
        test_id: testId, student_id: student.id,
        score: 0, total_marks: test.total_marks,
        percentage: 0, grade: 'F', passed: 0,
        answers: '{}', time_spent_secs: 0,
        attempt_number, ip_address: req.ip,
        started_at: now.toISOString(),
      });
      session = await ResultModel.findById(sessionId) || { id: sessionId, started_at: now.toISOString(), answers: '{}', assigned_questions: null };
      
      // Phase 5: Randomization & Pools
      
      if (session.assigned_questions) {
         try {
            const assignedIds = JSON.parse(session.assigned_questions);
            if (assignedIds && assignedIds.length > 0) {
              const placeholders = assignedIds.map(() => '?').join(',');
              questions = await dbAll(`SELECT * FROM questions WHERE id IN (${placeholders})`, assignedIds);
            }
         } catch(e) {}
      }

      if (!questions.length) {
        // If pools are enabled, pick one pool
        const pools = await dbAll(`SELECT DISTINCT pool_name FROM questions WHERE test_id = ? AND pool_name IS NOT NULL AND pool_name != ''`, [testId]);
        let poolClause = '';
        let queryParams = [testId];
        if (pools.length > 0) {
          const selectedPool = pools[Math.floor(Math.random() * pools.length)].pool_name;
          poolClause = ' AND pool_name = ? ';
          queryParams.push(selectedPool);
        }

        let limitClause = test.display_limit > 0 ? `LIMIT ${test.display_limit}` : '';
        let orderClause = test.randomize_questions ? 'ORDER BY RANDOM()' : 'ORDER BY id ASC';
        
        questions = await dbAll(`SELECT * FROM questions WHERE test_id = ? ${poolClause} ${orderClause} ${limitClause}`, queryParams);
        
        if (questions.length > 0) {
           const assignedIds = questions.map(q => q.id);
           await dbRun(`UPDATE results SET assigned_questions = ? WHERE id = ?`, [JSON.stringify(assignedIds), session.id]);
        }
      }
    }

    // Phase 5: Randomize Options if enabled
    if (test.randomize_options) {
      questions = questions.map(q => {
         if (q.question_type !== 'mcq' && q.question_type !== 'true_false') return q;
         const options = [
           { key: 'A', text: q.option_a },
           { key: 'B', text: q.option_b },
           { key: 'C', text: q.option_c },
           { key: 'D', text: q.option_d }
         ].filter(o => o.text != null && o.text.trim() !== '');
         
         for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
         }
         q.shuffled_options = options;
         return q;
      });
    }

    // Parse saved answers
    let savedAnswers = {};
    try { savedAnswers = JSON.parse(session.answers || '{}'); } catch {}

    const elapsed = Math.floor((now - new Date(session.started_at)) / 1000);
    const remainingSecs = Math.max(0, test.duration_mins * 60 - elapsed);

    await logActivity({ userId: req.user.id, action: isResume ? 'RESUME_TEST' : 'START_TEST',
      entityType: 'test', entityId: testId,
      description: `${isResume ? 'Resumed' : 'Started'}: ${test.title}`, ipAddress: req.ip });

    // SECURITY: Strip correct answers, explanations, and server-only metadata
    // before sending questions to the client. The server retains all data
    // internally for grading in submitResult.
    const safeQuestions = questions.map(({ correct_answer, explanation,
      times_used, times_correct, times_wrong, pool_name,
      is_active, created_at, updated_at, test_id,
      ...studentFields }) => studentFields);

    return R.success(res, {
      session_id:    session.id,
      is_resume:     isResume,
      remaining_secs: remainingSecs,
      started_at:    session.started_at,
      saved_answers: savedAnswers,
      test: {
        id: test.id, title: test.title, subject: test.subject,
        duration_mins: test.duration_mins, total_marks: test.total_marks,
        pass_mark: test.pass_mark, instructions: test.instructions,
        question_count: safeQuestions.length,
      },
      questions: safeQuestions,
    }, isResume ? 'Session resumed' : 'Test started');
  } catch (err) { next(err); }
};

/**
 * POST /api/tests/:id/save-progress
 * Auto-saves answers every N seconds without submitting.
 */
exports.saveProgress = async (req, res, next) => {
  try {
    const { session_id, answers, time_spent_secs, violations, anti_cheat_logs } = req.body;
    if (!session_id) return R.error(res, 'session_id required', 400);

    const session = await ResultModel.findById(session_id);
    if (!session) return R.notFound(res, 'Session not found');

    // Validate ownership
    const student = await StudentModel.findByUserId(req.user.id);
    if (!student || session.student_id !== student.id)
      return R.forbidden(res, 'Not your session');
    if (session.submitted_at)
      return R.error(res, 'Session already submitted', 409);

    await ResultModel.saveProgress(session_id, {
      answers: typeof answers==='string' ? answers : JSON.stringify(answers),
      time_spent_secs: time_spent_secs||0,
      violations_count: violations || 0,
      anti_cheat_logs: typeof anti_cheat_logs==='string' ? anti_cheat_logs : JSON.stringify(anti_cheat_logs || [])
    });

    return R.success(res, { saved: true }, 'Progress saved');
  } catch (err) { next(err); }
};

/**
 * POST /api/tests/:id/submit
 * Final submission – scores answers and stores result.
 */
exports.submitResult = async (req, res, next) => {
  try {
    const testId  = +req.params.id;
    const test    = await TestModel.findById(testId);
    if (!test) return R.notFound(res, 'Test not found');

    const student = await StudentModel.findByUserId(req.user.id);
    if (!student) return R.error(res, 'Student profile not found', 404);

    const { session_id, answers={}, time_spent_secs=0 } = req.body;

    // Find the session
    let session;
    if (session_id) {
      session = await ResultModel.findById(session_id);
    } else {
      session = await ResultModel.findActiveSession(testId, student.id);
    }

    // If no active session, check if already submitted
    if (!session) {
      const existing = await ResultModel.findByTestAndStudent(testId, student.id);
      if (existing?.submitted_at) return R.error(res, 'Test already submitted', 409);
      return R.error(res, 'No active test session found', 404);
    }

    if (session.submitted_at) return R.error(res, 'Test already submitted', 409);
    if (session.student_id !== student.id) return R.forbidden(res, 'Not your session');

    // Merge saved answers with final submission
    let finalAnswers = {};
    try { finalAnswers = JSON.parse(session.answers || '{}'); } catch {}
    Object.assign(finalAnswers, answers);

    // Score the answers
    let questions = [];
    let hasAssigned = false;
    if (session.assigned_questions) {
      try {
        const assignedIds = JSON.parse(session.assigned_questions);
        if (assignedIds && assignedIds.length > 0) {
          hasAssigned = true;
          const { all: dbAll } = require('../database/db');
          const placeholders = assignedIds.map(() => '?').join(',');
          questions = await dbAll(`SELECT id, correct_answer, question_type, marks FROM questions WHERE id IN (${placeholders})`, assignedIds);
        }
      } catch (e) {
        console.error('[submitResult] Error loading assigned questions:', e);
      }
    } 
    if (!hasAssigned && !questions.length) {
      questions = await QuestionModel.findByTestId(testId);
    }
    
    let score = 0;
    const { run } = require('../database/db');
    
    for (const q of questions) {
      const given = String(finalAnswers[q.id] || '').trim();
      
      if (q.question_type === 'essay' || q.question_type === 'practical') {
         // Handle essay and practical in Phase 5
         if (given) {
           if (q.question_type === 'essay') {
              const wordCount = given.split(/\s+/).filter(w => w.length > 0).length;
              await run(`INSERT INTO essay_answers (result_id, question_id, answer_text, word_count, char_count) VALUES (?, ?, ?, ?, ?)`, [session.id, q.id, given, wordCount, given.length]);
           } else {
              await run(`INSERT INTO practical_submissions (result_id, question_id, file_url, file_type) VALUES (?, ?, ?, 'application/octet-stream')`, [session.id, q.id, given]);
           }
         }
         // Score handled manually later for essay/practical
         await run(`UPDATE questions SET times_used = times_used + 1 WHERE id = ?`, [q.id]);
         continue;
      }

      // Objective marking
      const givenMCQ = given.toUpperCase();
      const correctMCQ = String(q.correct_answer).trim().toUpperCase();
      if (givenMCQ === correctMCQ) {
        score += q.marks || 1;
        await run(`UPDATE questions SET times_used = times_used + 1, times_correct = times_correct + 1 WHERE id = ?`, [q.id]);
      } else {
        if (givenMCQ && test.negative_marking > 0) {
          score -= test.negative_marking;
        }
        await run(`UPDATE questions SET times_used = times_used + 1, times_wrong = times_wrong + 1 WHERE id = ?`, [q.id]);
      }
    }
    score = Math.max(0, score); // Prevent negative total score

    const percentage = test.total_marks > 0 ? (score / test.total_marks) * 100 : 0;
    const passed     = percentage >= test.pass_mark;
    const grade      = assignGrade(percentage);

    await ResultModel.submit(session.id, {
      score, percentage: +percentage.toFixed(2), grade, passed,
      answers: JSON.stringify(finalAnswers), time_spent_secs,
    });
    
    // Phase 5 additions:
    await run(`INSERT INTO exam_attempts (test_id, student_id, attempt_number, score, percentage, passed, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [testId, student.id, session.attempt_number || 1, score, +percentage.toFixed(2), passed, new Date().toISOString()]);
      
    await run(`UPDATE exam_sessions SET status = 'completed', last_active_at = ? WHERE test_id = ? AND student_id = ? AND status != 'completed'`, [new Date().toISOString(), testId, student.id]);
    

    // Notify student
    await NotifModel.create({
      user_id: req.user.id,
      title:   `📊 Result: ${test.title}`,
      message: `You scored ${score}/${test.total_marks} (${percentage.toFixed(1)}%) — Grade: ${grade} — ${passed ? '✅ PASSED' : '❌ FAILED'}`,
      type:    passed ? 'success' : 'warning',
    });

    await logActivity({ userId: req.user.id, action: 'SUBMIT_TEST', entityType: 'result',
      entityId: session.id,
      description: `${test.title} → ${score}/${test.total_marks} (${percentage.toFixed(1)}%)`,
      ipAddress: req.ip });

    // Send result email to student (non-blocking)
    try {
      const userRow = await get('SELECT u.email, COALESCE(s.full_name, u.email) AS full_name FROM users u LEFT JOIN students s ON s.user_id = u.id WHERE u.id = ?', [req.user.id]);
      if (userRow) {
        emailService.sendResultEmail({
          to:         userRow.email,
          full_name:  userRow.full_name,
          resultData: {
            test_title:       test.title,
            subject:          test.subject || '',
            score, total_marks: test.total_marks,
            percentage:       +percentage.toFixed(2),
            grade, passed,
            pass_mark:        test.pass_mark,
            time_spent_secs,
            attempt_number:   session.attempt_number || 1,
            reviewUrl: `${process.env.FRONTEND_URL || 'http://localhost:5000'}/tests.html?view=my-results`,
          },
        }).catch(e => logger.warn('[Email] Result email queue failed:', e.message));
      }
    } catch (emailErr) { /* non-fatal */ }

    return R.created(res, {
      result_id:   session.id,
      score, total_marks: test.total_marks,
      percentage:  +percentage.toFixed(2),
      grade, passed,
      pass_mark:   test.pass_mark,
    }, 'Test submitted successfully');
  } catch (err) { next(err); }
};

/**
 * GET /api/tests/results/:resultId
 * Instant result card – available immediately after submission.
 */
exports.getResult = async (req, res, next) => {
  try {
    const result = await ResultModel.findById(+req.params.resultId);
    if (!result) return R.notFound(res, 'Result not found');

    // Students can only see their own
    if (req.user.role === 'student') {
      const student = await StudentModel.findByUserId(req.user.id);
      if (!student || result.student_id !== student.id)
        return R.forbidden(res, 'Not your result');
    }

    return R.success(res, result);
  } catch (err) { next(err); }
};

/**
 * GET /api/tests/results/:resultId/review
 * Full answer review with correct answers. Only after submission.
 */
exports.reviewResult = async (req, res, next) => {
  try {
    const result = await ResultModel.findById(+req.params.resultId);
    if (!result) return R.notFound(res, 'Result not found');
    if (!result.submitted_at) return R.error(res, 'Test not yet submitted', 400);

    // Students can only review their own
    if (req.user.role === 'student') {
      const student = await StudentModel.findByUserId(req.user.id);
      if (!student || result.student_id !== student.id)
        return R.forbidden(res, 'Not your result');
    }

    const questions = await QuestionModel.findForReview(result.test_id);
    let savedAnswers = {};
    try { savedAnswers = JSON.parse(result.answers || '{}'); } catch {}

    const review = questions.map(q => ({
      ...q,
      student_answer: savedAnswers[q.id] || null,
      is_correct: String(savedAnswers[q.id]||'').trim().toUpperCase()
                === String(q.correct_answer).trim().toUpperCase(),
    }));

    return R.success(res, { result, review }, 'Review data');
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════
// ADMIN: LIST RESULTS FOR A TEST
// ══════════════════════════════════════════════════════════════════
exports.listResults = async (req, res, next) => {
  try {
    const { page=1, limit=50 } = req.query;
    const result = await ResultModel.listByTest(+req.params.id, { page:+page, limit:+limit });
    return R.paginated(res, result, 'Results fetched');
  } catch (err) { next(err); }
};

exports.testResultStats = async (req, res, next) => {
  try {
    const stats = await ResultModel.getTestStats(+req.params.id);
    return R.success(res, stats, 'Result stats');
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════
// STUDENT: MY RESULTS
// ══════════════════════════════════════════════════════════════════
exports.myResults = async (req, res, next) => {
  try {
    // Non-students don't have results but shouldn't get a 404
    if (req.user.role !== 'student') {
      return R.paginated(res, { rows: [], total: 0, page: 1, limit: 20 }, 'No student results for this account');
    }
    const student = await StudentModel.findByUserId(req.user.id);
    if (!student) return R.error(res, 'Student profile not found', 404);
    const { page=1, limit=20 } = req.query;
    const result = await ResultModel.listByStudent(student.id, { page:+page, limit:+limit });
    return R.paginated(res, result, 'My results');
  } catch (err) { next(err); }
};

// ══════════════════════════════════════════════════════════════════
// INTERNAL: Auto-submit expired session
// ══════════════════════════════════════════════════════════════════
async function autoSubmitSession(session, test, student) {
  const questions = await QuestionModel.findByTestId(test.id);
  let savedAnswers = {};
  try { savedAnswers = JSON.parse(session.answers || '{}'); } catch {}

  let score = 0;
  for (const q of questions) {
    const given   = String(savedAnswers[q.id] || '').trim().toUpperCase();
    const correct = String(q.correct_answer).trim().toUpperCase();
    if (given === correct) score += q.marks;
  }

  const percentage = test.total_marks > 0 ? (score / test.total_marks) * 100 : 0;
  const passed     = percentage >= test.pass_mark;
  const grade      = assignGrade(percentage);

  await ResultModel.submit(session.id, {
    score, percentage: +percentage.toFixed(2), grade, passed,
    answers: session.answers, time_spent_secs: test.duration_mins * 60,
  });
}

// ══════════════════════════════════════════════════════════════════
// PHASE 4 & 5: EXTENDED ENDPOINTS
// ══════════════════════════════════════════════════════════════════

exports.getDashboardAnalytics = async (req, res, next) => {
  try {
    const { get, all } = require('../database/db');
    
    // Aggregate cards
    const totalSubjects = await get(`SELECT COUNT(*) as c FROM tests`);
    const totalQuestions = await get(`SELECT COUNT(*) as c FROM questions`);
    const totalExams = await get(`SELECT COUNT(*) as c FROM results WHERE submitted_at IS NOT NULL`);
    const totalStudents = await get(`SELECT COUNT(DISTINCT student_id) as c FROM results`);
    const avgScore = await get(`SELECT AVG(score) as c FROM results WHERE submitted_at IS NOT NULL`);
    const maxScore = await get(`SELECT MAX(score) as c FROM results WHERE submitted_at IS NOT NULL`);
    const minScore = await get(`SELECT MIN(score) as c FROM results WHERE submitted_at IS NOT NULL`);
    const passed = await get(`SELECT COUNT(*) as c FROM results WHERE passed = 1`);
    const failed = await get(`SELECT COUNT(*) as c FROM results WHERE passed = 0 AND submitted_at IS NOT NULL`);

    // Aggregate charts (Monthly exams, Pass/Fail, Subject Performance)
    const monthlyExams = await all(`
      SELECT strftime('%Y-%m', submitted_at) as month, COUNT(*) as count 
      FROM results WHERE submitted_at IS NOT NULL GROUP BY month ORDER BY month
    `);
    
    const subjectPerformance = await all(`
      SELECT t.title as subject, AVG(r.percentage) as avg_score 
      FROM results r JOIN tests t ON r.test_id = t.id 
      WHERE r.submitted_at IS NOT NULL GROUP BY t.id
    `);
    
    const worstQuestions = await all(`
      SELECT id, question_text, times_used, times_correct, times_wrong 
      FROM questions 
      WHERE times_used > 0 
      ORDER BY (CAST(times_wrong AS FLOAT)/times_used) DESC LIMIT 10
    `);

    return R.success(res, {
      cards: {
        totalSubjects: totalSubjects.c,
        totalQuestions: totalQuestions.c,
        totalExams: totalExams.c,
        totalStudents: totalStudents.c,
        avgScore: avgScore.c || 0,
        maxScore: maxScore.c || 0,
        minScore: minScore.c || 0,
        passRate: totalExams.c > 0 ? (passed.c / totalExams.c) * 100 : 0,
        failRate: totalExams.c > 0 ? (failed.c / totalExams.c) * 100 : 0
      },
      charts: {
        monthlyExams,
        subjectPerformance,
        worstQuestions
      }
    });
  } catch (err) { next(err); }
};

exports.getLiveMonitor = async (req, res, next) => {
  try {
    const { all } = require('../database/db');
    const testId = +req.params.id;
    // Get active sessions
    const sessions = await all(`
      SELECT s.id as session_id, st.full_name, st.matric_no, s.current_question_index, 
             s.last_active_at, s.status
      FROM exam_sessions s 
      JOIN students st ON s.student_id = st.id
      WHERE s.test_id = ? AND s.status != 'completed'
    `, [testId]);
    return R.success(res, sessions);
  } catch (err) { next(err); }
};

exports.exportResultPDF = async (req, res, next) => {
  try {
    const puppeteer = require('puppeteer');
    const QRCode = require('qrcode');
    const result = await ResultModel.findById(+req.params.resultId);
    if (!result) return R.notFound(res, 'Result not found');
    const test = await TestModel.findById(result.test_id);
    const student = await StudentModel.findById(result.student_id);

    // Generate QR
    const verificationUrl = `http://\${req.get('host')}/api/tests/results/\${result.id}`;
    const qrImage = await QRCode.toDataURL(verificationUrl);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Helvetica', 'Arial', sans-serif; color: #333; margin: 40px; }
          .header { text-align: center; border-bottom: 3px solid #0d9488; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { margin: 0; color: #0d9488; font-size: 28px; }
          .header p { margin: 5px 0 0 0; font-size: 14px; color: #666; }
          .details, .scores { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .details th, .details td, .scores th, .scores td { padding: 12px; text-align: left; border: 1px solid #e5e7eb; }
          .details th, .scores th { background-color: #f3f4f6; font-weight: bold; width: 35%; }
          .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #9ca3af; }
          .signature { margin-top: 60px; display: flex; justify-content: space-between; }
          .signature div { border-top: 1px solid #333; padding-top: 10px; width: 200px; text-align: center; }
          .qr-code { text-align: center; margin-top: 30px; }
          .qr-code img { width: 120px; height: 120px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Federal University Dutse</h1>
          <p>Official Examination Result</p>
        </div>
        
        <table class="details">
          <tr><th>Student Name</th><td>\${student.full_name}</td></tr>
          <tr><th>Registration Number</th><td>\${student.matric_no}</td></tr>
          <tr><th>Department</th><td>\${student.department}</td></tr>
          <tr><th>Faculty</th><td>\${student.faculty}</td></tr>
          <tr><th>Subject / Course</th><td>\${test.title} (\${test.course_code})</td></tr>
          <tr><th>Examination Date</th><td>\${new Date(result.started_at).toLocaleDateString()}</td></tr>
        </table>
        
        <table class="scores">
          <tr><th>Final Score</th><td>\${result.score} / \${test.total_marks}</td></tr>
          <tr><th>Percentage</th><td>\${result.percentage}%</td></tr>
          <tr><th>Grade</th><td>\${result.grade}</td></tr>
          <tr><th>Status</th><td><strong style="color: \${result.passed ? 'green' : 'red'}">\${result.passed ? 'PASSED' : 'FAILED'}</strong></td></tr>
        </table>

        <div class="qr-code">
          <img src="\${qrImage}" alt="Verification QR Code">
          <p style="font-size: 10px; color: #666;">Scan to Verify Result Authenticity</p>
        </div>
        
        <div class="signature">
          <div>Student Signature</div>
          <div>Examiner Signature</div>
        </div>
        
        <div class="footer">
          Generated automatically by FUD Portal CBT System on \${new Date().toLocaleString()}
        </div>
      </body>
      </html>
    `;

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdf.length,
      'Content-Disposition': `attachment; filename="Result_\${student.matric_no}_\${test.course_code}.pdf"`
    });
    res.send(pdf);
  } catch (err) { next(err); }
};
