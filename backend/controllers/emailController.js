'use strict';
/**
 * Email Controller – FUD Portal
 * Bulk send, queue management, retry, preview templates
 */
const EmailQueue   = require('../models/EmailQueue');
const emailService = require('../services/emailService');
const { all: dbAll, run: dbRun, get: dbGet } = require('../database/db');
const { logActivity } = require('../database/db');
const R = require('../utils/response');

// ── GET /api/email/verify-smtp ────────────────────────────────────────────────
// Test email connectivity without sending a real email
exports.verifySMTP = async (req, res, next) => {
  try {
    const result = await emailService.verifyTransporter();
    if (result.ok) {
      return R.success(res, result, 'Email connection verified successfully');
    } else {
      return R.error(res, `Email provider verification failed: ${result.error}`, 502);
    }
  } catch (err) { next(err); }
};

// ── POST /api/email/send-test ───────────────────────────────────────────────
// Send a live test email to a specified address to verify delivery
exports.sendTest = async (req, res, next) => {
  try {
    const { to } = req.body;
    if (!to) return R.error(res, '"to" email address is required', 400);

    const templates = require('../services/emailTemplates');
    const html = templates.announcementEmail({
      recipient_name: to.split('@')[0],
      subject_line:   'Test Email — FUD Portal',
      message_html:   '<p>This is a <strong>test email</strong> sent from the FUD Portal Email Management page to verify that your email configuration is working correctly.</p><p>If you received this email, your email system is <strong style="color:#22c55e">working correctly</strong>! ✅</p>',
      cta_text:       'Go to Admin Panel',
      cta_url:        process.env.FRONTEND_URL + '/admin.html',
      category:       'info',
    });

    // Send immediately (bypass the queue) so we get real-time delivery feedback
    let result;
    try {
      result = await emailService.sendMail({
        to,
        subject: '[TEST] FUD Portal Email Delivery Test',
        html,
        text: 'This is a test email from FUD Portal. If you received this, your email system is working correctly.',
      });
    } catch (sendErr) {
      return R.error(res, `Test email delivery failed: ${sendErr.message}`, 502);
    }

    await logActivity({
      userId: req.user.id, action: 'SEND_TEST_EMAIL', entityType: 'email',
      description: `Test email sent to ${to}`, ipAddress: req.ip,
    });

    return R.success(res, {
      to,
      messageId:  result.messageId,
      previewUrl: result.previewUrl || null,
    }, `Test email sent successfully to ${to}`);
  } catch (err) { next(err); }
};


// ── GET /api/email/stats ───────────────────────────────────────────────────────────
exports.stats = async (req, res, next) => {
  try {
    const stats = await EmailQueue.stats();
    const provider = String(process.env.EMAIL_PROVIDER || 'smtp').toLowerCase().trim();

    if (provider === 'brevo') {
      stats.smtp_live = !!process.env.BREVO_API_KEY;
      stats.smtp_provider = 'brevo';
      stats.smtp_user = stats.smtp_live ? 'Brevo API' : null;
    } else if (provider === 'resend') {
      stats.smtp_live = !!process.env.RESEND_API_KEY;
      stats.smtp_provider = 'resend';
      stats.smtp_user = stats.smtp_live ? 'Resend API' : null;
    } else if (provider === 'mailgun') {
      stats.smtp_live = !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);
      stats.smtp_provider = 'mailgun';
      stats.smtp_user = stats.smtp_live ? `Mailgun (${process.env.MAILGUN_DOMAIN})` : null;
    } else {
      stats.smtp_live = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
      stats.smtp_provider = 'smtp';
      stats.smtp_user = stats.smtp_live ? process.env.EMAIL_USER : null;
    }

    return R.success(res, stats, 'Email queue stats');
  } catch (err) { next(err); }
};

// ── GET /api/email/queue ──────────────────────────────────────────
exports.listQueue = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, status, type, search } = req.query;
    const result = await EmailQueue.list({ page: +page, limit: +limit, status, type, search });
    return R.paginated(res, result, 'Email queue');
  } catch (err) { next(err); }
};

// ── GET /api/email/queue/:id ──────────────────────────────────────
exports.getJob = async (req, res, next) => {
  try {
    const job = await EmailQueue.findById(+req.params.id);
    if (!job) return R.notFound(res, 'Email job not found');
    return R.success(res, job);
  } catch (err) { next(err); }
};

// ── POST /api/email/send ──────────────────────────────────────────
// Send bulk / custom email to selected users
exports.sendBulk = async (req, res, next) => {
  try {
    const { subject, message_html, cta_text, cta_url, category = 'announcement',
            target = 'all', user_ids = [], schedule_at = null } = req.body;

    if (!subject || !message_html)
      return R.error(res, 'subject and message_html are required', 400);

    // Resolve recipient list
    let recipients = [];
    if (target === 'all') {
      const rows = await dbAll(`
        SELECT u.email AS email_to, COALESCE(s.full_name, a.full_name, u.email) AS full_name
        FROM   users u
        LEFT JOIN students s ON s.user_id = u.id
        LEFT JOIN admins   a ON a.user_id = u.id
        WHERE  u.is_active = 1`, []);
      recipients = rows.map(r => ({ to: r.email_to, full_name: r.full_name }));
    } else if (target === 'students') {
      const rows = await dbAll(`
        SELECT u.email AS email_to, s.full_name
        FROM   users u JOIN students s ON s.user_id = u.id
        WHERE  u.is_active = 1 AND u.role = 'student'`, []);
      recipients = rows.map(r => ({ to: r.email_to, full_name: r.full_name }));
    } else if (target === 'admins') {
      const rows = await dbAll(`
        SELECT u.email AS email_to, a.full_name
        FROM   users u JOIN admins a ON a.user_id = u.id
        WHERE  u.is_active = 1`, []);
      recipients = rows.map(r => ({ to: r.email_to, full_name: r.full_name }));
    } else if (target === 'custom') {
      if (req.body.custom_emails && req.body.custom_emails.length) {
        recipients = req.body.custom_emails.map(e => ({ to: e, full_name: e.split('@')[0] }));
      } else if (user_ids && user_ids.length) {
        const ph   = user_ids.map(() => '?').join(',');
        const rows = await dbAll(`
          SELECT u.email AS email_to, COALESCE(s.full_name, a.full_name, u.email) AS full_name
          FROM   users u
          LEFT JOIN students s ON s.user_id = u.id
          LEFT JOIN admins   a ON a.user_id = u.id
          WHERE  u.id IN (${ph}) AND u.is_active = 1`, user_ids);
        recipients = rows.map(r => ({ to: r.email_to, full_name: r.full_name }));
      }
    }

    if (!recipients.length)
      return R.error(res, 'No active recipients found for the selected target', 400);

    const ids = await emailService.sendBulkEmail({
      recipients, subject, message_html, cta_text, cta_url, category,
    });

    await logActivity({
      userId: req.user.id, action: 'SEND_BULK_EMAIL', entityType: 'email',
      description: `Bulk email to ${ids.length} recipients: "${subject}"`, ipAddress: req.ip,
    });

    return R.created(res, { queued: ids.length, subject, target },
      `${ids.length} email(s) queued for delivery`);
  } catch (err) { next(err); }
};

// ── POST /api/email/send-one ──────────────────────────────────────
// Send single custom email
exports.sendOne = async (req, res, next) => {
  try {
    const { to, subject, message_html, cta_text, cta_url } = req.body;
    if (!to || !subject || !message_html)
      return R.error(res, 'to, subject and message_html are required', 400);

    const id = await emailService.sendBulkEmail({
      recipients:   [{ to, full_name: to.split('@')[0] }],
      subject, message_html, cta_text, cta_url, category: 'general',
    });

    return R.created(res, { id: id[0], to, subject }, 'Email queued');
  } catch (err) { next(err); }
};

// ── POST /api/email/retry/:id ─────────────────────────────────────
exports.retryOne = async (req, res, next) => {
  try {
    const job = await EmailQueue.findById(+req.params.id);
    if (!job) return R.notFound(res, 'Email job not found');

    await EmailQueue.retryOne(+req.params.id);
    return R.success(res, {}, 'Email re-queued for delivery');
  } catch (err) { next(err); }
};

// ── POST /api/email/retry-all ─────────────────────────────────────
exports.retryAll = async (req, res, next) => {
  try {
    const count = await EmailQueue.retryAllFailed();
    await logActivity({
      userId: req.user.id, action: 'RETRY_ALL_EMAILS', entityType: 'email',
      description: `Retrying ${count} failed emails`, ipAddress: req.ip,
    });
    return R.success(res, { retried: count }, `${count} email(s) re-queued`);
  } catch (err) { next(err); }
};

// ── DELETE /api/email/purge ───────────────────────────────────────
exports.purgeSent = async (req, res, next) => {
  try {
    const days   = parseInt(req.query.days || '30', 10);
    const purged = await EmailQueue.purgeSent(days);
    return R.success(res, { purged }, `${purged} old email record(s) removed`);
  } catch (err) { next(err); }
};

// ── GET /api/email/preview/:type ─────────────────────────────────
exports.previewTemplate = async (req, res, next) => {
  try {
    const templates = require('../services/emailTemplates');
    const now = new Date().toISOString();

    const previews = {
      welcome: templates.welcomeEmail({
        full_name: 'Ahmad Musa', email: 'ahmad@fud.edu.ng',
        matric_no: 'FUD/CS/2023/001', role: 'student',
        loginUrl: 'http://localhost:5000/index.html',
      }),
      password_reset: templates.passwordResetEmail({
        full_name: 'Ahmad Musa',
        resetUrl: 'http://localhost:5000/reset-password?token=abc123',
        expiresInMinutes: 60,
      }),
      exam: templates.examNotificationEmail({
        full_name: 'Ahmad Musa',
        test_title: 'Data Structures & Algorithms Mid-Semester Exam',
        subject: 'Computer Science',
        course_code: 'CSC 302',
        duration_mins: 90,
        pass_mark: 50,
        total_marks: 100,
        starts_at: now,
        ends_at: new Date(Date.now() + 3 * 24 * 3600000).toISOString(),
        instructions: 'Read all questions carefully.\nNo external resources allowed.',
        portalUrl: 'http://localhost:5000/tests.html',
      }),
      result: templates.resultEmail({
        full_name: 'Ahmad Musa',
        test_title: 'Data Structures & Algorithms Mid-Semester Exam',
        subject: 'Computer Science',
        score: 78, total_marks: 100, percentage: 78,
        grade: 'B', passed: true, pass_mark: 50,
        time_spent_secs: 3240, attempt_number: 1,
        reviewUrl: 'http://localhost:5000/tests.html?view=my-results',
      }),
      result_fail: templates.resultEmail({
        full_name: 'Ibrahim Yusuf',
        test_title: 'Mathematics MCQ Test',
        subject: 'Mathematics',
        score: 30, total_marks: 100, percentage: 30,
        grade: 'F', passed: false, pass_mark: 50,
        time_spent_secs: 1800, attempt_number: 2,
        reviewUrl: 'http://localhost:5000/tests.html?view=my-results',
      }),
      announcement: templates.announcementEmail({
        recipient_name: 'Ahmad Musa',
        subject_line: 'Semester Exam Schedule Released',
        message_html: '<p>The <strong>2024/2025 First Semester</strong> CBT examination timetable has been published.</p><p>All students are advised to check their schedules and prepare accordingly. Exams begin <strong>Monday, August 5th</strong>.</p>',
        cta_text: 'View Exam Schedule',
        cta_url: 'http://localhost:5000/tests.html',
        category: 'announcement',
      }),
      password_changed: templates.passwordChangedEmail({
        full_name: 'Ahmad Musa',
        changed_at: now,
        ip_address: '197.210.0.1',
      }),
    };

    const type = req.params.type;
    if (!previews[type])
      return res.status(404).json({ success: false, message: `Template "${type}" not found. Available: ${Object.keys(previews).join(', ')}` });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(previews[type]);
  } catch (err) { next(err); }
};

// ── POST /api/email/process-queue ────────────────────────────────
// Manually trigger queue processing (admin)
exports.processQueue = async (req, res, next) => {
  try {
    await emailService.processQueue();
    const stats = await EmailQueue.stats();
    return R.success(res, stats, 'Queue processing triggered');
  } catch (err) { next(err); }
};
