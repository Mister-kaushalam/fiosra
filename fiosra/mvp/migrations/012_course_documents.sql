-- ====================================================================
-- Fiosra MVP Migration 012: Course Documents & Primary Source Files
-- ====================================================================

CREATE TABLE IF NOT EXISTS course_documents (
    document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    module_id UUID REFERENCES modules(module_id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    resource_type VARCHAR(32) NOT NULL DEFAULT 'pdf',
    source_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_documents_course_module 
ON course_documents (course_id, module_id);

ALTER TABLE syllabus_chunks 
ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES course_documents(document_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_syllabus_chunks_document 
ON syllabus_chunks (document_id);
