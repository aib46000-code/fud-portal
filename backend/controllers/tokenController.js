'use strict';
const crypto = require('crypto');
const { all, run, get } = require('../database/db');
const R = require('../utils/response');

exports.listTokens = async (req, res, next) => {
  try {
    const testId = +req.params.id;
    const tokens = await all(`SELECT * FROM test_tokens WHERE test_id = ? ORDER BY created_at DESC`, [testId]);
    return R.success(res, tokens);
  } catch (err) { next(err); }
};

exports.generateToken = async (req, res, next) => {
  try {
    const testId = +req.params.id;
    const { max_attempts = 1, count = 1, expires_at = null } = req.body;

    const tokens = [];
    for (let i = 0; i < count; i++) {
      let token;
      let exists;
      do {
        token = 'FUD-' + crypto.randomBytes(4).toString('hex').toUpperCase();
        exists = await get('SELECT 1 FROM test_tokens WHERE token = ?', [token]);
      } while (exists);

      const id = await run(
        `INSERT INTO test_tokens (test_id, token, max_attempts, expires_at, created_by) VALUES (?, ?, ?, ?, ?)`,
        [testId, token, max_attempts, expires_at, req.user.id]
      );
      tokens.push({ id, token, max_attempts, expires_at });
    }

    return R.success(res, tokens, `${count} token(s) generated`);
  } catch (err) { next(err); }
};

exports.toggleToken = async (req, res, next) => {
  try {
    const { tokenId } = req.params;
    const token = await get(`SELECT is_active FROM test_tokens WHERE id = ?`, [tokenId]);
    if (!token) return R.notFound(res, 'Token not found');
    
    await run(`UPDATE test_tokens SET is_active = ? WHERE id = ?`, [token.is_active ? 0 : 1, tokenId]);
    return R.success(res, { is_active: !token.is_active }, 'Token status updated');
  } catch (err) { next(err); }
};
