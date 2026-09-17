from secrets import token_urlsafe
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

from fiosra.mvp.api_errors import LearnerAPIError
from fiosra.mvp.assignment_designer.generator import assignment_generator
from fiosra.mvp.event_store import SubmissionConflictError, event_store

router = APIRouter(prefix="/events", tags=["Event Store"])
SessionToken = Annotated[str | None, Header(alias="X-Fiosra-Session-Token")]


class CreateSessionRequest(BaseModel):
    student_id: str = Field(..., description="Unique student identifier")
    assignment_id: UUID | None = Field(default=None, description="Optional associated assignment ID")
    current_question_id: str = Field(default="q1", description="Initial question identifier")


class CreateSessionResponse(BaseModel):
    session_id: str
    student_id: str
    status: str
    access_token: str = Field(description="Opaque capability required for student canvas operations")


class LogEventRequest(BaseModel):
    session_id: UUID = Field(..., description="UUID of active session")
    student_id: str = Field(..., description="Student ID")
    question_id: str = Field(..., description="Current question ID")
    event_type: Literal["speech_to_thought_crystallized"] = Field(
        ..., description="Learner-authored reflection event type"
    )
    payload: dict[str, Any] = Field(..., description="Event payload validated against the session context")
    assignment_id: UUID | None = Field(default=None, description="Optional assignment ID")


class LogEventResponse(BaseModel):
    event_id: int
    status: str = "logged"


class SubmitSessionResponse(BaseModel):
    session_id: str
    status: str
    document_revision: int
    submitted_at: str
    idempotent_replay: bool = False
    message: str


class SubmitSessionRequest(BaseModel):
    """The exact server-saved document revision the learner intends to submit."""

    document_revision: int | None = Field(default=None, ge=0)


IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]


async def get_authorized_session(session_id: UUID, session_token: str | None) -> dict[str, Any]:
    """Resolve an active browser-held session capability without exposing its stored digest."""
    if not await event_store.has_session_access(session_id, session_token):
        raise LearnerAPIError(
            status_code=status.HTTP_403_FORBIDDEN,
            code="SESSION_AUTHORIZATION",
            message="This session needs reconnecting before it can be accessed.",
        )
    session_info = await event_store.get_session_details(session_id)
    if not session_info:
        raise LearnerAPIError(
            status_code=status.HTTP_404_NOT_FOUND,
            code="SESSION_NOT_FOUND",
            message="This reasoning session is no longer available.",
        )
    return session_info


@router.post("/session", response_model=CreateSessionResponse)
async def create_session(request: CreateSessionRequest) -> dict[str, str]:
    """Initialize an active student reasoning session."""
    if request.assignment_id:
        assignment = await assignment_generator.get_public_assignment(request.assignment_id)
        if not assignment or assignment.status != "published":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Student sessions can be started only for a published assignment.",
            )
        if request.current_question_id != assignment.question_id:
            raise HTTPException(
                status_code=409,
                detail="The requested question does not match the published assignment.",
            )
    access_token = token_urlsafe(32)
    session_id = await event_store.create_session(
        student_id=request.student_id,
        assignment_id=request.assignment_id,
        current_question_id=request.current_question_id,
        access_token=access_token,
    )
    return {
        "session_id": session_id,
        "student_id": request.student_id,
        "status": "active",
        "access_token": access_token,
    }


@router.post("/log", response_model=LogEventResponse)
async def log_session_event(
    request: LogEventRequest,
    session_token: SessionToken = None,
) -> dict[str, Any]:
    """Append an allow-listed learner reflection only to its authorized active session."""
    session_info = await get_authorized_session(request.session_id, session_token)
    if session_info["status"] != "active":
        raise HTTPException(status_code=409, detail="Submitted or completed sessions cannot accept new events.")
    if request.student_id != session_info["student_id"]:
        raise HTTPException(status_code=403, detail="Student identity does not match the authorized session.")
    if request.question_id != session_info["current_question_id"]:
        raise HTTPException(status_code=409, detail="Question context does not match the active session.")
    if request.assignment_id and str(request.assignment_id) != str(session_info.get("assignment_id")):
        raise HTTPException(status_code=409, detail="Assignment context does not match the active session.")
    event_id = await event_store.log_event(
        session_id=request.session_id,
        student_id=request.student_id,
        question_id=request.question_id,
        event_type=request.event_type,
        payload=request.payload,
        assignment_id=request.assignment_id,
    )
    return {"event_id": event_id, "status": "logged"}


@router.post("/session/{session_id}/submit", response_model=SubmitSessionResponse)
async def submit_session_for_review(
    session_id: UUID,
    request: SubmitSessionRequest | None = None,
    session_token: SessionToken = None,
    idempotency_key: IdempotencyKey = None,
) -> dict[str, Any]:
    """Send a student reasoning trace to the educator review queue without granting grade authority."""
    session_info = await get_authorized_session(session_id, session_token)
    if session_info["status"] == "completed":
        raise LearnerAPIError(
            status_code=status.HTTP_409_CONFLICT,
            code="SUBMISSION_BLOCKED",
            message="This session has already been finalized by an educator.",
        )
    target_revision = request.document_revision if request else None
    if target_revision is None:
        target_revision = await event_store.get_document_revision(session_id)
    if target_revision is None:
        raise LearnerAPIError(
            status_code=status.HTTP_409_CONFLICT,
            code="SUBMISSION_BLOCKED",
            message="Save your document before submitting it for educator review.",
        )
    safe_idempotency_key = idempotency_key or f"legacy-session-{session_id}"
    try:
        submitted = await event_store.submit_session(
            session_id,
            document_revision=target_revision,
            idempotency_key=safe_idempotency_key,
        )
    except SubmissionConflictError as error:
        raise LearnerAPIError(
            status_code=status.HTTP_409_CONFLICT,
            code="SUBMISSION_BLOCKED",
            message=str(error),
        ) from error

    if submitted["created"]:
        await event_store.log_event(
            session_id=session_id,
            student_id=session_info["student_id"],
            question_id=session_info.get("current_question_id", "q1"),
            event_type="student_submitted_for_review",
            payload={
                "submission_status": "submitted",
                "document_revision": submitted["document_revision"],
                "submitted_at": submitted["submitted_at"].isoformat(),
            },
            assignment_id=session_info.get("assignment_id"),
        )
    return {
        "session_id": str(session_id),
        "status": "submitted",
        "document_revision": submitted["document_revision"],
        "submitted_at": submitted["submitted_at"].isoformat(),
        "idempotent_replay": not submitted["created"],
        "message": "Reasoning trace submitted for educator review.",
    }


@router.get("/session/{session_id}")
async def get_session_replay(
    session_id: UUID,
    session_token: SessionToken = None,
) -> dict[str, Any]:
    """Return the full chronological flight-recorder trace for a session."""
    session_info = await get_authorized_session(session_id, session_token)
    events = await event_store.get_session_events(session_id)
    return {"session": session_info, "total_events": len(events), "events": events}
