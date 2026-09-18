import asyncio
import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse

from fiosra.mvp.concepts.service import concept_graph_service
from fiosra.mvp.courses.ingestion import syllabus_parser
from fiosra.mvp.courses.schemas import (
    CohortRosterResponse,
    CourseCreate,
    CourseDocumentResponse,
    CourseResponse,
    EnrollmentResponse,
    EnrollRequest,
    ModuleCreate,
    ModuleResponse,
    ResourceCreateRequest,
    SyllabusChunkResponse,
    SyllabusIngestRequest,
)
from fiosra.mvp.courses.service import course_service
from fiosra.mvp.neo4j_client import neo4j_client
from fiosra.mvp.storage import document_storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/courses", tags=["Courses & Modules Grounding"])
_taxonomy_tasks: set[asyncio.Task] = set()


def _schedule_taxonomy(coroutine) -> None:
    task = asyncio.create_task(coroutine)
    _taxonomy_tasks.add(task)
    task.add_done_callback(_taxonomy_tasks.discard)


async def _extract_and_seed_pedagogical_graph(
    course_id: UUID,
    module_id: UUID,
    course_title: str,
    module_title: str,
    domain: str,
    text_content: str,
) -> dict[str, int]:
    """Asynchronously extracts KnowledgeComponents, Misconceptions, and SocraticProbes and seeds Neo4j."""
    try:
        from fiosra.mvp.courses.pedagogical_extractor import pedagogical_extractor
        return await pedagogical_extractor.extract_and_seed(
            course_id=course_id,
            module_id=module_id,
            course_title=course_title,
            module_title=module_title,
            domain=domain,
            text_content=text_content,
            replace=True,
        )
    except Exception as e:  # noqa: BLE001 - background jobs must record failure without losing uploads.
        logger.warning(f"Pedagogical knowledge extraction warning: {e}")
        try:
            async with neo4j_client.get_session() as session:
                await session.run("""
                    MATCH (m:Module {module_id:$module_id, course_id:$course_id})
                    SET m.taxonomy_status='failed', m.taxonomy_error=$error,
                        m.taxonomy_updated_at=datetime()
                """, {'module_id': str(module_id), 'course_id': str(course_id),
                       'error': 'Taxonomy extraction failed validation or provider availability. Retry regeneration.'})
        except Exception:
            logger.exception('Could not persist taxonomy extraction failure status')
        return {}


@router.post("/ingest-pdf", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def ingest_pdf_to_course(
    course_title: Annotated[str, Form(description="Course Title")],
    domain: Annotated[str, Form(description="Course Domain")] = "History",
    created_by: Annotated[str, Form(description="Educator ID")] = "educator",
    module_title: Annotated[str | None, Form(description="Optional Module Title")] = None,
    file: Annotated[UploadFile | None, File(description="Uploaded PDF File")] = None,
    file_path: Annotated[str | None, Form(description="Server PDF File Path")] = None,
) -> CourseResponse:
    """
    Dynamically ingests a PDF curriculum document into the Fiosra LMS:
    - Finds or creates the Course in PostgreSQL and Neo4j.
    - Finds or creates the Module in PostgreSQL and Neo4j.
    - Extracts text, parses semantic chunks, and computes pgvector embeddings.
    - Ingests episodes into Graphiti with group_id=course_id.
    - Links Graphiti entities and relationships to the Course and Module in Neo4j.
    """
    from pathlib import Path

    # 1. Acquire raw document bytes
    filename = "document.pdf"
    raw_bytes = None
    if file:
        raw_bytes = await file.read()
        filename = file.filename or "uploaded.pdf"
    elif file_path:
        p = Path(file_path)
        if not p.is_absolute():
            p = Path(__file__).resolve().parent.parent.parent.parent / file_path
        if not p.exists():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File not found: {file_path}")
        raw_bytes = p.read_bytes()
        filename = p.name
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either an uploaded file or file_path must be provided.",
        )

    # 2. Find or create Course
    all_courses = await course_service.list_courses()
    course = next((c for c in all_courses if c.title.strip().lower() == course_title.strip().lower()), None)
    if not course:
        course = await course_service.create_course(
            CourseCreate(
                title=course_title.strip(),
                domain=domain.strip(),
                created_by=created_by.strip(),
                syllabus_context=f"Curriculum materials derived from {filename}",
            )
        )

    # 3. Find or create Module
    mod_name = (module_title or f"Unit: {filename.replace('_', ' ').replace('.pdf', '')}").strip()
    target_module = next((m for m in course.modules if m.title.strip().lower() == mod_name.lower()), None)
    if not target_module:
        target_module = await course_service.add_module(
            course.course_id,
            ModuleCreate(
                title=mod_name,
                description=f"Curriculum unit grounded on {filename}.",
                learning_objectives=[f"Master foundational concepts in {mod_name}"],
                position=len(course.modules) + 1,
            ),
        )

    # 4. Extract and chunk text
    is_pdf = filename.lower().endswith(".pdf") or raw_bytes.startswith(b"%PDF-")
    extracted_text = syllabus_parser.extract_text(raw_bytes, is_pdf=is_pdf)
    if not extracted_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No readable text extracted from document.")

    doc_title = filename.replace("_", " ").replace(".pdf", "")
    resource_type = "pdf" if is_pdf else "document"
    mime_type = "application/pdf" if is_pdf else "text/plain"

    course_doc = await syllabus_parser.create_course_document(
        course_id=course.course_id,
        module_id=target_module.module_id,
        title=doc_title,
        filename=filename,
        content=raw_bytes,
        resource_type=resource_type,
        mime_type=mime_type,
        source_url=f"/courses/{course.course_id}/documents",
    )

    # 5. Ingest into syllabus_chunks (pgvector) and sync Neo4j
    refreshed_course = await course_service.get_course(course.course_id)
    if refreshed_course:
        course = refreshed_course
    await concept_graph_service.sync_course_structure(course)
    chunks = await syllabus_parser.ingest_syllabus(
        course_id=course.course_id,
        content=extracted_text,
        title=doc_title,
        module_id=target_module.module_id,
        domain=course.domain,
        resource_type=resource_type,
        source_url=course_doc.download_url,
        document_id=course_doc.document_id,
    )
    await concept_graph_service.ingest_resource(
        course_id=str(course.course_id),
        module_id=str(target_module.module_id),
        title=filename,
        resource_type=resource_type,
        source_url=course_doc.download_url,
        chunks=[chunk.model_dump(mode="json") for chunk in chunks],
    )

    # 6. Ingest into Pedagogical Knowledge Graph in background
    full_text = "\n\n".join(chunk.content for chunk in chunks)
    _schedule_taxonomy(
        _extract_and_seed_pedagogical_graph(
            course_id=course.course_id,
            module_id=target_module.module_id,
            course_title=course.title,
            module_title=target_module.title,
            domain=course.domain,
            text_content=full_text,
        )
    )

    # Return refreshed course with modules
    refreshed = await course_service.get_course(course.course_id)
    return refreshed or course


@router.post(
    "/{course_id}/modules/{module_id}/reseed-graph",
    tags=["Courses & Modules Grounding"],
    summary="Validate and replace the module taxonomy using the configured provider.",
)
async def reseed_module_graph(
    course_id: UUID,
    module_id: UUID,
) -> dict:
    """Validate a grounded replacement before atomically retiring the previous taxonomy."""
    from fiosra.mvp.courses.pedagogical_extractor import pedagogical_extractor

    course = await course_service.get_course(course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")
    module = next((m for m in course.modules if m.module_id == module_id), None)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found.")
    try:
        counts = await pedagogical_extractor.extract_and_seed(
            course_id=course_id, module_id=module_id, course_title=course.title,
            module_title=module.title, domain=course.domain, text_content='', replace=True)
        return {'status': 'pending_review', 'module_id': str(module_id), **counts}
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error



@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(payload: CourseCreate) -> CourseResponse:
    """
    Creates a new institutional course workspace and optionally parses and vectors
    the introductory syllabus context into pgvector.
    """
    try:
        return await course_service.create_course(payload)
    except Exception as e:
        logger.exception("Error creating course")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create course: {e!s}",
        ) from e


@router.get("", response_model=list[CourseResponse])
async def list_courses() -> list[CourseResponse]:
    """
    Lists all course workspaces along with module counts and nested metadata.
    """
    try:
        return await course_service.list_courses()
    except Exception as e:
        logger.exception("Error listing courses")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list courses: {e!s}",
        ) from e


@router.get("/enrolled", response_model=list[CourseResponse])
async def list_enrolled_courses(
    student_id: Annotated[str, Query(min_length=1, description="Student identifier")],
) -> list[CourseResponse]:
    """
    Lists courses a specific student is enrolled in.
    """
    try:
        return await course_service.list_enrolled_courses(student_id)
    except Exception as e:
        logger.exception("Error listing enrolled courses")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list enrolled courses: {e!s}",
        ) from e


@router.get("/student-catalog")
async def list_student_catalog(
    student_id: Annotated[str, Query(min_length=1, description="Student identifier")],
) -> list[dict]:
    """Return the single availability projection used by the portal and course map."""
    try:
        return await course_service.list_student_catalog(student_id)
    except Exception as e:
        logger.exception("Error listing student course catalog")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list student course catalog: {e!s}",
        ) from e


@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(course_id: UUID) -> CourseResponse:
    """
    Fetches full course details including nested sequential curriculum modules and assignments.
    """
    course = await course_service.get_course(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course with ID '{course_id}' not found.",
        )
    return course


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(course_id: UUID) -> None:
    """
    Completely deletes a course from PostgreSQL and Neo4j, cascading across
    all child modules, enrollments, syllabus chunks, and graph nodes.
    """
    deleted = await course_service.delete_course(course_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course with ID '{course_id}' not found.",
        )


@router.post("/{course_id}/enroll", response_model=EnrollmentResponse, status_code=status.HTTP_201_CREATED)
async def enroll_student(course_id: UUID, payload: EnrollRequest) -> EnrollmentResponse:
    """
    Enrolls a student in a course. Idempotent — re-enrolling returns the existing enrollment.
    """
    course = await course_service.get_course(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course with ID '{course_id}' not found.",
        )
    try:
        return await course_service.enroll_student(course_id, payload.student_id)
    except Exception as e:
        logger.exception("Error enrolling student")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to enroll: {e!s}",
        ) from e


@router.delete("/{course_id}/enroll/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unenroll_student(course_id: UUID, student_id: str) -> None:
    """
    Removes a student's enrollment from a course.
    """
    deleted = await course_service.unenroll_student(course_id, student_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No enrollment found for student '{student_id}' in course '{course_id}'.",
        )


@router.post("/{course_id}/modules", response_model=ModuleResponse, status_code=status.HTTP_201_CREATED)
async def add_module(course_id: UUID, payload: ModuleCreate) -> ModuleResponse:
    """
    Adds a sequential curriculum module with learning objectives to a course sequencer.
    """
    try:
        return await course_service.add_module(course_id, payload)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve)) from ve
    except Exception as e:
        logger.exception("Error adding module")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create module: {e!s}",
        ) from e


@router.get("/{course_id}/modules/{module_id}", response_model=ModuleResponse)
async def get_module(course_id: UUID, module_id: UUID) -> ModuleResponse:
    """
    Fetches module details, learning objectives, lock status, and active assignments.
    """
    module = await course_service.get_module(course_id, module_id)
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Module '{module_id}' not found in course '{course_id}'.",
        )
    return module


@router.post("/{course_id}/syllabus", response_model=list[SyllabusChunkResponse])
async def ingest_syllabus(course_id: UUID, payload: SyllabusIngestRequest) -> list[SyllabusChunkResponse]:
    """
    Ingests syllabus reading corpus, segments into semantic chunks, generates 1536-dim
    embeddings, links Neo4j Knowledge Components, and saves to pgvector.
    """
    course = await course_service.get_course(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course with ID '{course_id}' not found.",
        )

    try:
        await concept_graph_service.sync_course_structure(course)
        chunks = await syllabus_parser.ingest_syllabus(
            course_id=course_id,
            content=payload.content,
            title=payload.title or "Syllabus",
            module_id=payload.module_id,
            domain=course.domain,
        )
        await concept_graph_service.ingest_resource(
            course_id=str(course_id),
            module_id=str(payload.module_id) if payload.module_id else None,
            title=payload.title or "Syllabus",
            resource_type="document",
            source_url=None,
            chunks=[chunk.model_dump(mode="json") for chunk in chunks],
        )
        return chunks
    except Exception as e:
        logger.exception("Error ingesting syllabus")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to ingest syllabus: {e!s}",
        ) from e


@router.get("/{course_id}/syllabus", response_model=list[SyllabusChunkResponse])
async def list_course_syllabus(
    course_id: UUID,
    module_id: Annotated[UUID | None, Query()] = None,
) -> list[SyllabusChunkResponse]:
    """
    Lists all ingested syllabus reading resources and primary sources for a course,
    optionally filtered by module_id.
    """
    course = await course_service.get_course(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course with ID '{course_id}' not found.",
        )
    return await syllabus_parser.list_chunks(course_id=course_id, module_id=module_id)


@router.post(
    "/{course_id}/modules/{module_id}/resources",
    response_model=list[SyllabusChunkResponse],
    status_code=status.HTTP_201_CREATED,
)
async def add_module_resource(
    course_id: UUID,
    module_id: UUID,
    payload: ResourceCreateRequest,
) -> list[SyllabusChunkResponse]:
    """
    Adds text, markdown excerpts, or external link reading material directly attached
    to a specific course module. Embeds into pgvector and grounds to Neo4j KCs.
    """
    course = await course_service.get_course(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course with ID '{course_id}' not found.",
        )
    module = await course_service.get_module(course_id, module_id)
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Module '{module_id}' not found in course '{course_id}'.",
        )

    try:
        resource_content = payload.content
        if payload.resource_type == "external_link" and payload.source_url:
            try:
                resource_content = await syllabus_parser.fetch_external_source(payload.source_url)
            except ValueError as error:
                if not syllabus_parser.has_substantive_content(payload.content):
                    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
                logger.info("Using educator-provided notes for link %s: %s", payload.source_url, error)
        await concept_graph_service.sync_course_structure(course)
        chunks = await syllabus_parser.ingest_syllabus(
            course_id=course_id,
            content=resource_content,
            title=payload.title,
            module_id=module_id,
            domain=course.domain,
            resource_type=payload.resource_type,
            source_url=payload.source_url,
        )
        await concept_graph_service.ingest_resource(
            course_id=str(course_id),
            module_id=str(module_id),
            title=payload.title,
            resource_type=payload.resource_type,
            source_url=payload.source_url,
            chunks=[chunk.model_dump(mode="json") for chunk in chunks],
        )
        _schedule_taxonomy(_extract_and_seed_pedagogical_graph(
            course_id, module_id, course.title, module.title, course.domain,
            '\n\n'.join(chunk.content for chunk in chunks)))
        return chunks
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error ingesting module resource")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add module resource: {e!s}",
        ) from e


@router.post(
    "/{course_id}/modules/{module_id}/resources/upload",
    response_model=list[SyllabusChunkResponse],
    status_code=status.HTTP_201_CREATED,
)
async def upload_module_resource_file(
    course_id: UUID,
    module_id: UUID,
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str | None, Form()] = None,
) -> list[SyllabusChunkResponse]:
    """
    Uploads a PDF, Markdown, or text document for a module.
    Extracts text using pypdf / UTF-8 decode, generates vector embeddings, and stores in pgvector.
    """
    course = await course_service.get_course(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course with ID '{course_id}' not found.",
        )
    module = await course_service.get_module(course_id, module_id)
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Module '{module_id}' not found in course '{course_id}'.",
        )

    try:
        raw_bytes = await file.read()
        is_pdf = bool(file.filename and file.filename.lower().endswith(".pdf")) or (
            file.content_type == "application/pdf"
        )
        extracted_text = syllabus_parser.extract_text(raw_bytes, is_pdf=is_pdf)
        if not extracted_text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No readable text could be extracted from uploaded file.",
            )

        doc_title = title or file.filename or "Uploaded Resource"
        resource_type = "pdf" if is_pdf else "document"
        mime_type = file.content_type or ("application/pdf" if is_pdf else "text/plain")

        course_doc = await syllabus_parser.create_course_document(
            course_id=course_id,
            module_id=module_id,
            title=doc_title,
            filename=file.filename or "document.pdf",
            content=raw_bytes,
            resource_type=resource_type,
            mime_type=mime_type,
            source_url=f"/courses/{course_id}/documents",
        )

        await concept_graph_service.sync_course_structure(course)
        chunks = await syllabus_parser.ingest_syllabus(
            course_id=course_id,
            content=extracted_text,
            title=doc_title,
            module_id=module_id,
            domain=course.domain,
            resource_type=resource_type,
            source_url=course_doc.download_url,
            document_id=course_doc.document_id,
        )
        await concept_graph_service.ingest_resource(
            course_id=str(course_id),
            module_id=str(module_id),
            title=doc_title,
            resource_type=resource_type,
            source_url=course_doc.download_url,
            chunks=[chunk.model_dump(mode="json") for chunk in chunks],
        )
        full_text = "\n\n".join(chunk.content for chunk in chunks)
        _schedule_taxonomy(
            _extract_and_seed_pedagogical_graph(
                course_id=course_id,
                module_id=module_id,
                course_title=course.title,
                module_title=module.title,
                domain=course.domain,
                text_content=full_text,
            )
        )
        return chunks
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error uploading module resource file")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process uploaded file: {e!s}",
        ) from e


@router.delete("/{course_id}/resources/{chunk_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource_chunk(course_id: UUID, chunk_id: UUID) -> None:
    """
    Deletes an attached reading or primary source chunk when no published task cites it.
    """
    course = await course_service.get_course(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course with ID '{course_id}' not found.",
        )
    dependencies = await syllabus_parser.published_assignment_dependencies(course_id, chunk_id)
    if dependencies:
        titles = ", ".join(item["title"] for item in dependencies[:3])
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This resource is cited by published assignments and is retained for student and evidence integrity: "
                f"{titles}. Archive those assignments before removing this source."
            ),
        )
    deleted = await syllabus_parser.delete_chunk(course_id, chunk_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resource chunk '{chunk_id}' not found.",
        )


@router.get("/{course_id}/resources/{chunk_id}/dependencies")
async def get_resource_dependencies(course_id: UUID, chunk_id: UUID) -> list[dict[str, str]]:
    """Preview the publication impact of removing a grounded source."""
    course = await course_service.get_course(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course with ID '{course_id}' not found.",
        )
    return await syllabus_parser.published_assignment_dependencies(course_id, chunk_id)


@router.get("/{course_id}/syllabus/search", response_model=list[SyllabusChunkResponse])

async def search_syllabus(
    course_id: UUID,
    query: Annotated[str, Query(min_length=2, description="Semantic search query")],
    top_k: Annotated[int, Query(ge=1, le=20)] = 5,
    module_id: Annotated[UUID | None, Query()] = None,
) -> list[SyllabusChunkResponse]:
    """
    Performs cosine vector similarity search over syllabus corpus chunks using pgvector.
    """
    course = await course_service.get_course(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course with ID '{course_id}' not found.",
        )

    return await syllabus_parser.search_syllabus(
        course_id=course_id,
        query=query,
        top_k=top_k,
        module_id=module_id,
    )


@router.get("/{course_id}/roster", response_model=CohortRosterResponse)
async def get_cohort_roster(course_id: UUID) -> CohortRosterResponse:
    """
    Returns the enrolled cohort roster with aggregate Autonomy Scores (A_s),
    hint consumption telemetry, and active struggle alerts.
    """
    try:
        return await course_service.get_cohort_roster(course_id)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve)) from ve
    except Exception as e:
        logger.exception("Error generating cohort roster")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate cohort roster: {e!s}",
        ) from e


@router.get("/{course_id}/documents", response_model=list[CourseDocumentResponse])
async def list_course_documents(
    course_id: UUID,
    module_id: Annotated[UUID | None, Query()] = None,
) -> list[CourseDocumentResponse]:
    """Lists all grounded course documents with chunk counts and download links."""
    course = await course_service.get_course(course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course with ID '{course_id}' not found.",
        )
    return await syllabus_parser.list_documents(course_id=course_id, module_id=module_id)


@router.get("/{course_id}/documents/{document_id}/file")
async def get_course_document_file(course_id: UUID, document_id: UUID) -> FileResponse:
    """Streams the real PDF/document binary with inline viewing headers."""
    doc = await syllabus_parser.get_document(course_id, document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' not found in course '{course_id}'.",
        )
    file_path = document_storage.get_document_path(doc["file_path"])
    if not file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The document file was not found in storage.",
        )
    return FileResponse(
        path=file_path,
        media_type=doc.get("mime_type") or "application/pdf",
        filename=doc.get("filename") or "document.pdf",
        content_disposition_type="inline",
    )


@router.delete("/{course_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course_document(course_id: UUID, document_id: UUID) -> None:
    """Deletes the source document file and cascades deletion of all its chunks."""
    deleted = await syllabus_parser.delete_document(course_id, document_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' not found in course '{course_id}'.",
        )

