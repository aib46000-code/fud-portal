'use strict';
/**
 * Validation Rules – FUD Portal
 * Full validators for all auth and API inputs.
 */
const { body, param, query } = require('express-validator');

// ─── Shared Field Rules ──────────────────────────────────────────────────────

const emailRule = body('email')
  .trim()
  .notEmpty().withMessage('Email is required')
  .isEmail().withMessage('Please provide a valid email address')
  .normalizeEmail()
  .isLength({ max: 254 }).withMessage('Email is too long');

const passwordRule = body('password')
  .notEmpty().withMessage('Password is required')
  .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
  .isLength({ max: 128 }).withMessage('Password must not exceed 128 characters')
  .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
  .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
  .matches(/\d/).withMessage('Password must contain at least one number')
  .matches(/[!@#$%^&*(),.?":{}|<>_\-+=/\\[\];'`~]/)
  .withMessage('Password must contain at least one special character');

const newPasswordRule = body('new_password')
  .notEmpty().withMessage('New password is required')
  .isLength({ min: 8 }).withMessage('New password must be at least 8 characters long')
  .isLength({ max: 128 }).withMessage('New password must not exceed 128 characters')
  .matches(/[A-Z]/).withMessage('New password must contain at least one uppercase letter')
  .matches(/[a-z]/).withMessage('New password must contain at least one lowercase letter')
  .matches(/\d/).withMessage('New password must contain at least one number')
  .matches(/[!@#$%^&*(),.?":{}|<>_\-+=/\\[\];'`~]/)
  .withMessage('New password must contain at least one special character');

const fullNameRule = body('full_name')
  .trim()
  .notEmpty().withMessage('Full name is required')
  .isLength({ min: 2, max: 100 }).withMessage('Full name must be between 2 and 100 characters')
  .matches(/^[a-zA-Z\s'-]+$/).withMessage('Full name may only contain letters, spaces, hyphens, and apostrophes');

// ─── Auth Validators ─────────────────────────────────────────────────────────

/**
 * Student Login / General Login
 */
const validateLogin = [
  emailRule,
  body('password')
    .notEmpty().withMessage('Password is required'),
];

/**
 * Student Registration
 */
const validateStudentRegister = [
  emailRule,
  passwordRule,
  fullNameRule,

  body('matric_no')
    .trim()
    .notEmpty().withMessage('Matric number is required')
    .isLength({ max: 30 }).withMessage('Matric number must not exceed 30 characters')
    .matches(/^[a-zA-Z0-9\/\-]+$/).withMessage('Matric number contains invalid characters'),

  body('department')
    .trim()
    .notEmpty().withMessage('Department is required')
    .isLength({ max: 100 }).withMessage('Department name is too long'),

  body('faculty')
    .trim()
    .notEmpty().withMessage('Faculty is required')
    .isLength({ max: 100 }).withMessage('Faculty name is too long'),

  body('level')
    .optional()
    .isIn(['100','200','300','400','500','600','PG'])
    .withMessage('Level must be one of: 100, 200, 300, 400, 500, 600, PG'),

  body('gender')
    .optional()
    .isIn(['male','female','other'])
    .withMessage('Gender must be one of: male, female, other'),

  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[+0-9\s\-()]{7,20}$/).withMessage('Please provide a valid phone number'),

  body('date_of_birth')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('Date of birth must be in YYYY-MM-DD format')
    .custom((val) => {
      const dob  = new Date(val);
      const now  = new Date();
      const age  = (now - dob) / (365.25 * 24 * 60 * 60 * 1000);
      if (age < 14 || age > 80) throw new Error('Date of birth is not realistic for a student');
      return true;
    }),
];

/**
 * Admin / Staff Registration (requires auth – superadmin only)
 */
const validateAdminRegister = [
  emailRule,
  passwordRule,
  fullNameRule,

  body('staff_id')
    .trim()
    .notEmpty().withMessage('Staff ID is required')
    .isLength({ max: 30 }).withMessage('Staff ID must not exceed 30 characters'),

  body('role')
    .optional()
    .isIn(['admin','staff']).withMessage('Role must be admin or staff'),

  body('department')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Department is too long'),

  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .isMobilePhone().withMessage('Please provide a valid phone number'),
];

/**
 * Change Password (authenticated user)
 */
const validateChangePassword = [
  body('current_password')
    .notEmpty().withMessage('Current password is required'),
  newPasswordRule,
  body('confirm_password')
    .notEmpty().withMessage('Please confirm your new password')
    .custom((val, { req }) => {
      if (val !== req.body.new_password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
  body('new_password').custom((val, { req }) => {
    if (val === req.body.current_password) {
      throw new Error('New password must be different from your current password');
    }
    return true;
  }),
];

/**
 * Forgot Password
 */
const validateForgotPassword = [
  emailRule,
];

/**
 * Reset Password (with token)
 */
const validateResetPassword = [
  body('token')
    .notEmpty().withMessage('Reset token is required')
    .isLength({ min: 32, max: 128 }).withMessage('Invalid reset token format'),
  newPasswordRule,
];

/**
 * Email Verification (token in params)
 */
const validateVerifyEmail = [
  param('token')
    .notEmpty().withMessage('Verification token is required')
    .isLength({ min: 32 }).withMessage('Invalid verification token'),
];

/**
 * Resend Verification
 */
const validateResendVerification = [
  emailRule,
];

// ─── General Validators ──────────────────────────────────────────────────────

const validateRegister = validateStudentRegister; // alias

const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    .toInt(),
];

const validateId = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID must be a positive integer')
    .toInt(),
];

const validateTest = [
  body('title')
    .trim().notEmpty().withMessage('Test title is required')
    .isLength({ max: 255 }).withMessage('Title must not exceed 255 characters'),
  body('subject')
    .optional({ nullable: true }).trim(),
  body('duration_mins')
    .optional({ nullable: true })
    .isInt({ min: 1, max: 480 }).withMessage('Duration must be between 1 and 480 minutes'),
  body('total_marks')
    .optional({ nullable: true })
    .isInt({ min: 0 }).withMessage('Total marks must be non-negative'),
  body('pass_mark')
    .optional({ nullable: true })
    .isInt({ min: 0, max: 100 }).withMessage('Pass mark must be 0–100'),
  body('test_type')
    .optional({ nullable: true })
    .isIn(['mcq','quiz','exam','assignment','practice']).withMessage('Invalid test type'),
  body('semester')
    .optional({ nullable: true }),
];

module.exports = {
  // Auth
  validateLogin,
  validateStudentRegister,
  validateAdminRegister,
  validateRegister,
  validateChangePassword,
  validateForgotPassword,
  validateResetPassword,
  validateVerifyEmail,
  validateResendVerification,
  // General
  validatePagination,
  validateId,
  validateTest,
};
