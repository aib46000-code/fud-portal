'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Email Service – FUD Portal                                      ║
 * ║  Nodemailer transporter + queue worker + send helpers            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
const EmailQueue = require('../models/EmailQueue');
const templates  = require('./emailTemplates');
const logger     = require('../utils/logger');
const { getProvider } = require('./emailProviders');

// ── Core send function ────────────────────────────────────────────────────────
async function sendMail({ to, subject, html, text }) {
  const fromName = process.env.EMAIL_FROM_NAME || 'FUD Portal';
  const from     = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@fudportal.edu.ng';
  
  const provider = getProvider();
  
  try {
    const info = await provider.send({ from, fromName, to, subject, html, text: text || '' });
    logger.info(`[Email] Sent: ${subject} → ${to} (id: ${info.messageId})`);
    return { messageId: info.messageId, previewUrl: info.previewUrl };
  } catch (err) {
    // If it's a "No SMTP transporter" error, we throw it as-is for the queue worker to catch
    throw err;
  }
}

// ── Verify SMTP connection (diagnostic) ──────────────────────────────────────
async function verifyTransporter() {
  try {
    const provider = getProvider();
    logger.info('[Email] Calling provider.verify()...');
    const result = await provider.verify();
    
    if (result.ok) {
      logger.info(`[Email] ${result.user ? result.user + ' @ ' : ''}${result.host} verified.`);
    } else {
      logger.error(`[Email] Provider failed: ${result.error}`);
    }
    
    return result;
  } catch (err) {
    logger.error(`[Email] Provider failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// ── Queue processor ───────────────────────────────────────────────────────────
let workerRunning = false;

async function processQueue() {
  if (workerRunning) {
    logger.info('[EmailWorker] Queue processor already running, skipping concurrent tick.');
    return;
  }
  workerRunning = true;

  try {
    let due = [];
    try {
      logger.info('[EmailWorker] Polling queue for due emails (EmailQueue.fetchDue)...');
      due = await EmailQueue.fetchDue(20);
    } catch (fetchErr) {
      logger.error(`[EmailWorker] Failed to fetch due emails from queue: ${fetchErr.message}`);
      throw fetchErr;
    }

    if (!due || !due.length) {
      logger.info('[EmailWorker] Queue poll complete: 0 pending emails due for delivery.');
      return;
    }

    logger.info(`[EmailWorker] Found ${due.length} queued email(s) ready for delivery.`);

    for (const job of due) {
      logger.info(`[EmailWorker] Processing job #${job.id} (to: ${job.to_address}, type: ${job.type || 'general'}, attempt: ${(job.retry_count || 0) + 1}/${job.max_retries || 5})`);

      try {
        await EmailQueue.markSending(job.id);
      } catch (markSendingErr) {
        logger.error(`[EmailWorker] Warning: Failed to mark job #${job.id} as sending: ${markSendingErr.message}`);
      }

      try {
        const result = await sendMail({
          to:      job.to_address,
          subject: job.subject,
          html:    job.html_body,
          text:    job.text_body || '',
        });
        await EmailQueue.markSent(job.id, result?.messageId);
        logger.info(`[EmailWorker] ✓ Successfully sent job #${job.id} to ${job.to_address} (messageId: ${result?.messageId || 'n/a'})`);
      } catch (sendErr) {
        logger.error(`[EmailWorker] ✗ Failed to send job #${job.id} to ${job.to_address}: ${sendErr.message}`);
        try {
          await EmailQueue.markFailed(job.id, sendErr.message);
          logger.info(`[EmailWorker] Scheduled retry/failure for job #${job.id} via EmailQueue.markFailed.`);
        } catch (markFailedErr) {
          logger.error(`[EmailWorker] Critical: Failed to update retry status for job #${job.id}: ${markFailedErr.message}`);
        }
      }
    }
  } catch (err) {
    logger.error(`[EmailWorker] Queue processing cycle error: ${err.message}`);
    throw err;
  } finally {
    workerRunning = false;
  }
}

// ── Start the queue worker ────────────────────────────────────────────────────
let workerInterval = null;

function startWorker(intervalMs = 30000) {
  if (workerInterval) {
    logger.warn('[EmailWorker] startWorker() called while worker is already running.');
    return;
  }

  logger.info(
    `[EmailWorker] Starting worker — polling every ${intervalMs / 1000}s`
  );

  // Process immediately on start
  processQueue().catch(err => {
    logger.error(
      `[EmailWorker] Initial queue processing failed: ${err.message}`
    );
  });

  // Schedule recurring polls
  workerInterval = setInterval(() => {
    processQueue().catch(err => {
      logger.error(
        `[EmailWorker] Scheduled queue processing failed: ${err.message}`
      );
    });
  }, intervalMs);

  logger.info('[EmailWorker] Worker interval initialized successfully.');
}

function stopWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    logger.info('[EmailWorker] Worker stopped.');
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
