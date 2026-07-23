const fs = require('fs');

let code = fs.readFileSync('backend/controllers/testController.js', 'utf8');

const searchStr = `      if (!questions.length) {
        // First time starting or parsing failed
        const { all: dbAll, run: dbRun } = require('../database/db');
        let limitClause = test.display_limit > 0 ? \`LIMIT \${test.display_limit}\` : '';
        let orderClause = test.randomize ? 'ORDER BY RANDOM()' : 'ORDER BY id ASC';
        questions = await dbAll(\`SELECT id, question_text, option_a, option_b, option_c, option_d, image_url, explanation FROM question_bank WHERE subject_id = ? \${orderClause} \${limitClause}\`, [test.bank_subject_id]);
        
        // Save assigned questions back to the session
        const assignedIds = questions.map(q => q.id);
        await dbRun(\`UPDATE results SET assigned_questions = ? WHERE id = ?\`, [JSON.stringify(assignedIds), session.id]);
      }
    } else {
      questions = await QuestionModel.findForExam(testId, { randomize: test.randomize === 1 ? true : test.randomize === 0 ? false : true });
    }`;

const replaceStr = `      if (!questions.length) {
        // If pools are enabled, pick one pool
        const pools = await dbAll(\`SELECT DISTINCT pool_name FROM questions WHERE test_id = ? AND pool_name IS NOT NULL AND pool_name != ''\`, [testId]);
        let poolClause = '';
        let queryParams = [testId];
        if (pools.length > 0) {
          const selectedPool = pools[Math.floor(Math.random() * pools.length)].pool_name;
          poolClause = ' AND pool_name = ? ';
          queryParams.push(selectedPool);
        }

        let limitClause = test.display_limit > 0 ? \`LIMIT \${test.display_limit}\` : '';
        let orderClause = test.randomize_questions ? 'ORDER BY RANDOM()' : 'ORDER BY id ASC';
        
        questions = await dbAll(\`SELECT * FROM questions WHERE test_id = ? \${poolClause} \${orderClause} \${limitClause}\`, queryParams);
        
        if (questions.length > 0) {
           const assignedIds = questions.map(q => q.id);
           await dbRun(\`UPDATE results SET assigned_questions = ? WHERE id = ?\`, [JSON.stringify(assignedIds), session.id]);
        }
      }
    }

    // Phase 5: Randomize Options if enabled
    if (test.randomize_options) {
      questions = questions.map(q => {
         if (q.question_type !== 'mcq' && q.question_type !== 'true_false') return q;
         const options = [
           { key: 'A', text: q.option_a },
           { key: 'B', text: q.option_b },
           { key: 'C', text: q.option_c },
           { key: 'D', text: q.option_d }
         ].filter(o => o.text != null && o.text.trim() !== '');
         
         for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
         }
         q.shuffled_options = options;
         return q;
      });
    }`;

code = code.replace(searchStr, replaceStr);

fs.writeFileSync('backend/controllers/testController.js', code);
console.log('Fixed successfully');
