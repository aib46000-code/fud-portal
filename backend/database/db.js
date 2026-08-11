'use strict';

/**
 * FUD Portal – Ahmaditech School
 * Database Connection & Configuration (db.js)
 *
 * Uses node sqlite3 driver (async/callback, pre-compiled binaries – no C++ build required).
 * Wraps all operations in Promises for clean async/await usage.
 * Auto-creates all tables, indexes, triggers, and seeds default admin on first run.
 */

const path    = require('path');
const fs      = require('fs');
const sqlite3 = require('sqlite3').verbose();
const logger  = require('../utils/logger');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// ─── Resolve DB Path ──────────────────────────────────────────────────────────
const projectRoot = path.resolve(__dirname, '../..');
const DB_PATH = process.env.DB_PATH
  ? (path.isAbsolute(process.env.DB_PATH)
      ? process.env.DB_PATH
      : path.resolve(projectRoot, process.env.DB_PATH))
  : path.join(__dirname, 'fud_portal.db');

const dbDir = path.dirname(DB_PATH);
let db;

// ─── Pre-Open Diagnostics ─────────────────────────────────────────────────────
console.log(`[Diagnostics] DB_PATH: ${DB_PATH}`);
console.log(`[Diagnostics] DB_DIR: ${dbDir}`);

try {
  console.log(`[Diagnostics] Running as UID: ${process.getuid()}, GID: ${process.getgid()}`);
} catch (_) {
  console.log(`[Diagnostics] UID/GID not available (Windows)`);
}

try {
  const dirExists = fs.existsSync(dbDir);
  console.log(`[Diagnostics] DB_DIR exists: ${dirExists}`);

  if (dirExists) {
    const stat = fs.statSync(dbDir);
    console.log(`[Diagnostics] DB_DIR stat: uid=${stat.uid}, gid=${stat.gid}, mode=${stat.mode.toString(8)}`);

    const contents = fs.readdirSync(dbDir);
    console.log(`[Diagnostics] DB_DIR contents: [${contents.join(', ')}]`);

    // Write test
    const testFile = path.join(dbDir, '.db_write_test');
    try {
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      console.log(`[Diagnostics] DB_DIR writable: true (write test passed)`);
    } catch (wErr) {
      console.error(`[Diagnostics] DB_DIR writable: false (${wErr.code || wErr.message})`);
    }
  }
} catch (diagErr) {
  console.error(`[Diagnostics] Pre-open diagnostics error:`, diagErr.message);
}

// ─── Check Permissions & Open Connection ──────────────────────────────────────
const dbOpenPromise = new Promise((resolve, reject) => {
  try {
    if (!fs.existsSync(dbDir)) {
      console.log(`[Diagnostics] DB Directory not found. Creating: ${dbDir}`);
      fs.mkdirSync(dbDir, { recursive: true });
    }
  } catch (err) {
    console.error(`[Diagnostics] DB directory permission/creation error for ${dbDir}:`, err.stack || err.message);
    reject(err);
    return;
  }

  console.log(`[Diagnostics] Opening SQLite database connection...`);
  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('[Diagnostics] FATAL DB OPEN ERROR:', err.stack || err.message);
      logger.error('[DB] Failed to open database: ' + err.message);
      reject(err);
      return;
    } 
    
    console.log(`[Diagnostics] Database successfully opened at: ${DB_PATH}`);
    logger.info(`[DB] Connected to SQLite at: ${DB_PATH}`);
    resolve(db);
  });
});

// ─── Promise Wrappers ─────────────────────────────────────────────────────────
const run   = (sql, params = []) => new Promise((res, rej) =>
  db.run(sql, params, function (err) { err ? rej(err) : res({ lastID: this.lastID, changes: this.changes }); })
);
const get   = (sql, params = []) => new Promise((res, rej) =>
  db.get(sql, params, (err, row) => err ? rej(err) : res(row))
);
const all   = (sql, params = []) => new Promise((res, rej) =>
  db.all(sql, params, (err, rows) => err ? rej(err) : res(rows))
);
const exec  = (sql) => new Promise((res, rej) =>
  db.exec(sql, (err) => err ? rej(err) : res())
);

// ─── PRAGMA Setup ──────────────────────────────────────────────────────────────
async function applyPragmas() {
  console.log('[Diagnostics] applyPragmas: Setting PRAGMA journal_mode = WAL');
  await run('PRAGMA journal_mode    = WAL');
  console.log('[Diagnostics] applyPragmas: Setting PRAGMA foreign_keys = ON');
  await run('PRAGMA foreign_keys   = ON');
  console.log('[Diagnostics] applyPragmas: Setting PRAGMA busy_timeout = 5000');
  await run('PRAGMA busy_timeout   = 5000');
  console.log('[Diagnostics] applyPragmas: Setting PRAGMA synchronous = NORMAL');
  await run('PRAGMA synchronous    = NORMAL');
  console.log('[Diagnostics] applyPragmas: Setting PRAGMA cache_size = -64000');
  await run('PRAGMA cache_size     = -64000');
  console.log('[Diagnostics] applyPragmas: Setting PRAGMA temp_store = MEMORY');
  await run('PRAGMA temp_store     = MEMORY');
  console.log('[Diagnostics] applyPragmas: Setting PRAGMA mmap_size = 268435456');
  await run('PRAGMA mmap_size      = 268435456');
  console.log('[Diagnostics] applyPragmas: Setting PRAGMA wal_autocheckpoint = 1000');
  await run('PRAGMA wal_autocheckpoint = 1000');
  console.log('[Diagnostics] applyPragmas: Setting PRAGMA optimize');
  await run('PRAGMA optimize');
  console.log('[Diagnostics] applyPragmas: All pragmas applied successfully');
}

// ─── Schema ────────────────────────────────────────────────────────────────────
const SCHEMA_SQL = `
  -- ── users ──────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'student'
                          CHECK(role IN ('superadmin','admin','student','staff')),
    is_active     INTEGER NOT NULL DEFAULT 1,
    is_verified   INTEGER NOT NULL DEFAULT 0,
    last_login    TEXT,
    login_count   INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- ── students ────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS students (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL UNIQUE,
    matric_no       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    full_name       TEXT    NOT NULL,
    department      TEXT    NOT NULL,
    faculty         TEXT    NOT NULL,
    level           TEXT    NOT NULL DEFAULT '100'
                            CHECK(level IN ('100','200','300','400','500','600','PG')),
    gender          TEXT    NOT NULL DEFAULT 'male'
                            CHECK(gender IN ('male','female','other')),
    phone           TEXT,
    date_of_birth   TEXT,
    state_of_origin TEXT,
    address         TEXT,
    avatar_url      TEXT,
    gpa             REAL    NOT NULL DEFAULT 0.00,
    is_graduated    INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
  );

  -- ── admins ──────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS admins (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL UNIQUE,
    full_name   TEXT    NOT NULL,
    staff_id    TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    department  TEXT,
    phone       TEXT,
    avatar_url  TEXT,
    permissions TEXT    NOT NULL DEFAULT '["dashboard"]',
    is_super    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
  );

  -- ── media ───────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS media (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid          TEXT    NOT NULL UNIQUE,
    original_name TEXT    NOT NULL,
    stored_name   TEXT    NOT NULL UNIQUE,
    mime_type     TEXT    NOT NULL,
    size_bytes    INTEGER NOT NULL,
    file_path     TEXT    NOT NULL,
    url           TEXT    NOT NULL,
    category      TEXT    NOT NULL DEFAULT 'general',
    uploaded_by   INTEGER NOT NULL,
    is_public     INTEGER NOT NULL DEFAULT 0,
    visibility    TEXT    NOT NULL DEFAULT 'private' CHECK(visibility IN ('public', 'private', 'faculty', 'department', 'course')),
    faculty       TEXT,
    department    TEXT,
    level         TEXT,
    semester      TEXT,
    course_code   TEXT,
    subject_id    INTEGER,
    approved_by   INTEGER,
    approved_at   TEXT,
    status        TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
  );

  -- ── subjects ─────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS subjects (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    code          TEXT    NOT NULL,
    description   TEXT    NOT NULL DEFAULT '',
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(name),
    UNIQUE(code)
  );

  -- ── question_bank ────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS question_bank (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id     INTEGER NOT NULL,
    question_text  TEXT    NOT NULL,
    question_type  TEXT    NOT NULL DEFAULT 'mcq'
                           CHECK(question_type IN ('mcq','true_false','short_answer','multi_select')),
    option_a       TEXT,
    option_b       TEXT,
    option_c       TEXT,
    option_d       TEXT,
    correct_answer TEXT    NOT NULL,
    explanation    TEXT,
    image_url      TEXT,
    difficulty     TEXT    NOT NULL DEFAULT 'medium' CHECK(difficulty IN ('easy','medium','hard')),
    marks          INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE ON UPDATE CASCADE
  );

  -- ── learning_progress ────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS learning_progress (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id     INTEGER NOT NULL,
    media_id       INTEGER NOT NULL,
    status         TEXT    NOT NULL DEFAULT 'started' CHECK(status IN ('started','completed')),
    progress_pct   INTEGER NOT NULL DEFAULT 0,
    started_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    completed_at   TEXT,
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(student_id, media_id),
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE ON UPDATE CASCADE
  );

  -- ── tests ───────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS tests (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL,
    description   TEXT    NOT NULL DEFAULT '',
    subject       TEXT    NOT NULL DEFAULT '',
    course_code   TEXT    NOT NULL DEFAULT '',
    semester      TEXT    NOT NULL DEFAULT '',
    academic_year TEXT    NOT NULL DEFAULT '',
    test_type     TEXT    NOT NULL DEFAULT 'mcq',
    duration_mins INTEGER NOT NULL DEFAULT 60,
    total_marks   INTEGER NOT NULL DEFAULT 100,
    pass_mark     INTEGER NOT NULL DEFAULT 50,
    instructions  TEXT    NOT NULL DEFAULT '',
    target_level  TEXT    NOT NULL DEFAULT '',
    target_dept   TEXT    NOT NULL DEFAULT '',
    starts_at     TEXT,
    ends_at       TEXT,
    is_active     INTEGER NOT NULL DEFAULT 0,
    is_published  INTEGER NOT NULL DEFAULT 0,
    created_by    INTEGER NOT NULL,
    bank_subject_id INTEGER,
    display_limit INTEGER NOT NULL DEFAULT 0,
    randomize_questions INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (bank_subject_id) REFERENCES subjects(id) ON DELETE SET NULL ON UPDATE CASCADE
  );

  -- ── questions ───────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS questions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id        INTEGER NOT NULL,
    question_text  TEXT    NOT NULL,
    question_type  TEXT    NOT NULL DEFAULT 'mcq'
                           CHECK(question_type IN ('mcq','true_false','short_answer','multi_select')),
    option_a       TEXT,
    option_b       TEXT,
    option_c       TEXT,
    option_d       TEXT,
    correct_answer TEXT    NOT NULL,
    explanation    TEXT,
    marks          INTEGER NOT NULL DEFAULT 1,
    order_index    INTEGER NOT NULL DEFAULT 0,
    is_active      INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE ON UPDATE CASCADE
  );

  -- ── results ─────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS results (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id         INTEGER NOT NULL,
    student_id      INTEGER NOT NULL,
    score           REAL    NOT NULL DEFAULT 0,
    total_marks     INTEGER NOT NULL,
    percentage      REAL    NOT NULL DEFAULT 0,
    grade           TEXT    NOT NULL DEFAULT 'F',
    passed          INTEGER NOT NULL DEFAULT 0,
    answers         TEXT    NOT NULL DEFAULT '{}',
    time_spent_secs INTEGER NOT NULL DEFAULT 0,
    attempt_number  INTEGER NOT NULL DEFAULT 1,
    ip_address      TEXT,
    started_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    submitted_at    TEXT,
    is_graded       INTEGER NOT NULL DEFAULT 0,
    graded_by       INTEGER,
    graded_at       TEXT,
    remarks         TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(test_id, student_id, attempt_number),
    FOREIGN KEY (test_id)    REFERENCES tests(id)    ON DELETE CASCADE  ON UPDATE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE  ON UPDATE CASCADE,
    FOREIGN KEY (graded_by)  REFERENCES users(id)    ON DELETE SET NULL ON UPDATE CASCADE
  );

  -- ── exam_sessions ────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS exam_sessions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id           INTEGER NOT NULL,
    student_id        INTEGER NOT NULL,
    token_used        TEXT,
    status            TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'terminated')),
    last_active_at    TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  );

  -- ── test_tokens ──────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS test_tokens (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id           INTEGER NOT NULL,
    token             TEXT NOT NULL,
    is_active         INTEGER NOT NULL DEFAULT 1,
    used_attempts     INTEGER NOT NULL DEFAULT 0,
    max_attempts      INTEGER NOT NULL DEFAULT 1,
    expires_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
  );

  -- ── exam_attempts ────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS exam_attempts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id           INTEGER NOT NULL,
    student_id        INTEGER NOT NULL,
    attempt_number    INTEGER NOT NULL DEFAULT 1,
    score             REAL NOT NULL DEFAULT 0,
    percentage        REAL NOT NULL DEFAULT 0,
    passed            INTEGER NOT NULL DEFAULT 0,
    completed_at      TEXT NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  );

  -- ── essay_answers ────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS essay_answers (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id         INTEGER NOT NULL,
    question_id       INTEGER NOT NULL,
    answer_text       TEXT NOT NULL,
    word_count        INTEGER NOT NULL DEFAULT 0,
    char_count        INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (result_id) REFERENCES results(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  );

  -- ── practical_submissions ────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS practical_submissions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id         INTEGER NOT NULL,
    question_id       INTEGER NOT NULL,
    file_url          TEXT NOT NULL,
    file_type         TEXT NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (result_id) REFERENCES results(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  );

  -- ── notifications ────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    title      TEXT    NOT NULL,
    message    TEXT    NOT NULL,
    type       TEXT    NOT NULL DEFAULT 'info'
                       CHECK(type IN ('info','success','warning','error','announcement','result','system')),
    link       TEXT,
    is_read    INTEGER NOT NULL DEFAULT 0,
    read_at    TEXT,
    expires_at TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
  );

  -- ── activity_logs ────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS activity_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER,
    action      TEXT    NOT NULL,
    entity_type TEXT,
    entity_id   INTEGER,
    description TEXT,
    metadata    TEXT    DEFAULT '{}',
    ip_address  TEXT,
    user_agent  TEXT,
    status      TEXT    NOT NULL DEFAULT 'success'
                        CHECK(status IN ('success','failure','warning')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
  );

  -- ── password_resets ──────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS password_resets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    token      TEXT    NOT NULL UNIQUE,
    expires_at TEXT    NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    used_at    TEXT,
    ip_address TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
  );

  -- ── tokens ───────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    token_hash  TEXT    NOT NULL UNIQUE,
    token_type  TEXT    NOT NULL DEFAULT 'refresh'
                        CHECK(token_type IN ('refresh','access','verify','reset')),
    device_info TEXT,
    ip_address  TEXT,
    expires_at  TEXT    NOT NULL,
    revoked     INTEGER NOT NULL DEFAULT 0,
    revoked_at  TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
  );

  -- ── email_queue ─────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS email_queue (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    to_address    TEXT    NOT NULL,
    subject       TEXT    NOT NULL,
    html_body     TEXT    NOT NULL DEFAULT '',
    text_body     TEXT    NOT NULL DEFAULT '',
    type          TEXT    NOT NULL DEFAULT 'general',
    priority      INTEGER NOT NULL DEFAULT 5,
    status        TEXT    NOT NULL DEFAULT 'pending'
                          CHECK(status IN ('pending','sending','sent','failed')),
    retry_count   INTEGER NOT NULL DEFAULT 0,
    max_retries   INTEGER NOT NULL DEFAULT 3,
    last_error    TEXT,
    message_id    TEXT,
    meta          TEXT,
    scheduled_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    next_retry_at TEXT,
    sent_at       TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`;

// ─── Indexes ──────────────────────────────────────────────────────────────────
const INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_users_email         ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_role          ON users(role);
  CREATE INDEX IF NOT EXISTS idx_users_is_active     ON users(is_active);
  CREATE INDEX IF NOT EXISTS idx_students_user_id    ON students(user_id);
  CREATE INDEX IF NOT EXISTS idx_students_matric_no  ON students(matric_no);
  CREATE INDEX IF NOT EXISTS idx_students_dept       ON students(department);
  CREATE INDEX IF NOT EXISTS idx_students_level      ON students(level);
  CREATE INDEX IF NOT EXISTS idx_admins_user_id      ON admins(user_id);
  CREATE INDEX IF NOT EXISTS idx_admins_staff_id     ON admins(staff_id);
  CREATE INDEX IF NOT EXISTS idx_media_uuid          ON media(uuid);
  CREATE INDEX IF NOT EXISTS idx_media_uploaded_by   ON media(uploaded_by);
  CREATE INDEX IF NOT EXISTS idx_media_category      ON media(category);
  CREATE INDEX IF NOT EXISTS idx_tests_created_by    ON tests(created_by);
  CREATE INDEX IF NOT EXISTS idx_tests_is_active     ON tests(is_active);
  CREATE INDEX IF NOT EXISTS idx_tests_is_published  ON tests(is_published);
  CREATE INDEX IF NOT EXISTS idx_tests_subject       ON tests(subject);
  CREATE INDEX IF NOT EXISTS idx_questions_test_id   ON questions(test_id);
  CREATE INDEX IF NOT EXISTS idx_questions_order     ON questions(test_id, order_index);
  CREATE INDEX IF NOT EXISTS idx_results_test_id     ON results(test_id);
  CREATE INDEX IF NOT EXISTS idx_results_student_id  ON results(student_id);
  CREATE INDEX IF NOT EXISTS idx_results_grade       ON results(grade);
  CREATE INDEX IF NOT EXISTS idx_notif_user_id       ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_notif_is_read       ON notifications(is_read);
  CREATE INDEX IF NOT EXISTS idx_notif_type          ON notifications(type);
  CREATE INDEX IF NOT EXISTS idx_activity_user_id    ON activity_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_activity_action     ON activity_logs(action);
  CREATE INDEX IF NOT EXISTS idx_pw_reset_user_id    ON password_resets(user_id);
  CREATE INDEX IF NOT EXISTS idx_pw_reset_token      ON password_resets(token);
  CREATE INDEX IF NOT EXISTS idx_tokens_user_id      ON tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_tokens_hash         ON tokens(token_hash);
  CREATE INDEX IF NOT EXISTS idx_tokens_revoked      ON tokens(revoked);
  CREATE INDEX IF NOT EXISTS idx_email_queue_status   ON email_queue(status);
  CREATE INDEX IF NOT EXISTS idx_email_queue_type     ON email_queue(type);
  CREATE INDEX IF NOT EXISTS idx_email_queue_sched    ON email_queue(scheduled_at);
  CREATE INDEX IF NOT EXISTS idx_email_queue_retry    ON email_queue(next_retry_at);
  CREATE INDEX IF NOT EXISTS idx_email_queue_priority ON email_queue(priority, status);
  CREATE INDEX IF NOT EXISTS idx_results_user_test    ON results(student_id, test_id);
  CREATE INDEX IF NOT EXISTS idx_results_submitted    ON results(submitted_at);
`;

// ─── Triggers ─────────────────────────────────────────────────────────────────
const TRIGGERS_SQL = `
  CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
    AFTER UPDATE ON users FOR EACH ROW BEGIN
      UPDATE users SET updated_at = datetime('now') WHERE id = OLD.id;
    END;

  CREATE TRIGGER IF NOT EXISTS trg_students_updated_at
    AFTER UPDATE ON students FOR EACH ROW BEGIN
      UPDATE students SET updated_at = datetime('now') WHERE id = OLD.id;
    END;

  CREATE TRIGGER IF NOT EXISTS trg_admins_updated_at
    AFTER UPDATE ON admins FOR EACH ROW BEGIN
      UPDATE admins SET updated_at = datetime('now') WHERE id = OLD.id;
    END;

  CREATE TRIGGER IF NOT EXISTS trg_tests_updated_at
    AFTER UPDATE ON tests FOR EACH ROW BEGIN
      UPDATE tests SET updated_at = datetime('now') WHERE id = OLD.id;
    END;

  CREATE TRIGGER IF NOT EXISTS trg_questions_updated_at
    AFTER UPDATE ON questions FOR EACH ROW BEGIN
      UPDATE questions SET updated_at = datetime('now') WHERE id = OLD.id;
    END;

  CREATE TRIGGER IF NOT EXISTS trg_email_queue_updated_at
    AFTER UPDATE ON email_queue FOR EACH ROW BEGIN
      UPDATE email_queue SET updated_at = datetime('now') WHERE id = OLD.id;
    END;

  CREATE TRIGGER IF NOT EXISTS trg_notifications_read
    AFTER UPDATE OF read_at ON notifications FOR EACH ROW
    WHEN NEW.read_at IS NOT NULL AND OLD.read_at IS NULL BEGIN
      UPDATE notifications SET is_read = 1 WHERE id = OLD.id;
    END;
`;

// ─── Column-Level Migrations (safe ALTER TABLE ADD COLUMN) ───────────────────
const COLUMN_MIGRATIONS = [
  // Auth: force password change flag
  { table: 'users', column: 'force_password_change', sql: `ALTER TABLE users ADD COLUMN force_password_change INTEGER NOT NULL DEFAULT 0` },
  // Auth: failed login attempts counter (brute-force lockout)
  { table: 'users', column: 'failed_attempts',       sql: `ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0` },
  // Auth: account lock until this timestamp
  { table: 'users', column: 'locked_until',          sql: `ALTER TABLE users ADD COLUMN locked_until TEXT` },
  // Auth: email verification token
  { table: 'users', column: 'verify_token',          sql: `ALTER TABLE users ADD COLUMN verify_token TEXT` },
  { table: 'users', column: 'verify_token_expires',  sql: `ALTER TABLE users ADD COLUMN verify_token_expires TEXT` },
  // Media: student upload metadata
  { table: 'media', column: 'visibility',            sql: `ALTER TABLE media ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'` },
  { table: 'media', column: 'faculty',               sql: `ALTER TABLE media ADD COLUMN faculty TEXT` },
  { table: 'media', column: 'department',            sql: `ALTER TABLE media ADD COLUMN department TEXT` },
  { table: 'media', column: 'level',                 sql: `ALTER TABLE media ADD COLUMN level TEXT` },
  { table: 'media', column: 'semester',              sql: `ALTER TABLE media ADD COLUMN semester TEXT` },
  { table: 'media', column: 'course_code',           sql: `ALTER TABLE media ADD COLUMN course_code TEXT` },
  { table: 'media', column: 'subject_id',            sql: `ALTER TABLE media ADD COLUMN subject_id INTEGER` },
  { table: 'media', column: 'approved_by',           sql: `ALTER TABLE media ADD COLUMN approved_by INTEGER` },
  { table: 'media', column: 'approved_at',           sql: `ALTER TABLE media ADD COLUMN approved_at TEXT` },
  { table: 'media', column: 'status',                sql: `ALTER TABLE media ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'` },
  
  // Tests: Phase 5 CBT configs
  { table: 'tests', column: 'bank_subject_id', sql: `ALTER TABLE tests ADD COLUMN bank_subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL` },
  { table: 'tests', column: 'early_access_mins', sql: `ALTER TABLE tests ADD COLUMN early_access_mins INTEGER NOT NULL DEFAULT 0` },
  { table: 'tests', column: 'late_entry_mins', sql: `ALTER TABLE tests ADD COLUMN late_entry_mins INTEGER NOT NULL DEFAULT 0` },
  { table: 'tests', column: 'max_attempts', sql: `ALTER TABLE tests ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 1` },
  { table: 'tests', column: 'token_required', sql: `ALTER TABLE tests ADD COLUMN token_required INTEGER NOT NULL DEFAULT 0` },
  { table: 'tests', column: 'display_limit', sql: `ALTER TABLE tests ADD COLUMN display_limit INTEGER NOT NULL DEFAULT 0` },
  { table: 'tests', column: 'randomize_questions', sql: `ALTER TABLE tests ADD COLUMN randomize_questions INTEGER NOT NULL DEFAULT 0` },
  { table: 'tests', column: 'randomize_options', sql: `ALTER TABLE tests ADD COLUMN randomize_options INTEGER NOT NULL DEFAULT 0` },
  { table: 'tests', column: 'negative_marking', sql: `ALTER TABLE tests ADD COLUMN negative_marking REAL NOT NULL DEFAULT 0` },

  // Results: Phase 5 session tracking
  { table: 'results', column: 'assigned_questions', sql: `ALTER TABLE results ADD COLUMN assigned_questions TEXT` },
  { table: 'results', column: 'violations_count', sql: `ALTER TABLE results ADD COLUMN violations_count INTEGER NOT NULL DEFAULT 0` },
  { table: 'results', column: 'anti_cheat_logs', sql: `ALTER TABLE results ADD COLUMN anti_cheat_logs TEXT` },

  // Questions: Phase 5 analytics & pooling
  { table: 'questions', column: 'pool_name', sql: `ALTER TABLE questions ADD COLUMN pool_name TEXT` },
  { table: 'questions', column: 'times_used', sql: `ALTER TABLE questions ADD COLUMN times_used INTEGER NOT NULL DEFAULT 0` },
  { table: 'questions', column: 'times_correct', sql: `ALTER TABLE questions ADD COLUMN times_correct INTEGER NOT NULL DEFAULT 0` },
  { table: 'questions', column: 'times_wrong', sql: `ALTER TABLE questions ADD COLUMN times_wrong INTEGER NOT NULL DEFAULT 0` },
];

async function runColumnMigrations() {
  for (const m of COLUMN_MIGRATIONS) {
    const info = await all(`PRAGMA table_info(${m.table})`);
    const exists = info.some(col => col.name === m.column);
    if (!exists) {
      await run(m.sql);
      logger.info(`[DB] Added column: ${m.table}.${m.column}`);
    }
  }
}

// ─── Migration ────────────────────────────────────────────────────────────────
async function runMigration() {
  console.log('[Diagnostics] runMigration: Creating tables...');
  await exec(SCHEMA_SQL);
  console.log('[Diagnostics] runMigration: Tables created successfully');
  
  console.log('[Diagnostics] runMigration: Creating indexes...');
  await exec(INDEXES_SQL);
  console.log('[Diagnostics] runMigration: Indexes created successfully');
  
  console.log('[Diagnostics] runMigration: Creating triggers...');
  await exec(TRIGGERS_SQL);
  console.log('[Diagnostics] runMigration: Triggers created successfully');
  
  console.log('[Diagnostics] runMigration: Running column migrations...');
  await runColumnMigrations();
  console.log('[Diagnostics] runMigration: Column migrations completed');
  
  logger.info('[DB] Schema, indexes & triggers applied');
}

// ─── Seed Default Admin ───────────────────────────────────────────────────────
async function seedDefaultAdmin() {
  const bcrypt = require('bcryptjs');
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    logger.warn('[Seeder] ADMIN_EMAIL or ADMIN_PASSWORD not configured. Skipping default admin creation.');
    return;
  }

  // Check if ANY admin already exists to prevent duplicate admins
  const existingAdmin = await get("SELECT id FROM users WHERE role IN ('admin', 'superadmin') LIMIT 1");
  if (existingAdmin) {
    logger.info('[DB] An admin user already exists - skipping default seed');
    return;
  }

  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
  const passwordHash = await bcrypt.hash(adminPassword, rounds);

  const { lastID: userId } = await run(
    `INSERT INTO users (email, password_hash, role, is_active, is_verified) VALUES (?, ?, 'superadmin', 1, 1)`,
    [adminEmail, passwordHash]
  );

  await run(
    `INSERT INTO admins (user_id, full_name, staff_id, department, permissions, is_super) VALUES (?, ?, ?, 'ICT Unit', '["all"]', 1)`,
    [userId, process.env.ADMIN_FULL_NAME || 'Super Administrator', process.env.ADMIN_STAFF_ID || 'ADM/001/2024']
  );

  await run(
    `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description, status) VALUES (?, 'SEED_ADMIN', 'user', ?, 'Default superadmin seeded', 'success')`,
    [userId, userId]
  );

  // NOTE: Password is intentionally not logged for security
  logger.info(`[DB] Default superadmin seeded – email: ${adminEmail}`);
}

// ─── Auto Initialize ──────────────────────────────────────────────────────────
async function initialize() {
  try {
    console.log('[Diagnostics] db.initialize() started...');
    
    console.log('[Diagnostics] Waiting for database connection to open...');
    await dbOpenPromise;
    console.log('[Diagnostics] Database connection confirmed.');
    
    console.log('[Diagnostics] Calling applyPragmas()...');
    await applyPragmas();
    
    console.log('[Diagnostics] Calling runMigration()...');
    await runMigration();
    
    console.log('[Diagnostics] Calling seedDefaultAdmin()...');
    await seedDefaultAdmin();
    console.log('[Diagnostics] seedDefaultAdmin() completed.');
    
    console.log('[Diagnostics] Database initialized successfully.');
    logger.info('[DB] Database fully ready');
  } catch(err) {
    console.error('[Diagnostics] FATAL DB INITIALIZATION ERROR:', err.stack || err);
    throw err;
  }
}

// ─── Activity Logger ──────────────────────────────────────────────────────────
async function logActivity({ userId = null, action, entityType = null, entityId = null,
  description = null, metadata = {}, ipAddress = null, userAgent = null, status = 'success' }) {
  try {
    await run(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description, metadata, ip_address, user_agent, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, action, entityType, entityId, description, JSON.stringify(metadata), ipAddress, userAgent, status]
    );
  } catch (err) {
    logger.error('[DB] logActivity error: ' + err.message);
  }
}

// ─── Purge Expired Tokens ─────────────────────────────────────────────────────
async function purgeExpiredTokens() {
  const now = new Date().toISOString();
  const pr = await run("DELETE FROM password_resets WHERE expires_at < ? AND used = 0", [now]);
  const tk = await run("DELETE FROM tokens WHERE expires_at < ? AND revoked = 0", [now]);
  return { passwordResets: pr.changes, tokens: tk.changes };
}

// ─── Close ────────────────────────────────────────────────────────────────────
function close() {
  if (!db) return;
  db.close((err) => {
    if (!err) logger.info('[DB] Connection closed');
    else logger.error('[DB] Close error: ' + err.message);
  });
}

process.on('exit',    close);
process.on('SIGINT',  () => { close(); process.exit(0); });
process.on('SIGTERM', () => { close(); process.exit(0); });

module.exports = { db, run, get, all, exec, initialize, logActivity, purgeExpiredTokens };
