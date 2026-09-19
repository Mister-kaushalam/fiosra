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
    hint_rung: int
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
    # Adversarial prompts never receive the accumulated hint context. This preserves
    # the existing ladder for the next legitimate turn while returning a base redirect.
    engine_rung = 0 if dialogue_engine.is_adversarial_attempt(request.student_input) else stored_rung
    result = await dialogue_engine.generate_response(
        student_input=request.student_input,
        question_prompt=active_prompt,
        domain=active_domain,
        current_rung=engine_rung,
        hint_requested=request.hint_requested,
        hint_ladder=active_hint_ladder,
        target_kcs=active_target_kcs,
        is_course_grounded=is_course_grounded,
        active_section_context=active_section_context,
        student_id=request.student_id,
    )

    if result["is_adversarial"]:
        event_type = "adversarial_probe_defended"
    elif request.hint_requested:
        event_type = "hint_delivered"
    else:
        event_type = "tutor_turn_completed"

    # Attach Epistemic Action Capsules & Progress Radar to turn
    try:
        from fiosra.mvp.agents.socratic_tutor_agent import SocraticTutorAgent
        tutor_agent = SocraticTutorAgent()
        toulmin_data = tutor_agent.decompose_toulmin({
            "focused_block_text": request.student_input,
            "student_input": request.student_input,
        })
        packed = tutor_agent.pack_epistemic_actions({
            "focused_block_id": "current-block",
            "toulmin_structure": toulmin_data.get("toulmin_structure"),
            "final_verified_response": result["response_text"],
        })
        result["action_capsules"] = packed.get("action_capsules", [])
        result["prompt_launchers"] = packed.get("prompt_launchers", [])
        result["learner_radar"] = packed.get("learner_radar", {})
    except Exception:
        result["action_capsules"] = []
        result["prompt_launchers"] = []
        result["learner_radar"] = None

    event_payload = {
        "response_text": result["response_text"],
        "thoughts_of_tutorbot": result["thoughts_of_tutorbot"],
        "hint_rung": result["hint_rung"],
        "rung": result["hint_rung"],
        "penalty_score": result["penalty_score"],
        "matched_misconception_id": result.get("matched_misconception_id"),
        "probe_id": result.get("matched_probe_id"),
        "generation_metadata": result.get("generation_metadata"),
        "action_capsules": result.get("action_capsules"),
        "learner_radar": result.get("learner_radar"),
    }
    await event_store.log_event(
        session_id=request.session_id,
        student_id=request.student_id,
        question_id=active_question_id,
        event_type=event_type,
        payload=event_payload,
        assignment_id=request.assignment_id or session_info.get("assignment_id"),
    )
    if result.get("matched_misconception_id"):
        await event_store.log_event(
            session_id=request.session_id,
            student_id=request.student_id,
            question_id=active_question_id,
            event_type="misconception_flagged",
            payload={
                "code": result["matched_misconception_id"],
                "kc_id": result.get("matched_kc_id") or "unmapped",
                "hint_rung": result["hint_rung"],
            },
            assignment_id=request.assignment_id or session_info.get("assignment_id"),
        )
    return result
