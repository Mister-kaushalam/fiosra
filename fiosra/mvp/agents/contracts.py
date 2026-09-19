"""
fiosra/mvp/agents/contracts.py
Pydantic v2 and TypedDict contracts for Fiosra's Multi-Agent State Machine.
Defines explicit state schemas, critic verification verdicts, and telemetry packets.
"""
from __future__ import annotations

from typing import Any, TypedDict
from pydantic import BaseModel, Field


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
    
    # 1. Assignment Context
    assignment_meta: dict[str, Any]
    target_bloom_level: str
    rubric_criteria: list[dict[str, Any]]
    
    # 2. Graphiti Temporal Mental Model
    active_beliefs: list[dict[str, Any]]        # invalidated_at IS NULL
    historical_pivots: list[dict[str, Any]]     # Prior self-corrections & leaps
    in_flight_revisions: list[dict[str, Any]]   # Uncommitted revisions awaiting async AutoSCORE
    
    # 3. Source Material Grounding
    open_exhibit_id: str | None                 # Currently open in left DocumentReader
    open_exhibit_page: int | None
    selected_source_quote: str | None
    retrieved_source_chunks: list[dict[str, Any]]
    
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
