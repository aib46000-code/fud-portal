'use strict';
/**
 * Token & PasswordReset Models – FUD Portal (async sqlite3)
 */
const crypto = require('crypto');
const { run, get } = require('../database/db');

// ─── Token Model ──────────────────────────────────────────────────────────────
const TokenModel = {

  hash(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  },

  async store({ user_id, raw_token, token_type = 'refresh', expires_at, device_info = null, ip_address = null }) {
    const token_hash = this.hash(raw_token);
    const result = await run(
      `INSERT INTO tokens (user_id, token_hash, token_type, device_info, ip_address, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user_id, token_hash, token_type, device_info, ip_address, expires_at]
    );
    return result.lastID;
  },

  async findByRawToken(raw_token, token_type = 'refresh') {
    const hash = this.hash(raw_token);
    return get(
      `SELECT * FROM tokens WHERE token_hash = ? AND token_type = ? AND revoked = 0 AND expires_at > datetime('now')`,
      [hash, token_type]
    );
  },

  async revoke(raw_token) {
    const hash = this.hash(raw_token);
    return run(`UPDATE tokens SET revoked = 1, revoked_at = datetime('now') WHERE token_hash = ?`, [hash]);
  },

  async revokeAllForUser(user_id) {
    return run(`UPDATE tokens SET revoked = 1, revoked_at = datetime('now') WHERE user_id = ? AND revoked = 0`, [user_id]);
  },

  async purgeExpired() {
    return run(`DELETE FROM tokens WHERE expires_at < datetime('now') OR revoked = 1`);
  },
};

// ─── Password Reset Model ─────────────────────────────────────────────────────
const PasswordResetModel = {

  async create({ user_id, token, expires_at, ip_address = null }) {
    await run('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0', [user_id]);
    const result = await run(
      `INSERT INTO password_resets (user_id, token, expires_at, ip_address) VALUES (?, ?, ?, ?)`,
      [user_id, token, expires_at, ip_address]
    );
    return result.lastID;
  },

  async findByToken(token) {
    return get(
      `SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > datetime('now')`,
      [token]
    );
  },

  async markUsed(id) {
    return run(`UPDATE password_resets SET used = 1, used_at = datetime('now') WHERE id = ?`, [id]);
  },

  async purgeExpired() {
    return run(`DELETE FROM password_resets WHERE expires_at < datetime('now') OR used = 1`);
  },
};

module.exports = { TokenModel, PasswordResetModel };
