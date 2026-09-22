from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text

from fiosra.mvp.assignment_designer.generator import assignment_generator
from fiosra.mvp.database import AsyncSessionLocal
from fiosra.mvp.event_store import event_store
from fiosra.mvp.evidence_dossier.synthesizer import evidence_dossier_synthesizer
from fiosra.mvp.analytics.thinking_trace import build_activity_log, build_reasoning_trace
from fiosra.mvp.socratic_probe_service import socratic_probe_service

router = APIRouter(prefix="/evidence", tags=["Evidence & AutoSCORE Dossier"])


async def _published_rubric(session_info: dict[str, Any]) -> list[dict[str, Any]] | None:
    assignment_id = session_info.get("assignment_id")
    if not assignment_id:
        return None
    assignment = await assignment_generator.get_public_assignment(assignment_id)
    if not assignment:
        return None
    return [
        {
            "criterion_id": criterion.criterion_id,
            "label": criterion.title,
            "description": criterion.description,
            "weight": criterion.weight,
        }
        for criterion in assignment.published.public_rubric
    ]


class FinaliseGradeRequest(BaseModel):
    approved_grade: str = Field(..., min_length=1, max_length=12, description="Educator-approved final grade")
    teacher_id: str = Field(default="teacher_sovereign_01", description="Educator ID finalizing the grade")
    teacher_override: bool = Field(default=False, description="Whether the educator overrode the suggested grade")
    feedback_comments: str = Field(default="", max_length=4000, description="Formative feedback notes")


class FinaliseGradeResponse(BaseModel):
    session_id: str
    status: str
    final_grade: str
    teacher_id: str
    teacher_override: bool
    message: str


@router.get("/review-queue")
async def get_review_queue(
    course_id: Annotated[UUID | None, Query()] = None,
    assignment_id: Annotated[UUID | None, Query()] = None,
) -> list[dict[str, Any]]:
    """Return submitted student sessions ready for sovereign educator review."""
    sql = text("""
        SELECT s.session_id, s.student_id, s.assignment_id, s.status, s.last_activity_at, a.title
        FROM student_sessions s
        LEFT JOIN assignments a ON s.assignment_id = a.assignment_id
        LEFT JOIN modules m ON a.module_id = m.module_id
        WHERE s.status = 'submitted'
          AND (CAST(:course_id AS UUID) IS NULL OR m.course_id = CAST(:course_id AS UUID))
          AND (CAST(:assignment_id AS UUID) IS NULL OR s.assignment_id = CAST(:assignment_id AS UUID))
        ORDER BY s.last_activity_at DESC;
    """)
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            sql,
            {
                "course_id": str(course_id) if course_id else None,
                "assignment_id": str(assignment_id) if assignment_id else None,
            },
        )
        rows = result.mappings().all()

    queue: list[dict[str, Any]] = []
    for row in rows:
        session_info = await event_store.get_session_details(row["session_id"])
        events = await event_store.get_session_events(row["session_id"])
        dossier = evidence_dossier_synthesizer.synthesize_dossier(
            session_info=session_info,
            events=events,
            rubric_criteria=await _published_rubric(session_info),
        )
        summary = dossier.get("executive_summary", {})
        queue.append(
            {
                "session_id": str(row["session_id"]),
                "student_id": row["student_id"],
                "assignment_id": str(row["assignment_id"]) if row["assignment_id"] else None,
                "assignment_title": row["title"] or "Reasoning assignment",
                "submitted_at": row["last_activity_at"].isoformat() if row["last_activity_at"] else None,
                "suggested_grade": summary.get("suggested_grade", "Pending"),
                "autonomy_score": summary.get("autonomy_score", 0),
                "misconceptions_triggered": summary.get("misconceptions_triggered", []),
            }
        )
    return queue


@router.get("/dossier/{session_id}")
async def get_executive_evidence_dossier(session_id: UUID) -> dict[str, Any]:
    """Synthesize the educator review dossier with evidence quotes and reasoning telemetry."""
    session_info = await event_store.get_session_details(session_id)
    if not session_info:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    events = await event_store.get_session_events(session_id)
    dossier = evidence_dossier_synthesizer.synthesize_dossier(
        session_info=session_info,
        events=events,
        rubric_criteria=await _published_rubric(session_info),
    )
    dossier["proactive_socratic_evidence"] = [
        record.model_dump(mode="json") for record in await socratic_probe_service.trace_records(session_id)
    ]

    # Extract latest canvas drafts authored in this session
    latest_sections: dict[str, dict[str, Any]] = {}
    for ev in events:
        if ev.get("event_type") == "canvas_section_saved":
            p = ev.get("payload", {})
            sec_id = p.get("section_id")
            if sec_id:
                latest_sections[sec_id] = {
                    "section_id": sec_id,
                    "title": sec_id.replace("_", " ").title(),
                    "text": p.get("plaintext") or p.get("text") or "",
                    "revision": p.get("revision", 1),
                    "updated_at": ev.get("created_at"),
                }

    # Match with assignment canvas section prompts if available
    assignment_id = session_info.get("assignment_id")
    if assignment_id:
        assignment = await assignment_generator.get_public_assignment(assignment_id)
        if assignment and assignment.canvas_sections:
            for s_def in assignment.canvas_sections:
                if s_def.section_id in latest_sections:
                    latest_sections[s_def.section_id]["title"] = s_def.title
                    latest_sections[s_def.section_id]["prompt"] = s_def.prompt

    dossier["canvas_sections"] = list(latest_sections.values())
    return dossier


@router.post("/dossier/{session_id}/finalise-grade", response_model=FinaliseGradeResponse)
async def finalise_student_grade(session_id: UUID, request: FinaliseGradeRequest) -> dict[str, Any]:
    """Record an educator's grade decision and seal the student session as completed."""
    session_info = await event_store.get_session_details(session_id)
    if not session_info:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    if session_info["status"] == "completed":
        raise HTTPException(status_code=409, detail="This session has already been finalized.")

    await event_store.log_event(
        session_id=session_id,
        student_id=session_info["student_id"],
        question_id=session_info.get("current_question_id", "q1"),
        event_type="grade_finalised_by_educator",
        payload={
            "approved_grade": request.approved_grade,
            "teacher_id": request.teacher_id,
            "teacher_override": request.teacher_override,
            "feedback_comments": request.feedback_comments,
        },
        assignment_id=session_info.get("assignment_id"),
    )
    await event_store.complete_session(session_id)
    return {
        "session_id": str(session_id),
        "status": "completed",
        "final_grade": request.approved_grade,
        "teacher_id": request.teacher_id,
        "teacher_override": request.teacher_override,
        "message": "Grade successfully recorded and session finalized.",
    }


@router.get("/trace/{session_id}")
async def get_student_reasoning_trace(session_id: UUID) -> dict[str, Any]:
    """Return a renderable chronological trace for the student reasoning canvas."""
    session_info = await event_store.get_session_details(session_id)
    if not session_info:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    events = await event_store.get_session_events(session_id)
    trace_nodes = []
    for event in events:
        payload = event.get("payload", {})
        event_type = event.get("event_type")
        summary = (
            payload.get("student_input")
            or payload.get("response_text")
            or payload.get("approved_grade")
        )
        if event_type == "canvas_section_saved":
            summary = f"{payload.get('section_id', 'Canvas')} saved at revision {payload.get('revision', 0)}."
        elif event_type == "canvas_suggestion_offered":
            summary = f"Optional {payload.get('kind', 'writing')} support offered for {payload.get('section_id', 'canvas')}."
        elif event_type == "canvas_suggestion_accepted":
            summary = f"Student applied and edited optional support in {payload.get('section_id', 'canvas')}."
        elif event_type == "canvas_suggestion_dismissed":
            summary = f"Student dismissed optional support in {payload.get('section_id', 'canvas')}."
        elif event_type == "socratic_probe_offered":
            summary = f"A proactive {payload.get('focus_type', 'reasoning')} question was offered for a saved paragraph."
        elif event_type == "socratic_probe_response_submitted":
            summary = "Student saved a response as evidence for educator review."
        elif event_type == "socratic_probe_deferred":
            summary = "Student deferred a proactive question for later."
        elif event_type == "socratic_probe_dismissed":
            summary = "Student dismissed a proactive question; the claim remains without a response record."
        trace_nodes.append(
            {
                "event_id": event.get("event_id"),
                "timestamp": event.get("created_at"),
                "event_type": event_type,
                "question_id": event.get("question_id"),
                "summary": summary or event_type,
                "payload": payload,
            }
        )
    return {"session_id": str(session_id), "total_nodes": len(trace_nodes), "trace_nodes": trace_nodes}


@router.get("/trace/{session_id}/reasoning")
async def get_reasoning_timeline(session_id: UUID) -> dict[str, Any]:
    """Return the curated reasoning trace: only intellectual milestones."""
    session_info = await event_store.get_session_details(session_id)
    if not session_info:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    events = await event_store.get_session_events(session_id)
    nodes = build_reasoning_trace(events)
    return {"session_id": str(session_id), "total_nodes": len(nodes), "nodes": nodes}


@router.get("/trace/{session_id}/activity")
async def get_activity_timeline(session_id: UUID) -> dict[str, Any]:
    """Return the full mechanical activity log: every event as a timeline node."""
    session_info = await event_store.get_session_details(session_id)
    if not session_info:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    events = await event_store.get_session_events(session_id)
    nodes = build_activity_log(events)
    return {"session_id": str(session_id), "total_nodes": len(nodes), "nodes": nodes}
