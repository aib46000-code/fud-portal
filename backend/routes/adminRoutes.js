'use strict';
/**
 * Admin Routes – FUD Portal
 * All routes require: authenticated + admin/superadmin role
 *
 * GET    /api/admin/stats
 *
 * Students
 * GET    /api/admin/students
 * POST   /api/admin/students
 * PUT    /api/admin/students/:id
 * DELETE /api/admin/students/:id
 * PATCH  /api/admin/students/:id/block
 * PATCH  /api/admin/students/:id/unblock
 * PATCH  /api/admin/students/:id/force-password
 *
 * Admins
 * GET    /api/admin/admins
 * POST   /api/admin/admins
 * PUT    /api/admin/admins/:id
 * DELETE /api/admin/admins/:id
 * PATCH  /api/admin/admins/:id/force-password
 *
 * Activity Logs
 * GET    /api/admin/activity
 *
 * Permissions
 * GET    /api/admin/permissions
 * PUT    /api/admin/permissions
 *
 * Exports
 * GET    /api/admin/export/students
 * GET    /api/admin/export/admins
 * GET    /api/admin/export/activity
 * GET    /api/admin/backup
 */
const router  = require('express').Router();
const ctrl    = require('../controllers/adminController');
const protect = require('../middleware/authMiddleware');
const role    = require('../middleware/roleMiddleware');

// All admin routes require login + admin/superadmin/staff
router.use(protect);
router.use(role('admin', 'superadmin', 'staff'));

// ── Dashboard Stats ──────────────────────────────────────────────────────────
router.get('/stats', ctrl.stats);

// ── Students ─────────────────────────────────────────────────────────────────
router.get ('/students',                      ctrl.listStudents);
router.post('/students',                      ctrl.createStudent);
router.put ('/students/:id',                  ctrl.updateStudent);
router.delete('/students/:id',  role('admin','superadmin'), ctrl.deleteStudent);
router.patch('/students/:id/block',           ctrl.blockStudent);
router.patch('/students/:id/unblock',         ctrl.unblockStudent);
router.patch('/students/:id/force-password',  ctrl.forcePasswordChange);

// ── Admins ───────────────────────────────────────────────────────────────────
router.get   ('/admins',                      ctrl.listAdmins);
router.post  ('/admins',        role('superadmin'), ctrl.createAdmin);
router.put   ('/admins/:id',    role('superadmin'), ctrl.updateAdmin);
router.delete('/admins/:id',    role('superadmin'), ctrl.deleteAdmin);
router.patch ('/admins/:id/force-password', role('superadmin'), ctrl.forcePasswordChange);

// ── Activity Logs ─────────────────────────────────────────────────────────────
router.get('/activity', ctrl.activityLogs);

// ── Role Permissions ──────────────────────────────────────────────────────────
router.get('/permissions',                    ctrl.getPermissions);
router.put('/permissions', role('superadmin'), ctrl.updatePermissions);

// ── CSV Exports ──────────────────────────────────────────────────────────────
router.get('/export/students',                ctrl.exportStudentsCSV);
router.get('/export/admins',  role('admin','superadmin'), ctrl.exportAdminsCSV);
router.get('/export/activity',                ctrl.exportActivityCSV);

// ── Database Backup ───────────────────────────────────────────────────────────
router.get('/backup', role('superadmin'),     ctrl.downloadBackup);

module.exports = router;
