"""Canonical source projection without deleting IDs referenced by published work."""

CANONICAL_CHUNKS = """
    (SELECT DISTINCT ON (module_id, title, resource_type, source_url, md5(content)) *
     FROM syllabus_chunks
     WHERE course_id = CAST(:course_id AS UUID)
     ORDER BY module_id, title, resource_type, source_url, md5(content), created_at, chunk_id)
    AS syllabus_chunks
"""
