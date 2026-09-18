from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CourseCreate(BaseModel):
    title: str = Field(..., description="Full course title")
    domain: str = Field(default="History", description="Discipline/domain of study")
    created_by: str = Field(default="prof_somerville", description="Authoring faculty member identifier")
    syllabus_context: str | None = Field(default=None, description="Raw syllabus or scope outline text")


class ModuleCreate(BaseModel):
    title: str = Field(..., description="Module title")
    description: str | None = Field(default=None, description="Module summary and pedagogical scope")
    learning_objectives: list[str] = Field(default_factory=list, description="Target learning objectives")
    position: int = Field(default=1, ge=1, description="Sequential curriculum position")


class ModuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    module_id: UUID
    course_id: UUID
    title: str
    description: str | None = None
    learning_objectives: list[str] = Field(default_factory=list)
    position: int
    is_locked: bool = False
    assignments: list[dict[str, Any]] = Field(default_factory=list)


class CourseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    course_id: UUID
    title: str
    domain: str
    created_by: str
    syllabus_context: str | None = None
    created_at: datetime
    modules: list[ModuleResponse] = Field(default_factory=list)
    assignments_count: int = 0


class SyllabusIngestRequest(BaseModel):
    content: str = Field(..., min_length=10, description="Markdown or text content of the syllabus/readings")
    title: str | None = Field(default="Course Syllabus", description="Document or section label")
    module_id: UUID | None = Field(default=None, description="Optional target module to bind chunks to")


class SyllabusChunkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    chunk_id: UUID
    course_id: UUID
    module_id: UUID | None = None
    document_id: UUID | None = None
    title: str | None = None
    content: str
    kc_id: str | None = None
    resource_type: str = "document"
    source_url: str | None = None
    created_at: datetime
    similarity: float | None = None


class CourseDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    document_id: UUID
    course_id: UUID
    module_id: UUID | None = None
    title: str
    filename: str
    file_size: int
    mime_type: str
    resource_type: str = "pdf"
    source_url: str | None = None
    download_url: str
    chunks_count: int = 0
    created_at: datetime


class ResourceCreateRequest(BaseModel):
    title: str = Field(..., description="Resource or reading excerpt title")
    content: str = Field(..., description="Text content or pedagogical summary")
    resource_type: str = Field(default="document", description="Type: document, primary_source, or external_link")
    source_url: str | None = Field(default=None, description="Optional external URL link")
    module_id: UUID | None = Field(default=None, description="Target module ID to bind resource to")


class CohortStudentMetrics(BaseModel):
    student_id: str
    session_count: int
    completed_assignments: int
    average_autonomy_score: float = Field(..., description="Aggregate mean autonomy score (0.00 to 1.00)")
    hint_consumption_rate: float = Field(..., description="Ratio of steps where hints were consumed")
    active_struggle: bool = Field(..., description="True if student exhibits struggle alerts or repeated hints")
    struggling_kcs: list[str] = Field(default_factory=list, description="Target KCs where struggle was detected")


class CohortRosterResponse(BaseModel):
    course_id: UUID
    course_title: str
    total_enrolled: int
    students: list[CohortStudentMetrics] = Field(default_factory=list)


class EnrollRequest(BaseModel):
    student_id: str = Field(..., description="Student identifier from browser localStorage")


class EnrollmentResponse(BaseModel):
    enrollment_id: UUID
    course_id: UUID
    student_id: str
    enrolled_at: datetime

