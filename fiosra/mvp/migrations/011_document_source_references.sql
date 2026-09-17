-- ====================================================================
-- Fiosra MVP Document Source References Migration
-- ====================================================================
-- Source selections are learner-visible provenance, not assertions that a
-- source proves a claim. They persist contextual metadata from the published
-- source pack so the learner can return to the assigned material after reload.

CREATE TABLE IF NOT EXISTS learning_document_source_references (
    reference_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES learning_documents(document_id) ON DELETE CASCADE,
    source_id VARCHAR(160) NOT NULL,
    source_title VARCHAR(360) NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    citation TEXT,
    source_url TEXT,
    locator JSONB NOT NULL DEFAULT '{}'::jsonb,
    attached_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_document_source_references_document
    ON learning_document_source_references (document_id, attached_at ASC);

CREATE TABLE IF NOT EXISTS learning_document_source_claim_links (
    reference_id UUID NOT NULL REFERENCES learning_document_source_references(reference_id) ON DELETE CASCADE,
    block_id UUID NOT NULL REFERENCES learning_document_blocks(block_id) ON DELETE CASCADE,
    linked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (reference_id, block_id)
);

CREATE INDEX IF NOT EXISTS idx_document_source_claim_links_block
    ON learning_document_source_claim_links (block_id);
