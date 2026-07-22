'use strict';
/**
 * Email Routes – FUD Portal
 *
 * GET    /api/email/stats               Queue stats (admin)
 * GET    /api/email/queue               List queue (admin)
 * GET    /api/email/queue/:id           Get single job (admin)
 * POST   /api/email/send               Send bulk email (admin)
 * POST   /api/email/send-one           Send single email (admin)
 * POST   /api/email/retry/:id          Retry failed job (admin)
 * POST   /api/email/retry-all          Retry all failed (admin)
 * POST   /api/email/process-queue      Manually flush queue (admin)
 * DELETE /api/email/purge              Purge old sent emails (superadmin)
 * GET    /api/email/preview/:type      Preview HTML template (admin)
 */
const router  = require('express').Router();
const ctrl    = require('../controllers/emailController');
const protect = require('../middleware/authMiddleware');
const role    = require('../middleware/roleMiddleware');

router.use(protect);

// Stats + queue inspection
router.get ('/stats',              role('admin','superadmin','staff'),  ctrl.stats);
router.get ('/queue',              role('admin','superadmin','staff'),  ctrl.listQueue);
router.get ('/queue/:id',          role('admin','superadmin','staff'),  ctrl.getJob);

// Template preview
router.get ('/preview/:type',      role('admin','superadmin'),          ctrl.previewTemplate);

// Send actions
router.post('/send',               role('admin','superadmin'),          ctrl.sendBulk);
router.post('/send-one',           role('admin','superadmin'),          ctrl.sendOne);
router.post('/process-queue',      role('admin','superadmin'),          ctrl.processQueue);

// Retry
router.post('/retry-all',          role('admin','superadmin'),          ctrl.retryAll);
router.post('/retry/:id',          role('admin','superadmin'),          ctrl.retryOne);

// Housekeeping
router.delete('/purge',            role('superadmin'),                  ctrl.purgeSent);

module.exports = router;
