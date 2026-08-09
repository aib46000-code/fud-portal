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
router.post('/:subjectId/questions', role('admin','superadmin','staff'), ctrl.addBankQuestion);
router.delete('/questions/:qid', ctrl.deleteBankQuestion);

// CSV/Excel Import
router.post(
  '/:subjectId/import',
  (req, res, next) => {
    console.log("========== [A] BEFORE MULTER ==========");
    console.log("SUBJECT_ID:", req.params.subjectId);
    console.log("CONTENT-TYPE:", req.headers["content-type"]);
    console.log("CONTENT-LENGTH:", req.headers["content-length"]);
    next();
  },
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      console.log("========== [B] AFTER MULTER ==========");
      if (err) {
        console.error("MULTER ERROR NAME:", err.name);
        console.error("MULTER ERROR MESSAGE:", err.message);
        console.error("MULTER ERROR CODE:", err.code);
        console.error("MULTER ERROR STACK:", err.stack);
        return next(err);
      }
      console.log("REQ.FILE PRESENT:", !!req.file);
      if (req.file) {
        console.log("FILE NAME:", req.file.originalname);
        console.log("FILE MIME:", req.file.mimetype);
        console.log("FILE SIZE:", req.file.size);
      }
      console.log("REQ.BODY:", req.body);
      next();
    });
  },
  ctrl.importQuestions
);

module.exports = router;
