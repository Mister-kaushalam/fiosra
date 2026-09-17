"""
fiosra/mvp/mcp/server.py
Custom Fiosra FastMCP Server.
Exposes typed, parameterized pedagogical tools to internal Fiosra agents over stdio/SSE/in-process.
Guarantees 100% Answer Isolation by only accepting parameterized inputs and never exposing raw Cypher/SQL strings.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from mcp.server.mcpserver import MCPServer
from sqlalchemy import text

from fiosra.mvp.database import AsyncSessionLocal
from fiosra.mvp.event_store import EventStore
from fiosra.mvp.graph_service import graph_service

logger = logging.getLogger(__name__)

mcp_server = MCPServer("FiosraPedagogicalEngine")
_event_store = EventStore()


# -------------------------------------------------------------------------
# Tool 1: search_misconceptions
# -------------------------------------------------------------------------
@mcp_server.tool()
async def search_misconceptions(
    student_claim: str,
    kc_id: str = "*",
    course_id: str = "",
    limit: int = 2,
) -> list[dict[str, Any]]:
    """
    Diagnoses student claims against the Neo4j pedagogical knowledge graph.
    Returns matching cognitive traps, flawed rules, and associated 3-rung Socratic probes.
    Guarantees Answer Isolation: only returns diagnostic probes, never solution keys.
    """
    try:
        results = await graph_service.search_misconceptions(
            query=student_claim,
            kc_id=kc_id,
            limit=min(max(limit, 1), 5),
        )
        return results
    except Exception as e:
        logger.warning(f"MCP search_misconceptions query error: {e}")
        return []


# -------------------------------------------------------------------------
# Tool 2: query_prerequisite_chain
# -------------------------------------------------------------------------
@mcp_server.tool()
async def query_prerequisite_chain(
    course_id: str,
    kc_id: str,
    max_depth: int = 3,
) -> list[dict[str, Any]]:
    """
    Traverses prerequisite relationships in Neo4j up to max_depth to retrieve foundational concepts.
    Returns concept labels, Bloom demand levels, and distance from the target concept.
    """
    try:
        return await graph_service.get_prerequisite_chain(
            course_id=course_id,
            kc_id=kc_id,
            depth=min(max(max_depth, 1), 5),
        )
    except Exception as e:
        logger.warning(f"MCP query_prerequisite_chain error: {e}")
        return []


# -------------------------------------------------------------------------
# Tool 3: record_student_mastery
# -------------------------------------------------------------------------
@mcp_server.tool()
async def record_student_mastery(
    student_id: str,
    kc_id: str,
    cleared_misconception_id: str = "",
) -> dict[str, Any]:
    """
    Records student demonstrated mastery in Neo4j and atomically clears the active
    [:BELIEVES] cognitive trap edge if a cleared_misconception_id is supplied.
    """
    try:
        await graph_service.record_student_mastery(
            student_id=student_id,
            kc_id=kc_id,
            cleared_misconception_id=cleared_misconception_id or None,
        )
        return {
            "status": "success",
            "student_id": student_id,
            "kc_id": kc_id,
            "cleared_misconception_id": cleared_misconception_id,
            "timestamp": datetime.now(UTC).isoformat(),
        }
    except Exception as e:
        logger.error(f"MCP record_student_mastery error: {e}")
        return {"status": "error", "message": str(e)}


# -------------------------------------------------------------------------
# Tool 4: fetch_grounded_source_chunks
# -------------------------------------------------------------------------
@mcp_server.tool()
async def fetch_grounded_source_chunks(
    course_id: str,
    query: str,
    top_k: int = 3,
) -> list[dict[str, Any]]:
    """
    Retrieves verbatim primary source text excerpts from PostgreSQL pgvector.
    Allows Socratic and Designer agents to ground claims in authentic curriculum materials.
    """
    try:
        # Check if course_id is a valid UUID
        try:
            cid = UUID(course_id)
        except (ValueError, TypeError):
            cid = None

        async with AsyncSessionLocal() as session:
            if cid:
                stmt = text("""
                    SELECT chunk_id, title, content, module_id
                    FROM syllabus_chunks
                    WHERE course_id = :course_id
                      AND (:query = '' OR to_tsvector('english', content) @@ plainto_tsquery('english', :query)
                           OR content ILIKE :like_query)
                    LIMIT :top_k
                """)
                res = await session.execute(stmt, {
                    "course_id": cid,
                    "query": query,
                    "like_query": f"%{query}%",
                    "top_k": min(max(top_k, 1), 5),
                })
            else:
                stmt = text("""
                    SELECT chunk_id, title, content, module_id
                    FROM syllabus_chunks
                    WHERE :query = '' OR content ILIKE :like_query
                    LIMIT :top_k
                """)
                res = await session.execute(stmt, {
                    "query": query,
                    "like_query": f"%{query}%",
                    "top_k": min(max(top_k, 1), 5),
                })

            rows = res.fetchall()
            return [
                {
                    "chunk_id": str(r.chunk_id),
                    "title": r.title or "Curriculum Source",
                    "content": r.content,
                    "module_id": str(r.module_id) if r.module_id else None,
                }
                for r in rows
            ]
    except Exception as e:
        logger.warning(f"MCP fetch_grounded_source_chunks error: {e}")
        return []


# -------------------------------------------------------------------------
# Tool 5: record_learning_episode (Graphiti)
# -------------------------------------------------------------------------
@mcp_server.tool()
async def record_learning_episode(
    student_id: str,
    turn_type: str,
    text_content: str,
) -> dict[str, Any]:
    """
    Records a conversational learning episode into Graphiti temporal memory in Neo4j.
    Graphiti extracts dynamic conceptual claims and invalidates superseded misconceptions over time.
    """
    graphiti = graph_service.get_graphiti()
    now_iso = datetime.now(UTC).isoformat()
    if not graphiti:
        logger.debug("Graphiti client offline; returning recorded mock episode.")
        return {
            "status": "recorded_mock",
            "student_id": student_id,
            "turn_type": turn_type,
            "timestamp": now_iso,
        }

    try:
        episode = await graphiti.add_episode(
            name=f"turn_{turn_type}_{int(datetime.now(UTC).timestamp())}",
            episode_body=text_content,
            source_description=f"Fiosra Socratic Dialogue ({turn_type})",
            reference_time=datetime.now(UTC),
            group_id=student_id,
        )
        return {
            "status": "success",
            "episode_id": str(episode.episode.uuid) if hasattr(episode, "episode") else "ok",
            "student_id": student_id,
            "timestamp": now_iso,
        }
    except Exception as e:
        logger.warning(f"Graphiti add_episode error: {e}")
        return {"status": "fallback", "error": str(e), "timestamp": now_iso}


# -------------------------------------------------------------------------
# Tool 6: query_student_belief_trajectory (Graphiti)
# -------------------------------------------------------------------------
@mcp_server.tool()
async def query_student_belief_trajectory(
    student_id: str,
    concept_query: str = "",
) -> list[dict[str, Any]]:
    """
    Queries Graphiti temporal memory in Neo4j to retrieve the student's evolving mental model.
    Returns facts and claims with temporal validity (valid_at, invalidated_at) for this student.
    """
    graphiti = graph_service.get_graphiti()
    if not graphiti:
        return []

    try:
        edges = await graphiti.search(
            query=concept_query or "student claim reasoning",
            group_ids=[student_id],
            num_results=6,
        )
        trajectory = []
        for edge in edges:
            fact_statement = getattr(edge, "fact", "") or getattr(edge, "statement", "")
            valid_at = getattr(edge, "valid_at", None)
            invalidated_at = getattr(edge, "invalidated_at", None)
            trajectory.append({
                "claim": fact_statement,
                "valid_at": valid_at.isoformat() if valid_at else None,
                "invalidated_at": invalidated_at.isoformat() if invalidated_at else None,
                "is_active": invalidated_at is None,
            })
        return trajectory
    except Exception as e:
        logger.warning(f"Graphiti search error: {e}")
        return []


# -------------------------------------------------------------------------
# Tool 7: fetch_telemetry_stats (EventStore)
# -------------------------------------------------------------------------
@mcp_server.tool()
async def fetch_telemetry_stats(
    student_id: str,
    assignment_id: str = "",
) -> dict[str, Any]:
    """
    Computes interaction telemetry metrics (event counts, hint request frequency)
    from PostgreSQL session_events for the Learner Evidence Agent.
    """
    try:
        async with AsyncSessionLocal() as session:
            stmt = text("""
                SELECT event_type, count(*) as count
                FROM session_events
                WHERE student_id = :student_id
                  AND (:assignment_id = '' OR assignment_id = CAST(:assignment_id AS UUID))
                GROUP BY event_type
            """)
            params: dict[str, Any] = {"student_id": student_id, "assignment_id": assignment_id}
            try:
                if assignment_id:
                    UUID(assignment_id)
            except ValueError:
                params["assignment_id"] = ""

            res = await session.execute(stmt, params)
            counts = {r.event_type: r.count for r in res.fetchall()}

            return {
                "student_id": student_id,
                "total_events": sum(counts.values()),
                "hints_requested": counts.get("hint_requested", 0),
                "turns_completed": counts.get("socratic_turn", 0),
                "event_breakdown": counts,
            }
    except Exception as e:
        logger.warning(f"MCP fetch_telemetry_stats error: {e}")
        return {
            "student_id": student_id,
            "total_events": 0,
            "hints_requested": 0,
            "turns_completed": 0,
            "event_breakdown": {},
        }


def get_fiosra_mcp_server() -> MCPServer:
    """Returns the configured Fiosra FastMCP Server instance."""
    return mcp_server
