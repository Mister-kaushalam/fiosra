from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from fiosra.mvp.learning_canvas_schemas import CanvasSectionDefinition, default_canvas_sections


class HintRung(BaseModel):
    level: int = Field(
        ge=0,
        le=4,
        description="0=metacognitive, 1=conceptual, 2=procedural, 3=worked_analogy, 4=bottom_out",
    )
    hint_type: str
    content: str
    is_locked: bool = False


class ScaffoldingStep(BaseModel):
    step_id: str
    step_prompt: str
    target_kc: str


class GroundingSource(BaseModel):
    """Teacher-visible provenance for an instructional recommendation."""

    chunk_id: str
    title: str
    kc_id: str | None = None
    excerpt: str
    source_url: str | None = None


class LLMGenerationMetadata(BaseModel):
    """Prompt-free provider telemetry for educator and operational audit trails."""

    provider: str
    model: str
    used_live_provider: bool
    latency_ms: int | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    fallback_reason: str | None = None


class RubricLevel(BaseModel):
    level_id: str
    label: str
    description: str


class PublicRubricCriterion(BaseModel):
    """One criterion that students see before beginning the assignment."""

    criterion_id: str
    title: str
    description: str
    weight: float = Field(default=0.0, ge=0.0, le=100.0)
    levels: list[RubricLevel] = Field(default_factory=list)
    self_review_prompt: str = "What evidence in your completed work shows this criterion?"
    concept_id: str | None = Field(default=None, description="Tied Knowledge Component ID (e.g. KC_HIST_*)")
    concept_label: str | None = Field(default=None, description="Human-readable concept name")


class PublicSource(BaseModel):
    """Student-readable source card without graph, chunk, or retrieval diagnostics."""

    source_id: str
    title: str
    excerpt: str
    source_url: str | None = None
    citation: str | None = None
    relevance_guidance: str


class AssignmentTask(BaseModel):
    prompt: str
    scope: str
    deliverable: str = "A written response"
    requirements: list[str] = Field(default_factory=list)


class SupportMenuItem(BaseModel):
    action_id: str
    title: str
    description: str


class PublishedAssignmentSpec(BaseModel):
    """The complete student-facing assignment contract."""

    title: str
    purpose: str
    task: AssignmentTask
    learning_goals: list[str] = Field(default_factory=list)
    source_pack: list[PublicSource] = Field(default_factory=list)
    public_rubric: list[PublicRubricCriterion] = Field(default_factory=list)
    start_options: list[str] = Field(default_factory=list)
    support_menu: list[SupportMenuItem] = Field(default_factory=list)
    completion_checklist: list[str] = Field(default_factory=list)
    integrity_notice: str = (
        "Your educator evaluates the final submission. Use course materials responsibly and acknowledge sources you use."
    )
    version_note: str | None = None


class EvaluationCriterionMap(BaseModel):
    """Teacher- and agent-only mapping from a visible criterion to internal evidence rules."""

    public_criterion_id: str
    concept_ids: list[str] = Field(default_factory=list)
    source_chunk_ids: list[str] = Field(default_factory=list)
    evidence_expectation: str


class AutoScoreEvaluationPlan(BaseModel):
    """Private, teacher-approved support and review configuration. Never student-facing."""

    public_rubric_map: list[EvaluationCriterionMap] = Field(default_factory=list)
    completion_states: list[str] = Field(default_factory=list)
    support_policy: list[str] = Field(default_factory=list)
    evidence_capture_notice: str = "The educator may review final work, source use, revisions, and assistance the learner chooses to apply."
    review_policy: str = "Prepare criterion-organized evidence for educator review; never determine the final grade."


class AssignmentReadinessItem(BaseModel):
    code: str
    message: str
    severity: str = "blocking"


class AssignmentReadiness(BaseModel):
    is_publishable: bool
    items: list[AssignmentReadinessItem] = Field(default_factory=list)


class AssignmentAuthoringUpdate(BaseModel):
    published: PublishedAssignmentSpec
    evaluation_plan: AutoScoreEvaluationPlan
    canvas_sections: list[CanvasSectionDefinition] | None = None


class CompletionSupportRequest(BaseModel):
    action_id: str
    document_excerpt: str = Field(default="", max_length=12_000)


class CompletionSupportResponse(BaseModel):
    action_id: str
    title: str
    guidance: str
    next_steps: list[str] = Field(default_factory=list)


class ClarificationQuestion(BaseModel):
    question_id: str
    dimension: str
    prompt: str
    options: list[str]
    default_recommendation: str


class AmbiguityDiagnosis(BaseModel):
    raw_prompt: str
    ambiguity_index: float = Field(ge=0.0, le=1.0, description="0.0=crystal clear, 1.0=completely open-ended")
    is_ambiguous: bool
    diagnosed_dimensions: dict[str, str]
    interview_questions: list[ClarificationQuestion]


class ScopeAnalysisRequest(BaseModel):
    raw_prompt: str = Field(..., min_length=3, description="Educator's initial assignment or essay prompt")
    domain: str = Field(default="history", description="Subject domain")
    course_id: UUID | None = Field(default=None, description="Optional grounding course ID")
    module_id: UUID | None = Field(default=None, description="Optional grounding module ID")


class ClarifyAndScaffoldRequest(BaseModel):
    raw_prompt: str
    domain: str = "history"
    answers: dict[str, str] = Field(default_factory=dict, description="Educator interview answers by question ID")
    target_kcs: list[str] = Field(default_factory=list)
    course_id: UUID | None = None
    module_id: UUID | None = None


class ScaffoldingPlan(BaseModel):
    clarified_prompt: str
    domain: str
    target_kcs: list[str]
    hint_ladder: list[HintRung]
    rubric_rules: list[dict[str, Any]]
    distractor_traps: list[dict[str, Any]]
    grounding_mode: str = Field(default="generic", description="course_grounded or generic")
    grounding_sources: list[GroundingSource] = Field(default_factory=list)
    generation_metadata: LLMGenerationMetadata | None = None
    canvas_sections: list[CanvasSectionDefinition] = Field(default_factory=default_canvas_sections)


class QuestionDraftRequest(BaseModel):
    topic: str
    domain: str = "history"
    grade_level: str = "Undergraduate"
    blooms_level: str = "Analyze"
    course_id: UUID | None = None
    module_id: UUID | None = None
    created_by: str = "educator_prof_mora"
    raw_prompt: str | None = None
    answers: dict[str, str] | None = None
    clarified_prompt: str | None = None
    target_kcs: list[str] | None = None
    hint_ladder: list[HintRung] | None = None
    rubric_rules: list[dict[str, Any]] | None = None
    grounding_mode: str = "generic"
    grounding_sources: list[GroundingSource] = Field(default_factory=list)
    generation_metadata: LLMGenerationMetadata | None = None
    reference_solution: str | dict[str, Any] | None = None
    canvas_sections: list[CanvasSectionDefinition] = Field(default_factory=default_canvas_sections)
    published: PublishedAssignmentSpec | None = None
    evaluation_plan: AutoScoreEvaluationPlan | None = None


class QuestionSpec(BaseModel):
    question_id: str
    assignment_id: str
    prompt: str
    domain: str
    target_kcs: list[str]
    subproblems: list[ScaffoldingStep]
    hint_ladder: list[HintRung]
    rubric_criteria: list[dict[str, Any]]
    vault_token: str
    status: str = "draft"
    grounding_mode: str = "generic"
    grounding_sources: list[GroundingSource] = Field(default_factory=list)
    generation_metadata: LLMGenerationMetadata | None = None
    canvas_sections: list[CanvasSectionDefinition] = Field(default_factory=default_canvas_sections)
    published: PublishedAssignmentSpec | None = None
    evaluation_plan: AutoScoreEvaluationPlan | None = None


class PublicQuestionSpec(BaseModel):
    """Student-safe assignment projection. Internal graph and evaluation values are intentionally absent."""

    question_id: str
    assignment_id: str
    published: PublishedAssignmentSpec
    prompt: str = ""
    domain: str = ""
    target_kcs: list[str] = Field(default_factory=list, exclude=True)
    subproblems: list[ScaffoldingStep] = Field(default_factory=list, exclude=True)
    hint_ladder: list[HintRung] = Field(default_factory=list, exclude=True)
    rubric_criteria: list[dict[str, Any]] = Field(default_factory=list, exclude=True)
    status: str = "draft"
    grounding_mode: str = Field(default="generic", exclude=True)
    grounding_sources: list[GroundingSource] = Field(default_factory=list, exclude=True)
    canvas_sections: list[CanvasSectionDefinition] = Field(default_factory=default_canvas_sections)
