from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

from fiosra.mvp.assignment_designer.generator import assignment_generator
from fiosra.mvp.dialogue_engine import dialogue_engine
from fiosra.mvp.event_store import event_store

router = APIRouter(prefix="/dialogue", tags=["Socratic Dialogue"])
SessionToken = Annotated[str | None, Header(alias="X-Fiosra-Session-Token")]


class DialogueMessageRequest(BaseModel):
    session_id: UUID = Field(..., description="Active session ID")
    student_id: str = Field(..., description="Student ID")
    question_id: str | None = Field(default=None, description="Current question ID")
    student_input: str = Field(..., min_length=1, max_length=12000, description="Student reasoning attempt")
    question_prompt: str = Field(..., min_length=3, description="Original question prompt")
    domain: str = Field(default="history", description="Curriculum domain")
    current_rung: int = Field(default=0, ge=0, le=3, description="Legacy client display value; ignored by server")
    hint_requested: bool = Field(default=False, description="Whether the student explicitly asked for a hint")
    assignment_id: UUID | None = Field(default=None, description="Optional assignment ID")
    active_section_id: str | None = Field(
        default=None,
        min_length=3,
        max_length=64,
        description="Requested canvas section; resolved and validated from the published assignment server-side.",
    )


class DialogueMessageResponse(BaseModel):
    response_text: str
    thoughts_of_tutorbot: dict[str, Any]
    hint_rung: int | None = None
    rung: int | None = None
    penalty_score: float
    is_adversarial: bool
    matched_misconception_id: str | None = None
    generation_metadata: dict[str, Any] | None = None
    action_capsules: list[dict[str, Any]] | None = None
    prompt_launchers: list[dict[str, Any]] | None = None
    learner_radar: dict[str, Any] | None = None


@router.post("/message", response_model=DialogueMessageResponse)
async def handle_dialogue_turn(
    request: DialogueMessageRequest,
    session_token: SessionToken = None,
) -> dict[str, Any]:
    """Process a guarded Socratic turn with server-controlled hint advancement."""
    if not await event_store.has_session_access(request.session_id, session_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This browser is not authorized to contribute to the requested reasoning session.",
        )
    session_info = await event_store.get_session_details(request.session_id)
    if not session_info:
        raise HTTPException(status_code=404, detail=f"Session '{request.session_id}' not found")
    if session_info["status"] != "active":
        raise HTTPException(status_code=409, detail="This session is no longer accepting student responses.")
    if request.student_id != session_info["student_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student identity does not match this session.")
    
    authoritative_question_id = session_info.get("current_question_id") or "q1"
    if request.question_id and request.question_id not in (authoritative_question_id, "q1"):
        if request.question_id.lower() != authoritative_question_id.lower():
            raise HTTPException(status_code=409, detail="Question context does not match the active session.")
    active_question_id = authoritative_question_id

    authoritative_assignment_id = session_info.get("assignment_id")
    assignment_context = None
    active_section_context = None
    if authoritative_assignment_id:
        assignment_context = await assignment_generator.get_public_assignment(authoritative_assignment_id)
        if not assignment_context:
            raise HTTPException(status_code=409, detail="The session's published assignment is no longer available.")
        if request.assignment_id and str(request.assignment_id) != authoritative_assignment_id:
            raise HTTPException(status_code=409, detail="The request assignment does not match this student session.")
        section_id = request.active_section_id or assignment_context.canvas_sections[0].section_id
        active_section = next(
            (section for section in assignment_context.canvas_sections if section.section_id == section_id),
            None,
        )
        if not active_section:
            raise HTTPException(status_code=409, detail="The requested canvas section is not declared by this assignment.")
        active_section_context = (
            f"{active_section.label}: {active_section.purpose} "
            f"Guidance: {active_section.completion_guidance}"
        )

    active_prompt = assignment_context.prompt if assignment_context else request.question_prompt
    active_domain = assignment_context.domain if assignment_context else request.domain
    active_hint_ladder = assignment_context.hint_ladder if assignment_context else None
    active_target_kcs = assignment_context.target_kcs if assignment_context else None
    is_course_grounded = bool(
        assignment_context and assignment_context.grounding_mode == "course_grounded"
    )

    await event_store.log_event(
        session_id=request.session_id,
        student_id=request.student_id,
        question_id=active_question_id,
        event_type="student_prompt_submitted",
        payload={"student_input": request.student_input, "hint_requested": request.hint_requested},
        assignment_id=request.assignment_id or session_info.get("assignment_id"),
    )

    stored_rung = await event_store.get_current_hint_rung(request.session_id)
    engine_rung = stored_rung or 0

    recent_events = await event_store.get_session_events(request.session_id, limit=50)
    dialogue_history: list[dict[str, str]] = []
    for ev in recent_events[:-1]:
        etype = ev.get("event_type")
        payload = ev.get("payload") or {}
        if etype == "student_prompt_submitted" and payload.get("student_input"):
            dialogue_history.append({"role": "student", "text": payload["student_input"]})
        elif etype in ("tutor_turn_completed", "hint_delivered", "adversarial_probe_defended") and payload.get("response_text"):
            dialogue_history.append({"role": "tutor", "text": payload["response_text"]})

    canvas_blocks: list[dict[str, Any]] = []
    try:
        from fiosra.mvp.learning_document_service import learning_document_service
        doc_state = await learning_document_service.get_state(request.session_id, session_token)
        if doc_state and getattr(doc_state, "blocks", None):
            canvas_blocks = [
                {"id": str(b.block_id), "text": b.plaintext or "", "role": b.block_type}
                for b in doc_state.blocks
                if (b.plaintext or "").strip()
            ]
    except Exception:
        canvas_blocks = []

    assigned_sources: list[dict[str, Any]] = []
    if assignment_context and assignment_context.published and getattr(assignment_context.published, "source_pack", None):
        for s in assignment_context.published.source_pack:
            assigned_sources.append({
                "source_id": getattr(s, "source_id", ""),
                "title": getattr(s, "title", ""),
                "author": getattr(s, "author", "") or "",
                "excerpt": s.excerpt[:300] if getattr(s, "excerpt", None) else "",
            })

    focused_block_id = str(canvas_blocks[0]["id"]) if canvas_blocks else None
    focused_block_text = canvas_blocks[0]["text"] if canvas_blocks else ""

    from fiosra.mvp.agents.graph import socratic_tutor_graph

    initial_state = {
        "session_id": str(request.session_id),
        "student_id": request.student_id,
        "assignment_id": str(request.assignment_id or session_info.get("assignment_id") or ""),
        "question_id": active_question_id,
        "current_rung": engine_rung,
        "hint_requested": request.hint_requested,
        "is_hint_requested": request.hint_requested,
        "student_input": request.student_input,
        "dialogue_history": dialogue_history,
        "domain": active_domain,
        "assignment_meta": {"question_prompt": active_prompt},
        "target_bloom_level": "Analyze",
        "rubric_criteria": [],
        "active_beliefs": [],
        "historical_pivots": [],
        "in_flight_revisions": [],
        "open_exhibit_id": None,
        "open_exhibit_page": None,
        "selected_source_quote": None,
        "retrieved_source_chunks": [],
        "target_kcs": active_target_kcs or [],
        "active_misconceptions": [],
        "prerequisite_status": {},
        "canvas_blocks": canvas_blocks,
        "focused_block_id": focused_block_id,
        "focused_block_text": focused_block_text,
        "section_guidance": active_section_context or "",
        "assigned_sources": assigned_sources,
        "adversarial_flag": False,
        "adversarial_reason": None,
        "temporal_context": [],
        "diagnosed_misconception": None,
        "thoughts_of_tutorbot": {},
        "draft_response": "",
        "verification_attempts": 0,
        "is_approved": False,
        "critic_violation": None,
        "remediation_instructions": None,
        "final_verified_response": "",
        "action_capsules": [],
        "prompt_launchers": [],
        "learner_radar": {},
        "penalty_score": 0.0,
        "discourse_phase": "",
        "hint_ladder": active_hint_ladder,
        "hint_rung": None,
    }

    from fiosra.mvp.llm.orchestrator import LLMServiceUnavailableError

    try:
        graph_result = await socratic_tutor_graph.ainvoke(
            initial_state,
            config={"configurable": {"thread_id": f"session-{request.session_id}"}},
        )
    except LLMServiceUnavailableError as exc:
        await event_store.log_event(
            session_id=request.session_id,
            student_id=request.student_id,
            question_id=active_question_id,
            event_type="dialogue_service_unavailable",
            payload={"error": str(exc)},
            assignment_id=request.assignment_id or session_info.get("assignment_id"),
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Socratic dialogue service is unavailable: {exc}",
        ) from exc

    discourse_phase = graph_result.get("discourse_phase", "substantive_inquiry")
    response_text = graph_result.get("final_verified_response") or graph_result.get("draft_response") or ""
    is_adversarial = discourse_phase == "adversarial"
    hint_rung = graph_result.get("hint_rung") if (request.hint_requested and discourse_phase == "hint_scaffold") else engine_rung
    action_capsules = graph_result.get("action_capsules", []) if not request.hint_requested else []
    prompt_launchers = graph_result.get("prompt_launchers", [])
    learner_radar = graph_result.get("learner_radar")
    thoughts = graph_result.get("thoughts_of_tutorbot", {})
    penalty = graph_result.get("penalty_score", 0.0)

    if is_adversarial:
        event_type = "adversarial_probe_defended"
    elif request.hint_requested:
        event_type = "hint_delivered"
    else:
        event_type = "tutor_turn_completed"

    event_payload = {
        "response_text": response_text,
        "thoughts_of_tutorbot": thoughts,
        "hint_rung": hint_rung,
        "rung": hint_rung,
        "penalty_score": penalty,
        "matched_misconception_id": None,
        "probe_id": None,
        "generation_metadata": {"discourse_phase": discourse_phase},
        "action_capsules": action_capsules,
        "learner_radar": learner_radar,
    }
    await event_store.log_event(
        session_id=request.session_id,
        student_id=request.student_id,
        question_id=active_question_id,
        event_type=event_type,
        payload=event_payload,
        assignment_id=request.assignment_id or session_info.get("assignment_id"),
    )

    return {
        "response_text": response_text,
        "thoughts_of_tutorbot": thoughts,
        "hint_rung": hint_rung,
        "rung": hint_rung,
        "penalty_score": penalty,
        "matched_misconception_id": None,
        "generation_metadata": {"discourse_phase": discourse_phase},
        "action_capsules": action_capsules,
        "prompt_launchers": prompt_launchers,
        "learner_radar": learner_radar,
        "is_adversarial": is_adversarial,
    }
