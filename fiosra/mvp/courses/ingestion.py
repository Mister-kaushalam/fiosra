import asyncio
import io
import ipaddress
import logging
import re
import socket
import uuid
from html.parser import HTMLParser
from typing import ClassVar
from urllib.parse import urljoin, urlparse
from uuid import UUID

import httpx
from neo4j.exceptions import Neo4jError
from sqlalchemy import text

from fiosra.mvp.courses.schemas import CourseDocumentResponse, SyllabusChunkResponse
from fiosra.mvp.courses.source_queries import CANONICAL_CHUNKS
from fiosra.mvp.database import AsyncSessionLocal
from fiosra.mvp.graph_service import graph_service
from fiosra.mvp.seed_pipeline import generate_deterministic_embedding
from fiosra.mvp.storage import document_storage

logger = logging.getLogger(__name__)


class _ReadableTextExtractor(HTMLParser):
    """Small dependency-free extractor for readable text from public HTML documents."""

    _IGNORED_TAGS: ClassVar[set[str]] = {"script", "style", "noscript", "svg", "template"}

    def __init__(self) -> None:
        super().__init__()
        self._ignored_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in self._IGNORED_TAGS:
            self._ignored_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in self._IGNORED_TAGS and self._ignored_depth:
            self._ignored_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._ignored_depth and data.strip():
            self.parts.append(data.strip())

    def text(self) -> str:
        return re.sub(r"\s+", " ", " ".join(self.parts)).strip()


class SyllabusParser:
    """
    Parses syllabus and reading corpus materials (Markdown, text, PDF),
    splits them into semantic chunks, generates 1536-dimensional pgvector embeddings,
    and grounds them against Neo4j Knowledge Components.
    """

    @classmethod
    def extract_text(cls, content: str | bytes, is_pdf: bool = False) -> str:
        """
        Extracts raw UTF-8 string text from plain/markdown text or PDF bytes.
        """
        if isinstance(content, bytes):
            if is_pdf or content.startswith(b"%PDF-"):
                try:
                    import pypdf
                    reader = pypdf.PdfReader(io.BytesIO(content))
                    extracted = [page.extract_text() or "" for page in reader.pages]
                    return "\n\n".join(extracted).strip()
                except (ImportError, ValueError, OSError, RuntimeError) as e:
                    logger.warning(
                        f"pypdf extraction failed or not available: {e}. Falling back to utf-8 decode."
                    )
                    return content.decode("utf-8", errors="ignore").strip()
            return content.decode("utf-8", errors="ignore").strip()
        return str(content).strip()

    @staticmethod
    def has_substantive_content(content: str) -> bool:
        """Reject link labels and URL slugs as insufficient instructional material."""
        return len(re.findall(r"\w+", content)) >= 35

    @classmethod
    async def fetch_external_source(cls, source_url: str) -> str:
        """Retrieve public linked reading text, with a reader fallback for sites that block direct clients."""
        async def validate_public_url(candidate_url: str) -> None:
            parsed = urlparse(candidate_url)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc or not parsed.hostname:
                raise ValueError("External resources must use a public http or https URL.")
            try:
                addresses = await asyncio.get_running_loop().getaddrinfo(
                    parsed.hostname,
                    parsed.port or (443 if parsed.scheme == "https" else 80),
                    type=socket.SOCK_STREAM,
                )
            except socket.gaierror as error:
                raise ValueError("The external source host could not be resolved.") from error
            for address in addresses:
                if not ipaddress.ip_address(address[4][0]).is_global:
                    raise ValueError("Local network URLs cannot be ingested as course materials.")

        await validate_public_url(source_url)

        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; FiosraCourseIngestion/1.0)",
            "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
        }
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(20.0),
                follow_redirects=False,
                headers=headers,
            ) as client:
                active_url = source_url
                for _ in range(5):
                    response = await client.get(active_url)
                    if response.is_redirect:
                        redirect_to = response.headers.get("location")
                        if not redirect_to:
                            break
                        active_url = urljoin(active_url, redirect_to)
                        await validate_public_url(active_url)
                        continue
                    break
                response.raise_for_status()
                extracted = _ReadableTextExtractor()
                extracted.feed(response.text)
                retrieved = extracted.text() if "html" in response.headers.get("content-type", "") else response.text.strip()
                if cls.has_substantive_content(retrieved):
                    return retrieved
        except httpx.HTTPError as error:
            logger.info("Direct retrieval blocked for %s: %s", source_url, error)

        # Some public publishers deny ordinary server requests. The reader endpoint retrieves only
        # the public page text and keeps the original URL as the learner-facing source provenance.
        reader_url = f"https://r.jina.ai/http://{source_url}"
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(25.0)) as client:
                response = await client.get(reader_url)
                response.raise_for_status()
                retrieved = response.text.strip()
                if cls.has_substantive_content(retrieved):
                    return retrieved
        except httpx.HTTPError as error:
            logger.info("Reader retrieval unavailable for %s: %s", source_url, error)

        raise ValueError(
            "The linked page could not provide enough readable teaching content. "
            "Paste an excerpt or upload the reading so it can be grounded."
        )

    @classmethod
    def chunk_document(cls, text_content: str, default_title: str = "Syllabus Section") -> list[dict[str, str]]:
        """
        Splits text content into semantic chunks based on markdown headings or double newlines.
        Each chunk is between 150 and 1200 characters.
        """
        sections: list[dict[str, str]] = []
        lines = text_content.splitlines()

        current_title = default_title
        current_buffer: list[str] = []

        header_regex = re.compile(r"^(#{1,4})\s+(.+)$")

        for line in lines:
            stripped = line.strip()
            m = header_regex.match(stripped)
            if m:
                # Save previous buffer if non-empty
                if current_buffer:
                    body = "\n".join(current_buffer).strip()
                    if len(body) >= 40:
                        sections.append({"title": current_title, "content": body})
                    current_buffer = []
                current_title = m.group(2).strip()
            else:
                if stripped:
                    current_buffer.append(stripped)

        if current_buffer:
            body = "\n".join(current_buffer).strip()
            if len(body) >= 20:
                sections.append({"title": current_title, "content": body})

        # If no markdown headings were detected, chunk by paragraph blocks
        if not sections:
            paragraphs = [p.strip() for p in text_content.split("\n\n") if p.strip()]
            for idx, p in enumerate(paragraphs, start=1):
                sections.append({
                    "title": f"{default_title} - Part {idx}",
                    "content": p,
                })

        bounded = []
        for section in sections:
            body = section['content']
            while len(body) > 1200:
                boundary = body.rfind(' ', 0, 1201)
                if boundary < 1:
                    boundary = 1200
                bounded.append({'title': section['title'], 'content': body[:boundary]})
                body = body[boundary:].lstrip()
            if body:
                bounded.append({'title': section['title'], 'content': body})
        return bounded

    @classmethod
    async def match_kc_for_text(cls, chunk_text: str, domain: str | None = None, course_id: str | None = None) -> str | None:
        """
        Scans chunk text against available Neo4j Knowledge Components to link grounding context.
        """
        try:
            kcs = await graph_service.list_all_kcs(domain=domain)
        except (Neo4jError, RuntimeError, ConnectionError, OSError) as e:
            logger.warning(f"Could not fetch KCs from Neo4j for grounding: {e}")
            kcs = []

        # Never use unrelated curriculum seeds as an ingestion fallback.
        kcs = [k for k in kcs if course_id is not None and (k.get('course_id') == str(course_id) or not k.get('course_id'))]

        text_lower = chunk_text.lower()
        best_kc = None
        best_score = 0

        for kc in kcs:
            score = 0
            label_words = [w.lower() for w in re.findall(r"\w+", kc.get("label", "")) if len(w) > 3]
            for w in label_words:
                if w in text_lower:
                    score += 1
            if score > best_score:
                best_score = score
                best_kc = kc.get("kc_id")

        return best_kc if best_score > 0 else None

    @classmethod
    async def create_course_document(
        cls,
        course_id: UUID | str,
        title: str,
        filename: str,
        content: bytes,
        module_id: UUID | str | None = None,
        resource_type: str = "pdf",
        mime_type: str = "application/pdf",
        source_url: str | None = None,
    ) -> CourseDocumentResponse:
        """Saves raw file bytes into local storage and registers CourseDocument record."""
        document_id = uuid.uuid4()
        rel_path, file_size = document_storage.save_document(
            course_id=course_id,
            document_id=document_id,
            filename=filename,
            content=content,
        )
        insert_sql = text("""
            INSERT INTO course_documents (
                document_id, course_id, module_id, title, filename, file_path, file_size,
                mime_type, resource_type, source_url, created_at
            ) VALUES (
                :document_id, :course_id, :module_id, :title, :filename, :file_path, :file_size,
                :mime_type, :resource_type, :source_url, NOW()
            )
            RETURNING document_id, course_id, module_id, title, filename, file_path, file_size,
                      mime_type, resource_type, source_url, created_at;
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                insert_sql,
                {
                    "document_id": document_id,
                    "course_id": str(course_id),
                    "module_id": str(module_id) if module_id else None,
                    "title": title,
                    "filename": filename,
                    "file_path": rel_path,
                    "file_size": file_size,
                    "mime_type": mime_type,
                    "resource_type": resource_type,
                    "source_url": source_url,
                },
            )
            row = result.mappings().first()
            await session.commit()

        return CourseDocumentResponse(
            document_id=row["document_id"],
            course_id=row["course_id"],
            module_id=row["module_id"],
            title=row["title"],
            filename=row["filename"],
            file_size=row["file_size"],
            mime_type=row["mime_type"],
            resource_type=row["resource_type"],
            source_url=row["source_url"],
            download_url=f"/courses/{course_id}/documents/{document_id}/file",
            chunks_count=0,
            created_at=row["created_at"],
        )

    @classmethod
    async def list_documents(
        cls,
        course_id: UUID | str,
        module_id: UUID | str | None = None,
    ) -> list[CourseDocumentResponse]:
        """Lists all grounded course documents with their chunk counts and download links."""
        query_sql = text("""
            SELECT d.document_id, d.course_id, d.module_id, d.title, d.filename, d.file_path, d.file_size,
                   d.mime_type, d.resource_type, d.source_url, d.created_at,
                   COUNT(c.chunk_id) AS chunks_count
            FROM course_documents d
            LEFT JOIN syllabus_chunks c ON d.document_id = c.document_id
            WHERE d.course_id = CAST(:course_id AS UUID)
              AND (CAST(:module_id AS UUID) IS NULL OR d.module_id = CAST(:module_id AS UUID))
            GROUP BY d.document_id, d.course_id, d.module_id, d.title, d.filename, d.file_path, d.file_size,
                     d.mime_type, d.resource_type, d.source_url, d.created_at
            ORDER BY d.created_at DESC;
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                query_sql,
                {
                    "course_id": str(course_id),
                    "module_id": str(module_id) if module_id else None,
                },
            )
            rows = result.mappings().all()

        return [
            CourseDocumentResponse(
                document_id=r["document_id"],
                course_id=r["course_id"],
                module_id=r["module_id"],
                title=r["title"],
                filename=r["filename"],
                file_size=r["file_size"],
                mime_type=r["mime_type"],
                resource_type=r["resource_type"],
                source_url=r["source_url"],
                download_url=f"/courses/{course_id}/documents/{r['document_id']}/file",
                chunks_count=int(r["chunks_count"] or 0),
                created_at=r["created_at"],
            )
            for r in rows
        ]

    @classmethod
    async def get_document(
        cls,
        course_id: UUID | str,
        document_id: UUID | str,
    ) -> dict | None:
        """Retrieves single CourseDocument by ID."""
        query_sql = text("""
            SELECT document_id, course_id, module_id, title, filename, file_path, file_size,
                   mime_type, resource_type, source_url, created_at
            FROM course_documents
            WHERE course_id = CAST(:course_id AS UUID) AND document_id = CAST(:document_id AS UUID);
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                query_sql,
                {"course_id": str(course_id), "document_id": str(document_id)},
            )
            row = result.mappings().first()
            return dict(row) if row else None

    @classmethod
    async def delete_document(
        cls,
        course_id: UUID | str,
        document_id: UUID | str,
    ) -> bool:
        """Deletes raw document file from storage and database (cascades chunks)."""
        doc = await cls.get_document(course_id, document_id)
        if not doc:
            return False
        document_storage.delete_document(doc["file_path"])
        delete_sql = text("""
            DELETE FROM course_documents
            WHERE course_id = CAST(:course_id AS UUID) AND document_id = CAST(:document_id AS UUID);
        """)
        async with AsyncSessionLocal() as session:
            await session.execute(
                delete_sql,
                {"course_id": str(course_id), "document_id": str(document_id)},
            )
            await session.commit()
        return True

    @classmethod
    async def ingest_syllabus(
        cls,
        course_id: UUID | str,
        content: str | bytes,
        title: str = "Course Syllabus",
        module_id: UUID | str | None = None,
        domain: str = "History",
        is_pdf: bool = False,
        resource_type: str = "document",
        source_url: str | None = None,
        document_id: UUID | str | None = None,
    ) -> list[SyllabusChunkResponse]:
        """
        Parses, chunks, embeds, grounds, and stores syllabus chunks in PostgreSQL with pgvector.
        """
        raw_text = cls.extract_text(content, is_pdf=is_pdf)
        raw_chunks = cls.chunk_document(raw_text, default_title=title)

        persisted_chunks: list[SyllabusChunkResponse] = []

        insert_sql = text("""
            INSERT INTO syllabus_chunks (
                chunk_id, course_id, module_id, document_id, title, content, kc_id, embedding, resource_type, source_url, created_at
            ) VALUES (
                :chunk_id, :course_id, :module_id, :document_id, :title, :content, :kc_id, :embedding, :resource_type, :source_url, NOW()
            )
            RETURNING chunk_id, course_id, module_id, document_id, title, content, kc_id, resource_type, source_url, created_at;
        """)

        async with AsyncSessionLocal() as session:
            # Serialize identical resource uploads, including concurrent retries.
            await session.execute(text('SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))'),
                {'key': f'{course_id}|{module_id}|{title}|{resource_type}|{source_url}'})
            for item in raw_chunks:
                existing = await session.execute(text("""
                    SELECT chunk_id, course_id, module_id, document_id, title, content, kc_id,
                           resource_type, source_url, created_at
                    FROM syllabus_chunks
                    WHERE course_id=:course_id AND module_id IS NOT DISTINCT FROM CAST(:module_id AS UUID)
                      AND title=:title AND content=:content
                      AND resource_type=:resource_type AND source_url IS NOT DISTINCT FROM :source_url
                    ORDER BY created_at, chunk_id LIMIT 1
                """), {'course_id': str(course_id), 'module_id': str(module_id) if module_id else None,
                       'title': item['title'], 'content': item['content'],
                       'resource_type': resource_type, 'source_url': source_url})
                prior = existing.mappings().first()
                if prior:
                    persisted_chunks.append(SyllabusChunkResponse(**dict(prior), similarity=1.0))
                    continue
                chunk_id = uuid.uuid4()
                c_title = item["title"]
                c_text = item["content"]
                kc_id = await cls.match_kc_for_text(c_text, domain=domain, course_id=str(course_id))
                embedding = generate_deterministic_embedding(c_text)

                result = await session.execute(
                    insert_sql,
                    {
                        "chunk_id": chunk_id,
                        "course_id": str(course_id),
                        "module_id": str(module_id) if module_id else None,
                        "document_id": str(document_id) if document_id else None,
                        "title": c_title,
                        "content": c_text,
                        "kc_id": kc_id,
                        "embedding": str(embedding),
                        "resource_type": resource_type,
                        "source_url": source_url,
                    },
                )
                row = result.mappings().first()
                if row:
                    persisted_chunks.append(
                        SyllabusChunkResponse(
                            chunk_id=row["chunk_id"],
                            course_id=row["course_id"],
                            module_id=row["module_id"],
                            document_id=row.get("document_id"),
                            title=row["title"],
                            content=row["content"],
                            kc_id=row["kc_id"],
                            resource_type=row.get("resource_type") or resource_type,
                            source_url=row.get("source_url"),
                            created_at=row["created_at"],
                            similarity=1.0,
                        )
                    )
            await session.commit()

        logger.info(
            f"Successfully ingested {len(persisted_chunks)} syllabus chunks for course {course_id}."
        )
        return persisted_chunks

    @classmethod
    async def search_syllabus(
        cls,
        course_id: UUID | str,
        query: str,
        top_k: int = 5,
        module_id: UUID | str | None = None,
    ) -> list[SyllabusChunkResponse]:
        """
        Executes a vector cosine similarity search in PostgreSQL via pgvector.
        """
        query_vector = generate_deterministic_embedding(query)

        query_sql = text(f"""
            SELECT chunk_id, course_id, module_id, document_id, title, content, kc_id, resource_type, source_url, created_at,
                   1.0 - (embedding <=> CAST(:query_vec AS vector)) AS similarity
            FROM {CANONICAL_CHUNKS}
            WHERE course_id = :course_id
              AND (CAST(:module_id AS UUID) IS NULL OR module_id = CAST(:module_id AS UUID))
            ORDER BY embedding <=> CAST(:query_vec AS vector) ASC
            LIMIT :top_k;
        """)

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                query_sql,
                {
                    "course_id": str(course_id),
                    "module_id": str(module_id) if module_id else None,
                    "query_vec": str(query_vector),
                    "top_k": top_k,
                },
            )
            rows = result.mappings().all()

        return [
            SyllabusChunkResponse(
                chunk_id=r["chunk_id"],
                course_id=r["course_id"],
                module_id=r["module_id"],
                document_id=r.get("document_id"),
                title=r["title"],
                content=r["content"],
                kc_id=r["kc_id"],
                resource_type=r.get("resource_type") or "document",
                source_url=r.get("source_url"),
                created_at=r["created_at"],
                similarity=round(float(r["similarity"]), 4) if r["similarity"] is not None else None,
            )
            for r in rows
        ]

    @classmethod
    async def list_chunks(
        cls,
        course_id: UUID | str,
        module_id: UUID | str | None = None,
    ) -> list[SyllabusChunkResponse]:
        """
        Lists all ingested syllabus and primary source reading chunks for a course.
        """
        query_sql = text(f"""
            SELECT chunk_id, course_id, module_id, document_id, title, content, kc_id, resource_type, source_url, created_at
            FROM {CANONICAL_CHUNKS}
            WHERE course_id = :course_id
              AND (CAST(:module_id AS UUID) IS NULL OR module_id = CAST(:module_id AS UUID))
            ORDER BY created_at ASC;
        """)

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                query_sql,
                {
                    "course_id": str(course_id),
                    "module_id": str(module_id) if module_id else None,
                },
            )
            rows = result.mappings().all()

        return [
            SyllabusChunkResponse(
                chunk_id=r["chunk_id"],
                course_id=r["course_id"],
                module_id=r["module_id"],
                document_id=r.get("document_id"),
                title=r["title"],
                content=r["content"],
                kc_id=r["kc_id"],
                resource_type=r.get("resource_type") or "document",
                source_url=r.get("source_url"),
                created_at=r["created_at"],
                similarity=1.0,
            )
            for r in rows
        ]

    @classmethod
    async def published_assignment_dependencies(
        cls,
        course_id: UUID | str,
        chunk_id: UUID | str,
    ) -> list[dict[str, str]]:
        """Return published tasks that cite a source chunk in their stored provenance."""
        dependency_sql = text("""
            SELECT a.assignment_id, a.title
            FROM assignments a
            JOIN modules m ON a.module_id = m.module_id
            WHERE m.course_id = CAST(:course_id AS UUID)
              AND COALESCE(a.spec ->> 'status', 'draft') = 'published'
              AND COALESCE(a.spec -> 'grounding_sources', '[]'::jsonb)
                    @> jsonb_build_array(jsonb_build_object('chunk_id', CAST(:chunk_id AS TEXT)));
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                dependency_sql,
                {"course_id": str(course_id), "chunk_id": str(chunk_id)},
            )
            return [
                {"assignment_id": str(row["assignment_id"]), "title": row["title"]}
                for row in result.mappings().all()
            ]

    @classmethod
    async def delete_chunk(cls, course_id: UUID | str, chunk_id: UUID | str) -> bool:
        """Delete an unreferenced resource chunk from the selected course only."""
        delete_sql = text("""
            DELETE FROM syllabus_chunks
            WHERE chunk_id = CAST(:chunk_id AS UUID)
              AND course_id = CAST(:course_id AS UUID)
            RETURNING chunk_id;
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                delete_sql,
                {"course_id": str(course_id), "chunk_id": str(chunk_id)},
            )
            deleted = result.scalar() is not None
            await session.commit()
            return deleted


syllabus_parser = SyllabusParser()
