'use strict';
/**
 * Subject & Question Bank Routes — FUD Portal
 * Require admin/superadmin role
 */
const router = require('express').Router();
const ctrl = require('../controllers/subjectController');
const protect = require('../middleware/authMiddleware');
const role = require('../middleware/roleMiddleware');
const multer = require('multer');

// Configure multer for memory storage (file parsed directly without writing to disk)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Protect all routes
router.use(protect);
router.use(role('admin', 'superadmin', 'staff'));

// Subjects
router.get('/', ctrl.listSubjects);
router.post('/', ctrl.createSubject);
router.delete('/:id', role('admin', 'superadmin'), ctrl.deleteSubject);

// Question Bank for a specific subject
router.get('/:subjectId/questions', ctrl.listQuestionBank);
router.delete('/questions/:qid', ctrl.deleteBankQuestion);

// CSV/Excel Import
router.post('/:subjectId/import', upload.single('file'), ctrl.importQuestions);

module.exports = router;
