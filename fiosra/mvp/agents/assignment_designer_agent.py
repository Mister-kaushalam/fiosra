"""
fiosra/mvp/agents/assignment_designer_agent.py
Assignment Designer Agent.
Authors primary-source-grounded assessments, questions, and Bloom-calibrated rubrics.
Consumes Fiosra FastMCP Server tools:
  - fetch_grounded_source_chunks (PostgreSQL pgvector)
  - search_misconceptions (Neo4j Misconception graph)
"""
from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

from fiosra.mvp.agents.contracts import AssignmentDesignerState
from fiosra.mvp.agents.mcp_client import agent_mcp_client

logger = logging.getLogger(__name__)


class AssignmentDesignerAgent:
    """
    Assignment Designer Agent acting as an MCP client.
    Synthesizes primary-source-grounded assessments with diagnostic distractors
    mapped directly to Neo4j cognitive traps.
    """

    def __init__(self, mcp_client=None) -> None:
        self.mcp = mcp_client or agent_mcp_client

    async def retrieve_grounded_chunks(
        self, state: AssignmentDesignerState
    ) -> list[dict[str, Any]]:
        """
        Retrieves top-k primary source text excerpts from PostgreSQL pgvector via FastMCP.
        """
        course_id = state.get("course_id", "")
        target_kcs = state.get("target_kc_ids", [])
        query = " ".join(target_kcs) or "Core primary sources and curriculum foundations"

        chunks = await self.mcp.call_tool(
            "fetch_grounded_source_chunks",
            {"course_id": course_id, "query": query, "top_k": 3},
        ) or []
        return chunks

    async def pull_diagnostic_distractors(
        self, state: AssignmentDesignerState
    ) -> list[dict[str, Any]]:
        """
        Retrieves paired misconceptions from Neo4j via FastMCP to build diagnostic distractors.
        """
        target_kcs = state.get("target_kc_ids", [])
        distractors = []

        for kc_id in target_kcs[:3]:
            traps = await self.mcp.call_tool(
                "search_misconceptions",
                {"kc_id": kc_id, "student_claim": "*", "limit": 2},
            ) or []
            distractors.extend(traps)

        return distractors

    async def design_assignment(
        self, state: AssignmentDesignerState
    ) -> dict[str, Any]:
        """
        Full assessment design execution:
        1. Retrieves grounded source chunks via pgvector MCP.
        2. Retrieves diagnostic distractors via Neo4j MCP.
        3. Formulates grounded questions, distractors, and Bloom rubric criteria.
        """
        course_id = state.get("course_id", "")
        module_id = state.get("module_id", "")
        target_kcs = state.get("target_kc_ids", ["KC_CORE_01"])
        assignment_title = state.get("assignment_title", "Grounded Historical Analysis Assessment")

        # 1. MCP retrievals
        chunks = await self.retrieve_grounded_chunks(state)
        distractors = await self.pull_diagnostic_distractors(state)

        # 2. Formulate grounded questions
        primary_excerpt = chunks[0].get("content", "Primary historical document excerpt.") if chunks else "Archival excerpt."
        excerpt_heading = chunks[0].get("heading", "Document 1") if chunks else "Source Document"

        # Diagnostic options
        correct_option = {
            "option_id": "opt_A",
            "text": "Institutional and fiscal imbalances produced structural breakdowns over multiple decades.",
            "is_correct": True,
            "diagnostic_misconception_id": None,
        }

        distractor_options = []
        option_letters = ["opt_B", "opt_C", "opt_D"]
        for idx, trap in enumerate(distractors[:3]):
            opt_id = option_letters[idx] if idx < len(option_letters) else f"opt_{idx+2}"
            distractor_options.append({
                "option_id": opt_id,
                "text": f"The crisis was strictly driven by {trap.get('name', 'a single immediate factor')}.",
                "is_correct": False,
                "diagnostic_misconception_id": trap.get("misconception_id", f"misc_{idx+1}"),
                "flawed_rule": trap.get("flawed_rule", "Monolithic causation error"),
            })

        # Fallback distractor if none retrieved from graph
        if not distractor_options:
            distractor_options = [
                {
                    "option_id": "opt_B",
                    "text": "The crisis was strictly caused by short-term bread speculation alone.",
                    "is_correct": False,
                    "diagnostic_misconception_id": "MISC_FALLBACK_01",
                    "flawed_rule": "Monocausal Attribution Trap",
                },
                {
                    "option_id": "opt_C",
                    "text": "The monarch possessed absolute authority with no institutional constraints.",
                    "is_correct": False,
                    "diagnostic_misconception_id": "MISC_FALLBACK_02",
                    "flawed_rule": "Absolutist Omnipotence Fallacy",
                },
            ]

        all_options = [correct_option] + distractor_options

        question_item = {
            "question_id": str(uuid4()),
            "target_kc_id": target_kcs[0] if target_kcs else "KC_CORE_01",
            "prompt": f"Based on {excerpt_heading} ('{primary_excerpt[:140]}...'), how should the underlying causation be evaluated?",
            "source_chunk_reference": chunks[0].get("chunk_id") if chunks else "chunk-ref-01",
            "options": all_options,
        }

        # 3. Formulate Bloom-calibrated rubrics
        rubric_criteria = [
            {
                "criterion_id": "crit_causal_complexity",
                "label": "Multi-Causal Structural Analysis",
                "bloom_level": "analyze",
                "description": "Distinguishes between underlying structural causes and immediate catalysts.",
                "target_kc": target_kcs[0] if target_kcs else "KC_CORE_01",
            },
            {
                "criterion_id": "crit_evidence_grounding",
                "label": "Primary Source Evidentiary Grounding",
                "bloom_level": "evaluate",
                "description": "Directly supports inferences with specific excerpts from the primary document.",
                "target_kc": target_kcs[0] if target_kcs else "KC_CORE_01",
            },
        ]

        return {
            "course_id": course_id,
            "module_id": module_id,
            "target_kc_ids": target_kcs,
            "retrieved_chunks": chunks,
            "distractor_misconceptions": distractors,
            "assignment_title": assignment_title,
            "questions": [question_item],
            "rubric_criteria": rubric_criteria,
            "is_published": True,
        }


# Global default instance
assignment_designer_agent = AssignmentDesignerAgent()
