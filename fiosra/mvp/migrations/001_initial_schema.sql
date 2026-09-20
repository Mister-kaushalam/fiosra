-- ====================================================================
-- Fiosra MVP Initial Schema Migration
-- ====================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Course Workspace & Curriculum Grounding
CREATE TABLE IF NOT EXISTS courses (
    course_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    domain VARCHAR(64),
    created_by VARCHAR(64) NOT NULL,
    syllabus_context TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Curriculum Modules (Prerequisite Sequencer)
CREATE TABLE IF NOT EXISTS modules (
    module_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    learning_objectives JSONB,
    position INT NOT NULL DEFAULT 1
);

-- 4. Misconception Taxonomy with Vector Search (pgvector)
-- Note: Knowledge Components (KCs) and prerequisite DAGs are managed in Neo4j.
-- kc_id links to Neo4j (:KnowledgeConcept {kc_id: ...})
CREATE TABLE IF NOT EXISTS misconceptions (
    misconception_id VARCHAR(64) PRIMARY KEY,
    kc_id VARCHAR(64) NOT NULL,
    domain VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    flawed_rule TEXT NOT NULL,
    remediation_hint TEXT NOT NULL,
    embedding VECTOR(1536)
);

CREATE INDEX IF NOT EXISTS idx_misconceptions_vector ON misconceptions 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- 5. Assignments & Scaffolding Specifications
CREATE TABLE IF NOT EXISTS assignments (
    assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID REFERENCES modules(module_id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    created_by VARCHAR(64) NOT NULL,
    spec JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Student Reasoning Sessions
CREATE TABLE IF NOT EXISTS student_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR(64) NOT NULL,
    assignment_id UUID REFERENCES assignments(assignment_id),
    current_question_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) DEFAULT 'active',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 7. Append-Only JSON Event Store (Flight Recorder & Audit Trail)
CREATE TABLE IF NOT EXISTS session_events (
    event_id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES student_sessions(session_id),
    student_id VARCHAR(64) NOT NULL,
    assignment_id UUID,
    question_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_events_payload ON session_events USING gin (payload);
CREATE INDEX IF NOT EXISTS idx_session_events_chronological ON session_events (session_id, created_at ASC);
