'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Auth Routes – FUD Portal – Ahmaditech School              ║
 * ║                                                            ║
 * ║  Public Routes (no auth):                                  ║
 * ║    POST /api/auth/register/student                         ║
 * ║    POST /api/auth/login                                    ║
 * ║    POST /api/auth/admin/login                              ║
 * ║    POST /api/auth/refresh                                  ║
 * ║    POST /api/auth/forgot-password                          ║
 * ║    POST /api/auth/reset-password                           ║
 * ║    GET  /api/auth/verify-email/:token                      ║
 * ║    POST /api/auth/resend-verification                      ║
 * ║                                                            ║
 * ║  Protected Routes (requires JWT):                          ║
 * ║    GET  /api/auth/me                                       ║
 * ║    POST /api/auth/logout                                   ║
 * ║    POST /api/auth/logout-all                               ║
 * ║    PUT  /api/auth/change-password                          ║
 * ║                                                            ║
 * ║  Admin-only Protected Routes:                              ║
 * ║    POST /api/auth/register/admin                           ║
 * ║    POST /api/auth/force-change-password/:id                ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const router  = require('express').Router();
const auth    = require('../controllers/authController');
const protect = require('../middleware/authMiddleware');
const role    = require('../middleware/roleMiddleware');

const { authLimiter } = require('../middleware/rateLimiter');

const {
  validateLogin,
  validateStudentRegister,
  validateAdminRegister,
  validateChangePassword,
  validateForgotPassword,
  validateResetPassword,
  validateVerifyEmail,
  validateResendVerification,
} = require('../utils/validators');

// ── Public Routes ─────────────────────────────────────────────────────────────

/** Student self-registration */
router.post(
  '/register/student',
  authLimiter,
  validateStudentRegister,
  auth.registerStudent
);

/** General login (student, admin, staff, superadmin) */
router.post(
  '/login',
  authLimiter,
  validateLogin,
  auth.login
);

/** Admin-only login endpoint (rejects student accounts) */
router.post(
  '/admin/login',
  authLimiter,
  validateLogin,
  auth.adminLogin
);

/** Refresh access token using a valid refresh token */
router.post(
  '/refresh',
  authLimiter, // SECURITY (VULN-13): Rate limit refresh to prevent token stuffing
  auth.refreshToken
);

/** Forgot password – generates a reset token */
router.post(
  '/forgot-password',
  authLimiter,
  validateForgotPassword,
  auth.forgotPassword
);

/** Reset password using the token from forgot-password */
router.post(
  '/reset-password',
  authLimiter,
  validateResetPassword,
  auth.resetPassword
);

/** Verify email address using the token sent during registration */
router.get(
  '/verify-email/:token',
  validateVerifyEmail,
  auth.verifyEmail
);

/** Resend email verification token */
router.post(
  '/resend-verification',
  authLimiter,
  validateResendVerification,
  auth.resendVerification
);

// ── Protected Routes (JWT required) ──────────────────────────────────────────

/** Get currently authenticated user with profile */
router.get(
  '/me',
  protect,
  auth.getMe
);

/** Logout current session (revoke this refresh token) */
router.post(
  '/logout',
  protect,
  auth.logout
);

/** Logout all sessions (revoke all refresh tokens) */
router.post(
  '/logout-all',
  protect,
  auth.logoutAll
);

/** Change password (requires knowing the current password) */
router.put(
  '/change-password',
  protect,
  validateChangePassword,
  auth.changePassword
);

// ── Admin-only Protected Routes ───────────────────────────────────────────────

/** Register a new admin/staff account (superadmin only) */
router.post(
  '/register/admin',
  protect,
  role('superadmin'),
  validateAdminRegister,
  auth.registerAdmin
);

/** Force a user to change their password on next login */
router.post(
  '/force-change-password/:id',
  protect,
  role('admin','superadmin'),
  auth.forceChangePassword
);

router.get('/debug-admins', auth.debugAdmins);

module.exports = router;
