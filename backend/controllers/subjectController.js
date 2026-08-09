'use strict';

const { run, get, all: dbAll } = require('../database/db');
const R = require('../utils/response');
const logger = require('../utils/logger');
const xlsx = require('xlsx');
const { logActivity } = require('../database/db');

exports.listSubjects = async (req, res, next) => {
  try {
    const subjects = await dbAll('SELECT * FROM subjects ORDER BY name ASC');
    return R.success(res, subjects);
  } catch(e) { next(e); }
};

exports.createSubject = async (req, res, next) => {
  try {
    const { name, code, description } = req.body;
    if(!name || !code) return R.error(res, 'Name and code are required', 400);
    
    const existing = await get('SELECT id FROM subjects WHERE name=? OR code=?', [name, code]);
    if(existing) return R.error(res, 'Subject with this name or code already exists', 409);
    
    const r = await run('INSERT INTO subjects (name, code, description) VALUES (?, ?, ?)', [name, code, description||'']);
    const newSubj = await get('SELECT * FROM subjects WHERE id=?', [r.lastID]);
    
    await logActivity({ userId: req.user.id, action: 'CREATE_SUBJECT', entityType: 'subject', entityId: r.lastID, description: `Created subject ${name}`, ipAddress: req.ip });
    return R.created(res, newSubj, 'Subject created');
  } catch(e) { next(e); }
};

exports.deleteSubject = async (req, res, next) => {
  try {
    const id = +req.params.id;
    const subj = await get('SELECT id FROM subjects WHERE id=?', [id]);
    if(!subj) return R.notFound(res, 'Subject not found');
    await run('DELETE FROM subjects WHERE id=?', [id]);
    return R.success(res, null, 'Subject deleted');
  } catch(e) { next(e); }
};

exports.listQuestionBank = async (req, res, next) => {
  try {
    const { subjectId } = req.params;
    const questions = await dbAll('SELECT * FROM question_bank WHERE subject_id = ? ORDER BY id DESC', [subjectId]);
    return R.success(res, questions);
  } catch(e) { next(e); }
};

exports.deleteBankQuestion = async (req, res, next) => {
  try {
    await run('DELETE FROM question_bank WHERE id=?', [+req.params.qid]);
    return R.success(res, null, 'Question deleted');
  } catch(e) { next(e); }
};

exports.importQuestions = async (req, res, next) => {
  console.log("========== [C] START CONTROLLER ==========");
  try {
    const { subjectId } = req.params;
    console.log("========== [D] AFTER REQ.FILE CHECK ==========");
    if(!req.file) {
      console.error("NO FILE UPLOADED IN REQ");
      return R.error(res, 'No file uploaded', 400);
    }
    
    const subject = await get('SELECT id FROM subjects WHERE id=?', [subjectId]);
    if(!subject) return R.error(res, 'Subject not found', 404);
    
    console.log("Parsing XLSX...");
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    console.log("========== [E] AFTER XLSX PARSE ==========");
    console.log(`Parsed ${rows.length} rows`);
    
    let imported = 0, duplicate = 0, invalid = 0;
    const errors = [];
    
    console.log("========== [F] BEFORE DB INSERT ==========");
    await run('BEGIN TRANSACTION');
    try {
      const existingQs = await dbAll('SELECT question_text FROM question_bank WHERE subject_id=?', [subjectId]);
      const existingSet = new Set(existingQs.map(q => String(q.question_text).trim().toLowerCase()));
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const qText = String(row.question_text || row.Question || row.question || '').trim();
        const correct = String(row.correct_answer || row.Correct || row.Answer || '').trim();
        
        if (!qText || !correct) {
          invalid++;
          errors.push(`Row ${i+2}: Missing question text or correct answer`);
          continue;
        }
        
        if (existingSet.has(qText.toLowerCase())) {
          duplicate++;
          errors.push(`Row ${i+2}: Duplicate question text`);
          continue;
        }
        
        const qType = String(row.question_type || row.Type || 'mcq').trim().toLowerCase();
        const optA = String(row.option_a || row.A || '');
        const optB = String(row.option_b || row.B || '');
        const optC = String(row.option_c || row.C || '');
        const optD = String(row.option_d || row.D || '');
        const image = String(row.image_url || row.Image || '');
        const explanation = String(row.explanation || row.Explanation || '');
        const diff = String(row.difficulty || row.Difficulty || 'medium');
        
        await run(`
          INSERT INTO question_bank 
          (subject_id, question_text, question_type, option_a, option_b, option_c, option_d, correct_answer, image_url, explanation, difficulty)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [subjectId, qText, qType, optA, optB, optC, optD, correct, image, explanation, diff]);
        
        existingSet.add(qText.toLowerCase());
        imported++;
      }
      
      await run('COMMIT');
      console.log("========== [G] AFTER DB INSERT ==========");
    } catch(err) {
      await run('ROLLBACK');
      console.error("========== [H] DB INSERT ERROR ==========");
      console.error("MESSAGE:", err.message);
      console.error("CODE:", err.code);
      console.error("STACK:", err.stack);
      return R.error(res, 'Database error during import. Transaction rolled back.', 500);
    }
    
    try {
      await logActivity({ userId: req.user.id, action: 'IMPORT_QUESTIONS', entityType: 'subject', entityId: subjectId, description: `Imported ${imported} questions`, ipAddress: req.ip });
    } catch(err) {
      console.error("========== [K] POST-INSERT ERROR ==========");
      console.error("MESSAGE:", err.message);
      console.error("CODE:", err.code);
      console.error("STACK:", err.stack);
      throw err;
    }
    
    console.log("========== [I] BEFORE SUCCESS RESPONSE ==========");
    const payload = {
      success: true,
      message: 'Import completed',
      data: {
        total_rows: rows.length,
        imported_rows: imported,
        skipped_rows: duplicate + invalid,
        duplicate_rows: duplicate,
        invalid_rows: invalid,
        error_messages: errors.slice(0, 50)
      }
    };
    console.log("STATUS: 200");
    console.log("PAYLOAD:", payload);
    
    res.status(200).json(payload);
    console.log("========== [J] SUCCESS RESPONSE SENT ==========");
    return;
  } catch(e) {
    console.error("========== [H] CONTROLLER TOP-LEVEL ERROR ==========");
    console.error("MESSAGE:", e.message);
    console.error("STACK:", e.stack);
    next(e);
  }
};

// -- ADD MANUAL QUESTION ------------------------------------------------------
exports.addBankQuestion = async (req, res, next) => {
  try {
    const subjectId = +req.params.subjectId;
    const { question_text, question_type = 'mcq', options, correct_answer } = req.body;
    
    if (!question_text || !options || !correct_answer) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const { run } = require('../database/db');
    const result = await run(`
      INSERT INTO question_bank (subject_id, question_text, question_type, option_a, option_b, option_c, option_d, correct_answer)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [subjectId, question_text, question_type, options.A || '', options.B || '', options.C || '', options.D || '', correct_answer]);
    
    return res.status(201).json({ success: true, message: 'Question added', data: { id: result.lastID } });
  } catch (err) { next(err); }
};
