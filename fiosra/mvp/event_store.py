import asyncio
import hashlib
import hmac
import json
import logging
from secrets import token_urlsafe
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import text

from fiosra.mvp.database import AsyncSessionLocal
from fiosra.mvp.graph_service import graph_service

logger = logging.getLogger(__name__)


class SubmissionConflictError(RuntimeError):
    """Raised when a session cannot be submitted for the requested revision."""


class EventStore:
    """Append-only learning-event store with server-authoritative session state."""

    def __init__(self) -> None:
        self._pool_primed = False
        self._priming_lock = asyncio.Lock()

    async def _ensure_pool_primed(self) -> None:
        """Open a small set of reusable asyncpg connections before the first learner write.

        This keeps the first concurrent classroom interaction from paying multiple
        independent TCP and authentication setup costs at once.
        """
        if self._pool_primed:
            return
        async with self._priming_lock:
            if self._pool_primed:
                return

            async def open_connection() -> None:
                async with AsyncSessionLocal() as session:
                    await session.execute(text("SELECT 1"))

            await asyncio.gather(*(open_connection() for _ in range(5)))
            self._pool_primed = True

    async def create_session(
        self,
        student_id: str,
        assignment_id: UUID | str | None = None,
        current_question_id: str = "q1",
        access_token: str | None = None,
    ) -> str:
        await self._ensure_pool_primed()
        insert_sql = text("""
            INSERT INTO student_sessions (
                student_id, assignment_id, current_question_id, access_token_hash, status, started_at, last_activity_at
            ) VALUES (
                :student_id, :assignment_id, :current_question_id, :access_token_hash, 'active', NOW(), NOW()
            ) RETURNING session_id;
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                insert_sql,
                {
                    "student_id": student_id,
                    "assignment_id": str(assignment_id) if assignment_id else None,
                    "current_question_id": current_question_id,
                    "access_token_hash": self._hash_access_token(access_token) if access_token else None,
                },
            )
            session_id = result.scalar()
            await session.commit()
        return str(session_id)

    @staticmethod
    def _hash_access_token(access_token: str) -> str:
        return hashlib.sha256(access_token.encode("utf-8")).hexdigest()

    async def has_session_access(self, session_id: UUID | str, access_token: str | None) -> bool:
        """Verify a browser-held capability without exposing its stored digest."""
        if not access_token:
            return False
        query_sql = text("""
            SELECT access_token_hash
            FROM student_sessions
            WHERE session_id = :session_id;
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(query_sql, {"session_id": str(session_id)})
            token_hash = result.scalar()
        return bool(token_hash) and hmac.compare_digest(
            str(token_hash), self._hash_access_token(access_token)
        )

    async def log_event(
        self,
        session_id: UUID | str,
        student_id: str,
        question_id: str,
        event_type: str,
        payload: dict[str, Any],
        assignment_id: UUID | str | None = None,
    ) -> int:
        """Append an immutable event and atomically refresh the active session marker."""
        single_cte_sql = text("""
            WITH ins AS (
                INSERT INTO session_events (
                    session_id, student_id, assignment_id, question_id, event_type, created_at, payload
                ) VALUES (
                    :session_id, :student_id, :assignment_id, :question_id, :event_type, NOW(),
                    CAST(:payload AS JSONB)
                ) RETURNING event_id
            ), upd AS (
                UPDATE student_sessions
                SET last_activity_at = NOW(), current_question_id = :question_id
                WHERE session_id = :session_id
            ) SELECT event_id FROM ins;
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                single_cte_sql,
                {
                    "session_id": str(session_id),
                    "student_id": student_id,
                    "assignment_id": str(assignment_id) if assignment_id else None,
                    "question_id": question_id,
                    "event_type": event_type,
                    "payload": json.dumps(payload, default=str),
                },
            )
            event_id = result.scalar()
            await session.commit()
            
        # Pedagogical Knowledge Graph telemetry in Neo4j
        try:
            if event_type == "student_prompt_submitted" and question_id:
                await graph_service.record_student_attempt(
                    student_id=str(student_id),
                    question_id=str(question_id),
                    session_id=str(session_id),
                )
            elif event_type in ("hint_delivered", "hint_served", "socratic_probe_offered"):
                probe_id = payload.get("probe_id") or f"probe_rung_{payload.get('hint_rung', payload.get('rung', 0))}"
                await graph_service.record_probe_delivery(
                    session_id=str(session_id),
                    probe_id=probe_id,
                    student_id=str(student_id),
                )
            elif event_type == "misconception_flagged":
                misc_id = payload.get("misconception_id") or payload.get("code")
                if misc_id:
                    await graph_service.record_student_belief(
                        student_id=str(student_id),
                        misconception_id=str(misc_id),
                    )
            elif event_type in ("kc_mastered", "concept_mastered"):
                kc_id = payload.get("kc_id") or payload.get("concept_id")
                if kc_id:
                    await graph_service.record_student_mastery(
                        student_id=str(student_id),
                        kc_id=str(kc_id),
                        cleared_misconception_id=payload.get("cleared_misconception_id"),
                    )
        except Exception as e:
            logger.warning(f"Failed to record event in pedagogical graph: {e}")
            
        return int(event_id)

    async def get_current_hint_rung(self, session_id: UUID | str) -> int:
        """Read the maximum hint rung already delivered from the immutable event stream.

        The client may render this value, but cannot authoritatively advance it.
        """
        sql = text("""
            SELECT COALESCE(MAX(COALESCE((payload ->> 'hint_rung')::int, 0)), 0)
            FROM session_events
            WHERE session_id = :session_id
              AND event_type IN ('hint_delivered', 'tutor_turn_completed', 'adversarial_probe_defended');
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(sql, {"session_id": str(session_id)})
            rung = result.scalar()
        return int(rung or 0)

    async def get_session_events(
        self,
        session_id: UUID | str,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        query_sql = text("""
            SELECT event_id, session_id, student_id, assignment_id, question_id, event_type, created_at, payload
            FROM session_events
            WHERE session_id = :session_id
            ORDER BY created_at ASC, event_id ASC
            LIMIT :limit;
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(query_sql, {"session_id": str(session_id), "limit": limit})
            rows = result.mappings().all()
        events = []
        for row in rows:
            event = dict(row)
            if isinstance(event["created_at"], datetime):
                event["created_at"] = event["created_at"].isoformat()
            event["session_id"] = str(event["session_id"])
            if event["assignment_id"]:
                event["assignment_id"] = str(event["assignment_id"])
            events.append(event)
        return events

    async def get_session_details(self, session_id: UUID | str) -> dict[str, Any] | None:
        query_sql = text("""
            SELECT s.session_id, s.student_id, s.assignment_id, s.current_question_id, s.status,
                   s.started_at, s.last_activity_at, s.completed_at,
                   submission.document_revision AS submitted_document_revision,
                   submission.submitted_at
            FROM student_sessions s
            LEFT JOIN student_session_submissions submission ON submission.session_id = s.session_id
            WHERE s.session_id = :session_id;
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(query_sql, {"session_id": str(session_id)})
            row = result.mappings().first()
        if not row:
            return None
        session_data = dict(row)
        session_data["session_id"] = str(session_data["session_id"])
        if session_data["assignment_id"]:
            session_data["assignment_id"] = str(session_data["assignment_id"])
        for key in ("started_at", "last_activity_at", "completed_at", "submitted_at"):
            if isinstance(session_data[key], datetime):
                session_data[key] = session_data[key].isoformat()
        return session_data

    async def get_session(self, session_id: UUID | str) -> dict[str, Any] | None:
        """Compatibility alias for session detail lookup."""
        return await self.get_session_details(session_id)

    async def get_student_assignment_sessions(
        self,
        student_id: str,
        assignment_id: UUID | str,
    ) -> list[dict[str, Any]]:
        """Retrieve chronological history of reasoning sessions for a student on an assignment."""
        query_sql = text("""
            SELECT s.session_id, s.student_id, s.assignment_id, s.current_question_id, s.status,
                   s.started_at, s.last_activity_at, s.completed_at,
                   sub.document_revision AS submitted_document_revision,
                   sub.submitted_at,
                   doc.document_id,
                   doc.document_revision AS current_document_revision,
                   doc.title AS document_title,
                   (
                       SELECT COUNT(*)
                       FROM learning_document_blocks b
                       WHERE b.document_id = doc.document_id
                   ) AS block_count
            FROM student_sessions s
            LEFT JOIN student_session_submissions sub ON sub.session_id = s.session_id
            LEFT JOIN learning_documents doc ON doc.session_id = s.session_id
            WHERE s.student_id = :student_id
              AND s.assignment_id = :assignment_id
            ORDER BY s.started_at ASC;
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                query_sql,
                {"student_id": str(student_id), "assignment_id": str(assignment_id)},
            )
            rows = result.mappings().all()

        sessions_list = []
        for idx, row in enumerate(rows, start=1):
            s_dict = dict(row)
            s_dict["attempt_number"] = idx
            s_dict["session_id"] = str(s_dict["session_id"])
            if s_dict.get("assignment_id"):
                s_dict["assignment_id"] = str(s_dict["assignment_id"])
            if s_dict.get("document_id"):
                s_dict["document_id"] = str(s_dict["document_id"])
            for key in ("started_at", "last_activity_at", "completed_at", "submitted_at"):
                if isinstance(s_dict.get(key), datetime):
                    s_dict[key] = s_dict[key].isoformat()
            sessions_list.append(s_dict)

        sessions_list.reverse()
        return sessions_list

    async def reconnect_session(self, session_id: UUID | str, student_id: str) -> str | None:
        """Issue a fresh access token for a student's own active or submitted session."""
        new_token = token_urlsafe(32)
        update_sql = text("""
            UPDATE student_sessions
            SET access_token_hash = :new_token_hash,
                last_activity_at = NOW()
            WHERE session_id = :session_id
              AND student_id = :student_id
            RETURNING session_id;
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                update_sql,
                {
                    "session_id": str(session_id),
                    "student_id": student_id,
                    "new_token_hash": self._hash_access_token(new_token),
                },
            )
            matched = result.scalar()
            await session.commit()
        return new_token if matched else None

    async def get_document_revision(self, session_id: UUID | str) -> int | None:
        """Return the latest saved revision for compatibility callers without a request body."""
        query_sql = text("""
            SELECT document_revision
            FROM learning_documents
            WHERE session_id = :session_id;
        """)
        async with AsyncSessionLocal() as session:
            result = await session.execute(query_sql, {"session_id": str(session_id)})
            revision = result.scalar()
        return int(revision) if revision is not None else None

    async def submit_session(
        self,
        session_id: UUID | str,
        document_revision: int,
        idempotency_key: str,
    ) -> dict[str, Any]:
        """Submit one exact document revision and return the same result on safe retry."""
        document_sql = text("""
            SELECT document_id, document_revision
            FROM learning_documents
            WHERE session_id = :session_id
            FOR UPDATE;
        """)
        existing_submission_sql = text("""
            SELECT session_id, document_id, document_revision, idempotency_key, submitted_at
            FROM student_session_submissions
            WHERE session_id = :session_id
            FOR UPDATE;
        """)
        update_sql = text("""
            UPDATE student_sessions
            SET status = 'submitted', last_activity_at = NOW()
            WHERE session_id = :session_id AND status = 'active'
            RETURNING session_id, student_id, assignment_id, current_question_id, status;
        """)
        insert_submission_sql = text("""
            INSERT INTO student_session_submissions (
                session_id, document_id, document_revision, idempotency_key
            ) VALUES (
                :session_id, :document_id, :document_revision, :idempotency_key
            ) RETURNING submitted_at;
        """)
        async with AsyncSessionLocal() as session:
            existing_result = await session.execute(existing_submission_sql, {"session_id": str(session_id)})
            existing = existing_result.mappings().first()
            if existing:
                await session.commit()
                return {
                    "session_id": str(existing["session_id"]),
                    "document_id": str(existing["document_id"]),
                    "document_revision": int(existing["document_revision"]),
                    "submitted_at": existing["submitted_at"],
                    "created": False,
                }

            document_result = await session.execute(document_sql, {"session_id": str(session_id)})
            document = document_result.mappings().first()
            if not document:
                raise SubmissionConflictError("A document must be saved before it can be submitted.")
            if int(document["document_revision"]) != int(document_revision):
                raise SubmissionConflictError(
                    "The document changed before submission. Save the latest revision and try again."
                )

            result = await session.execute(update_sql, {"session_id": str(session_id)})
            row = result.mappings().first()
            if not row:
                raise SubmissionConflictError("This session is no longer available for submission.")
            submission_result = await session.execute(
                insert_submission_sql,
                {
                    "session_id": str(session_id),
                    "document_id": str(document["document_id"]),
                    "document_revision": int(document_revision),
                    "idempotency_key": idempotency_key,
                },
            )
            submitted_at = submission_result.scalar_one()
            await session.commit()
        return {
            "session_id": str(row["session_id"]),
            "document_id": str(document["document_id"]),
            "document_revision": int(document_revision),
            "submitted_at": submitted_at,
            "created": True,
        }

    async def complete_session(self, session_id: UUID | str) -> None:
        update_sql = text("""
            UPDATE student_sessions
            SET status = 'completed', completed_at = NOW(), last_activity_at = NOW()
            WHERE session_id = :session_id;
        """)
        async with AsyncSessionLocal() as session:
            await session.execute(update_sql, {"session_id": str(session_id)})
            await session.commit()


event_store = EventStore()
