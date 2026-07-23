-- Phase 4: Final Analytics, Tokens, and Management

-- Add token requirement to tests
ALTER TABLE tests ADD COLUMN token_required INTEGER NOT NULL DEFAULT 0;

-- Add question statistics
ALTER TABLE questions ADD COLUMN times_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE questions ADD COLUMN times_correct INTEGER NOT NULL DEFAULT 0;
ALTER TABLE questions ADD COLUMN times_wrong INTEGER NOT NULL DEFAULT 0;

-- Exam Tokens table
CREATE TABLE IF NOT EXISTS test_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  used_attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_results_test_student ON results(test_id, student_id);
CREATE INDEX IF NOT EXISTS idx_questions_test ON questions(test_id);
CREATE INDEX IF NOT EXISTS idx_test_tokens_token ON test_tokens(token);
