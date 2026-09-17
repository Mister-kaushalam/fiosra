"""Contracts for the course-scoped curriculum concept graph."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ConceptLevel = Literal["course_theme", "strand", "topic", "subtopic", "atomic_concept"]
ConceptType = Literal[
    "domain",
    "entity",
    "process",
    "relationship",
    "method",
    "threshold",
    "misconception",
]
ModuleConceptRole = Literal["introduces", "develops", "assesses"]


class ConceptCreate(BaseModel):
    """Teacher-approved concept for one course's curriculum model."""

    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=2, max_length=160)
    definition: str = Field(min_length=4, max_length=1200)
    concept_type: ConceptType = "domain"
    level: ConceptLevel = "topic"
    parent_concept_id: str | None = Field(default=None, max_length=96)
    module_id: str | None = Field(default=None, max_length=96)
    module_role: ModuleConceptRole = "introduces"


class ConceptUpdate(BaseModel):
    """Editable teacher-controlled properties for an approved concept."""

    model_config = ConfigDict(extra="forbid")

    label: str | None = Field(default=None, min_length=2, max_length=160)
    definition: str | None = Field(default=None, min_length=4, max_length=1200)
    concept_type: ConceptType | None = None
    level: ConceptLevel | None = None


class ConceptRelationCreate(BaseModel):
    """A directed edge from the route concept to the requested target concept."""

    model_config = ConfigDict(extra="forbid")

    target_concept_id: str = Field(min_length=1, max_length=96)


class ModuleConceptLinkCreate(BaseModel):
    """Relates a curriculum module to an approved concept."""

    model_config = ConfigDict(extra="forbid")

    concept_id: str = Field(min_length=1, max_length=96)
    role: ModuleConceptRole = "introduces"


class ConceptResponse(BaseModel):
    concept_id: str
    course_id: str
    label: str
    definition: str
    concept_type: str
    level: str
    status: str = "approved"


class ConceptGraphResponse(BaseModel):
    course_id: str
    nodes: list[dict] = Field(default_factory=list)
    edges: list[dict] = Field(default_factory=list)
    module_links: list[dict] = Field(default_factory=list)
    source_links: list[dict] = Field(default_factory=list)
    probes: list[dict] = Field(default_factory=list)
    stats: dict[str, int] = Field(default_factory=dict)


class ConceptProposalNode(BaseModel):
    """A reviewable, not-yet-approved concept generated from the course materials."""

    model_config = ConfigDict(extra="forbid")

    proposal_id: str = Field(pattern=r"^c[0-9]+$")
    label: str = Field(min_length=2, max_length=160)
    definition: str = Field(min_length=4, max_length=1200)
    concept_type: ConceptType
    level: ConceptLevel
    parent_proposal_id: str | None = Field(default=None, pattern=r"^c[0-9]+$")
    module_positions: list[int] = Field(default_factory=list, max_length=8)
    module_role: ModuleConceptRole = "introduces"


class PrerequisiteProposal(BaseModel):
    """A proposed dependency within the generated curriculum concept graph."""

    model_config = ConfigDict(extra="forbid")

    prerequisite_proposal_id: str = Field(pattern=r"^c[0-9]+$")
    dependent_proposal_id: str = Field(pattern=r"^c[0-9]+$")
    rationale: str = Field(min_length=4, max_length=360)


class ConceptGraphProposal(BaseModel):
    """A teacher-reviewable draft of a course's high-to-low concept graph."""

    model_config = ConfigDict(extra="forbid")

    course_rationale: str = Field(min_length=4, max_length=1200)
    concepts: list[ConceptProposalNode] = Field(min_length=3, max_length=28)
    prerequisites: list[PrerequisiteProposal] = Field(default_factory=list, max_length=32)


class ConceptGraphProposalResponse(BaseModel):
    proposal: ConceptGraphProposal
    generated_by: str
    needs_teacher_validation: bool = True


class ConceptGraphProposalRequest(BaseModel):
    """Optional teacher direction for an automatic graph proposal."""

    model_config = ConfigDict(extra="forbid")

    instruction: str | None = Field(default=None, max_length=1200)


class ConceptGraphProposalApprovalRequest(BaseModel):
    """The teacher-approved subset of an automatically generated concept graph."""

    model_config = ConfigDict(extra="forbid")

    proposal: ConceptGraphProposal
