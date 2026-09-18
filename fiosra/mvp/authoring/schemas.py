from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from fiosra.mvp.assignment_designer.schemas import PublicRubricCriterion, ScaffoldingPlan

# ----------------------------------------------------------------------
# Course Drafting Schemas
# ----------------------------------------------------------------------

class DraftAssignmentMilestoneSpec(BaseModel):
    title: str = Field(..., description="Suggested milestone assignment title")
    description: str = Field(..., description="Summary of student task and focus")
    primary_sources: list[str] = Field(default_factory=list, description="Relevant primary sources or evidence texts")


class DraftModuleSpec(BaseModel):
    title: str = Field(..., description="Module title")
    description: str = Field(..., description="Module pedagogical scope and summary")
    learning_objectives: list[str] = Field(default_factory=list, description="Target Bloom's taxonomy learning objectives")
    position: int = Field(default=1, ge=1, description="Sequential ordering in curriculum")
    knowledge_components: list[str] = Field(default_factory=list, description="Target knowledge component IDs (e.g. KC_HIST_*)")
    suggested_assignments: list[DraftAssignmentMilestoneSpec] = Field(default_factory=list, description="Suggested assessment tasks")
    change_status: str = Field(default="unchanged", description="Status tag: added, modified, or unchanged")


class CourseDraftSpec(BaseModel):
    title: str = Field(..., description="Full course title")
    domain: str = Field(default="History", description="Discipline/domain")
    overview: str = Field(..., description="High-level syllabus overview and course goals")
    target_audience: str = Field(default="Undergraduate", description="Target academic level")
    modules: list[DraftModuleSpec] = Field(default_factory=list, description="Sequence of curriculum modules")


class CourseDraftRequest(BaseModel):
    materials_text: str = Field(..., min_length=20, description="Raw syllabus text, lecture notes, or course description")
    title_hint: str | None = Field(default=None, description="Optional title hint or course code")
    domain: str = Field(default="History", description="Academic discipline")
    author_id: str = Field(default="prof_educator", description="Faculty ID")


class CourseDraftRevisionRequest(BaseModel):
    current_draft: CourseDraftSpec = Field(..., description="Current state of the course draft")
    review_comments: str = Field(..., min_length=1, description="Educator feedback, critiques, or revision instructions")
    target_module_index: int | None = Field(default=None, description="Optional 0-indexed module target for focused edits")
    conversation_history: list[dict[str, str]] = Field(default_factory=list, description="Prior conversational turns with the agent")


class CourseDraftRevisionResponse(BaseModel):
    revised_draft: CourseDraftSpec = Field(..., description="Updated course draft incorporating educator feedback")
    changes_summary: str = Field(..., description="Explanation of what changes were applied based on the review comments")
    revision_count: int = Field(default=1, description="Sequential revision index")


class PublishCourseDraftRequest(BaseModel):
    draft: CourseDraftSpec = Field(..., description="Approved course draft to persist and publish")
    author_id: str = Field(default="prof_educator", description="Faculty author ID")


# ----------------------------------------------------------------------
# Assignment Drafting Schemas
# ----------------------------------------------------------------------

class HintRungSpec(BaseModel):
    rung: int = Field(..., ge=1, le=3, description="1: Orienting Question, 2: Source Cue, 3: Structural Scaffold")
    title: str = Field(..., description="Descriptive rung label")
    content: str = Field(..., description="The Socratic pedagogical prompt or cue")


class CognitiveTrapSpec(BaseModel):
    trap_id: str = Field(..., description="Unique trap identifier (e.g. TRAP_SINGLE_CAUSE)")
    name: str = Field(..., description="Trap name")
    description: str = Field(..., description="Common misconception or flawed logic to guard against")
    remediation_hint: str = Field(..., description="Targeted remediation response")


class AssignmentDraftSpec(BaseModel):
    title: str = Field(..., description="Assignment title")
    domain: str = Field(default="History", description="Academic discipline")
    task_brief: str = Field(..., description="Primary student question or prompt")
    context_scope: str = Field(..., description="Historical or disciplinary setting and scope")
    learning_objectives: list[str] = Field(default_factory=list, description="Target learning objectives")
    allowed_sources: list[str] = Field(default_factory=list, description="Permitted evidence sources")
    hint_ladder: list[HintRungSpec] = Field(default_factory=list, description="3-Rung Socratic Hint Ladder")
    cognitive_traps: list[CognitiveTrapSpec] = Field(default_factory=list, description="Expected misconceptions")
    rubric_criteria: list[str] = Field(default_factory=list, description="AutoSCORE evaluation criteria")


class AssignmentDraftRequest(BaseModel):
    task_topic: str = Field(..., min_length=5, description="Topic or prompt idea for the assignment")
    course_id: UUID | None = Field(default=None, description="Parent course ID for grounding")
    module_id: UUID | None = Field(default=None, description="Parent module ID for grounding")
    domain: str = Field(default="History", description="Academic discipline")
    pedagogical_focus: str | None = Field(default=None, description="Optional pedagogical emphasis")


class AssignmentDraftPackage(BaseModel):
    """One teacher-reviewable proposal that flows directly into assignment persistence."""

    draft: AssignmentDraftSpec
    scaffold: ScaffoldingPlan


class AssignmentDraftRevisionRequest(BaseModel):
    current_draft: AssignmentDraftSpec = Field(..., description="Current assignment draft state")
    review_comments: str = Field(..., min_length=1, description="Educator critique or tuning instructions")
    conversation_history: list[dict[str, str]] = Field(default_factory=list, description="Prior chat turns")


class AssignmentDraftRevisionResponse(BaseModel):
    revised_draft: AssignmentDraftSpec = Field(..., description="Refined assignment draft")
    changes_summary: str = Field(..., description="Summary of applied edits")


class PublishAssignmentDraftRequest(BaseModel):
    course_id: UUID = Field(..., description="Target course ID")
    module_id: UUID = Field(..., description="Target module ID")
    draft: AssignmentDraftSpec = Field(..., description="Approved assignment draft")
    author_id: str = Field(default="prof_educator", description="Faculty ID")


class RubricSynthesisRequest(BaseModel):
    title: str = Field(..., description="Assignment title")
    prompt: str = Field(..., description="Student inquiry prompt")
    deliverable: str = Field(default="Analytical essay", description="Deliverable expected from students")
    scope: str = Field(default="", description="Scope and chronology")
    domain: str = Field(default="history", description="Discipline/domain")
    course_id: UUID | None = Field(default=None, description="Course ID for grounding")
    module_id: UUID | None = Field(default=None, description="Module ID for grounding")
    module_objectives: list[str] = Field(default_factory=list, description="Target module learning objectives")
    target_concepts: list[dict[str, Any]] = Field(default_factory=list, description="Selected Knowledge Components (kc_id, label)")
    sources: list[dict[str, Any]] = Field(default_factory=list, description="Assigned sources")
    learning_goals: list[str] = Field(default_factory=list, description="Learning goals")


class RubricSynthesisResponse(BaseModel):
    public_rubric: list[PublicRubricCriterion]
    learning_goals: list[str] = Field(default_factory=list)
