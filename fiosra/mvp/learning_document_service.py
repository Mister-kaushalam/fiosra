"""Server-authoritative persistence for long-form student learning documents."""

import json
import re
import uuid
from collections.abc import Iterable
from typing import Any, ClassVar
from uuid import UUID

from sqlalchemy import text

from fiosra.mvp.assignment_designer.generator import assignment_generator
from fiosra.mvp.assignment_designer.schemas import PublicQuestionSpec, PublicSource
from fiosra.mvp.database import AsyncSessionLocal
from fiosra.mvp.event_store import event_store
from fiosra.mvp.learning_document_schemas import (
    AssignedEvidenceCandidate,
    AssignedEvidenceLocatorResponse,
    DocumentBlockResponse,
    DocumentSourceReference,
    LearningDocumentState,
    SyncLearningDocumentRequest,
    SyncLearningDocumentResponse,
)


class LearningDocumentAccessError(PermissionError):
    """Raised when the browser-held session capability is invalid."""


class LearningDocumentConflictError(RuntimeError):
    """Raised when a document patch would overwrite a newer revision."""


class LearningDocumentValidationError(ValueError):
    """Raised when a document structure or lifecycle state is invalid."""


class LearningDocumentService:
    """Protected, incremental document storage with legacy canvas import."""

    _ALLOWED_NODE_TYPES = frozenset({
        "doc",
        "heading",
        "paragraph",
        "blockquote",
        "bulletList",
        "orderedList",
        "listItem",
        "text",
        "hardBreak",
    })
    _BLOCK_NODE_TYPES: ClassVar[dict[str, str]] = {
        "heading": "heading",
        "paragraph": "paragraph",
        "blockquote": "blockquote",
        "bullet_list": "bulletList",
        "ordered_list": "orderedList",
    }
    _MAX_BLOCK_PLAINTEXT = 50_000
    _MAX_BLOCK_JSON_BYTES = 100_000
    _LEGACY_TEMPLATE_HEADINGS = frozenset(
        {
            "working claim",
            "source observations",
            "reasoning",
            "alternative explanation",
            "revision reflection",
        }
    )

    async def _get_authorized_context(
        self,
        session_id: UUID | str,
        access_token: str | None,
    ) -> tuple[dict[str, Any], PublicQuestionSpec]:
        if not await event_store.has_session_access(session_id, access_token):
            raise LearningDocumentAccessError(
                "This browser is not authorized to access the requested learning document."
            )
        session_info = await event_store.get_session_details(session_id)
        if not session_info or not session_info.get("assignment_id"):
            raise LearningDocumentValidationError(
                "This document session is not linked to a published assignment."
            )
        assignment = await assignment_generator.get_public_assignment(session_info["assignment_id"])
        if not assignment or assignment.status != "published":
            raise LearningDocumentValidationError(
                "The session's published assignment is no longer available."
            )
        return session_info, assignment

    @staticmethod
    def _node(block_id: UUID, node_type: str, content: list[dict[str, Any]], **attrs: Any) -> dict[str, Any]:
        node_attrs = {"blockId": str(block_id), **attrs}
        node: dict[str, Any] = {"type": node_type, "attrs": node_attrs}
        if content:
            node["content"] = content
        return node

    @classmethod
    def _text_content(cls, value: str) -> list[dict[str, Any]]:
        return [{"type": "text", "text": value}] if value else []

    async def _ensure_document(
        self,
        session_info: dict[str, Any],
        assignment: PublicQuestionSpec,
    ) -> UUID:
        """Create a block document once and import legacy section drafts on first load."""
        existing_sql = text("""
            SELECT document_id
            FROM learning_documents
            WHERE session_id = CAST(:session_id AS UUID)
            FOR UPDATE;
        """)
        create_sql = text("""
            INSERT INTO learning_documents (session_id, assignment_id, title)
            VALUES (CAST(:session_id AS UUID), CAST(:assignment_id AS UUID), :title)
            RETURNING document_id;
        """)
        legacy_sql = text("""
            SELECT section_id, text, author_type
            FROM canvas_section_drafts
            WHERE session_id = CAST(:session_id AS UUID);
        """)
        insert_block_sql = text("""
            INSERT INTO learning_document_blocks (
                block_id, document_id, section_id, position, block_type, content, plaintext, author_type
            ) VALUES (
                CAST(:block_id AS UUID), CAST(:document_id AS UUID), :section_id, :position,
                :block_type, CAST(:content AS JSONB), :plaintext, :author_type
            );
        """)
        async with AsyncSessionLocal() as session:
            existing = await session.execute(existing_sql, {"session_id": str(session_info["session_id"])})
            existing_id = existing.scalar()
            if existing_id:
                return existing_id
            created = await session.execute(
                create_sql,
                {
                    "session_id": str(session_info["session_id"]),
                    "assignment_id": str(session_info["assignment_id"]),
                    "title": "Reasoning document",
                },
            )
            document_id = created.scalar_one()
            legacy_result = await session.execute(
                legacy_sql, {"session_id": str(session_info["session_id"])}
            )
            legacy_drafts = {
                row["section_id"]: row for row in legacy_result.mappings().all()
            }
            # New work starts as an open canvas. Assignment-specific headings must
            # emerge from learner-authored work or an explicitly accepted helper
            # proposal; the old fixed canvas_sections are retained only to import
            # legacy drafts safely.
            legacy_rows = [row for _, row in sorted(legacy_drafts.items())]
            if legacy_rows:
                position = 1
                for legacy in legacy_rows:
                    paragraph_id = uuid.uuid4()
                    draft_text = legacy["text"] or ""
                    author_type = legacy["author_type"] or "student"
                    section_id = legacy["section_id"] or "page_1"
                    paragraph_content = self._node(
                        paragraph_id,
                        "paragraph",
                        self._text_content(draft_text),
                        sectionId=section_id,
                    )
                    await session.execute(
                        insert_block_sql,
                        {
                            "block_id": str(paragraph_id),
                            "document_id": str(document_id),
                            "section_id": section_id,
                            "position": position,
                            "block_type": "paragraph",
                            "content": json.dumps(paragraph_content),
                            "plaintext": draft_text,
                            "author_type": author_type,
                        },
                    )
                    position += 1
            await session.commit()
        await event_store.log_event(
            session_id=session_info["session_id"],
            student_id=session_info["student_id"],
            assignment_id=session_info["assignment_id"],
            question_id=session_info["current_question_id"],
            event_type="learning_document_initialized",
            payload={"imported_canvas_sections": len(legacy_rows)},
        )
        return document_id

    @classmethod
    def _collect_text(cls, node: Any) -> Iterable[str]:
        if not isinstance(node, dict):
            return
        if node.get("type") == "text" and isinstance(node.get("text"), str):
            yield node["text"]
        for child in node.get("content", []) or []:
            yield from cls._collect_text(child)

    @classmethod
    def _validate_node(cls, node: Any, expected_node_type: str, block_id: UUID) -> str:
        if not isinstance(node, dict):
            raise LearningDocumentValidationError("Document blocks must be structured JSON nodes.")
        node_type = node.get("type")
        if node_type != expected_node_type:
            raise LearningDocumentValidationError("The block type does not match its document node type.")
        serialized = json.dumps(node, ensure_ascii=False, separators=(",", ":"))
        if len(serialized.encode("utf-8")) > cls._MAX_BLOCK_JSON_BYTES:
            raise LearningDocumentValidationError("A single document block exceeds the safe synchronization size.")

        def validate(current: Any, depth: int = 0) -> None:
            if depth > 12 or not isinstance(current, dict):
                raise LearningDocumentValidationError("The document block has an invalid nested structure.")
            current_type = current.get("type")
            if current_type not in cls._ALLOWED_NODE_TYPES:
                raise LearningDocumentValidationError("This document contains a node type not enabled for learning work.")
            if current_type == "text" and not isinstance(current.get("text", ""), str):
                raise LearningDocumentValidationError("Text nodes must contain text.")
            children = current.get("content", [])
            if children is not None:
                if not isinstance(children, list) or len(children) > 500:
                    raise LearningDocumentValidationError("The document block has too many nested nodes.")
                for child in children:
                    validate(child, depth + 1)

        validate(node)
        attrs = node.get("attrs", {})
        if not isinstance(attrs, dict) or str(attrs.get("blockId", "")) != str(block_id):
            raise LearningDocumentValidationError("The document block identity is missing or does not match the request.")
        plaintext = "".join(cls._collect_text(node)).strip()
        if len(plaintext) > cls._MAX_BLOCK_PLAINTEXT:
            raise LearningDocumentValidationError("A single document block exceeds the safe text size.")
        return plaintext

    @classmethod
    def _block_response(cls, row: Any) -> DocumentBlockResponse:
        content = row["content"]
        if isinstance(content, str):
            content = json.loads(content)
        return DocumentBlockResponse(
            block_id=row["block_id"],
            block_type=row["block_type"],
            content=content,
            position=row["position"],
            section_id=row["section_id"],
            author_type=row["author_type"],
            revision=row["revision"],
            updated_at=row["updated_at"],
            plaintext=row["plaintext"],
        )

    @staticmethod
    def _source_reference_response(row: Any) -> DocumentSourceReference:
        locator = row["locator"]
        if isinstance(locator, str):
            locator = json.loads(locator)
        linked_block_ids = row["linked_block_ids"] or []
        return DocumentSourceReference(
            reference_id=row["reference_id"],
            source_id=row["source_id"],
            title=row["source_title"],
            excerpt=row["excerpt"],
            citation=row["citation"],
            source_url=row["source_url"],
            locator=locator or {},
            attached_at=row["attached_at"],
            linked_block_ids=linked_block_ids,
        )

    async def _state_for_document(
        self,
        document_id: UUID | str,
        session_info: dict[str, Any],
    ) -> LearningDocumentState:
        document_sql = text("""
            SELECT document_id, session_id, assignment_id, title, schema_version, document_revision
            FROM learning_documents
            WHERE document_id = CAST(:document_id AS UUID);
        """)
        blocks_sql = text("""
            SELECT block_id, section_id, position, block_type, content, plaintext, author_type, revision, updated_at
            FROM learning_document_blocks
            WHERE document_id = CAST(:document_id AS UUID)
            ORDER BY position ASC;
        """)
        source_references_sql = text("""
            SELECT reference_row.reference_id, reference_row.source_id, reference_row.source_title,
                   reference_row.excerpt, reference_row.citation, reference_row.source_url,
                   reference_row.locator, reference_row.attached_at,
                   COALESCE(
                       array_agg(claim_link.block_id) FILTER (WHERE claim_link.block_id IS NOT NULL),
                       ARRAY[]::UUID[]
                   ) AS linked_block_ids
            FROM learning_document_source_references reference_row
            LEFT JOIN learning_document_source_claim_links claim_link
                ON claim_link.reference_id = reference_row.reference_id
            WHERE reference_row.document_id = CAST(:document_id AS UUID)
            GROUP BY reference_row.reference_id
            ORDER BY reference_row.attached_at ASC;
        """)
        async with AsyncSessionLocal() as session:
            document_result = await session.execute(document_sql, {"document_id": str(document_id)})
            document = document_result.mappings().first()
            if not document:
                raise LearningDocumentValidationError("The requested learning document no longer exists.")
            blocks_result = await session.execute(blocks_sql, {"document_id": str(document_id)})
            blocks = [self._block_response(row) for row in blocks_result.mappings().all()]
            references_result = await session.execute(source_references_sql, {"document_id": str(document_id)})
            source_references = [
                self._source_reference_response(row) for row in references_result.mappings().all()
            ]
        return LearningDocumentState(
            document_id=document["document_id"],
            session_id=document["session_id"],
            assignment_id=document["assignment_id"],
            title=document["title"],
            status=session_info["status"],
            schema_version=document["schema_version"],
            document_revision=document["document_revision"],
            blocks=blocks,
            source_references=source_references,
        )

    @classmethod
    def _is_untouched_legacy_template(cls, state: LearningDocumentState) -> bool:
        """Recognize only the prior empty five-section starter, never learner prose."""
        headings = [
            block.plaintext.strip().casefold()
            for block in state.blocks
            if block.block_type == "heading"
        ]
        non_heading_text = [
            block.plaintext.strip()
            for block in state.blocks
            if block.block_type != "heading" and block.plaintext.strip()
        ]
        return (
            len(headings) == len(cls._LEGACY_TEMPLATE_HEADINGS)
            and set(headings) == cls._LEGACY_TEMPLATE_HEADINGS
            and not non_heading_text
        )

    async def _remove_untouched_legacy_template(
        self,
        state: LearningDocumentState,
        session_info: dict[str, Any],
    ) -> LearningDocumentState:
        """Clear a purely mechanical starter so the learner begins on an open canvas."""
        if not self._is_untouched_legacy_template(state):
            return state
        async with AsyncSessionLocal() as session:
            await session.execute(
                text("DELETE FROM learning_document_blocks WHERE document_id = CAST(:document_id AS UUID);"),
                {"document_id": str(state.document_id)},
            )
            await session.execute(
                text(
                    "UPDATE learning_documents "
                    "SET document_revision = document_revision + 1, updated_at = NOW() "
                    "WHERE document_id = CAST(:document_id AS UUID);"
                ),
                {"document_id": str(state.document_id)},
            )
            await session.commit()
        await event_store.log_event(
            session_id=session_info["session_id"],
            student_id=session_info["student_id"],
            assignment_id=session_info["assignment_id"],
            question_id=session_info["current_question_id"],
            event_type="learning_document_legacy_template_removed",
            payload={"document_id": str(state.document_id)},
        )
        return await self._state_for_document(state.document_id, session_info)

    async def get_state(
        self,
        session_id: UUID | str,
        access_token: str | None,
    ) -> LearningDocumentState:
        session_info, assignment = await self._get_authorized_context(session_id, access_token)
        document_id = await self._ensure_document(session_info, assignment)
        state = await self._state_for_document(document_id, session_info)
        return await self._remove_untouched_legacy_template(state, session_info)

    @staticmethod
    def _published_source(assignment: PublicQuestionSpec, source_id: str) -> PublicSource:
        source = next(
            (item for item in assignment.published.source_pack if item.source_id == source_id),
            None,
        )
        if not source:
            raise LearningDocumentValidationError("That source is not in this assignment's evidence pack.")
        return source

    async def add_source_reference(
        self,
        session_id: UUID | str,
        access_token: str | None,
        source_id: str,
    ) -> LearningDocumentState:
        """Persist a learner-selected source card without writing any student prose."""
        session_info, assignment = await self._get_authorized_context(session_id, access_token)
        if session_info["status"] != "active":
            raise LearningDocumentConflictError("Submitted or completed sessions cannot add source references.")
        source = self._published_source(assignment, source_id)
        document_id = await self._ensure_document(session_info, assignment)
        insert_sql = text("""
            INSERT INTO learning_document_source_references (
                document_id, source_id, source_title, excerpt, citation, source_url, locator
            ) VALUES (
                CAST(:document_id AS UUID), :source_id, :source_title, :excerpt, :citation,
                :source_url, CAST(:locator AS JSONB)
            )
            ON CONFLICT (document_id, source_id) DO NOTHING;
        """)
        async with AsyncSessionLocal() as session:
            await session.execute(
                insert_sql,
                {
                    "document_id": str(document_id),
                    "source_id": source.source_id,
                    "source_title": source.title,
                    "excerpt": source.excerpt,
                    "citation": source.citation,
                    "source_url": source.source_url,
                    "locator": json.dumps({"source_id": source.source_id}),
                },
            )
            await session.commit()
        await event_store.log_event(
            session_id=session_info["session_id"],
            student_id=session_info["student_id"],
            assignment_id=session_info["assignment_id"],
            question_id=session_info["current_question_id"],
            event_type="document_source_reference_added",
            payload={"source_id": source.source_id},
        )
        return await self._state_for_document(document_id, session_info)

    async def link_source_reference(
        self,
        session_id: UUID | str,
        access_token: str | None,
        source_id: str,
        block_id: UUID | str,
    ) -> LearningDocumentState:
        """Record that the learner wants to examine a source beside one draft block."""
        session_info, assignment = await self._get_authorized_context(session_id, access_token)
        if session_info["status"] != "active":
            raise LearningDocumentConflictError("Submitted or completed sessions cannot change source links.")
        self._published_source(assignment, source_id)
        document_id = await self._ensure_document(session_info, assignment)
        reference_sql = text("""
            SELECT reference_id
            FROM learning_document_source_references
            WHERE document_id = CAST(:document_id AS UUID) AND source_id = :source_id;
        """)
        block_sql = text("""
            SELECT block_id
            FROM learning_document_blocks
            WHERE document_id = CAST(:document_id AS UUID) AND block_id = CAST(:block_id AS UUID);
        """)
        insert_sql = text("""
            INSERT INTO learning_document_source_claim_links (reference_id, block_id)
            VALUES (CAST(:reference_id AS UUID), CAST(:block_id AS UUID))
            ON CONFLICT DO NOTHING;
        """)
        async with AsyncSessionLocal() as session:
            reference_id = await session.scalar(
                reference_sql, {"document_id": str(document_id), "source_id": source_id}
            )
            if not reference_id:
                raise LearningDocumentValidationError("Select this assigned source before linking it to a claim.")
            found_block_id = await session.scalar(
                block_sql, {"document_id": str(document_id), "block_id": str(block_id)}
            )
            if not found_block_id:
                raise LearningDocumentValidationError("That claim is not part of this document.")
            await session.execute(insert_sql, {"reference_id": str(reference_id), "block_id": str(block_id)})
            await session.commit()
        await event_store.log_event(
            session_id=session_info["session_id"],
            student_id=session_info["student_id"],
            assignment_id=session_info["assignment_id"],
            question_id=session_info["current_question_id"],
            event_type="document_source_reference_linked",
            payload={"source_id": source_id, "block_id": str(block_id)},
        )
        return await self._state_for_document(document_id, session_info)

    async def locate_assigned_evidence(
        self,
        session_id: UUID | str,
        access_token: str | None,
        block_id: UUID | str,
        claim_text: str,
    ) -> AssignedEvidenceLocatorResponse:
        """Rank only assigned source cards using transparent lexical overlap, never an LLM answer."""
        session_info, assignment = await self._get_authorized_context(session_id, access_token)
        document_id = await self._ensure_document(session_info, assignment)
        block_sql = text("""
            SELECT plaintext
            FROM learning_document_blocks
            WHERE document_id = CAST(:document_id AS UUID) AND block_id = CAST(:block_id AS UUID);
        """)
        async with AsyncSessionLocal() as session:
            stored_text = await session.scalar(
                block_sql, {"document_id": str(document_id), "block_id": str(block_id)}
            )
        if stored_text is None:
            raise LearningDocumentValidationError("That claim is not part of this document.")

        stop_words = {
            "about", "after", "also", "because", "been", "being", "between", "could", "does", "from",
            "have", "into", "more", "must", "not", "only", "organized", "report", "should", "that",
            "the", "their", "there", "these", "they", "this", "through", "using", "what", "when",
            "where", "which", "who", "with", "would",
        }
        claim_terms = {
            term.lower() for term in re.findall(r"[A-Za-z][A-Za-z'-]{2,}", claim_text)
            if term.lower() not in stop_words
        }
        candidates: list[tuple[int, PublicSource, list[str]]] = []
        for source in assignment.published.source_pack:
            source_terms = set(re.findall(r"[A-Za-z][A-Za-z'-]{2,}", f"{source.title} {source.excerpt}".lower()))
            matching_terms = sorted(claim_terms & source_terms)
            candidates.append((len(matching_terms), source, matching_terms))
        candidates.sort(key=lambda item: (-item[0], item[1].title.casefold()))
        return AssignedEvidenceLocatorResponse(
            block_id=UUID(str(block_id)),
            message=(
                "These assigned passages may help you test or support your claim. "
                "They do not establish the conclusion for you."
            ),
            candidates=[
                AssignedEvidenceCandidate(
                    source_id=source.source_id,
                    title=source.title,
                    excerpt=source.excerpt,
                    citation=source.citation,
                    source_url=source.source_url,
                    locator={"source_id": source.source_id},
                    matched_terms=matched_terms,
                )
                for _score, source, matched_terms in candidates[:5]
            ],
        )

    async def sync_document(
        self,
        session_id: UUID | str,
        access_token: str | None,
        request: SyncLearningDocumentRequest,
    ) -> SyncLearningDocumentResponse:
        session_info, assignment = await self._get_authorized_context(session_id, access_token)
        if session_info["status"] != "active":
            raise LearningDocumentConflictError("Submitted or completed sessions cannot be changed.")
        document_id = await self._ensure_document(session_info, assignment)
        if not request.upserts and not request.deleted_block_ids:
            state = await self._state_for_document(document_id, session_info)
            return SyncLearningDocumentResponse(**state.model_dump(), changed_block_ids=[])

        upsert_ids = [block.block_id for block in request.upserts]
        deleted_ids = list(request.deleted_block_ids)
        if len(set(upsert_ids)) != len(upsert_ids) or len(set(deleted_ids)) != len(deleted_ids):
            raise LearningDocumentValidationError("A document patch cannot repeat block identities.")
        if set(upsert_ids) & set(deleted_ids):
            raise LearningDocumentValidationError("A block cannot be saved and deleted in the same patch.")
        positions = [block.position for block in request.upserts]
        if len(set(positions)) != len(positions):
            raise LearningDocumentValidationError("Each changed document block needs a distinct position.")
        for block in request.upserts:
            expected_type = self._BLOCK_NODE_TYPES[block.block_type]
            self._validate_node(block.content, expected_type, block.block_id)

        document_lock_sql = text("""
            SELECT document_revision
            FROM learning_documents
            WHERE document_id = CAST(:document_id AS UUID)
            FOR UPDATE;
        """)
        existing_blocks_sql = text("""
            SELECT block_id FROM learning_document_blocks
            WHERE document_id = CAST(:document_id AS UUID);
        """)
        delete_sql = text("""
            DELETE FROM learning_document_blocks
            WHERE document_id = CAST(:document_id AS UUID) AND block_id = CAST(:block_id AS UUID);
        """)
        shift_sql = text("""
            UPDATE learning_document_blocks
            SET position = position + 1000000
            WHERE document_id = CAST(:document_id AS UUID) AND block_id = CAST(:block_id AS UUID);
        """)
        insert_sql = text("""
            INSERT INTO learning_document_blocks (
                block_id, document_id, section_id, position, block_type, content, plaintext, author_type
            ) VALUES (
                CAST(:block_id AS UUID), CAST(:document_id AS UUID), :section_id, :position,
                :block_type, CAST(:content AS JSONB), :plaintext, :author_type
            );
        """)
        update_sql = text("""
            UPDATE learning_document_blocks
            SET section_id = :section_id,
                position = :position,
                block_type = :block_type,
                content = CAST(:content AS JSONB),
                plaintext = :plaintext,
                author_type = :author_type,
                revision = revision + 1,
                updated_at = NOW()
            WHERE document_id = CAST(:document_id AS UUID) AND block_id = CAST(:block_id AS UUID);
        """)
        document_update_sql = text("""
            UPDATE learning_documents
            SET document_revision = document_revision + 1, updated_at = NOW()
            WHERE document_id = CAST(:document_id AS UUID);
        """)
        changed_ids: list[UUID] = []
        async with AsyncSessionLocal() as session:
            lock_result = await session.execute(document_lock_sql, {"document_id": str(document_id)})
            current_revision = lock_result.scalar()
            if current_revision is None:
                raise LearningDocumentValidationError("The requested learning document no longer exists.")
            if int(current_revision) != request.base_revision:
                raise LearningDocumentConflictError(
                    "This document changed in another tab. Reload before saving your changes."
                )
            existing_result = await session.execute(existing_blocks_sql, {"document_id": str(document_id)})
            existing_ids = {row[0] for row in existing_result.all()}
            for block_id in deleted_ids:
                if block_id not in existing_ids:
                    raise LearningDocumentValidationError("A deleted block does not belong to this document.")
                await session.execute(delete_sql, {"document_id": str(document_id), "block_id": str(block_id)})
                changed_ids.append(block_id)
            for block in request.upserts:
                if block.block_id in existing_ids:
                    await session.execute(
                        shift_sql, {"document_id": str(document_id), "block_id": str(block.block_id)}
                    )
            for block in request.upserts:
                plaintext = self._validate_node(
                    block.content, self._BLOCK_NODE_TYPES[block.block_type], block.block_id
                )
                values = {
                    "block_id": str(block.block_id),
                    "document_id": str(document_id),
                    "section_id": block.section_id,
                    "position": block.position,
                    "block_type": block.block_type,
                    "content": json.dumps(block.content),
                    "plaintext": plaintext,
                    "author_type": block.author_type,
                }
                await session.execute(update_sql if block.block_id in existing_ids else insert_sql, values)
                changed_ids.append(block.block_id)
            await session.execute(document_update_sql, {"document_id": str(document_id)})
            await session.commit()
        state = await self._state_for_document(document_id, session_info)
        await event_store.log_event(
            session_id=session_info["session_id"],
            student_id=session_info["student_id"],
            assignment_id=session_info["assignment_id"],
            question_id=session_info["current_question_id"],
            event_type="learning_document_synced",
            payload={
                "document_id": str(document_id),
                "document_revision": state.document_revision,
                "changed_blocks": len(changed_ids),
            },
        )
        return SyncLearningDocumentResponse(**state.model_dump(), changed_block_ids=changed_ids)


learning_document_service = LearningDocumentService()
