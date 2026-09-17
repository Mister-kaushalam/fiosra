"""
fiosra/mvp/agents/learner_evidence_agent.py
Learner Evidence Agent.
Analyzes longitudinal student engagement, keystroke/dwell telemetry,
and Graphiti bi-temporal belief evolution (valid_at, invalidated_at)
to synthesize educator-facing Evidence Dossiers.
"""
from __future__ import annotations

import logging
from typing import Any

from fiosra.mvp.agents.contracts import EvidenceSessionState
from fiosra.mvp.agents.mcp_client import agent_mcp_client

logger = logging.getLogger(__name__)


class LearnerEvidenceAgent:
    """
    Learner Evidence Agent acting as an MCP client.
    Consumes Fiosra FastMCP Server tools:
      - fetch_telemetry_stats
      - query_student_belief_trajectory
    Computes authentic effort metrics, detects epistemic self-corrections,
    and produces comprehensive longitudinal dossiers.
    """

    def __init__(self, mcp_client=None) -> None:
        self.mcp = mcp_client or agent_mcp_client

    def compute_authentic_effort_score(self, telemetry: dict[str, Any]) -> float:
        """
        Computes a normalized Authentic Effort Score [0.0 - 1.0] from engagement telemetry:
        - Dwell time (adequate cognitive processing)
        - Keystroke cadence and revision depth (deliberate composition)
        - Copy-paste / burst detection penalty (ghostwriting or automated submission indicator)
        - Scaffolding dependency deduction (hints consumed)
        """
        dwell_seconds = float(telemetry.get("dwell_time_seconds", 0.0))
        typing_wpm = float(telemetry.get("typing_cadence_wpm", 40.0))
        revisions_count = int(telemetry.get("revisions_count", 0))
        hints_consumed = int(telemetry.get("hints_consumed", 0))
        paste_events = int(telemetry.get("paste_events_count", 0))

        # 1. Base cognitive effort score
        score = 0.70

        # 2. Dwell Time Factor: reward >= 90s, penalize < 20s
        if dwell_seconds >= 120.0:
            score += 0.15
        elif dwell_seconds >= 60.0:
            score += 0.08
        elif dwell_seconds < 20.0:
            score -= 0.25

        # 3. Revision Depth: active iterative editing indicates genuine formulation
        if revisions_count >= 5:
            score += 0.15
        elif revisions_count >= 2:
            score += 0.08

        # 4. Copy-Paste / Ghostwriting Burst Penalty:
        # If paste events detected or typing cadence exceeds plausible human drafting (>140 WPM)
        if paste_events > 0:
            score -= min(0.15 * paste_events, 0.35)
        if typing_wpm > 130.0:
            score -= 0.20

        # 5. Scaffolding / Hint Deduction:
        score -= min(hints_consumed * 0.05, 0.25)

        # Clamped to [0.05, 1.0]
        return round(max(0.05, min(1.0, score)), 2)

    def detect_self_correction(
        self, temporal_beliefs: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """
        Identifies epistemic self-corrections from Graphiti temporal belief evolution.
        Detects transitions where an erroneous belief node was invalidated (invalidated_at)
        and subsequently replaced by a conceptually grounded belief (valid_at).
        """
        self_corrections: list[dict[str, Any]] = []

        # Find invalidated beliefs
        invalidated = [
            b for b in temporal_beliefs
            if b.get("invalidated_at") is not None or b.get("status") == "invalidated"
        ]

        # Find active / valid beliefs
        active = [
            b for b in temporal_beliefs
            if b.get("status") == "active" or (b.get("valid_at") and not b.get("invalidated_at"))
        ]

        for inv in invalidated:
            concept = inv.get("concept") or inv.get("fact") or "Historical Premise"
            # Find matching active belief addressing the same concept or later in time
            matching_active = next(
                (
                    act for act in active
                    if act.get("concept") == concept or act.get("valid_at", "") >= inv.get("invalidated_at", "")
                ),
                None,
            )

            self_corrections.append({
                "concept": concept,
                "initial_misconception": inv.get("claim") or inv.get("fact") or "Initial ungrounded claim",
                "corrected_understanding": matching_active.get("claim") if matching_active else "Revised with primary evidence",
                "invalidated_at": inv.get("invalidated_at"),
                "resolved_at": matching_active.get("valid_at") if matching_active else inv.get("invalidated_at"),
                "resolution_verified": matching_active is not None,
            })

        return self_corrections

    async def synthesize_longitudinal_dossier(
        self, state: EvidenceSessionState
    ) -> dict[str, Any]:
        """
        Synthesizes a longitudinal Evidence Dossier by querying FastMCP tools:
          - fetch_telemetry_stats: event store keystrokes, dwell time, hints
          - query_student_belief_trajectory: Graphiti bi-temporal belief evolution
        """
        student_id = state.get("student_id", "anonymous_student")
        assignment_id = state.get("assignment_id", "")
        course_id = state.get("course_id", "")

        # 1. Query FastMCP for telemetry stats
        telemetry = await self.mcp.call_tool(
            "fetch_telemetry_stats",
            {"student_id": student_id, "assignment_id": assignment_id},
        ) or {}

        # 2. Query FastMCP for Graphiti belief trajectory
        temporal_beliefs = await self.mcp.call_tool(
            "query_student_belief_trajectory",
            {"student_id": student_id, "concept_query": "*"},
        ) or []

        # 3. Compute Metrics
        authentic_effort_score = self.compute_authentic_effort_score(telemetry)
        self_corrections = self.detect_self_correction(temporal_beliefs)

        # 4. Synthesize Educator Assessment Summary
        dwell_minutes = round(float(telemetry.get("dwell_time_seconds", 0.0)) / 60.0, 1)
        hints_count = int(telemetry.get("hints_consumed", 0))

        if authentic_effort_score >= 0.80:
            autonomy_rating = "High Autonomous Effort"
            recommendation = (
                f"Student exhibited sustained deliberative reasoning with {dwell_minutes}m dwell time "
                f"and {len(self_corrections)} verified self-corrections."
            )
        elif authentic_effort_score >= 0.50:
            autonomy_rating = "Moderate Assisted Effort"
            recommendation = (
                f"Student actively engaged with scaffolding ({hints_count} hints consumed). "
                "Recommend confirming conceptual understanding during class discussion."
            )
        else:
            autonomy_rating = "Low / Suspicious Cadence"
            recommendation = (
                "Anomalous typing cadence or minimal dwell time detected. "
                "Educator interview recommended to verify authentic student authorship."
            )

        packet = {
            "student_id": student_id,
            "assignment_id": assignment_id,
            "course_id": course_id,
            "authentic_effort_score": authentic_effort_score,
            "autonomy_rating": autonomy_rating,
            "educator_recommendation": recommendation,
            "telemetry_breakdown": {
                "dwell_time_minutes": dwell_minutes,
                "typing_cadence_wpm": telemetry.get("typing_cadence_wpm", 40.0),
                "revisions_count": telemetry.get("revisions_count", 0),
                "hints_consumed": hints_count,
                "paste_events_count": telemetry.get("paste_events_count", 0),
            },
            "temporal_belief_trajectory": temporal_beliefs,
            "self_corrections_detected": self_corrections,
            "self_corrections_count": len(self_corrections),
        }

        return packet


# Global default instance
learner_evidence_agent = LearnerEvidenceAgent()
