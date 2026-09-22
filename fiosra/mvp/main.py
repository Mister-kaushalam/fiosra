from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from fiosra.mvp.api_errors import LearnerAPIError, learner_error_response
from fiosra.mvp.assignment_designer.router import router as assignment_router
from fiosra.mvp.authoring.router import router as authoring_router
from fiosra.mvp.concepts.router import router as concept_graph_router
from fiosra.mvp.config import settings
from fiosra.mvp.courses.router import router as courses_router
from fiosra.mvp.dialogue_router import router as dialogue_router
from fiosra.mvp.events_router import router as events_router
from fiosra.mvp.evidence_dossier.router import router as evidence_router
from fiosra.mvp.knowledge_router import router as knowledge_router
from fiosra.mvp.learning_canvas_router import router as learning_canvas_router
from fiosra.mvp.learning_document_router import router as learning_document_router
from fiosra.mvp.neo4j_client import neo4j_client
from fiosra.mvp.socratic_probe_router import router as socratic_probe_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Lifespan context manager for startup and shutdown hooks."""
    # Startup: ensure the enrollments table exists (migration 008).
    # docker-entrypoint-initdb.d only runs on first DB init; this is
    # idempotent so it is safe to run on every startup.
    from sqlalchemy import text as _text

    from fiosra.mvp.database import engine as _engine

    async with _engine.begin() as conn:
        await conn.execute(_text(
            """
            CREATE TABLE IF NOT EXISTS enrollments (
                enrollment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                course_id     UUID NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
                student_id    VARCHAR(64) NOT NULL,
                enrolled_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE (course_id, student_id)
            );
            """
        ))
        await conn.execute(_text(
            "CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments (student_id);"
        ))
        await conn.execute(_text(
            "CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments (course_id);"
        ))
        await conn.execute(_text(
            "ALTER TABLE socratic_probes ADD COLUMN IF NOT EXISTS concept_id VARCHAR(96);"
        ))
        await conn.execute(_text(
            "ALTER TABLE socratic_probes ADD COLUMN IF NOT EXISTS concept_label VARCHAR(160);"
        ))
        await conn.execute(_text(
            "CREATE INDEX IF NOT EXISTS idx_socratic_probes_concept ON socratic_probes (concept_id);"
        ))
        await conn.execute(_text(
            """
            CREATE TABLE IF NOT EXISTS student_session_submissions (
                session_id UUID PRIMARY KEY REFERENCES student_sessions(session_id) ON DELETE CASCADE,
                document_id UUID NOT NULL REFERENCES learning_documents(document_id) ON DELETE RESTRICT,
                document_revision INTEGER NOT NULL CHECK (document_revision >= 0),
                idempotency_key VARCHAR(160) NOT NULL,
                submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                UNIQUE (session_id, idempotency_key)
            );
            """
        ))
        await conn.execute(_text(
            "CREATE INDEX IF NOT EXISTS idx_student_session_submissions_document "
            "ON student_session_submissions (document_id, document_revision);"
        ))
        await conn.execute(_text(
            """
            CREATE TABLE IF NOT EXISTS learning_document_source_references (
                reference_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                document_id UUID NOT NULL REFERENCES learning_documents(document_id) ON DELETE CASCADE,
                source_id VARCHAR(160) NOT NULL,
                source_title VARCHAR(360) NOT NULL,
                excerpt TEXT NOT NULL DEFAULT '',
                citation TEXT,
                source_url TEXT,
                locator JSONB NOT NULL DEFAULT '{}'::jsonb,
                attached_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                UNIQUE (document_id, source_id)
            );
            """
        ))
        await conn.execute(_text(
            """
            CREATE TABLE IF NOT EXISTS learning_document_source_claim_links (
                reference_id UUID NOT NULL REFERENCES learning_document_source_references(reference_id) ON DELETE CASCADE,
                block_id UUID NOT NULL REFERENCES learning_document_blocks(block_id) ON DELETE CASCADE,
                linked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                PRIMARY KEY (reference_id, block_id)
            );
            """
        ))
        await conn.execute(_text(
            "CREATE INDEX IF NOT EXISTS idx_document_source_references_document "
            "ON learning_document_source_references (document_id, attached_at ASC);"
        ))
        await conn.execute(_text(
            "CREATE INDEX IF NOT EXISTS idx_document_source_claim_links_block "
            "ON learning_document_source_claim_links (block_id);"
        ))
        await conn.execute(_text(
            """
            CREATE TABLE IF NOT EXISTS course_documents (
                document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                course_id UUID NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
                module_id UUID REFERENCES modules(module_id) ON DELETE SET NULL,
                title VARCHAR(255) NOT NULL,
                filename VARCHAR(255) NOT NULL,
                file_path TEXT NOT NULL,
                file_size INTEGER NOT NULL DEFAULT 0,
                mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
                resource_type VARCHAR(32) NOT NULL DEFAULT 'pdf',
                source_url TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            """
        ))
        await conn.execute(_text(
            "CREATE INDEX IF NOT EXISTS idx_course_documents_course_module "
            "ON course_documents (course_id, module_id);"
        ))
        await conn.execute(_text(
            "ALTER TABLE syllabus_chunks ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES course_documents(document_id) ON DELETE CASCADE;"
        ))
        await conn.execute(_text(
            "CREATE INDEX IF NOT EXISTS idx_syllabus_chunks_document ON syllabus_chunks (document_id);"
        ))
    yield
    # Shutdown: gracefully close Neo4j connection pool
    await neo4j_client.close()


app = FastAPI(
    title=settings.APP_NAME,
    description="Fiosra AI MVP API: Socratic Dialogue & Knowledge Tracing System",
    version="0.1.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def attach_correlation_id(request: Request, call_next):
    """Make learner-visible failures traceable without exposing internal details."""
    correlation_id = request.headers.get("X-Correlation-ID") or f"req_{uuid4().hex}"
    request.state.correlation_id = correlation_id
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = correlation_id
    return response


@app.exception_handler(LearnerAPIError)
async def handle_learner_api_error(request: Request, error: LearnerAPIError):
    """Serialize known student workflow failures into one public contract."""
    return learner_error_response(request, error)

# Enable CORS only for configured local frontend development origins.
cors_origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include Routers with standard routes and /api aliases
for router_instance in [
    knowledge_router,
    events_router,
    learning_canvas_router,
    learning_document_router,
    socratic_probe_router,
    dialogue_router,
    evidence_router,
    assignment_router,
    courses_router,
    concept_graph_router,
    authoring_router,
]:
    app.include_router(router_instance)
    app.include_router(router_instance, prefix="/api")

# Mount Static UI Frontend (Svelte production build)
DIST_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if DIST_DIR.exists():
    app.mount("/ui", StaticFiles(directory=str(DIST_DIR), html=True), name="ui")


@app.get("/", include_in_schema=False)
async def root_redirect() -> RedirectResponse:
    """Redirect root to UI landing page."""
    return RedirectResponse(url="/ui/")


@app.get("/healthz", tags=["System"])
async def health_check() -> dict[str, str]:
    """Basic health check endpoint."""
    return {"status": "ok", "app": settings.APP_NAME}


@app.get("/health", tags=["System"], include_in_schema=False)
async def health_check_alias() -> dict[str, str]:
    """Alias for /healthz to satisfy standard system health probes."""
    return await health_check()
