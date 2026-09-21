import json
import logging
from typing import Any
from uuid import UUID

from sqlalchemy import text

from fiosra.mvp.courses.ingestion import syllabus_parser
from fiosra.mvp.courses.schemas import (
    CohortRosterResponse,
    CohortStudentMetrics,
    CourseCreate,
    CourseResponse,
    EnrollmentResponse,
    ModuleCreate,
    ModuleResponse,
)
from fiosra.mvp.database import AsyncSessionLocal

logger = logging.getLogger(__name__)


class CourseService:
    """
    Business logic and query engine for Course Workspaces, Curriculum Modules,
    Syllabus grounding, and Cohort Roster diagnostics.
    """

    @classmethod
    async def create_course(cls, data: CourseCreate) -> CourseResponse:
        """
        Creates a new course workspace, stores syllabus context, and automatically
        generates semantic syllabus grounding chunks in pgvector.
        """
        insert_sql = text("""
            INSERT INTO courses (title, domain, created_by, syllabus_context, created_at)
            VALUES (:title, :domain, :created_by, :syllabus_context, NOW())
            RETURNING course_id, title, domain, created_by, syllabus_context, created_at;
        """)

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                insert_sql,
                {
                    "title": data.title,
                    "domain": data.domain,
                    "created_by": data.created_by,
                    "syllabus_context": data.syllabus_context,
                },
            )
            row = result.mappings().first()
            if not row:
                raise RuntimeError("Failed to insert course.")
            await session.commit()

        course_id = row["course_id"]

        # If syllabus text was provided, ingest and vectorize
        if data.syllabus_context:
            try:
                await syllabus_parser.ingest_syllabus(
                    course_id=course_id,
                    content=data.syllabus_context,
                    title=f"{data.title} - Overview",
                    domain=data.domain,
                )
            except (RuntimeError, ValueError, OSError) as e:
                logger.warning(f"Automatic syllabus ingestion failed for course {course_id}: {e}")

        return CourseResponse(
            course_id=course_id,
            title=row["title"],
            domain=row["domain"],
            created_by=row["created_by"],
            syllabus_context=row["syllabus_context"],
            created_at=row["created_at"],
            modules=[],
            assignments_count=0,
        )

    @classmethod
    async def list_courses(cls) -> list[CourseResponse]:
        """
        Lists all courses with nested module summaries and total assignment counts.
        """
        courses_sql = text("""
            SELECT c.course_id, c.title, c.domain, c.created_by, c.syllabus_context, c.created_at,
                   COUNT(DISTINCT a.assignment_id) as assignments_count
            FROM courses c
            LEFT JOIN modules m ON c.course_id = m.course_id
            LEFT JOIN assignments a ON m.module_id = a.module_id
            GROUP BY c.course_id
            ORDER BY c.created_at DESC;
        """)

        async with AsyncSessionLocal() as session:
            result = await session.execute(courses_sql)
            rows = result.mappings().all()

            courses = []
            for r in rows:
                course_id = r["course_id"]
                modules = await cls.get_modules_for_course(course_id)
                courses.append(
                    CourseResponse(
                        course_id=course_id,
                        title=r["title"],
                        domain=r["domain"],
                        created_by=r["created_by"],
                        syllabus_context=r["syllabus_context"],
                        created_at=r["created_at"],
                        modules=modules,
                        assignments_count=int(r["assignments_count"]),
                    )
                )
            return courses

    @classmethod
    async def list_student_catalog(cls, student_id: str) -> list[dict[str, Any]]:
        """Project a single student-safe course catalog with one canonical published milestone."""
        # Imported lazily to avoid coupling the general course domain to authoring
        # during application startup.
        from fiosra.mvp.assignment_designer.generator import assignment_generator

        courses = await cls.list_courses()
        enrolled_course_ids = {
            str(course.course_id) for course in await cls.list_enrolled_courses(student_id)
        }
        catalog: list[dict[str, Any]] = []
        for course in courses:
            public_assignments = await assignment_generator.list_public_assignments(
                course_id=course.course_id,
                status="published",
            )
            active_assignment = public_assignments[0].model_dump(mode="json") if public_assignments else None
            if active_assignment:
                public_contract = active_assignment.get("published") or {}
                active_assignment["title"] = active_assignment.get("title") or public_contract.get("title", "Assignment")
                active_assignment["prompt"] = active_assignment.get("prompt") or (
                    public_contract.get("task") or {}
                ).get("prompt", "")
            course_data = course.model_dump(mode="json")
            # Do not use the legacy nested assignment summary to determine
            # availability. It can disagree with the student-safe projection.
            course_data["active_assignment"] = active_assignment
            course_data["is_enrolled"] = str(course.course_id) in enrolled_course_ids
            course_data["is_available"] = active_assignment is not None or bool(course.modules and len(course.modules) > 0)
            catalog.append(course_data)
        return catalog

    @classmethod
    async def get_course(cls, course_id: UUID | str) -> CourseResponse | None:
        """
        Fetches a course by ID with all sequential modules and active assignments.
        """
        course_sql = text("""
            SELECT c.course_id, c.title, c.domain, c.created_by, c.syllabus_context, c.created_at,
                   COUNT(DISTINCT a.assignment_id) as assignments_count
            FROM courses c
            LEFT JOIN modules m ON c.course_id = m.course_id
            LEFT JOIN assignments a ON m.module_id = a.module_id
            WHERE c.course_id = :course_id
            GROUP BY c.course_id;
        """)

        async with AsyncSessionLocal() as session:
            result = await session.execute(course_sql, {"course_id": str(course_id)})
            row = result.mappings().first()
            if not row:
                return None

        modules = await cls.get_modules_for_course(course_id)
        return CourseResponse(
            course_id=row["course_id"],
            title=row["title"],
            domain=row["domain"],
            created_by=row["created_by"],
            syllabus_context=row["syllabus_context"],
            created_at=row["created_at"],
            modules=modules,
            assignments_count=int(row["assignments_count"]),
        )

    @classmethod
    async def add_module(cls, course_id: UUID | str, data: ModuleCreate) -> ModuleResponse:
        """
        Appends a new curriculum module to a course.
        """
        # Verify course exists
        course = await cls.get_course(course_id)
        if not course:
            raise ValueError(f"Course '{course_id}' does not exist.")

        insert_sql = text("""
            INSERT INTO modules (course_id, title, description, learning_objectives, position)
            VALUES (:course_id, :title, :description, :learning_objectives, :position)
            RETURNING module_id, course_id, title, description, learning_objectives, position;
        """)

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                insert_sql,
                {
                    "course_id": str(course_id),
                    "title": data.title,
                    "description": data.description,
                    "learning_objectives": json.dumps(data.learning_objectives),
                    "position": data.position,
                },
            )
            row = result.mappings().first()
            if not row:
                raise RuntimeError("Failed to insert module.")
            await session.commit()

        return ModuleResponse(
            module_id=row["module_id"],
            course_id=row["course_id"],
            title=row["title"],
            description=row["description"],
            learning_objectives=row["learning_objectives"] or [],
            position=row["position"],
            is_locked=row["position"] > 1,
            assignments=[],
        )

    @classmethod
    async def get_modules_for_course(cls, course_id: UUID | str) -> list[ModuleResponse]:
        """
        Fetches all modules for a course ordered by position with nested assignment lists.
        """
        modules_sql = text("""
            SELECT module_id, course_id, title, description, learning_objectives, position
            FROM modules
            WHERE course_id = :course_id
            ORDER BY position ASC;
        """)

        assignments_sql = text("""
            SELECT assignment_id, module_id, title, spec
            FROM assignments
            WHERE module_id IN (
                SELECT module_id FROM modules WHERE course_id = :course_id
            );
        """)

        async with AsyncSessionLocal() as session:
            m_res = await session.execute(modules_sql, {"course_id": str(course_id)})
            m_rows = m_res.mappings().all()

            a_res = await session.execute(assignments_sql, {"course_id": str(course_id)})
            a_rows = a_res.mappings().all()

        assignments_by_module: dict[str, list[dict[str, Any]]] = {}
        for a in a_rows:
            mid = str(a["module_id"])
            if mid not in assignments_by_module:
                assignments_by_module[mid] = []
            spec = a["spec"] if isinstance(a["spec"], dict) else {}
            published = spec.get("published") or {}
            task = published.get("task") or {}
            raw_prompt = task.get("prompt") or spec.get("prompt") or ""
            # Extract first paragraph as concise clean summary
            first_para = raw_prompt.split("\n\n")[0] if raw_prompt else ""
            clean_summary = first_para.replace("###", "").replace("#", "").strip()[:240]
            rubric_items = published.get("public_rubric") or spec.get("rubric_criteria") or []
            assignments_by_module[mid].append({
                "assignment_id": str(a["assignment_id"]),
                "title": published.get("title") or a["title"],
                "status": spec.get("status", "draft"),
                "summary": clean_summary,
                "rubric_count": len(rubric_items),
                "target_kcs": published.get("target_kcs") or spec.get("target_kcs") or [],
            })

        modules: list[ModuleResponse] = []
        for idx, m in enumerate(m_rows):
            mid_str = str(m["module_id"])
            modules.append(
                ModuleResponse(
                    module_id=m["module_id"],
                    course_id=m["course_id"],
                    title=m["title"],
                    description=m["description"],
                    learning_objectives=m["learning_objectives"] or [],
                    position=m["position"],
                    is_locked=(idx > 0),
                    assignments=assignments_by_module.get(mid_str, []),
                )
            )
        return modules

    @classmethod
    async def get_module(cls, course_id: UUID | str, module_id: UUID | str) -> ModuleResponse | None:
        """
        Fetches details, learning objectives, lock status, and assignments for a single module.
        """
        sql = text("""
            SELECT module_id, course_id, title, description, learning_objectives, position
            FROM modules
            WHERE course_id = :course_id AND module_id = :module_id;
        """)

        assignments_sql = text("""
            SELECT assignment_id, title, spec
            FROM assignments
            WHERE module_id = :module_id;
        """)

        async with AsyncSessionLocal() as session:
            res = await session.execute(sql, {"course_id": str(course_id), "module_id": str(module_id)})
            row = res.mappings().first()
            if not row:
                return None

            a_res = await session.execute(assignments_sql, {"module_id": str(module_id)})
            a_rows = a_res.mappings().all()

        assignments = [
            {
                "assignment_id": str(a["assignment_id"]),
                "title": a["title"],
                "status": a["spec"].get("status", "draft") if isinstance(a["spec"], dict) else "draft",
            }
            for a in a_rows
        ]

        return ModuleResponse(
            module_id=row["module_id"],
            course_id=row["course_id"],
            title=row["title"],
            description=row["description"],
            learning_objectives=row["learning_objectives"] or [],
            position=row["position"],
            is_locked=row["position"] > 1,
            assignments=assignments,
        )

    # ------------------------------------------------------------------
    # Enrollment Management
    # ------------------------------------------------------------------

    @classmethod
    async def enroll_student(cls, course_id: UUID | str, student_id: str) -> EnrollmentResponse:
        """Enroll a student in a course. Idempotent — re-enrolling returns existing row."""
        upsert_sql = text("""
            INSERT INTO enrollments (course_id, student_id, enrolled_at)
            VALUES (:course_id, :student_id, NOW())
            ON CONFLICT (course_id, student_id) DO NOTHING
            RETURNING enrollment_id, course_id, student_id, enrolled_at;
        """)
        select_sql = text("""
            SELECT enrollment_id, course_id, student_id, enrolled_at
            FROM enrollments
            WHERE course_id = :course_id AND student_id = :student_id;
        """)
        params = {"course_id": str(course_id), "student_id": student_id}

        async with AsyncSessionLocal() as session:
            result = await session.execute(upsert_sql, params)
            row = result.mappings().first()
            if not row:
                # Already enrolled — fetch existing record
                result = await session.execute(select_sql, params)
                row = result.mappings().first()
            await session.commit()

        return EnrollmentResponse(
            enrollment_id=row["enrollment_id"],
            course_id=row["course_id"],
            student_id=row["student_id"],
            enrolled_at=row["enrolled_at"],
        )

    @classmethod
    async def unenroll_student(cls, course_id: UUID | str, student_id: str) -> bool:
        """Remove a student's enrollment. Returns True if a row was deleted."""
        delete_sql = text("""
            DELETE FROM enrollments
            WHERE course_id = :course_id AND student_id = :student_id;
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                delete_sql,
                {"course_id": str(course_id), "student_id": student_id},
            )
            await session.commit()
            return result.rowcount > 0

    @classmethod
    async def list_enrolled_courses(cls, student_id: str) -> list[CourseResponse]:
        """Return all courses a student is enrolled in, with modules and assignment counts."""
        enrolled_sql = text("""
            SELECT c.course_id, c.title, c.domain, c.created_by, c.syllabus_context, c.created_at
            FROM courses c
            JOIN enrollments e ON c.course_id = e.course_id
            WHERE e.student_id = :student_id
            ORDER BY e.enrolled_at DESC;
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(enrolled_sql, {"student_id": student_id})
            rows = result.mappings().all()

        courses: list[CourseResponse] = []
        for row in rows:
            cid = row["course_id"]
            modules = await cls.get_modules_for_course(cid)
            assignment_count = sum(len(m.assignments) for m in modules)
            courses.append(
                CourseResponse(
                    course_id=cid,
                    title=row["title"],
                    domain=row["domain"] or "General",
                    created_by=row["created_by"],
                    syllabus_context=row["syllabus_context"],
                    created_at=row["created_at"],
                    modules=modules,
                    assignments_count=assignment_count,
                )
            )
        return courses

    @classmethod
    async def get_cohort_roster(cls, course_id: UUID | str) -> CohortRosterResponse:
        """
        Aggregates student performance across all course assignments, computing
        Autonomy Scores (A_s), hint consumption rates, and active struggle flags.
        """
        course = await cls.get_course(course_id)
        if not course:
            raise ValueError(f"Course '{course_id}' not found.")

        # Query session telemetry linked to this course
        telemetry_sql = text("""
            SELECT 
                s.student_id,
                COUNT(DISTINCT s.session_id) as session_count,
                COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.session_id END) as completed_count,
                COUNT(CASE WHEN e.event_type IN ('hint_served', 'hint_delivered') THEN 1 END) as hint_count,
                COUNT(CASE WHEN e.event_type = 'misconception_flagged' THEN 1 END) as misconception_count,
                jsonb_agg(CASE WHEN e.event_type IN ('hint_served', 'hint_delivered') THEN e.payload END) as hints,
                jsonb_agg(CASE WHEN e.event_type = 'misconception_flagged' THEN e.payload END) as misconceptions
            FROM student_sessions s
            JOIN assignments a ON s.assignment_id = a.assignment_id
            JOIN modules m ON a.module_id = m.module_id
            LEFT JOIN session_events e ON s.session_id = e.session_id
            WHERE m.course_id = :course_id
            GROUP BY s.student_id;
        """)

        async with AsyncSessionLocal() as session:
            result = await session.execute(telemetry_sql, {"course_id": str(course_id)})
            rows = result.mappings().all()

        students: list[CohortStudentMetrics] = []

        for r in rows:
            student_id = r["student_id"]
            session_count = int(r["session_count"])
            completed = int(r["completed_count"])
            hint_count = int(r["hint_count"])
            misconception_count = int(r["misconception_count"])

            hints_data = [h for h in (r["hints"] or []) if h is not None]
            misconceptions_data = [m for m in (r["misconceptions"] or []) if m is not None]

            # Calculate Autonomy Score
            # Each hint rung decrements by 0.25 (rung 1 -> 0.75, rung 2 -> 0.50, rung 3 -> 0.25)
            autonomy_scores = []
            struggling_kcs = set()

            for h in hints_data:
                rung = h.get("rung", 1)
                autonomy_scores.append(max(0.0, 1.0 - 0.25 * rung))
                if rung >= 3 and "target_kc" in h:
                    struggling_kcs.add(h["target_kc"])

            for m in misconceptions_data:
                if "kc_id" in m:
                    struggling_kcs.add(m["kc_id"])

            avg_autonomy = round(sum(autonomy_scores) / len(autonomy_scores), 2) if autonomy_scores else 1.00
            hint_rate = round(hint_count / max(session_count * 2, 1), 2)
            active_struggle = (avg_autonomy < 0.60) or (misconception_count >= 2) or (hint_rate > 0.50)

            students.append(
                CohortStudentMetrics(
                    student_id=student_id,
                    session_count=session_count,
                    completed_assignments=completed,
                    average_autonomy_score=avg_autonomy,
                    hint_consumption_rate=hint_rate,
                    active_struggle=active_struggle,
                    struggling_kcs=sorted(struggling_kcs),
                )
            )

        return CohortRosterResponse(
            course_id=course.course_id,
            course_title=course.title,
            total_enrolled=len(students),
            students=students,
        )

    @classmethod
    async def delete_course(cls, course_id: UUID | str) -> bool:
        """
        Completely deletes a course workspace and all associated records:
        1. PostgreSQL: deletes dependent session records, canvas drafts, documents,
           student sessions, assignments, and the course record (which cascades to
           modules, syllabus_chunks, course_documents, enrollments).
        2. Neo4j: detaches and deletes all nodes linked by course_id.
        3. Storage: removes course source files from disk.
        """
        from fiosra.mvp.neo4j_client import neo4j_client
        from fiosra.mvp.storage import document_storage

        c_id = str(course_id)
        async with AsyncSessionLocal() as session:
            # Query stored file paths for disk cleanup
            docs_res = await session.execute(
                text("SELECT file_path FROM course_documents WHERE course_id = CAST(:course_id AS UUID)"),
                {"course_id": c_id},
            )
            file_paths = [r[0] for r in docs_res.fetchall() if r[0]]

            # 1. Claim links
            await session.execute(
                text("""
                    DELETE FROM learning_document_source_claim_links
                    WHERE reference_id IN (
                        SELECT r.reference_id FROM learning_document_source_references r
                        JOIN learning_documents d ON r.document_id = d.document_id
                        JOIN assignments a ON d.assignment_id = a.assignment_id
                        JOIN modules m ON a.module_id = m.module_id
                        WHERE m.course_id = CAST(:course_id AS UUID)
                    )
                """),
                {"course_id": c_id},
            )

            # 2. Source references
            await session.execute(
                text("""
                    DELETE FROM learning_document_source_references
                    WHERE document_id IN (
                        SELECT d.document_id FROM learning_documents d
                        JOIN assignments a ON d.assignment_id = a.assignment_id
                        JOIN modules m ON a.module_id = m.module_id
                        WHERE m.course_id = CAST(:course_id AS UUID)
                    )
                """),
                {"course_id": c_id},
            )

            # 3. Socratic probe responses
            await session.execute(
                text("""
                    DELETE FROM socratic_probe_responses
                    WHERE probe_id IN (
                        SELECT p.probe_id FROM socratic_probes p
                        JOIN student_sessions s ON p.session_id = s.session_id
                        JOIN assignments a ON s.assignment_id = a.assignment_id
                        JOIN modules m ON a.module_id = m.module_id
                        WHERE m.course_id = CAST(:course_id AS UUID)
                    )
                """),
                {"course_id": c_id},
            )

            # 4. Socratic probes
            await session.execute(
                text("""
                    DELETE FROM socratic_probes
                    WHERE session_id IN (
                        SELECT s.session_id FROM student_sessions s
                        JOIN assignments a ON s.assignment_id = a.assignment_id
                        JOIN modules m ON a.module_id = m.module_id
                        WHERE m.course_id = CAST(:course_id AS UUID)
                    )
                """),
                {"course_id": c_id},
            )

            # 5. Session submissions
            await session.execute(
                text("""
                    DELETE FROM student_session_submissions
                    WHERE session_id IN (
                        SELECT s.session_id FROM student_sessions s
                        JOIN assignments a ON s.assignment_id = a.assignment_id
                        JOIN modules m ON a.module_id = m.module_id
                        WHERE m.course_id = CAST(:course_id AS UUID)
                    )
                """),
                {"course_id": c_id},
            )

            # 6. Document blocks
            await session.execute(
                text("""
                    DELETE FROM learning_document_blocks
                    WHERE document_id IN (
                        SELECT d.document_id FROM learning_documents d
                        JOIN assignments a ON d.assignment_id = a.assignment_id
                        JOIN modules m ON a.module_id = m.module_id
                        WHERE m.course_id = CAST(:course_id AS UUID)
                    )
                """),
                {"course_id": c_id},
            )

            # 7. Learning documents
            await session.execute(
                text("""
                    DELETE FROM learning_documents
                    WHERE assignment_id IN (
                        SELECT a.assignment_id FROM assignments a
                        JOIN modules m ON a.module_id = m.module_id
                        WHERE m.course_id = CAST(:course_id AS UUID)
                    )
                """),
                {"course_id": c_id},
            )

            # 8. Canvas drafts
            await session.execute(
                text("""
                    DELETE FROM canvas_section_drafts
                    WHERE session_id IN (
                        SELECT s.session_id FROM student_sessions s
                        JOIN assignments a ON s.assignment_id = a.assignment_id
                        JOIN modules m ON a.module_id = m.module_id
                        WHERE m.course_id = CAST(:course_id AS UUID)
                    )
                """),
                {"course_id": c_id},
            )

            # 9. Canvas suggestions
            await session.execute(
                text("""
                    DELETE FROM canvas_suggestions
                    WHERE session_id IN (
                        SELECT s.session_id FROM student_sessions s
                        JOIN assignments a ON s.assignment_id = a.assignment_id
                        JOIN modules m ON a.module_id = m.module_id
                        WHERE m.course_id = CAST(:course_id AS UUID)
                    )
                """),
                {"course_id": c_id},
            )

            # 10. Session events
            await session.execute(
                text("""
                    DELETE FROM session_events
                    WHERE session_id IN (
                        SELECT s.session_id FROM student_sessions s
                        JOIN assignments a ON s.assignment_id = a.assignment_id
                        JOIN modules m ON a.module_id = m.module_id
                        WHERE m.course_id = CAST(:course_id AS UUID)
                    )
                """),
                {"course_id": c_id},
            )

            # 11. Student sessions
            await session.execute(
                text("""
                    DELETE FROM student_sessions
                    WHERE assignment_id IN (
                        SELECT a.assignment_id FROM assignments a
                        JOIN modules m ON a.module_id = m.module_id
                        WHERE m.course_id = CAST(:course_id AS UUID)
                    )
                """),
                {"course_id": c_id},
            )

            # 12. Assignments
            await session.execute(
                text("""
                    DELETE FROM assignments 
                    WHERE module_id IN (SELECT module_id FROM modules WHERE course_id = CAST(:course_id AS UUID))
                """),
                {"course_id": c_id},
            )

            # 13. Courses (cascades to modules, syllabus_chunks, course_documents, enrollments)
            result = await session.execute(
                text("DELETE FROM courses WHERE course_id = CAST(:course_id AS UUID)"),
                {"course_id": c_id},
            )
            await session.commit()
            deleted = result.rowcount > 0

        # Remove stored files from disk
        for fp in file_paths:
            try:
                document_storage.delete_file(fp)
            except Exception as e:
                logger.warning("Failed to delete course file %s: %s", fp, e)
        try:
            document_storage.delete_course_documents(c_id)
        except Exception as e:
            logger.warning("Failed to remove course directory: %s", e)

        try:
            async with neo4j_client.get_session() as graph_session:
                await graph_session.run(
                    """
                    MATCH (n {course_id: $course_id})
                    DETACH DELETE n
                    """,
                    {"course_id": c_id},
                )
        except Exception as e:
            logger.warning("Neo4j cleanup during course deletion warning: %s", e)

        return deleted


course_service = CourseService()
