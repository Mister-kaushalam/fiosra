"""Teacher-facing endpoints for the course concept graph."""

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from fiosra.mvp.concepts.schemas import (
    ConceptCreate,
    ConceptGraphHydrateRequest,
    ConceptGraphProposalApprovalRequest,
    ConceptGraphProposalRequest,
    ConceptGraphProposalResponse,
    ConceptGraphResponse,
    ConceptRelationCreate,
    ConceptResponse,
    ConceptUpdate,
    ModuleConceptLinkCreate,
)
from fiosra.mvp.concepts.service import ConceptGraphError, concept_graph_service
from fiosra.mvp.courses.service import course_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/courses/{course_id}/concept-graph", tags=["Curriculum Concept Graph"])


async def _course_or_404(course_id: UUID):
    course = await course_service.get_course(course_id)
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found.")
    await concept_graph_service.sync_course_structure(course)
    return course


@router.get("", response_model=ConceptGraphResponse)
async def get_concept_graph(course_id: UUID) -> ConceptGraphResponse:
    """Return the approved course-scoped concept hierarchy and its evidence links."""
    await _course_or_404(course_id)
    return ConceptGraphResponse(**await concept_graph_service.get_course_graph(str(course_id)))


@router.post("/hydrate", response_model=ConceptGraphResponse)
async def hydrate_concept_graph(
    course_id: UUID,
    payload: ConceptGraphHydrateRequest | None = None,
) -> ConceptGraphResponse:
    """Directly hydrate or expand the course concept graph for a module or the whole course."""
    course = await _course_or_404(course_id)
    try:
        graph = await concept_graph_service.hydrate_course_graph(
            course,
            module_id=payload.module_id if payload else None,
            instruction=payload.instruction if payload else None,
        )
        return ConceptGraphResponse(**graph)
    except ConceptGraphError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error


@router.post("/proposals/generate", response_model=ConceptGraphProposalResponse)
async def generate_concept_graph_proposal(
    course_id: UUID,
    payload: ConceptGraphProposalRequest | None = None,
) -> ConceptGraphProposalResponse:
    """Generate a teacher-reviewable high-to-low concept graph from the course materials."""
    course = await _course_or_404(course_id)
    proposal, generated_by, completeness = await concept_graph_service.generate_proposal(
        course,
        instruction=payload.instruction if payload else None,
        similarity_threshold=payload.similarity_threshold if payload else 0.85,
    )
    return ConceptGraphProposalResponse(
        proposal=proposal,
        generated_by=generated_by,
        completeness=completeness,
    )


@router.post("/proposals/approve", response_model=ConceptGraphResponse)
async def approve_concept_graph_proposal(
    course_id: UUID,
    payload: ConceptGraphProposalApprovalRequest,
) -> ConceptGraphResponse:
    """Commit a teacher-reviewed proposal as the active curriculum concept graph."""
    course = await _course_or_404(course_id)
    try:
        graph = await concept_graph_service.approve_proposal(course, payload.proposal)
        return ConceptGraphResponse(**graph)
    except ConceptGraphError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error


@router.post("/concepts", response_model=ConceptResponse, status_code=status.HTTP_201_CREATED)
async def create_concept(course_id: UUID, payload: ConceptCreate) -> ConceptResponse:
    """Create an approved curriculum concept and optionally place it in the hierarchy."""
    await _course_or_404(course_id)
    try:
        concept = await concept_graph_service.create_concept(
            str(course_id),
            payload.label,
            payload.definition,
            payload.concept_type,
            payload.level,
            payload.parent_concept_id,
        )
        if payload.module_id:
            await concept_graph_service.link_module(
                str(course_id), payload.module_id, concept["concept_id"], payload.module_role
            )
        return ConceptResponse(**concept)
    except ConceptGraphError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error


@router.patch("/concepts/{concept_id}", response_model=ConceptResponse)
async def update_concept(course_id: UUID, concept_id: str, payload: ConceptUpdate) -> ConceptResponse:
    """Update teacher-controlled concept metadata."""
    await _course_or_404(course_id)
    concept = await concept_graph_service.update_concept(
        str(course_id), concept_id, payload.model_dump(exclude_none=True)
    )
    if not concept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Concept not found in this course.")
    return ConceptResponse(**concept)


@router.post("/concepts/{concept_id}/children", status_code=status.HTTP_204_NO_CONTENT)
async def add_child_concept(course_id: UUID, concept_id: str, payload: ConceptRelationCreate) -> None:
    """Place a lower-level concept beneath the selected concept after cycle validation."""
    await _course_or_404(course_id)
    try:
        await concept_graph_service.add_contains(str(course_id), concept_id, payload.target_concept_id)
    except ConceptGraphError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error


@router.post("/concepts/{concept_id}/prerequisites", status_code=status.HTTP_204_NO_CONTENT)
async def add_prerequisite(
    course_id: UUID,
    concept_id: str,
    payload: ConceptRelationCreate,
) -> None:
    """Declare that the target concept must be understood before the selected concept."""
    await _course_or_404(course_id)
    try:
        await concept_graph_service.add_prerequisite(
            str(course_id), payload.target_concept_id, concept_id
        )
    except ConceptGraphError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error


@router.post("/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
async def link_module_concept(
    course_id: UUID,
    module_id: UUID,
    payload: ModuleConceptLinkCreate,
) -> None:
    """Mark whether a module introduces, develops, or assesses a concept."""
    course = await _course_or_404(course_id)
    if not any(str(module.module_id) == str(module_id) for module in course.modules):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found in this course.")
    try:
        await concept_graph_service.link_module(
            str(course_id), str(module_id), payload.concept_id, payload.role
        )
    except ConceptGraphError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
