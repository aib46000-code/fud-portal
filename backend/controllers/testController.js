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
    const testId = await TestModel.create(data);
    await logActivity({ userId: req.user.id, action: 'CREATE_TEST', entityType: 'test',
      entityId: testId, description: `Created: ${data.title}`, ipAddress: req.ip });

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
    const test = await TestModel.findById(+req.params.id);
    if (!test) return R.notFound(res, 'Test not found');
    await TestModel.update(+req.params.id, req.body);
    await logActivity({ userId: req.user.id, action: 'UPDATE_TEST', entityType: 'test',
      entityId: +req.params.id, description: `Updated: ${test.title}`, ipAddress: req.ip });
    const updated = await TestModel.findById(+req.params.id);
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

    // Check time window
    const now = new Date();
    if (test.starts_at && new Date(test.starts_at) > now)
      return R.error(res, `Test starts at ${test.starts_at}`, 403);
    if (test.ends_at && new Date(test.ends_at) < now)
      return R.error(res, 'This test has ended', 403);

    const student = await StudentModel.findByUserId(req.user.id);
    if (!student) return R.error(res, 'Student profile not found', 404);

    // Check if already has a submitted attempt (if retakes disabled)
    const lastResult = await ResultModel.findByTestAndStudent(testId, student.id);
    if (lastResult && lastResult.submitted_at) {
      // Return existing completed result
      return R.error(res, 'You have already completed this test', 409);
    }

    // Check for existing active session (resume)
    let session = await ResultModel.findActiveSession(testId, student.id);
    let isResume = false;

    if (session) {
      isResume = true;
      // Check if session expired (time ran out)
      const elapsed = Math.floor((now - new Date(session.started_at)) / 1000);
      if (elapsed >= test.duration_mins * 60) {
        // Auto-submit expired session
        await autoSubmitSession(session, test, student);
        return R.error(res, 'Your test session has expired and was auto-submitted', 410);
      }
    } else {
      // Create new session
      const attempt_number = lastResult ? lastResult.attempt_number + 1 : 1;
      const sessionId = await ResultModel.create({
        test_id: testId, student_id: student.id,
        score: 0, total_marks: test.total_marks,
        percentage: 0, grade: 'F', passed: 0,
        answers: '{}', time_spent_secs: 0,
        attempt_number, ip_address: req.ip,
        started_at: now.toISOString(),
      });
      session = await ResultModel.findById(sessionId) || { id: sessionId, started_at: now.toISOString(), answers: '{}' };
    }

    // Get questions (randomized)
    const questions = await QuestionModel.findForExam(testId, { randomize: true });

    // Parse saved answers
    let savedAnswers = {};
    try { savedAnswers = JSON.parse(session.answers || '{}'); } catch {}

    const elapsed = Math.floor((now - new Date(session.started_at)) / 1000);
    const remainingSecs = Math.max(0, test.duration_mins * 60 - elapsed);

    await logActivity({ userId: req.user.id, action: isResume ? 'RESUME_TEST' : 'START_TEST',
      entityType: 'test', entityId: testId,
      description: `${isResume ? 'Resumed' : 'Started'}: ${test.title}`, ipAddress: req.ip });

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
        question_count: questions.length,
      },
      questions,
    }, isResume ? 'Session resumed' : 'Test started');
  } catch (err) { next(err); }
};

/**
 * POST /api/tests/:id/save-progress
 * Auto-saves answers every N seconds without submitting.
 */
exports.saveProgress = async (req, res, next) => {
  try {
    const { session_id, answers, time_spent_secs } = req.body;
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
    const questions = await QuestionModel.findByTestId(testId);
    let score = 0;
    for (const q of questions) {
      const given   = String(finalAnswers[q.id] || '').trim().toUpperCase();
      const correct = String(q.correct_answer).trim().toUpperCase();
      if (given === correct) score += q.marks;
    }

    const percentage = test.total_marks > 0 ? (score / test.total_marks) * 100 : 0;
    const passed     = percentage >= test.pass_mark;
    const grade      = assignGrade(percentage);

    await ResultModel.submit(session.id, {
      score, percentage: +percentage.toFixed(2), grade, passed,
      answers: JSON.stringify(finalAnswers), time_spent_secs,
    });

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
