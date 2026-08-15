'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Email Queue Model – FUD Portal                                  ║
 * ║  Persistent SQLite-backed queue with retry tracking              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
const { run, get, all, db } = require('../database/db');

const EmailQueue = {

  // ── Enqueue a new email ─────────────────────────────────────────
  async enqueue({ to, subject, html, text = '', type = 'general',
                  priority = 5, meta = null, scheduled_at = null }) {
    if (!to || !subject || !html) throw new Error('Email: to, subject, html are required');
    const r = await run(`
      INSERT INTO email_queue
        (to_address, subject, html_body, text_body, type, priority, meta, scheduled_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [to, subject, html, text, type, priority,
       meta ? JSON.stringify(meta) : null,
       scheduled_at || new Date().toISOString()]
    );
    return r.lastID;
  },

  // ── Batch enqueue (wrapped in a transaction for atomicity) ──────
  async enqueueBatch(emails) {
    if (!emails || !emails.length) return [];
    return new Promise((resolve, reject) => {
      const ids = [];
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        let pending = emails.length;
        let failed  = false;

        const finish = (err) => {
          if (failed) return;
          if (err) {
            failed = true;
            db.run('ROLLBACK');
            return reject(err);
          }
          pending--;
          if (pending === 0) {
            db.run('COMMIT', commitErr => {
              if (commitErr) return reject(commitErr);
              resolve(ids);
            });
          }
        };

        for (const e of emails) {
          const { to, subject, html, text = '', type = 'general',
                  priority = 5, meta = null, scheduled_at = null } = e;
          db.run(
            `INSERT INTO email_queue
              (to_address, subject, html_body, text_body, type, priority, meta, scheduled_at, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [to, subject, html || '', text, type, priority,
             meta ? JSON.stringify(meta) : null,
             scheduled_at || new Date().toISOString()],
            function(err) {
              if (!err) ids.push(this.lastID);
              finish(err);
            }
          );
        }
      });
    });
  },

  // ── Fetch pending emails due for processing ─────────────────────
  async fetchDue(limit = 20) {
    return all(`
      SELECT * FROM email_queue
      WHERE  status = 'pending'
        AND  retry_count < max_retries
        AND  (next_retry_at IS NULL OR datetime(next_retry_at) <= datetime('now'))
        AND  datetime(scheduled_at) <= datetime('now')
      ORDER  BY priority ASC, created_at ASC
      LIMIT  ?`, [limit]);
  },

  // ── Mark as sending ─────────────────────────────────────────────
  async markSending(id) {
    return run(`UPDATE email_queue SET status='sending', updated_at=datetime('now') WHERE id=?`, [id]);
  },

  // ── Mark as sent ────────────────────────────────────────────────
  async markSent(id, messageId = null) {
    return run(`
      UPDATE email_queue
      SET    status='sent', sent_at=datetime('now'), message_id=?,
             updated_at=datetime('now')
      WHERE  id=?`, [messageId, id]);
  },

  // ── Mark as failed, schedule retry ─────────────────────────────
  async markFailed(id, errorMsg) {
    const row = await get('SELECT retry_count, max_retries FROM email_queue WHERE id=?', [id]);
    if (!row) return;
    const nextCount = (row.retry_count || 0) + 1;
    const backoff   = Math.min(5 * Math.pow(2, nextCount), 60); // 10m → 20m → 40m → max 60m
    const nextRetry = new Date(Date.now() + backoff * 60000).toISOString();
    const status    = nextCount >= row.max_retries ? 'failed' : 'pending';
    const errMsg    = (errorMsg || '').toString().slice(0, 500);
    return run(`
      UPDATE email_queue
      SET    retry_count=?, last_error=?, status=?, next_retry_at=?,
             updated_at=datetime('now')
      WHERE  id=?`, [nextCount, errMsg, status, nextRetry, id]);
  },

  // ── List (admin) ────────────────────────────────────────────────
  async list({ page = 1, limit = 50, status = null, type = null, search = null } = {}) {
    const offset = (Math.max(1, page) - 1) * Math.min(limit, 100);
    let   where  = 'WHERE 1=1';
    const params = [];
    if (status) { where += ' AND status=?';                          params.push(status); }
    if (type)   { where += ' AND type=?';                            params.push(type);   }
    if (search) { where += ' AND (to_address LIKE ? OR subject LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    const rows = await all(`
      SELECT id, to_address, subject, type, status, priority,
             retry_count, max_retries, last_error, sent_at, scheduled_at,
             next_retry_at, created_at
      FROM   email_queue ${where}
      ORDER  BY created_at DESC
      LIMIT  ? OFFSET ?`, [...params, limit, offset]);
    const cnt = await get(`SELECT COUNT(*) AS c FROM email_queue ${where}`, params);
    return { rows, total: cnt?.c || 0, page, limit };
  },

  // ── Stats ───────────────────────────────────────────────────────
  async stats() {
    const rows   = await all(`SELECT status, COUNT(*) AS count FROM email_queue GROUP BY status`);
    const totals = await get(`SELECT COUNT(*) AS total FROM email_queue`);
    const byType = await all(`SELECT type, COUNT(*) AS count FROM email_queue GROUP BY type ORDER BY count DESC`);
    const map = {};
    rows.forEach(r => { map[r.status] = r.count; });
    return {
      pending:  map.pending  || 0,
      sending:  map.sending  || 0,
      sent:     map.sent     || 0,
      failed:   map.failed   || 0,
      total:    totals?.total || 0,
      by_type:  byType,
    };
  },

  // ── Retry a specific failed email ───────────────────────────────
  async retryOne(id) {
    return run(`
      UPDATE email_queue
      SET    status='pending', next_retry_at=datetime('now'),
             updated_at=datetime('now')
      WHERE  id=? AND status='failed'`, [id]);
  },

  // ── Retry all failed ────────────────────────────────────────────
  async retryAllFailed() {
    const r = await run(`
      UPDATE email_queue
      SET    status='pending', retry_count=0, next_retry_at=datetime('now'),
             updated_at=datetime('now')
      WHERE  status='failed'`);
    return r.changes;
  },

  // ── Delete old sent emails (housekeeping) ───────────────────────
  // FIXED: Use parameterised query to avoid SQL injection risk
  async purgeSent(olderThanDays = 30) {
    const days = parseInt(olderThanDays, 10) || 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const r = await run(
      `DELETE FROM email_queue WHERE status='sent' AND sent_at < ?`,
      [cutoff]
    );
    return r.changes;
  },

  // ── Recover stuck sending jobs (interrupted by server crash/restart) ──
  async recoverStuckJobs(staleThresholdMins = 5) {
    const logger = require('../utils/logger');
    const stuck = await all(
      `SELECT id, retry_count, max_retries FROM email_queue
       WHERE  status = 'sending'
         AND  datetime(updated_at) <= datetime('now', '-' || ? || ' minutes')`,
      [staleThresholdMins]
    );

    if (!stuck || !stuck.length) return 0;

    logger.info(`[EmailRecovery] Found ${stuck.length} interrupted sending job(s)`);

    for (const job of stuck) {
      const nextCount = (job.retry_count || 0) + 1;
      const backoff   = Math.min(5 * Math.pow(2, nextCount), 60); // 10m → 20m → 40m → max 60m
      const nextRetry = new Date(Date.now() + backoff * 60000).toISOString();
      const status    = nextCount >= job.max_retries ? 'failed' : 'pending';
      await run(
        `UPDATE email_queue
         SET    retry_count=?, last_error='Interrupted by server restart/crash', status=?, next_retry_at=?,
                updated_at=datetime('now')
         WHERE  id=? AND status='sending'`,
        [nextCount, status, nextRetry, job.id]
      );

      logger.info(`[EmailRecovery] Requeued job #${job.id} for retry (attempts: ${nextCount}/${job.max_retries})`);
    }

    logger.info('[EmailRecovery] Recovery complete');
    return stuck.length;
  },

  async findById(id) {
    return get('SELECT * FROM email_queue WHERE id=?', [id]);
  },
};

module.exports = EmailQueue;
