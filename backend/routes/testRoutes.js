'use strict';
/**
 * Test Routes – FUD Portal CBT System
 *
 * Tests (Admin CRUD)
 * GET    /api/tests
 * POST   /api/tests
 * GET    /api/tests/stats
 * GET    /api/tests/my-results            (student)
 * GET    /api/tests/:id
 * PUT    /api/tests/:id
 * DELETE /api/tests/:id
 * PATCH  /api/tests/:id/publish
 * PATCH  /api/tests/:id/unpublish
 *
 * Questions (Admin)
 * GET    /api/tests/:id/questions
 * POST   /api/tests/:id/questions
 * POST   /api/tests/:id/questions/bulk
 * PUT    /api/tests/:id/questions/:qid
 * DELETE /api/tests/:id/questions/:qid
 *
 * CBT Session (Student)
 * POST   /api/tests/:id/start
 * POST   /api/tests/:id/save-progress
 * POST   /api/tests/:id/submit
 *
 * Results
 * GET    /api/tests/:id/results           (admin)
 * GET    /api/tests/:id/results/stats     (admin)
 * GET    /api/tests/results/:resultId     (student/admin)
 * GET    /api/tests/results/:resultId/review
 */
const router  = require('express').Router();
const ctrl    = require('../controllers/testController');
const tokenCtrl = require('../controllers/tokenController');
const protect = require('../middleware/authMiddleware');
const role    = require('../middleware/roleMiddleware');
const { validateTest } = require('../utils/validators');

router.use(protect);

// ─── Tests ───────────────────────────────────────────────────────────────────
router.get ('/',                                             ctrl.listTests);
router.post('/', role('admin','superadmin','staff'),         validateTest, ctrl.createTest);
router.get ('/stats', role('admin','superadmin','staff'),    ctrl.testStats);
router.get ('/stats/dashboard', role('admin','superadmin'),  ctrl.getDashboardAnalytics);
router.get ('/my-results',                                   ctrl.myResults);

// ─── Result detail BEFORE /:id routes to avoid conflict ──────────────────────
router.get ('/results/:resultId',                            ctrl.getResult);
router.get ('/results/:resultId/review',                     ctrl.reviewResult);
router.get ('/results/:resultId/pdf',                        ctrl.exportResultPDF);

// ─── Single test ──────────────────────────────────────────────────────────────
router.get ('/:id',                                          ctrl.getTest);
router.put ('/:id', role('admin','superadmin','staff'),      ctrl.updateTest);
router.delete('/:id', role('admin','superadmin'),            ctrl.deleteTest);
router.patch('/:id/publish',  role('admin','superadmin'),    ctrl.publishTest);
router.patch('/:id/unpublish',role('admin','superadmin'),    ctrl.unpublishTest);
router.get ('/:id/live-monitor', role('admin','superadmin'), ctrl.getLiveMonitor);

// ─── Tokens ───────────────────────────────────────────────────────────────────
router.get ('/:id/tokens', role('admin','superadmin'),       tokenCtrl.listTokens);
router.post('/:id/tokens', role('admin','superadmin'),       tokenCtrl.generateToken);
router.patch('/tokens/:tokenId/toggle', role('admin','superadmin'), tokenCtrl.toggleToken);

// ── Questions ─────────────────────────────────────────────────────
router.get ('/:id/questions',                                ctrl.listQuestions);
router.post('/:id/questions',       role('admin','superadmin','staff'), ctrl.addQuestion);
router.post('/:id/questions/bulk',  role('admin','superadmin','staff'), ctrl.bulkAddQuestions);
router.put ('/:id/questions/:qid',  role('admin','superadmin','staff'), ctrl.updateQuestion);
router.delete('/:id/questions/:qid',role('admin','superadmin'),         ctrl.deleteQuestion);

// ── CBT Session (Student) ─────────────────────────────────────────
router.post('/:id/start',           ctrl.startTest);
router.post('/:id/save-progress',   ctrl.saveProgress);
router.post('/:id/submit',          ctrl.submitResult);

// ── Results (Admin) ───────────────────────────────────────────────
router.get ('/:id/results',       role('admin','superadmin','staff'), ctrl.listResults);
router.get ('/:id/results/stats', role('admin','superadmin'),         ctrl.testResultStats);

module.exports = router;
