const fs = require('fs');

let code = fs.readFileSync('backend/controllers/testController.js', 'utf8');

const targetStr = `
    // Check for existing active session (resume)
    let session = await ResultModel.findActiveSession(testId, student.id);
    let isResume = false;

    if (session) {`;

const replaceStr = `
    let questions = [];
    const dbAll = require('../database/db').all;
    const dbRun = require('../database/db').run;

    // Check for existing active session (resume)
    let session = await ResultModel.findActiveSession(testId, student.id);
    let isResume = false;

    if (session) {
      // Load assigned questions for resume
      if (session.assigned_questions) {
         try {
            const assignedIds = JSON.parse(session.assigned_questions);
            if (assignedIds && assignedIds.length > 0) {
              const placeholders = assignedIds.map(() => '?').join(',');
              questions = await dbAll(\`SELECT * FROM questions WHERE id IN (\${placeholders})\`, assignedIds);
            }
         } catch(e) {}
      }
      if (!questions.length) {
         questions = await dbAll(\`SELECT * FROM questions WHERE test_id = ?\`, [testId]);
      }`;
      
code = code.replace(targetStr, replaceStr);

const targetStr2 = `
      // Phase 5: Randomization & Pools
      let questions = [];
      const dbAll = require('../database/db').all;
      const dbRun = require('../database/db').run;`;

const replaceStr2 = `
      // Phase 5: Randomization & Pools`;
      
code = code.replace(targetStr2, replaceStr2);

fs.writeFileSync('backend/controllers/testController.js', code);
console.log('Fixed questions scoping issue in startTest');
