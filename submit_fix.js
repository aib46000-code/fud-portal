const fs = require('fs');

let code = fs.readFileSync('backend/controllers/testController.js', 'utf8');

const searchStr = `    let score = 0;
    for (const q of questions) {
      const given   = String(finalAnswers[q.id] || '').trim().toUpperCase();
      const correct = String(q.correct_answer).trim().toUpperCase();
      if (given === correct) {
        score += q.marks || 1;
      } else if (given && test.negative_marking > 0) {
        score -= test.negative_marking;
      }
    }
    score = Math.max(0, score); // Prevent negative total score

    const percentage = test.total_marks > 0 ? (score / test.total_marks) * 100 : 0;
    const passed     = percentage >= test.pass_mark;
    const grade      = assignGrade(percentage);

    await ResultModel.submit(session.id, {
      score, percentage: +percentage.toFixed(2), grade, passed,
      answers: JSON.stringify(finalAnswers), time_spent_secs,
    });`;

const replaceStr = `    let score = 0;
    const { run } = require('../database/db');
    
    for (const q of questions) {
      const given = String(finalAnswers[q.id] || '').trim();
      
      if (q.question_type === 'essay' || q.question_type === 'practical') {
         // Handle essay and practical in Phase 5
         if (given) {
           if (q.question_type === 'essay') {
              const wordCount = given.split(/\\s+/).filter(w => w.length > 0).length;
              await run(\`INSERT INTO essay_answers (result_id, question_id, answer_text, word_count, char_count) VALUES (?, ?, ?, ?, ?)\`, [session.id, q.id, given, wordCount, given.length]);
           } else {
              await run(\`INSERT INTO practical_submissions (result_id, question_id, file_url, file_type) VALUES (?, ?, ?, 'application/octet-stream')\`, [session.id, q.id, given]);
           }
         }
         // Score handled manually later for essay/practical
         await run(\`UPDATE questions SET times_used = times_used + 1 WHERE id = ?\`, [q.id]);
         continue;
      }

      // Objective marking
      const givenMCQ = given.toUpperCase();
      const correctMCQ = String(q.correct_answer).trim().toUpperCase();
      if (givenMCQ === correctMCQ) {
        score += q.marks || 1;
        await run(\`UPDATE questions SET times_used = times_used + 1, times_correct = times_correct + 1 WHERE id = ?\`, [q.id]);
      } else {
        if (givenMCQ && test.negative_marking > 0) {
          score -= test.negative_marking;
        }
        await run(\`UPDATE questions SET times_used = times_used + 1, times_wrong = times_wrong + 1 WHERE id = ?\`, [q.id]);
      }
    }
    score = Math.max(0, score); // Prevent negative total score

    const percentage = test.total_marks > 0 ? (score / test.total_marks) * 100 : 0;
    const passed     = percentage >= test.pass_mark;
    const grade      = assignGrade(percentage);

    await ResultModel.submit(session.id, {
      score, percentage: +percentage.toFixed(2), grade, passed,
      answers: JSON.stringify(finalAnswers), time_spent_secs,
    });
    
    // Phase 5 additions:
    await run(\`INSERT INTO exam_attempts (test_id, student_id, attempt_number, score, percentage, passed, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)\`,
      [testId, student.id, session.attempt_number || 1, score, +percentage.toFixed(2), passed, new Date().toISOString()]);
      
    await run(\`UPDATE exam_sessions SET status = 'completed', last_active_at = ? WHERE test_id = ? AND student_id = ? AND status != 'completed'\`, [new Date().toISOString(), testId, student.id]);
    `;

if(code.includes(searchStr)) {
  code = code.replace(searchStr, replaceStr);
  fs.writeFileSync('backend/controllers/testController.js', code);
  console.log('Fixed submitResult successfully');
} else {
  console.log('Could not find search string in submitResult');
}
