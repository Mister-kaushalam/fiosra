import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status

from fiosra.mvp.authoring.schemas import (
    AssignmentDraftPackage,
    AssignmentDraftRequest,
    AssignmentDraftRevisionRequest,
    AssignmentDraftRevisionResponse,
    AssignmentDraftSpec,
    CourseDraftRequest,
    CourseDraftRevisionRequest,
    CourseDraftRevisionResponse,
    CourseDraftSpec,
    PublishAssignmentDraftRequest,
    PublishCourseDraftRequest,
    RubricSynthesisRequest,
    RubricSynthesisResponse,
)
from fiosra.mvp.authoring.service import (
    assignment_authoring_service,
    course_authoring_service,
)
from fiosra.mvp.courses.schemas import CourseResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/authoring", tags=["authoring"])


# ----------------------------------------------------------------------
# Course Curriculum Authoring
# ----------------------------------------------------------------------

@router.post(
    "/courses/draft",
    response_model=CourseDraftSpec,
    status_code=status.HTTP_200_OK,
    summary="Synthesize a structured course draft from raw syllabus/materials",
)
async def draft_course(payload: CourseDraftRequest) -> CourseDraftSpec:
    try:
        return await course_authoring_service.generate_course_draft(payload)
    except Exception as e:
        logger.exception("Failed to draft course")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Course draft synthesis failed: {e!s}",
        )


@router.post(
    "/courses/revise",
    response_model=CourseDraftRevisionResponse,
    status_code=status.HTTP_200_OK,
    summary="Revise a course draft based on educator review comments",
)
async def revise_course_draft(payload: CourseDraftRevisionRequest) -> CourseDraftRevisionResponse:
    try:
        return await course_authoring_service.revise_course_draft(payload)
    except Exception as e:
        logger.exception("Failed to revise course draft")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Course draft revision failed: {e!s}",
        )


@router.post(
    "/courses/publish",
    response_model=CourseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Approve and publish course draft to live catalog",
)
async def publish_course_draft(payload: PublishCourseDraftRequest) -> CourseResponse:
    try:
        return await course_authoring_service.publish_course_draft(payload)
    except Exception as e:
        logger.exception("Failed to publish course draft")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Course publication failed: {e!s}",
        )


# ----------------------------------------------------------------------
# Assignment & Scaffold Authoring
# ----------------------------------------------------------------------

@router.post(
    "/assignments/propose",
    response_model=AssignmentDraftPackage,
    status_code=status.HTTP_200_OK,
    summary="Create a complete AI assignment proposal ready for teacher review and persistence",
)
async def propose_assignment(payload: AssignmentDraftRequest) -> AssignmentDraftPackage:
    try:
        return await assignment_authoring_service.propose_assignment_package(payload)
    except Exception as e:
        logger.exception("Failed to create assignment proposal")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Assignment proposal generation failed: {e!s}",
        )


@router.post(
    "/assignments/synthesize-rubric",
    response_model=RubricSynthesisResponse,
    status_code=status.HTTP_200_OK,
    summary="Synthesize domain- and topic-grounded rubric criteria with 3-level performance descriptors",
)
async def synthesize_rubric(payload: RubricSynthesisRequest) -> RubricSynthesisResponse:
    try:
        return await assignment_authoring_service.synthesize_assignment_rubric(payload)
    except Exception as e:
        logger.exception("Failed to synthesize assignment rubric")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Rubric synthesis failed: {e!s}",
        )


@router.post(
    "/assignments/draft",
    response_model=AssignmentDraftSpec,
    status_code=status.HTTP_200_OK,
    summary="Synthesize an assignment draft with 3-rung hint ladder and traps",
)
async def draft_assignment(payload: AssignmentDraftRequest) -> AssignmentDraftSpec:
    try:
        return await assignment_authoring_service.generate_assignment_draft(payload)
    except Exception as e:
        logger.exception("Failed to draft assignment")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Assignment draft synthesis failed: {e!s}",
        )


@router.post(
    "/assignments/revise",
    response_model=AssignmentDraftRevisionResponse,
    status_code=status.HTTP_200_OK,
    summary="Revise an assignment draft based on educator review critique",
)
async def revise_assignment_draft(payload: AssignmentDraftRevisionRequest) -> AssignmentDraftRevisionResponse:
    try:
        return await assignment_authoring_service.revise_assignment_draft(payload)
    except Exception as e:
        logger.exception("Failed to revise assignment draft")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Assignment draft revision failed: {e!s}",
        )


@router.post(
    "/assignments/publish",
    response_model=dict[str, Any],
    status_code=status.HTTP_201_CREATED,
    summary="Approve and publish assignment draft to course module",
)
async def publish_assignment_draft(payload: PublishAssignmentDraftRequest) -> dict[str, Any]:
    try:
        return await assignment_authoring_service.publish_assignment_draft(payload)
    except Exception as e:
        logger.exception("Failed to publish assignment draft")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Assignment publication failed: {e!s}",
        )
