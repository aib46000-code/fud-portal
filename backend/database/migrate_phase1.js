const path = require('path');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const projectRoot = path.resolve(__dirname, '../..');
const DB_PATH = process.env.DB_PATH
  ? (path.isAbsolute(process.env.DB_PATH) ? process.env.DB_PATH : path.resolve(projectRoot, process.env.DB_PATH))
  : path.resolve(__dirname, 'fud_portal.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  console.log("Starting Phase 1 Migration...");
  
  // 1. Create subjects table
  db.run(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // 2. Create question_bank table
  db.run(`
    CREATE TABLE IF NOT EXISTS question_bank (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL DEFAULT 'mcq' CHECK(question_type IN ('mcq','true_false','short_answer','multi_select')),
      option_a TEXT, option_b TEXT, option_c TEXT, option_d TEXT,
      correct_answer TEXT NOT NULL,
      image_url TEXT,
      explanation TEXT,
      difficulty TEXT DEFAULT 'medium',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    )
  `);

  // 3. Alter tests table
  const testCols = [
    "ALTER TABLE tests ADD COLUMN display_limit INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE tests ADD COLUMN randomize INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE tests ADD COLUMN negative_marking REAL NOT NULL DEFAULT 0;",
    "ALTER TABLE tests ADD COLUMN bank_subject_id INTEGER;"
  ];
  for (const query of testCols) {
    db.run(query, (err) => {
      if (err && !err.message.includes('duplicate column name')) console.error(err.message);
    });
  }

  // 4. Alter results table
  db.run("ALTER TABLE results ADD COLUMN assigned_questions TEXT;", (err) => {
    if (err && !err.message.includes('duplicate column name')) console.error(err.message);
  });
  
  // 5. Alter questions table (for existing tests that want images)
  db.run("ALTER TABLE questions ADD COLUMN image_url TEXT;", (err) => {
    if (err && !err.message.includes('duplicate column name')) console.error(err.message);
  });
  db.run("ALTER TABLE questions ADD COLUMN explanation TEXT;", (err) => {
    if (err && !err.message.includes('duplicate column name')) console.error(err.message);
  });

  console.log("Phase 1 Migration completed (safe errors ignored).");
});
