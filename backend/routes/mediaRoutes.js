'use strict';
/**
 * Media Routes – FUD Portal
 *
 * POST   /api/media/upload          Upload a file (auth)
 * GET    /api/media/stats           Media stats
 * GET    /api/media                 List files
 * GET    /api/media/:id             Get single file
 * PATCH  /api/media/:id/visibility  Toggle public/private (owner or admin)
 * DELETE /api/media/bulk            Bulk delete (admin)
 * DELETE /api/media/:id             Delete single file (owner or admin)
 */
const router  = require('express').Router();
const ctrl    = require('../controllers/mediaController');
const protect = require('../middleware/authMiddleware');
const role    = require('../middleware/roleMiddleware');
const { upload } = require('../middleware/uploadMiddleware');
const { uploadLimiter } = require('../middleware/rateLimiter');

// All media routes require auth
router.use(protect);

// Multer error → friendly JSON
function multerErrorHandler(err, req, res, next) {
  if (err && (err.code === 'LIMIT_FILE_SIZE' || err.code === 'FILE_TOO_LARGE' || err.code === 'INVALID_TYPE' || err.code === 'INVALID_EXT' || err.name === 'MulterError')) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'File exceeds maximum allowed size (200 MB hard limit)'
      : err.message;
    return res.status(413).json({ success: false, message: msg });
  }
  next(err);
}

// ── Upload (admin/staff only) ────────────────────────────────────
router.post('/upload',
  role('admin','superadmin','staff'),
  uploadLimiter,
  (req, res, next) => {
    upload.single('file')(req, res, err => {
      if (err) return multerErrorHandler(err, req, res, next);
      next();
    });
  },
  ctrl.upload
);

// ── Stats (admin only) ────────────────────────────────────────────
router.get('/stats', role('admin','superadmin','staff'), ctrl.stats);

// ── Bulk delete (admin only) ──────────────────────────────────────
router.delete('/bulk', role('admin','superadmin'), ctrl.bulkDelete);

// ── List all ─────────────────────────────────────────────────────
router.get('/', ctrl.list);

// ── Single file ───────────────────────────────────────────────────
router.get   ('/:id', ctrl.getOne);
router.patch ('/:id/visibility', ctrl.toggleVisibility);
router.delete('/:id', ctrl.delete);

module.exports = router;
