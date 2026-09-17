-- ====================================================================
-- Fiosra MVP Student Submission Integrity Migration
-- ====================================================================
-- One immutable learner submission record per reasoning session. The record
-- binds a visible submission acknowledgement to the exact document revision
-- and makes safe retries idempotent.

CREATE TABLE IF NOT EXISTS student_session_submissions (
    session_id UUID PRIMARY KEY REFERENCES student_sessions(session_id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES learning_documents(document_id) ON DELETE RESTRICT,
    document_revision INTEGER NOT NULL CHECK (document_revision >= 0),
    idempotency_key VARCHAR(160) NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_student_session_submissions_document
    ON student_session_submissions (document_id, document_revision);
