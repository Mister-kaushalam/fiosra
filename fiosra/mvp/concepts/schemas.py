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


BloomLevel = Literal["remember", "understand", "apply", "analyze", "evaluate", "create"]


class SocraticProbeProposal(BaseModel):
    """A diagnostic Socratic question designed to expose and remediate a misconception."""

    model_config = ConfigDict(extra="ignore")

    rung: int = Field(default=0, ge=0, le=2)
    probe_text: str = Field(min_length=4, max_length=4000)
    rationale: str = Field(default="Socratic inquiry scaffolding.", max_length=2000)


class MisconceptionProposal(BaseModel):
    """A cognitive trap or flawed reasoning rule associated with a knowledge component."""

    model_config = ConfigDict(extra="ignore")

    name: str = Field(min_length=2, max_length=255)
    flawed_rule: str = Field(min_length=4, max_length=3000)
    remediation_hint: str = Field(min_length=4, max_length=4000)
    probes: list[SocraticProbeProposal] = Field(default_factory=list)


class ConceptProposalNode(BaseModel):
    """A reviewable, not-yet-approved concept generated from the course materials."""

    model_config = ConfigDict(extra="ignore")

    proposal_id: str = Field(pattern=r"^c[0-9]+$")
    label: str = Field(min_length=2, max_length=255)
    definition: str = Field(min_length=4, max_length=4000)
    concept_type: ConceptType = "domain"
    level: ConceptLevel = "topic"
    bloom_level: BloomLevel | None = None
    parent_proposal_id: str | None = Field(default=None, pattern=r"^c[0-9]+$")
    module_positions: list[int] = Field(default_factory=list, max_length=16)
    module_role: ModuleConceptRole = "introduces"
    misconceptions: list[MisconceptionProposal] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list, max_length=20)
    evidence_chunk_ids: list[str] = Field(default_factory=list, max_length=50)


class PrerequisiteProposal(BaseModel):
    """A proposed dependency within the generated curriculum concept graph."""

    model_config = ConfigDict(extra="ignore")

    prerequisite_proposal_id: str = Field(pattern=r"^c[0-9]+$")
    dependent_proposal_id: str = Field(pattern=r"^c[0-9]+$")
    rationale: str = Field(min_length=4, max_length=2000)


class ConceptGraphProposal(BaseModel):
    """A teacher-reviewable draft of a course's high-to-low concept graph."""

    model_config = ConfigDict(extra="ignore")

    course_rationale: str = Field(min_length=4, max_length=10000)
    concepts: list[ConceptProposalNode] = Field(min_length=3, max_length=10000)
    prerequisites: list[PrerequisiteProposal] = Field(default_factory=list, max_length=5000)


class CompletenessStats(BaseModel):
    """Metrics validating curriculum breadth, objective alignment, and source evidence recall."""

    module_coverage_pct: float = 100.0
    objective_coverage_pct: float = 100.0
    evidence_recall_pct: float = 100.0
    total_concepts: int = 0
    total_prerequisites: int = 0
    unmapped_chunk_ids: list[str] = Field(default_factory=list)
    is_complete: bool = True


class ConceptGraphProposalResponse(BaseModel):
    proposal: ConceptGraphProposal
    generated_by: str
    needs_teacher_validation: bool = True
    completeness: CompletenessStats | None = None


class ConceptGraphProposalRequest(BaseModel):
    """Optional teacher direction for an automatic graph proposal."""

    model_config = ConfigDict(extra="forbid")

    instruction: str | None = Field(default=None, max_length=1200)
    similarity_threshold: float | None = Field(default=0.85, ge=0.5, le=1.0)


class ConceptGraphProposalApprovalRequest(BaseModel):
    """The teacher-approved subset of an automatically generated concept graph."""

    model_config = ConfigDict(extra="forbid")

    proposal: ConceptGraphProposal


class ConceptGraphHydrateRequest(BaseModel):
    """Teacher request to hydrate curriculum concept graph for a module or whole course."""

    model_config = ConfigDict(extra="forbid")

    module_id: str | None = Field(default=None, max_length=96)
    instruction: str | None = Field(default=None, max_length=1200)
    similarity_threshold: float | None = Field(default=0.85, ge=0.5, le=1.0)

