"""Typed contracts for the protected long-form student document API."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

DocumentBlockType = Literal["heading", "paragraph", "blockquote", "bullet_list", "ordered_list"]
DocumentAuthorType = Literal["student", "student_edited_assistance"]


class DocumentBlockInput(BaseModel):
    """One top-level ProseMirror/Tiptap document block supplied by the learner client."""

    model_config = ConfigDict(extra="forbid")

    block_id: UUID
    block_type: DocumentBlockType
    content: dict[str, Any]
    position: int = Field(ge=1, le=100_000)
    section_id: str | None = Field(default=None, pattern=r"^[a-z][a-z0-9_]{2,63}$")
    author_type: DocumentAuthorType = "student"


class DocumentBlockResponse(DocumentBlockInput):
    revision: int = Field(ge=1)
    updated_at: datetime
    plaintext: str


class DocumentSourceReference(BaseModel):
    """Learner-selected published source context; never a claim of proof."""

    reference_id: UUID
    source_id: str
    title: str
    excerpt: str
    citation: str | None = None
    source_url: str | None = None
    locator: dict[str, Any] = Field(default_factory=dict)
    attached_at: datetime
    linked_block_ids: list[UUID] = Field(default_factory=list)


class AddDocumentSourceReferenceRequest(BaseModel):
    source_id: str = Field(min_length=1, max_length=160)


class LinkDocumentSourceReferenceRequest(BaseModel):
    block_id: UUID


class AssignedEvidenceLocatorRequest(BaseModel):
    block_id: UUID
    claim_text: str = Field(min_length=4, max_length=12_000)


class AssignedEvidenceCandidate(BaseModel):
    source_id: str
    title: str
    excerpt: str
    citation: str | None = None
    source_url: str | None = None
    locator: dict[str, Any] = Field(default_factory=dict)
    matched_terms: list[str] = Field(default_factory=list)


class AssignedEvidenceLocatorResponse(BaseModel):
    block_id: UUID
    message: str
    candidates: list[AssignedEvidenceCandidate] = Field(default_factory=list)


class LearningDocumentState(BaseModel):
    """Authorized, student-visible state of one session-bound long-form document."""

    document_id: UUID
    session_id: UUID
    assignment_id: UUID
    title: str
    status: Literal["active", "submitted", "completed"]
    schema_version: int = 1
    document_revision: int = Field(ge=0)
    blocks: list[DocumentBlockResponse]
    source_references: list[DocumentSourceReference] = Field(default_factory=list)


class SyncLearningDocumentRequest(BaseModel):
    """Incremental document patch with optimistic-concurrency protection."""

    model_config = ConfigDict(extra="forbid")

    base_revision: int = Field(ge=0)
    upserts: list[DocumentBlockInput] = Field(default_factory=list, max_length=300)
    deleted_block_ids: list[UUID] = Field(default_factory=list, max_length=300)


class SyncLearningDocumentResponse(LearningDocumentState):
    changed_block_ids: list[UUID] = Field(default_factory=list)
