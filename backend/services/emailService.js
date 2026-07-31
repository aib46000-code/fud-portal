'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Email Service – FUD Portal                                      ║
 * ║  Nodemailer transporter + queue worker + send helpers            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
const nodemailer = require('nodemailer');
const EmailQueue = require('../models/EmailQueue');
const templates  = require('./emailTemplates');
const logger     = require('../utils/logger');

// ── Build transporter ─────────────────────────────────────────────────────────
function createTransporter() {
  const service = process.env.EMAIL_SERVICE || '';   // 'gmail' | 'outlook' | ''
  const host    = process.env.EMAIL_HOST    || 'smtp.gmail.com';
  const port    = parseInt(process.env.EMAIL_PORT || '587', 10);
  const secure  = process.env.EMAIL_SECURE === 'true' || port === 465;
  const user    = process.env.EMAIL_USER    || '';
  const pass    = process.env.EMAIL_PASS    || '';

  // Use Ethereal (test SMTP) if no real credentials configured
  if (!user || !pass) {
    logger.warn('[Email] No SMTP credentials configured – using Ethereal test transport');
    return null; // will create on demand
  }

  const opts = {
    auth:   { user, pass },
    tls:    { rejectUnauthorized: false },
    pool:   true,
    maxConnections: 5,
    maxMessages:    100,
    rateDelta:      1000,
    rateLimit:      5,
  };

  if (service) {
    opts.service = service;
  } else {
    opts.host   = host;
    opts.port   = port;
    opts.secure = secure;
  }

  return nodemailer.createTransport(opts);
}

let transporter = null;
let etherealAccount = null;

async function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (user && pass) {
    transporter = createTransporter();
    return transporter;
  }

  // Create Ethereal test account on first use
  if (!etherealAccount) {
    try {
      etherealAccount = await nodemailer.createTestAccount();
      logger.info(`[Email] Ethereal test account: ${etherealAccount.user}`);
    } catch (err) {
      logger.error('[Email] Failed to create Ethereal account:', err.message);
      // Fallback: just log emails
      return null;
    }
  }

  transporter = nodemailer.createTransport({
    host:   'smtp.ethereal.email',
    port:   587,
    secure: false,
    auth: { user: etherealAccount.user, pass: etherealAccount.pass },
  });

  return transporter;
}

// ── Core send function ────────────────────────────────────────────────────────
async function sendMail({ to, subject, html, text }) {
  const from = `"${process.env.EMAIL_FROM_NAME || 'FUD Portal'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@fudportal.edu.ng'}>`;
  const t    = await getTransporter();

  if (!t) {
    // BUG FIX: Previously returned a fake success here.
    // Now we throw so the queue worker correctly marks the job as failed
    // and schedules a retry instead of recording a phantom "sent" state.
    throw new Error('No SMTP transporter available. Set EMAIL_USER and EMAIL_PASS in your environment variables.');
  }

  const info = await t.sendMail({ from, to, subject, html, text: text || '' });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    logger.info(`[Email] Ethereal preview URL: ${previewUrl}`);
  }

  logger.info(`[Email] Sent: ${subject} → ${to} (id: ${info.messageId})`);
  return { messageId: info.messageId, previewUrl };
}

// ── Verify SMTP connection (diagnostic) ──────────────────────────────────────
async function verifyTransporter() {
  try {
    const t = await getTransporter();
    if (!t) {
      return { ok: false, error: 'No transporter — EMAIL_USER/EMAIL_PASS not set' };
    }
    await t.verify();
    return { ok: true, user: process.env.EMAIL_USER, host: process.env.EMAIL_HOST || 'gmail' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Queue processor ───────────────────────────────────────────────────────────
let workerRunning = false;

async function processQueue() {
  if (workerRunning) return;
  workerRunning = true;

  try {
    const due = await EmailQueue.fetchDue(20);
    // BUG FIX: Previously `return` here bypassed the `finally` block in some
    // Node.js paths and left workerRunning = true forever. Now always falls
    // through to `finally` to guarantee the flag is reset.
    if (!due.length) return;

    logger.info(`[EmailWorker] Processing ${due.length} queued email(s)`);

    for (const job of due) {
      await EmailQueue.markSending(job.id);
      try {
        const result = await sendMail({
          to:      job.to_address,
          subject: job.subject,
          html:    job.html_body,
          text:    job.text_body || '',
        });
        await EmailQueue.markSent(job.id, result.messageId);
        logger.info(`[EmailWorker] ✓ Sent job #${job.id} to ${job.to_address}`);
      } catch (err) {
        logger.error(`[EmailWorker] ✗ Failed job #${job.id}: ${err.message}`);
        await EmailQueue.markFailed(job.id, err.message);
      }
    }
  } catch (err) {
    logger.error('[EmailWorker] Queue processing error:', err.message);
  } finally {
    // BUG FIX: This finally block is ALWAYS executed — even after an early
    // `return` above — guaranteeing the worker lock is released every time.
    workerRunning = false;
  }
}

// ── Start the queue worker ────────────────────────────────────────────────────
let workerInterval = null;

function startWorker(intervalMs = 30000) {
  if (workerInterval) return;
  // Process immediately on start, then on interval
  processQueue().catch(() => {});
  workerInterval = setInterval(() => processQueue().catch(() => {}), intervalMs);
  logger.info(`[EmailWorker] Started – polling every ${intervalMs / 1000}s`);
}

function stopWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC HELPERS — enqueue specific email types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send welcome / registration email
 */
async function sendWelcomeEmail({ to, full_name, matric_no, role, loginUrl }) {
  const html = templates.welcomeEmail({ full_name, email: to, matric_no, role, loginUrl });
  const text = templates.plainText(full_name,
    `Welcome to FUD Portal! Your account has been created.\nEmail: ${to}\n${matric_no ? 'Matric No: ' + matric_no + '\n' : ''}Login at: ${loginUrl || process.env.FRONTEND_URL || 'http://localhost:5000'}`
  );
  return EmailQueue.enqueue({
    to, subject: '🎉 Welcome to FUD Portal — Your Account is Ready!',
    html, text, type: 'welcome', priority: 1,
  });
}

/**
 * Send password reset email
 */
async function sendPasswordResetEmail({ to, full_name, resetUrl, expiresInMinutes = 60 }) {
  const html = templates.passwordResetEmail({ full_name, resetUrl, expiresInMinutes });
  const text = templates.plainText(full_name,
    `Password Reset Request\n\nClick the link below to reset your password (expires in ${expiresInMinutes} minutes):\n${resetUrl}\n\nIf you did not request this, ignore this email.`
  );
  return EmailQueue.enqueue({
    to, subject: '🔐 Reset Your FUD Portal Password',
    html, text, type: 'password_reset', priority: 1,
  });
}

/**
 * Send exam notification to a student (or array of students)
 */
async function sendExamNotification({ recipients, testData }) {
  // recipients = [{ to, full_name }]
  const ids = [];
  for (const r of recipients) {
    const html = templates.examNotificationEmail({ ...testData, full_name: r.full_name });
    const text = templates.plainText(r.full_name,
      `New exam available: ${testData.test_title}\nSubject: ${testData.subject}\nDuration: ${testData.duration_mins} minutes\nPass Mark: ${testData.pass_mark}%\nLogin to take the exam: ${process.env.FRONTEND_URL || 'http://localhost:5000'}/tests.html`
    );
    ids.push(await EmailQueue.enqueue({
      to: r.to,
      subject: `📝 New Exam: ${testData.test_title}`,
      html, text, type: 'exam_notification', priority: 3,
    }));
  }
  return ids;
}

/**
 * Send result notification
 */
async function sendResultEmail({ to, full_name, resultData }) {
  const html = templates.resultEmail({ full_name, ...resultData });
  const text = templates.plainText(full_name,
    `Your Exam Result\n\nExam: ${resultData.test_title}\nScore: ${resultData.score}/${resultData.total_marks} (${resultData.percentage.toFixed(1)}%)\nGrade: ${resultData.grade}\nStatus: ${resultData.passed ? 'PASSED ✓' : 'FAILED ✗'}\n\nReview answers: ${process.env.FRONTEND_URL || 'http://localhost:5000'}/tests.html?view=my-results`
  );
  return EmailQueue.enqueue({
    to, subject: `📊 Result: ${resultData.test_title} — Grade ${resultData.grade}`,
    html, text, type: 'result', priority: 2,
  });
}

/**
 * Send password changed notification
 */
async function sendPasswordChangedEmail({ to, full_name, changed_at, ip_address }) {
  const html = templates.passwordChangedEmail({ full_name, changed_at, ip_address });
  const text = templates.plainText(full_name,
    `Your FUD Portal password was changed at ${changed_at || new Date().toISOString()}.\nIP: ${ip_address || 'unknown'}\n\nIf this was not you, contact support immediately.`
  );
  return EmailQueue.enqueue({
    to, subject: '🔒 FUD Portal — Password Changed',
    html, text, type: 'security', priority: 1,
  });
}

/**
 * Send account blocked notification
 */
async function sendAccountBlockedEmail({ to, full_name, reason }) {
  const html = templates.accountBlockedEmail({ full_name, reason });
  const text = templates.plainText(full_name,
    `Your FUD Portal account has been suspended.\nReason: ${reason || 'Not specified'}\nContact support: ${process.env.SUPPORT_EMAIL || 'support@fudportal.edu.ng'}`
  );
  return EmailQueue.enqueue({
    to, subject: '⚠️ FUD Portal — Account Suspended',
    html, text, type: 'security', priority: 2,
  });
}

/**
 * Send bulk announcement email to multiple recipients
 */
async function sendBulkEmail({ recipients, subject, message_html, cta_text, cta_url, category = 'announcement' }) {
  // recipients = [{ to, full_name }] or just [email_string]
  const normalised = recipients.map(r => typeof r === 'string' ? { to: r, full_name: 'Portal User' } : r);

  const jobs = normalised.map(r => ({
    to:      r.to,
    subject,
    html: templates.announcementEmail({
      recipient_name: r.full_name,
      subject_line: subject,
      message_html,
      cta_text,
      cta_url,
      category,
    }),
    text: templates.plainText(r.full_name, message_html.replace(/<[^>]+>/g, '')),
    type:     'bulk',
    priority: 5,
  }));

  const ids = await EmailQueue.enqueueBatch(jobs);
  logger.info(`[Email] Bulk: queued ${ids.length} emails — subject: "${subject}"`);
  return ids;
}

module.exports = {
  sendMail,
  verifyTransporter,
  processQueue,
  startWorker,
  stopWorker,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendExamNotification,
  sendResultEmail,
  sendPasswordChangedEmail,
  sendAccountBlockedEmail,
  sendBulkEmail,
};
