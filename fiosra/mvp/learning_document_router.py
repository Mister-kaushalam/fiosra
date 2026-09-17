"""HTTP boundary for protected long-form learner documents."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, status

from fiosra.mvp.api_errors import LearnerAPIError
from fiosra.mvp.learning_document_schemas import (
    AddDocumentSourceReferenceRequest,
    AssignedEvidenceLocatorRequest,
    AssignedEvidenceLocatorResponse,
    LearningDocumentState,
    LinkDocumentSourceReferenceRequest,
    SyncLearningDocumentRequest,
    SyncLearningDocumentResponse,
)
from fiosra.mvp.learning_document_service import (
    LearningDocumentAccessError,
    LearningDocumentConflictError,
    LearningDocumentValidationError,
    learning_document_service,
)

router = APIRouter(prefix="/learning-documents", tags=["Long-form Student Documents"])
SessionToken = Annotated[str | None, Header(alias="X-Fiosra-Session-Token")]


def _raise_document_error(error: Exception) -> None:
    if isinstance(error, LearningDocumentAccessError):
        raise LearnerAPIError(
            status_code=status.HTTP_403_FORBIDDEN,
            code="SESSION_AUTHORIZATION",
            message="This session needs reconnecting before your document can be accessed.",
        ) from error
    if isinstance(error, LearningDocumentConflictError):
        raise LearnerAPIError(
            status_code=status.HTTP_409_CONFLICT,
            code="DOCUMENT_CONFLICT",
            message="A newer document version exists. Review it before saving changes.",
        ) from error
    if isinstance(error, LearningDocumentValidationError):
        raise LearnerAPIError(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="VALIDATION_ERROR",
            message=str(error),
        ) from error
    raise error


@router.get("/sessions/{session_id}", response_model=LearningDocumentState)
async def get_learning_document(
    session_id: UUID,
    session_token: SessionToken = None,
) -> LearningDocumentState:
    """Load or import the current learner-owned document for an authorized active session."""
    try:
        return await learning_document_service.get_state(session_id, session_token)
    except (LearningDocumentAccessError, LearningDocumentConflictError, LearningDocumentValidationError) as error:
        _raise_document_error(error)


@router.put("/sessions/{session_id}", response_model=SyncLearningDocumentResponse)
async def sync_learning_document(
    session_id: UUID,
    request: SyncLearningDocumentRequest,
    session_token: SessionToken = None,
) -> SyncLearningDocumentResponse:
    """Persist a revision-checked batch of learner document block changes."""
    try:
        return await learning_document_service.sync_document(session_id, session_token, request)
    except (LearningDocumentAccessError, LearningDocumentConflictError, LearningDocumentValidationError) as error:
        _raise_document_error(error)


@router.post("/sessions/{session_id}/source-references", response_model=LearningDocumentState)
async def add_learning_document_source_reference(
    session_id: UUID,
    request: AddDocumentSourceReferenceRequest,
    session_token: SessionToken = None,
) -> LearningDocumentState:
    """Persist selected assigned-source context without changing student-authored prose."""
    try:
        return await learning_document_service.add_source_reference(
            session_id, session_token, request.source_id
        )
    except (LearningDocumentAccessError, LearningDocumentConflictError, LearningDocumentValidationError) as error:
        _raise_document_error(error)


@router.post("/sessions/{session_id}/source-references/{source_id}/links", response_model=LearningDocumentState)
async def link_learning_document_source_reference(
    session_id: UUID,
    source_id: str,
    request: LinkDocumentSourceReferenceRequest,
    session_token: SessionToken = None,
) -> LearningDocumentState:
    """Link a learner-selected source to one existing document block for review."""
    try:
        return await learning_document_service.link_source_reference(
            session_id, session_token, source_id, request.block_id
        )
    except (LearningDocumentAccessError, LearningDocumentConflictError, LearningDocumentValidationError) as error:
        _raise_document_error(error)


@router.post("/sessions/{session_id}/assigned-evidence", response_model=AssignedEvidenceLocatorResponse)
async def locate_learning_document_assigned_evidence(
    session_id: UUID,
    request: AssignedEvidenceLocatorRequest,
    session_token: SessionToken = None,
) -> AssignedEvidenceLocatorResponse:
    """Locate relevant assigned material without generating a substantive answer."""
    try:
        return await learning_document_service.locate_assigned_evidence(
            session_id, session_token, request.block_id, request.claim_text
        )
    except (LearningDocumentAccessError, LearningDocumentConflictError, LearningDocumentValidationError) as error:
        _raise_document_error(error)
