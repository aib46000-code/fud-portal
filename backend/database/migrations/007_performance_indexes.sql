-- Performance Optimization: Add missing indexes for Foreign Keys and frequent queries

CREATE INDEX IF NOT EXISTS idx_results_test_id ON results(test_id);
CREATE INDEX IF NOT EXISTS idx_results_student_id ON results(student_id);

CREATE INDEX IF NOT EXISTS idx_questions_test_id ON questions(test_id);

CREATE INDEX IF NOT EXISTS idx_media_uploaded_by ON media(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_exam_sessions_test_id ON exam_sessions(test_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_student_id ON exam_sessions(student_id);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_test_id ON exam_attempts(test_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_student_id ON exam_attempts(student_id);

CREATE INDEX IF NOT EXISTS idx_exam_sections_test_id ON exam_sections(test_id);
CREATE INDEX IF NOT EXISTS idx_question_pools_test_id ON question_pools(test_id);
