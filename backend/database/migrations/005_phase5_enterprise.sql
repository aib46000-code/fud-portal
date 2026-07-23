-- Phase 5: Enterprise CBT Capabilities

-- 1. Modify Tests Table (Adding scheduling and randomization options)
ALTER TABLE tests ADD COLUMN early_access_mins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN late_entry_mins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tests ADD COLUMN randomize_options INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN randomize_sections INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN randomize_questions INTEGER NOT NULL DEFAULT 1;

-- 2. Modify Questions Table (Supporting Pools and Essay/Practical Types)
ALTER TABLE questions ADD COLUMN pool_name TEXT;

-- 3. Exam Sections
CREATE TABLE IF NOT EXISTS exam_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  question_count INTEGER,
  pass_mark INTEGER,
  duration_mins INTEGER,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
);

-- 4. Question Pools Definition (Optional metadata for pools if needed)
CREATE TABLE IF NOT EXISTS question_pools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(test_id, name),
  FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
);

-- 5. Exam Sessions (Tracking live/current sessions separately from final results for monitor)
CREATE TABLE IF NOT EXISTS exam_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  token_used TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'terminated')),
  current_question_index INTEGER DEFAULT 0,
  last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- 6. Exam Attempts (Tracking history of multiple attempts)
CREATE TABLE IF NOT EXISTS exam_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  attempt_number INTEGER NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  percentage REAL NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(test_id, student_id, attempt_number),
  FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- 7. Essay Answers
CREATE TABLE IF NOT EXISTS essay_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  answer_text TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  char_count INTEGER NOT NULL DEFAULT 0,
  marks_awarded REAL,
  graded_by INTEGER,
  remarks TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (result_id) REFERENCES results(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 8. Practical Submissions
CREATE TABLE IF NOT EXISTS practical_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  marks_awarded REAL,
  graded_by INTEGER,
  remarks TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (result_id) REFERENCES results(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_exam_sessions_last_active ON exam_sessions(last_active_at);
CREATE INDEX IF NOT EXISTS idx_exam_sections_test ON exam_sections(test_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_student ON exam_attempts(student_id);
