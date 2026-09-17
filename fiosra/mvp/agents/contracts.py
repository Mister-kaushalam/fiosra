"""
fiosra/mvp/agents/contracts.py
Pydantic v2 and TypedDict contracts for Fiosra's Multi-Agent State Machine.
Defines explicit state schemas, critic verification verdicts, and telemetry packets.
"""
from __future__ import annotations

from typing import Any, TypedDict
from pydantic import BaseModel, Field


# -------------------------------------------------------------------------
# 1. Socratic Tutor Agent State Schema
# -------------------------------------------------------------------------
class TutorSessionState(TypedDict, total=False):
    """
    Session working memory persisted into PostgreSQL checkpointer across multi-turn dialogue.
    """
    session_id: str
    student_id: str
    assignment_id: str
    question_id: str
    question_prompt: str
    active_kc_id: str
    current_rung: int               # 0 (Reflection), 1 (Confrontation), 2 (Synthesis), 3 (Max Hint)
    hint_requested: bool
    student_input: str
    domain: str
    
    # Internal reasoning and diagnosis
    adversarial_flag: bool
    adversarial_reason: str | None
    temporal_context: list[dict[str, Any]]
    diagnosed_misconception: dict[str, Any] | None
    thoughts_of_tutorbot: dict[str, Any]
    
    # Verification and Critic Loop
    draft_response: str
    verification_attempts: int      # Max 2 retry loops if critic rejects
    is_approved: bool
    critic_violation: str | None
    remediation_instructions: str | None
    
    # Output
    final_verified_response: str
    penalty_score: float            # current_rung * 0.25


# -------------------------------------------------------------------------
# 2. Answer-Isolation Critic Verdict Model
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
