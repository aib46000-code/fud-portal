'use strict';
/**
 * ╔════════════════════════════════════════════════════════════════╗
 * ║  Auth Controller – FUD Portal – Ahmaditech School            ║
 * ║                                                              ║
 * ║  Features:                                                   ║
 * ║    • Student Register (with matric validation)               ║
 * ║    • Admin Register   (with staff_id validation)             ║
 * ║    • Student Login / Admin Login (unified endpoint)          ║
 * ║    • Logout (revoke refresh token)                           ║
 * ║    • Refresh Token (rotation strategy)                       ║
 * ║    • Get Me (current user + profile)                         ║
 * ║    • Change Password (with current password verify)          ║
 * ║    • Forgot Password (generate secure token)                 ║
 * ║    • Reset Password (validate token, set new password)       ║
 * ║    • Force Change Password (admin flags user)                ║
 * ║    • Verify Email                                             ║
 * ║    • Brute-force lockout (5 bad attempts = 30 min lock)      ║
 * ╚════════════════════════════════════════════════════════════════╝
 */

const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const { validationResult } = require('express-validator');

const UserModel              = require('../models/User');
const StudentModel           = require('../models/Student');
const AdminModel             = require('../models/Admin');
const { TokenModel,
        PasswordResetModel } = require('../models/Token');
const NotificationModel      = require('../models/Notification');
const jwtHelper              = require('../utils/jwtHelper');
const { logActivity }        = require('../database/db');
const R                      = require('../utils/response');
const logger                 = require('../utils/logger');
const emailService           = require('../services/emailService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = () => parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

/** Generate a cryptographically secure random token (hex) */
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Check if account is currently locked */
function isLocked(user) {
  if (!user.locked_until) return false;
  return new Date(user.locked_until) > new Date();
}

/** Build token pair and store refresh token */
async function issueTokenPair(user, req) {
  const payload      = { id: user.id, email: user.email, role: user.role };
  const accessToken  = jwtHelper.signAccess(payload);
  const refreshToken = jwtHelper.signRefresh(payload);

  await TokenModel.store({
    user_id:     user.id,
    raw_token:   refreshToken,
    token_type:  'refresh',
    expires_at:  jwtHelper.expiresAt(process.env.JWT_REFRESH_EXPIRES_IN || '30d'),
    device_info: req.get('User-Agent'),
    ip_address:  req.ip,
  });

  return { accessToken, refreshToken };
}

// ══════════════════════════════════════════════════════════════════════════════
//  REGISTER – STUDENT
// ══════════════════════════════════════════════════════════════════════════════
exports.registerStudent = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('[Auth] Validation failed on student register:', JSON.stringify(errors.array()));
      return R.validationError(res, errors.array());
    }

    const {
      email, password, full_name,
      matric_no, department, faculty,
      level = '100', gender = 'male',
      phone, date_of_birth, state_of_origin, address,
    } = req.body;

    // ── Uniqueness checks ───────────────────────────────────────────────────
    if (await UserModel.emailExists(email)) {
      return R.error(res, 'Email address is already registered', 409);
    }
    if (await StudentModel.matricNoExists(matric_no)) {
      return R.error(res, 'Matric number is already registered', 409);
    }

    // ── Create user account ──────────────────────────────────────────────────
    const verifyToken        = generateToken(24);
    const verifyTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS());
    const userId = await UserModel.create({
      email, password_hash, role: 'student',
      is_verified: 0, verify_token: verifyToken, verify_token_expires: verifyTokenExpires,
    });

    // ── Create student profile ───────────────────────────────────────────────
    await StudentModel.create({
      user_id: userId, matric_no, full_name, department, faculty,
      level, gender, phone, date_of_birth, state_of_origin, address,
    });

    // ── Welcome notification ────────────────────────────────────────────────
    await NotificationModel.create({
      user_id: userId,
      title:   '🎉 Welcome to FUD Portal!',
      message: `Hello ${full_name}! Your student account has been created. Please verify your email.`,
      type:    'success',
    });

    await logActivity({
      userId, action: 'STUDENT_REGISTER', entityType: 'user', entityId: userId,
      description: `Student registered: ${email} | Matric: ${matric_no}`,
      ipAddress: req.ip, userAgent: req.get('User-Agent'),
    });

    logger.info(`[Auth] Student registered: ${email} (${matric_no})`);

    // Send welcome email (non-blocking)
    emailService.sendWelcomeEmail({
      to: email, full_name, matric_no, role: 'student',
      loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:5000'}/index.html`,
    }).catch(e => logger.warn('[Email] Welcome email queue failed:', e.message));

    // SECURITY: Never return verify_token in response — sent via email only
    return R.created(res, {
      id:       userId,
      email,
      role:     'student',
      matric_no,
      full_name,
    }, 'Student registration successful. Please verify your email.');
  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  REGISTER – ADMIN / STAFF
// ══════════════════════════════════════════════════════════════════════════════
exports.registerAdmin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return R.validationError(res, errors.array());

    // Only superadmin can create other admins
    if (req.user.role !== 'superadmin') {
      return R.forbidden(res, 'Only superadmin can register admin accounts');
    }

    const { email, password, full_name, staff_id, department, phone, role = 'admin' } = req.body;

    if (!['admin','staff'].includes(role)) {
      return R.error(res, 'role must be admin or staff', 400);
    }
    if (await UserModel.emailExists(email)) {
      return R.error(res, 'Email address is already registered', 409);
    }
    if (await AdminModel.staffIdExists(staff_id)) {
      return R.error(res, 'Staff ID is already registered', 409);
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS());
    const userId = await UserModel.create({
      email, password_hash, role, is_verified: 1, // Admins verified by default
    });

    await AdminModel.create({
      user_id: userId, full_name, staff_id, department, phone,
      permissions: '["dashboard","users","tests","results","notifications"]',
      is_super: 0,
    });

    await NotificationModel.create({
      user_id: userId,
      title:   '👋 Admin Account Created',
      message: `Your ${role} account has been created by a superadmin.`,
      type:    'info',
    });

    await logActivity({
      userId: req.user.id, action: 'ADMIN_REGISTER', entityType: 'user', entityId: userId,
      description: `${role} registered: ${email} | Staff ID: ${staff_id}`,
      ipAddress: req.ip, userAgent: req.get('User-Agent'),
    });

    logger.info(`[Auth] Admin registered by superadmin: ${email}`);

    // Send welcome email for admin (non-blocking)
    emailService.sendWelcomeEmail({
      to: email, full_name, role,
      loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:5000'}/index.html`,
    }).catch(e => logger.warn('[Email] Admin welcome email failed:', e.message));

    return R.created(res, { id: userId, email, role, staff_id, full_name },
      `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully`);
  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  LOGIN  (unified for all roles)
// ══════════════════════════════════════════════════════════════════════════════
exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return R.validationError(res, errors.array());

    const { email, password } = req.body;

    // ── Fetch user ──────────────────────────────────────────────────────────
    const user = await UserModel.findByEmail(email);

    const match = user
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!user) {
      return R.unauthorized(res, 'Invalid email or password');
    }

    // ── Check account status ────────────────────────────────────────────────
    if (!user.is_active) {
      return R.unauthorized(res, 'Your account has been deactivated. Please contact the administrator.');
    }

    // ── Brute-force lockout check ───────────────────────────────────────────
    if (isLocked(user)) {
      const unlockAt = new Date(user.locked_until);
      const minutesLeft = Math.ceil((unlockAt - Date.now()) / 60000);
      await logActivity({
        userId: user.id, action: 'LOGIN_LOCKED', entityType: 'user', entityId: user.id,
        description: `Login blocked – account locked for ${minutesLeft} more minutes`,
        ipAddress: req.ip, status: 'failure',
      });
      return R.error(res,
        `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`,
        423
      );
    } else if (user.locked_until) {
      // Lock has expired, automatically unlock the account
      await UserModel.resetFailedAttempts(user.id);
      user.failed_attempts = 0;
      user.locked_until = null;
    }

    // ── Verify password ─────────────────────────────────────────────────────
    // match already computed above
    if (!match) {
      await UserModel.recordFailedLogin(user.id);
      const updated = await UserModel.findById(user.id);
      const attemptsLeft = Math.max(0, 5 - (updated?.failed_attempts || 0));

      await logActivity({
        userId: user.id, action: 'LOGIN_FAILED', entityType: 'user', entityId: user.id,
        description: `Wrong password. ${attemptsLeft} attempts remaining.`,
        ipAddress: req.ip, status: 'failure',
      });

      const msg = attemptsLeft > 0
        ? `Invalid email or password. ${attemptsLeft} attempt(s) remaining before lockout.`
        : 'Account locked for 5 minutes due to too many failed attempts.';
      return R.unauthorized(res, msg);
    }

    // ── Issue tokens ────────────────────────────────────────────────────────
    const { accessToken, refreshToken } = await issueTokenPair(user, req);

    await UserModel.recordLogin(user.id);
    await logActivity({
      userId: user.id, action: 'LOGIN', entityType: 'user', entityId: user.id,
      description: `Successful login (${user.role})`,
      ipAddress: req.ip, userAgent: req.get('User-Agent'),
    });

    // ── Build response ──────────────────────────────────────────────────────
    const profile = await UserModel.findWithProfile(user.id);
    logger.info(`[Auth] Login: ${email} (${user.role})`);

    const responseData = { accessToken, refreshToken, user: profile };

    // Warn client if password change is forced
    if (user.force_password_change) {
      responseData.force_password_change = true;
      responseData.message = 'You must change your password before continuing.';
    }

    return R.success(res, responseData, 'Login successful');
  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN LOGIN  (separate endpoint – only allows admin/superadmin/staff)
// ══════════════════════════════════════════════════════════════════════════════
exports.adminLogin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return R.validationError(res, errors.array());

    const { email, password } = req.body;

    const user = await UserModel.findByEmail(email);

    if (!user) {
      return R.unauthorized(res, 'Invalid credentials');
    }

    if (!['admin','superadmin','staff'].includes(user.role)) {
      return R.forbidden(res, 'This login is for administrators only');
    }

    if (!user.is_active) {
      return R.unauthorized(res, 'Account is deactivated. Contact ICT support.');
    }

    // SECURITY (VULN-11): Apply same brute-force lockout as regular login
    if (isLocked(user)) {
      const unlockAt    = new Date(user.locked_until);
      const minutesLeft = Math.ceil((unlockAt - Date.now()) / 60000);
      await logActivity({
        userId: user.id, action: 'ADMIN_LOGIN_LOCKED', entityType: 'user', entityId: user.id,
        description: `Admin login blocked – account locked for ${minutesLeft} more minutes`,
        ipAddress: req.ip, status: 'failure',
      });
      return R.error(res,
        `Account temporarily locked. Try again in ${minutesLeft} minute(s).`, 423);
    } else if (user.locked_until) {
      await UserModel.resetFailedAttempts(user.id);
      user.failed_attempts = 0;
      user.locked_until = null;
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      await UserModel.recordFailedLogin(user.id);
      const updated = await UserModel.findById(user.id);
      const attemptsLeft = Math.max(0, 5 - (updated?.failed_attempts || 0));

      await logActivity({
        userId: user.id, action: 'ADMIN_LOGIN_FAILED', entityType: 'user',
        entityId: user.id, ipAddress: req.ip, status: 'failure',
        description: `Wrong admin password. ${attemptsLeft} attempts remaining.`
      });

      const msg = attemptsLeft > 0
        ? `Invalid credentials. ${attemptsLeft} attempt(s) remaining before lockout.`
        : 'Account locked for 5 minutes due to too many failed attempts.';
      return R.unauthorized(res, msg);
    }

    const { accessToken, refreshToken } = await issueTokenPair(user, req);
    await UserModel.recordLogin(user.id);

    await logActivity({
      userId: user.id, action: 'ADMIN_LOGIN', entityType: 'user', entityId: user.id,
      description: `Admin login (${user.role})`, ipAddress: req.ip,
    });

    const profile = await UserModel.findWithProfile(user.id);
    logger.info(`[Auth] Admin login: ${email}`);

    return R.success(res, {
      accessToken, refreshToken, user: profile,
      ...(user.force_password_change && { force_password_change: true }),
    }, 'Admin login successful');
  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  LOGOUT
// ══════════════════════════════════════════════════════════════════════════════
exports.logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await TokenModel.revoke(refreshToken);
    }

    await logActivity({
      userId: req.user.id, action: 'LOGOUT', entityType: 'user',
      entityId: req.user.id, ipAddress: req.ip,
    });

    logger.info(`[Auth] Logout: ${req.user.email}`);
    return R.success(res, {}, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  REFRESH TOKEN  (token rotation)
// ══════════════════════════════════════════════════════════════════════════════
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return R.unauthorized(res, 'Refresh token is required');

    // 1. Verify JWT signature and expiry
    let decoded;
    try {
      decoded = jwtHelper.verifyRefresh(refreshToken);
    } catch (e) {
      const msg = e.name === 'TokenExpiredError'
        ? 'Refresh token has expired. Please login again.'
        : 'Invalid refresh token.';
      return R.unauthorized(res, msg);
    }

    // 2. Verify token exists in DB and is not revoked
    const stored = await TokenModel.findByRawToken(refreshToken, 'refresh');
    if (!stored) {
      // Potential token reuse – revoke ALL tokens for this user (security)
      await TokenModel.revokeAllForUser(decoded.id);
      await logActivity({
        userId: decoded.id, action: 'TOKEN_REUSE_DETECTED', entityType: 'user',
        entityId: decoded.id, ipAddress: req.ip, status: 'warning',
        description: 'Possible refresh token reuse – all sessions revoked',
      });
      return R.unauthorized(res, 'Security alert: Token reuse detected. Please login again.');
    }

    // 3. Verify user still active
    const user = await UserModel.findById(decoded.id);
    if (!user || !user.is_active) {
      await TokenModel.revoke(refreshToken);
      return R.unauthorized(res, 'User account is no longer active');
    }

    // 4. Rotate – revoke old, issue new pair
    await TokenModel.revoke(refreshToken);

    const payload     = { id: user.id, email: user.email, role: user.role };
    const accessToken = jwtHelper.signAccess(payload);
    const newRefresh  = jwtHelper.signRefresh(payload);

    await TokenModel.store({
      user_id:    user.id,
      raw_token:  newRefresh,
      token_type: 'refresh',
      expires_at: jwtHelper.expiresAt(process.env.JWT_REFRESH_EXPIRES_IN || '30d'),
      ip_address: req.ip,
      device_info: req.get('User-Agent'),
    });

    return R.success(res, { accessToken, refreshToken: newRefresh }, 'Token refreshed successfully');
  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  GET ME  (current authenticated user)
// ══════════════════════════════════════════════════════════════════════════════
exports.getMe = async (req, res, next) => {
  try {
    const user = await UserModel.findWithProfile(req.user.id);
    if (!user) return R.notFound(res, 'User not found');
    return R.success(res, user, 'Profile fetched');
  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  CHANGE PASSWORD  (authenticated user – knows current password)
// ══════════════════════════════════════════════════════════════════════════════
exports.changePassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return R.validationError(res, errors.array());

    const { current_password, new_password } = req.body;

    // Reject if new = current (before hashing)
    if (current_password === new_password) {
      return R.error(res, 'New password must be different from current password', 400);
    }

    const user = await UserModel.findByEmail(req.user.email);
    if (!user) return R.notFound(res, 'User not found');

    // Verify current password
    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match) {
      await logActivity({
        userId: req.user.id, action: 'CHANGE_PASSWORD_FAILED', status: 'failure',
        entityType: 'user', entityId: req.user.id, ipAddress: req.ip,
        description: 'Wrong current password provided',
      });
      return R.error(res, 'Current password is incorrect', 400);
    }

    const hash = await bcrypt.hash(new_password, BCRYPT_ROUNDS());
    await UserModel.updatePassword(req.user.id, hash);

    // Revoke ALL active sessions (force re-login everywhere)
    await TokenModel.revokeAllForUser(req.user.id);

    await NotificationModel.create({
      user_id: req.user.id,
      title:   '🔐 Password Changed',
      message: 'Your password was changed successfully. All other sessions have been logged out.',
      type:    'success',
    });

    await logActivity({
      userId: req.user.id, action: 'CHANGE_PASSWORD', entityType: 'user',
      entityId: req.user.id, ipAddress: req.ip, description: 'Password changed by user',
    });

    logger.info(`[Auth] Password changed: ${req.user.email}`);

    // Send security notification email (non-blocking)
    const userWithProfile = await UserModel.findWithProfile(req.user.id).catch(() => null);
    const displayName     = userWithProfile?.profile?.full_name || req.user.email;
    emailService.sendPasswordChangedEmail({
      to: req.user.email, full_name: displayName,
      changed_at: new Date().toISOString(), ip_address: req.ip,
    }).catch(e => logger.warn('[Email] Password changed email failed:', e.message));

    return R.success(res, {}, 'Password changed successfully. Please login again.');
  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  FORGOT PASSWORD  (generate & return reset token)
// ══════════════════════════════════════════════════════════════════════════════
exports.forgotPassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return R.validationError(res, errors.array());

    const { email } = req.body;

    // Always return success even if email not found (prevent user enumeration)
    const user = await UserModel.findByEmail(email);
    if (!user) {
      logger.warn(`[Auth] Forgot password: unknown email ${email}`);
      return R.success(res, {},
        'If that email is registered, a reset link has been sent.'
      );
    }

    if (!user.is_active) {
      return R.success(res, {}, 'If that email is registered, a reset link has been sent.');
    }

    // Generate a secure token
    const rawToken  = generateToken(32);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await PasswordResetModel.create({
      user_id:    user.id,
      token:      rawToken,
      expires_at: expiresAt,
      ip_address: req.ip,
    });

    await NotificationModel.create({
      user_id: user.id,
      title:   '🔑 Password Reset Requested',
      message: 'A password reset token has been generated for your account. It expires in 1 hour.',
      type:    'warning',
    });

    await logActivity({
      userId: user.id, action: 'FORGOT_PASSWORD', entityType: 'user', entityId: user.id,
      description: 'Password reset token generated', ipAddress: req.ip,
    });

    logger.info(`[Auth] Forgot password token generated for: ${email}`);

    // Fetch user profile for name
    const profile = await UserModel.findWithProfile(user.id).catch(() => null);
    const fullName = profile?.profile?.full_name || email.split('@')[0];
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5000'}/reset-password.html?token=${rawToken}`;

    // Send password reset email (non-blocking)
    emailService.sendPasswordResetEmail({
      to: email, full_name: fullName,
      resetUrl, expiresInMinutes: 60,
    }).catch(e => logger.warn('[Email] Password reset email failed:', e.message));

    // SECURITY (VULN-03): Never return reset token in API response — email only
    return R.success(res, {},
      'If that email is registered, a password reset link has been sent.');
  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  RESET PASSWORD  (use token from forgot-password)
// ══════════════════════════════════════════════════════════════════════════════
exports.resetPassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return R.validationError(res, errors.array());

    const { token, new_password } = req.body;

    // 1. Validate the reset token
    const resetRecord = await PasswordResetModel.findByToken(token);
    if (!resetRecord) {
      return R.error(res, 'Reset token is invalid or has expired. Please request a new one.', 400);
    }

    // 2. Fetch the user – use findByEmail path to get password_hash
    const userBasic = await UserModel.findById(resetRecord.user_id);
    if (!userBasic || !userBasic.is_active) {
      return R.error(res, 'User account is not available', 400);
    }
    // findByEmail returns full row including password_hash
    const user = await UserModel.findByEmail(userBasic.email);

    // 3. Prevent reuse of current password
    const isSame = await bcrypt.compare(new_password, user.password_hash);
    if (isSame) {
      return R.error(res, 'New password must be different from your current password', 400);
    }

    // 4. Hash and update password
    const hash = await bcrypt.hash(new_password, BCRYPT_ROUNDS());
    await UserModel.updatePassword(user.id, hash);

    // 5. Mark reset token as used
    await PasswordResetModel.markUsed(resetRecord.id);

    // 6. Revoke all active sessions
    await TokenModel.revokeAllForUser(user.id);

    await NotificationModel.create({
      user_id: user.id,
      title:   '✅ Password Reset Successful',
      message: 'Your password has been reset. All previous sessions have been terminated.',
      type:    'success',
    });

    await logActivity({
      userId: user.id, action: 'RESET_PASSWORD', entityType: 'user', entityId: user.id,
      description: 'Password reset via token', ipAddress: req.ip,
    });

    logger.info(`[Auth] Password reset for user ID: ${user.id}`);
    return R.success(res, {}, 'Password reset successful. Please login with your new password.');
  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  FORCE CHANGE PASSWORD  (admin forces a user to change on next login)
// ══════════════════════════════════════════════════════════════════════════════
exports.forceChangePassword = async (req, res, next) => {
  try {
    const targetId = +req.params.id;

    // Must be admin or superadmin
    if (!['admin','superadmin'].includes(req.user.role)) {
      return R.forbidden(res, 'Only admins can force a password change');
    }

    const user = await UserModel.findById(targetId);
    if (!user) return R.notFound(res, 'User not found');

    // Superadmin cannot be force-changed by non-superadmin
    if (user.role === 'superadmin' && req.user.role !== 'superadmin') {
      return R.forbidden(res, 'Cannot force password change on superadmin');
    }

    await UserModel.setForcePasswordChange(targetId, true);

    // Revoke all sessions so user must log in fresh and see the prompt
    await TokenModel.revokeAllForUser(targetId);

    await NotificationModel.create({
      user_id: targetId,
      title:   '⚠️ Password Change Required',
      message: 'An administrator requires you to change your password on next login.',
      type:    'warning',
    });

    await logActivity({
      userId: req.user.id, action: 'FORCE_PASSWORD_CHANGE', entityType: 'user',
      entityId: targetId,
      description: `Force password change set for user ID ${targetId} by ${req.user.email}`,
      ipAddress: req.ip,
    });

    logger.info(`[Auth] Force password change set for user ${targetId} by ${req.user.email}`);
    return R.success(res, { user_id: targetId, force_password_change: true },
      'User will be required to change password on next login.');
  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  VERIFY EMAIL
// ══════════════════════════════════════════════════════════════════════════════
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!token) return R.error(res, 'Verification token is required', 400);

    const user = await UserModel.findByVerifyToken(token);
    if (!user) {
      return R.error(res, 'Verification link is invalid or has expired. Please request a new one.', 400);
    }

    if (user.is_verified) {
      return R.success(res, {}, 'Email is already verified.');
    }

    await UserModel.verify(user.id);

    await NotificationModel.create({
      user_id: user.id,
      title:   '✅ Email Verified',
      message: 'Your email address has been verified successfully. Welcome to FUD Portal!',
      type:    'success',
    });

    await logActivity({
      userId: user.id, action: 'EMAIL_VERIFIED', entityType: 'user',
      entityId: user.id, ipAddress: req.ip,
    });

    logger.info(`[Auth] Email verified for user ID: ${user.id}`);
    return R.success(res, { email: user.email, is_verified: true }, 'Email verified successfully.');
  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  RESEND VERIFICATION EMAIL
// ══════════════════════════════════════════════════════════════════════════════
exports.resendVerification = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return R.validationError(res, errors.array());

    const { email } = req.body;
    const user = await UserModel.findByEmail(email);

    // Always success to avoid user enumeration
    if (!user || user.is_verified) {
      return R.success(res, {}, 'If a pending account exists, a new verification link has been sent.');
    }

    const verifyToken        = generateToken(24);
    const verifyTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await UserModel.setVerifyToken(user.id, verifyToken, verifyTokenExpires);

    await logActivity({
      userId: user.id, action: 'RESEND_VERIFICATION', entityType: 'user',
      entityId: user.id, ipAddress: req.ip,
    });

    // SECURITY (VULN-04): Never expose tokens in API response
    return R.success(res, {}, 'New verification token generated. Check your email.');
  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
//  LOGOUT ALL DEVICES
// ══════════════════════════════════════════════════════════════════════════════
exports.logoutAll = async (req, res, next) => {
  try {
    const result = await TokenModel.revokeAllForUser(req.user.id);

    await logActivity({
      userId: req.user.id, action: 'LOGOUT_ALL', entityType: 'user',
      entityId: req.user.id, ipAddress: req.ip,
      description: 'All sessions revoked by user',
    });

    logger.info(`[Auth] All sessions revoked for: ${req.user.email}`);
    return R.success(res, { sessions_revoked: result.changes }, 'All sessions logged out successfully.');
  } catch (err) {
    next(err);
  }
};
