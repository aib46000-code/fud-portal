'use strict';
/**
 * Notification Routes – FUD Portal
 * GET   /api/notifications
 * GET   /api/notifications/unread-count
 * PATCH /api/notifications/mark-all-read
 * PATCH /api/notifications/:id/read
 * DELETE /api/notifications/:id
 * POST  /api/notifications/broadcast  (admin)
 */
const router  = require('express').Router();
const ctrl    = require('../controllers/notificationController');
const protect = require('../middleware/authMiddleware');
const role    = require('../middleware/roleMiddleware');

router.use(protect);

router.get  ('/',                                                    ctrl.list);
router.get  ('/unread-count',                                        ctrl.unreadCount);
router.patch('/mark-all-read',                                       ctrl.markAllRead);
router.post ('/broadcast',    role('admin','superadmin'),            ctrl.broadcast);
router.patch('/:id/read',                                            ctrl.markRead);
router.delete('/:id',                                                ctrl.delete);

module.exports = router;
