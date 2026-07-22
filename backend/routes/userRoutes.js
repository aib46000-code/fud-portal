'use strict';
/**
 * User Routes – FUD Portal
 * GET    /api/users           (admin)
 * GET    /api/users/students  (admin)
 * GET    /api/users/students/stats (admin)
 * GET    /api/users/:id
 * PUT    /api/users/:id
 * PATCH  /api/users/:id/active (admin)
 * DELETE /api/users/:id        (superadmin)
 */
const router  = require('express').Router();
const ctrl    = require('../controllers/userController');
const protect = require('../middleware/authMiddleware');
const role    = require('../middleware/roleMiddleware');

router.use(protect);

router.get ('/activity',           ctrl.getActivity);
router.get ('/',                   role('admin','superadmin','staff'),  ctrl.list);
router.get ('/students',           role('admin','superadmin','staff'),  ctrl.listStudents);
router.get ('/students/stats',     role('admin','superadmin'),          ctrl.studentStats);
router.get ('/:id',                                                     ctrl.getOne);
router.put ('/:id',                                                     ctrl.updateProfile);
router.patch('/:id/active',        role('admin','superadmin'),          ctrl.toggleActive);
router.delete('/:id',              role('superadmin'),                  ctrl.deleteUser);

module.exports = router;

