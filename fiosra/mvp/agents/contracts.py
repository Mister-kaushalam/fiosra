"""
fiosra/mvp/agents/contracts.py
Pydantic v2 and TypedDict contracts for Fiosra's Multi-Agent State Machine.
Defines explicit state schemas, critic verification verdicts, and telemetry packets.
"""
from __future__ import annotations

from typing import Any, TypedDict
from pydantic import BaseModel, ConfigDict, Field


# -------------------------------------------------------------------------
# 1. Toulmin Argument & Action Capsule Models
# -------------------------------------------------------------------------
class AssumptionChip(BaseModel):
    """
    Subtle scholarly assumption affordance extracted from student text.
    """
    assumption_id: str = Field(description="Unique identifier for the assumption")
    statement: str = Field(description="The unexamined premise or underlying assumption")
    state: str = Field(default="unexamined", description="'unexamined', 'defended', 'testing', or 'invalidated'")
    target_block_id: str | None = Field(default=None, description="ProseMirror block ID where this assumption was detected")


class ToulminArgumentDecomposition(BaseModel):
    """
    Formal Toulmin model representation of student draft or conversational turn.
    """
    claims: list[str] = Field(default_factory=list, description="Asserted thesis statements and conclusions")
    warrants: list[str] = Field(default_factory=list, description="Causal bridges connecting evidence to claim")
    evidence_citations: list[str] = Field(default_factory=list, description="Direct references or quotes to primary sources")
    implicit_assumptions: list[AssumptionChip] = Field(default_factory=list, description="Unstated assumptions surfacing in the text")
    epistemic_gap: str | None = Field(default=None, description="The primary missing cognitive element (e.g. missing warrant, unexamined premise)")


class EpistemicActionCapsule(BaseModel):
    """
    Quiet, student-grounded actionable proposal allowing 1-click transfer to Canvas.
    """
    capsule_id: str = Field(description="Unique capsule identifier")
    action_type: str = Field(default="commit_to_canvas", description="'commit_to_canvas', 'link_evidence_warrant', or 'flag_assumption'")
    label: str = Field(description="Scholarly label, e.g., 'Transfer to Paragraph 2 ↗'")
    target_block_id: str = Field(description="ProseMirror data-block-id target")
    suggested_student_text: str = Field(description="The student's own articulated insight to commit")
    role: str = Field(default="claim", description="'claim', 'warrant', 'evidence'")
    provenance: str = Field(default="action_capsule", description="Ensures LearnerEvidenceAgent classifies as Assisted Mastery without paste penalty")
    source_dialogue_turn_id: str | None = Field(default=None, description="Dialogue turn that originated this insight")


class LearnerRadarState(BaseModel):
    """
    Subtle 2-line student-facing metacognitive progress rule (replaces developer JSON).
    """
    target_concept: str = Field(default="", description="The target Knowledge Component name")
    epistemic_stance: str = Field(default="Exploring Premise", description="Current stance: Exploring Premise, Challenging Monocausal, Grounding Evidence")
    scaffolding_tier: int = Field(default=0, description="Rung 0 (Inquiry), Rung 1 (Spotlight), Rung 2 (Sentence Frame)")
    milestone_summary: str = Field(default="", description="e.g. '1 warrant needed for submission readiness'")


class UniversalSocraticTurn(BaseModel):
    """
    Structured domain-agnostic cognitive output from the Socratic Tutor Agent.
    Returned as structured JSON from a single LLM call that simultaneously
    classifies the student's move, reasons about the tension to probe,
    and generates the Socratic response.
    """
    model_config = ConfigDict(extra="ignore")

    student_move: str = Field(
        description=(
            "Classify the student's latest message into exactly one of: "
            "'orientation' (greeting, meta-question, or opening), "
            "'focus_selection' (choosing a topic, aspect, or angle to explore), "
            "'substantive_claim' (making an argument, proposal, decision, or interpretation), "
            "'seeking_clarity' (expressing uncertainty, asking for step-by-step guidance, or affirming readiness to continue), "
            "'structural_request' (asking about essay structure, outlining, or brainstorming)."
        )
    )
    student_claim_summary: str | None = Field(
        default=None,
        description="The core assertion, decision, or thesis articulated by the student, or null if none."
    )
    unexamined_tension: str = Field(
        description=(
            "The key analytical tension, trade-off, contradictory evidence, or competing constraint "
            "in the assigned materials that the student has not yet addressed. "
            "This drives what your Socratic question will probe."
        )
    )
    socratic_response: str = Field(
        description=(
            "A natural, conversational 1-3 sentence Socratic response ending with exactly one question mark. "
            "Must directly engage with the student's latest message. "
            "Never give advice, recommendations, or direct answers."
        )
    )
    is_claim_ready_for_draft: bool = Field(
        default=False,
        description="True ONLY if the student formulated a reasoned, self-contained thesis or claim ready for their draft."
    )
    formulated_claim_for_draft: str | None = Field(
        default=None,
        description="The student's insight formatted cleanly as an academic draft sentence, or null."
    )
    suggested_inquiries: list[Any] = Field(
        default_factory=list,
        description=(
            "Exactly 2 first-person student follow-up prompts. "
            "These are student intentions, NOT tutor questions."
        )
    )

    def to_graph_state(self) -> dict[str, Any]:
        """Map structured LLM output to TutorSessionState fields."""
        launchers = []
        for item in self.suggested_inquiries[:2]:
            if isinstance(item, dict):
                launchers.append(item)
            elif isinstance(item, str):
                launchers.append({"title": item[:30], "prompt": item})
            elif hasattr(item, "model_dump"):
                launchers.append(item.model_dump())
        return {
            "draft_response": self.socratic_response,
            "discourse_phase": self.student_move,
            "prompt_launchers": launchers,
            "hint_rung": None,
            "penalty_score": 0.0,
            "thoughts_of_tutorbot": {
                "student_move": self.student_move,
                "student_claim_summary": self.student_claim_summary,
                "unexamined_tension": self.unexamined_tension,
                "is_claim_ready_for_draft": self.is_claim_ready_for_draft,
                "strategy_selected": "Unified LLM structured Socratic generation",
            },
        }


# -------------------------------------------------------------------------
# 2. Socratic Tutor Agent State Schema (Pentagonal Context Envelope)
# -------------------------------------------------------------------------
class TutorSessionState(TypedDict, total=False):
    """
    Session working memory persisted into PostgreSQL checkpointer across multi-turn dialogue.
    Hydrates the complete Pentagonal Context Envelope before every generation step.
    """
    session_id: str
    student_id: str
    assignment_id: str
    question_id: str
    question_prompt: str
    active_kc_id: str
    current_rung: int               # 0 (Reflection/Inquiry), 1 (Spotlight/Confrontation), 2 (Sentence Frame/Synthesis)
    hint_requested: bool
    student_input: str
    domain: str
    discourse_phase: str                        # "orientation", "structural_scaffold", "substantive_inquiry", "hint_scaffold", "adversarial", "acknowledgment"
    dialogue_history: list[dict[str, str]]      # Prior turns [{"role": "student"|"tutor", "text": "..."}]
    hint_ladder: list[dict[str, Any]] | None    # Configured pedagogical hint rungs
    hint_rung: int | None                       # Only present on explicit hint scaffold turns
    
    # 1. Assignment Context
    assignment_meta: dict[str, Any]
    target_bloom_level: str
    rubric_criteria: list[dict[str, Any]]
    section_guidance: str | None

    # 2. Graphiti Temporal Mental Model
    active_beliefs: list[dict[str, Any]]        # invalidated_at IS NULL
    historical_pivots: list[dict[str, Any]]     # Prior self-corrections & leaps
    in_flight_revisions: list[dict[str, Any]]   # Uncommitted revisions awaiting async AutoSCORE

    # 3. Source Material Grounding
    open_exhibit_id: str | None                 # Currently open in left DocumentReader
    open_exhibit_page: int | None
    selected_source_quote: str | None
    retrieved_source_chunks: list[dict[str, Any]]
    assigned_sources: list[dict[str, Any]]      # Primary sources and exhibits from assignment source pack
    
    # 4. Neo4j Curriculum Knowledge Graph
    target_kcs: list[dict[str, Any]]
    active_misconceptions: list[dict[str, Any]]
    prerequisite_status: dict[str, bool]
    
    # 5. Live Canvas Co-Presence (ProseMirror)
    canvas_blocks: list[dict[str, Any]]         # Full block hierarchy with data-block-id
    focused_block_id: str | None                # Paragraph currently under cursor
    focused_block_text: str | None
    toulmin_structure: dict[str, Any]           # Active claims, warrants, citations
    
    # Internal reasoning and diagnosis
    intellectual_operation: str | None
    adversarial_flag: bool
    adversarial_reason: str | None
    temporal_context: list[dict[str, Any]]
    diagnosed_misconception: dict[str, Any] | None
    thoughts_of_tutorbot: dict[str, Any]
    
    # Verification and Critic Loop
    draft_response: str
    verification_attempts: int                  # Max 2 retry loops if critic rejects
    is_approved: bool
    critic_violation: str | None
    remediation_instructions: str | None
    
    # Output and Action Packing
    final_verified_response: str
    action_capsules: list[dict[str, Any]]       # 1-click text-first transfer capsules
    prompt_launchers: list[dict[str, Any]]      # Subtle typographic discussion starters
    learner_radar: dict[str, Any]               # Clean 2-line scholastic progress indicator
    penalty_score: float                        # current_rung * 0.25


# -------------------------------------------------------------------------
# 3. Answer-Isolation Critic Verdict Model
# -------------------------------------------------------------------------
class VerificationResult(BaseModel):
    """
    Structured verdict produced by the AnswerIsolationCritic.
    """
    is_approved: bool = Field(description="True if response complies with Answer Isolation and policy.")
    leakage_score: float = Field(default=0.0, description="0.0 (safe) to 1.0 (blatant solution leak).")
    violation_category: str | None = Field(
        default=None,
        description="Category of violation: 'direct_answer', 'thesis_ghostwriting', 'formula_leak', 'rung_exceeded'."
    )
    remediation_instructions: str | None = Field(
        default=None,
        description="Instructions guiding Socratic rephrasing if rejected."
    )


# -------------------------------------------------------------------------
# 3. Learner Evidence Agent State Schema
# -------------------------------------------------------------------------
class EvidenceSessionState(TypedDict, total=False):
    """
    State tracking longitudinal student interaction telemetry and epistemic belief trajectories.
    """
    student_id: str
    assignment_id: str
    course_id: str
    timeframe_days: int
    
    # Computed metrics
    authentic_effort_score: float
    dwell_time_minutes: float
    hint_reliance_ratio: float
    typing_cadence_wpm: float
    self_corrections_count: int
    
    # Dossier and timeline milestones
    temporal_beliefs: list[dict[str, Any]]
    milestones: list[dict[str, Any]]
    evidence_packet: dict[str, Any]


# -------------------------------------------------------------------------
# 4. Curriculum Architect Agent State Schema
# -------------------------------------------------------------------------
class CurriculumExtractionState(TypedDict, total=False):
    """
    State tracking the 4-stage iterative curriculum extraction pipeline into Neo4j.
    """
    course_id: str
    course_title: str
    module_id: str
    module_title: str
    domain: str
    source_chunks: list[dict[str, Any]]
    
    # Staged outputs
    knowledge_components: list[dict[str, Any]]
    prerequisite_edges: list[dict[str, Any]]
    misconceptions: list[dict[str, Any]]
    socratic_probes: list[dict[str, Any]]
    
    # Human-in-the-loop review hook
    is_paused_for_review: bool
    review_approved: bool
    teacher_notes: str | None
    
    # Final graph write summary
    nodes_written: int
    edges_written: int


# -------------------------------------------------------------------------
# 5. Assignment Designer Agent State Schema
# -------------------------------------------------------------------------
class AssignmentDesignerState(TypedDict, total=False):
    """
    State tracking primary-source-grounded assessment authoring.
    """
    course_id: str
    module_id: str
    target_kc_ids: list[str]
    retrieved_chunks: list[dict[str, Any]]
    distractor_misconceptions: list[dict[str, Any]]
    
    # Generated assessment
    assignment_title: str
    questions: list[dict[str, Any]]
    rubric_criteria: list[dict[str, Any]]
    is_published: bool
