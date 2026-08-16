'use strict';
/**
 * User Controller – FUD Portal
 * Admin CRUD for users; student self-update.
 */
const { validationResult } = require('express-validator');
const UserModel    = require('../models/User');
const StudentModel = require('../models/Student');
const AdminModel   = require('../models/Admin');
const { logActivity } = require('../database/db');
const R = require('../utils/response');

// ─── List Users (Admin) ───────────────────────────────────────────────────────
exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, role, search, is_active } = req.query;
    const activeFilter = is_active === '' || is_active === undefined ? null
      : is_active === '1' || is_active === 'true';
    const result = await UserModel.list({ page: +page, limit: +limit, role, search, is_active: activeFilter });
    return R.paginated(res, result, 'Users fetched');
  } catch (err) { next(err); }
};

// ─── Get Single User ───────────────────────────────────────────────────────────
exports.getOne = async (req, res, next) => {
  try {
    const targetId = +req.params.id;

    // SECURITY: Allow only self-access or admin/superadmin/staff
    const isSelf  = req.user.id === targetId;
    const isAdmin = ['admin', 'superadmin', 'staff'].includes(req.user.role);
    if (!isSelf && !isAdmin) {
      return R.forbidden(res, 'Access denied');
    }

    const user = await UserModel.findWithProfile(targetId);
    if (!user) return R.notFound(res, 'User not found');
    return R.success(res, user);
  } catch (err) { next(err); }
};

// ─── Update Profile (Self or Admin) ──────────────────────────────────────────
exports.updateProfile = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return R.validationError(res, errors.array());

    const targetId = +req.params.id;

    // Non-admins can only edit themselves
    if (!['admin','superadmin'].includes(req.user.role) && req.user.id !== targetId) {
      return R.forbidden(res, 'You can only update your own profile');
    }

    const user = await UserModel.findById(targetId);
    if (!user) return R.notFound(res, 'User not found');

    if (user.role === 'student') {
      const student = await StudentModel.findByUserId(targetId);
      if (student) await StudentModel.update(student.id, req.body);
    } else {
      const admin = await AdminModel.findByUserId(targetId);
      if (admin) await AdminModel.update(admin.id, req.body);
    }

    await logActivity({
      userId: req.user.id, action: 'UPDATE_PROFILE', entityType: 'user',
      entityId: targetId, ipAddress: req.ip,
    });

    const updated = await UserModel.findWithProfile(targetId);
    return R.success(res, updated, 'Profile updated');
  } catch (err) { next(err); }
};

// ─── Toggle Active (Admin) ────────────────────────────────────────────────────
exports.toggleActive = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await UserModel.findById(+id);
    if (!user) return R.notFound(res, 'User not found');
    if (user.role === 'superadmin') return R.forbidden(res, 'Cannot deactivate superadmin');

    await UserModel.setActive(+id, !user.is_active);
    await logActivity({
      userId: req.user.id, action: user.is_active ? 'DEACTIVATE_USER' : 'ACTIVATE_USER',
      entityType: 'user', entityId: +id, ipAddress: req.ip,
    });
    return R.success(res, { is_active: !user.is_active }, `User ${user.is_active ? 'deactivated' : 'activated'}`);
  } catch (err) { next(err); }
};

// ─── Delete User (Superadmin) ─────────────────────────────────────────────────
exports.deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await UserModel.findById(+id);
    if (!user) return R.notFound(res, 'User not found');
    if (user.role === 'superadmin') return R.forbidden(res, 'Cannot delete superadmin');

    await UserModel.delete(+id);
    await logActivity({
      userId: req.user.id, action: 'DELETE_USER', entityType: 'user',
      entityId: +id, description: `Deleted user: ${user.email}`, ipAddress: req.ip,
    });
    return R.success(res, {}, 'User deleted');
  } catch (err) { next(err); }
};

// ─── List Students (Admin) ────────────────────────────────────────────────────
exports.listStudents = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, department, faculty, level, search } = req.query;
    const result = await StudentModel.list({ page: +page, limit: +limit, department, faculty, level, search });
    return R.paginated(res, result, 'Students fetched');
  } catch (err) { next(err); }
};

// ─── Student Stats ────────────────────────────────────────────────────────────
exports.studentStats = async (req, res, next) => {
  try {
    const stats = await StudentModel.getStats();
    return R.success(res, stats, 'Student statistics');
  } catch (err) { next(err); }
};

// ─── Activity Log (self) ───────────────────────────────────────────────
exports.getActivity = async (req, res, next) => {
  try {
    const limit = Math.min(+req.query.limit || 15, 50);
    const logs  = await UserModel.getActivity(req.user.id, { limit });
    return R.success(res, { rows: logs, total: logs.length }, 'Activity fetched');
  } catch (err) { next(err); }
};
