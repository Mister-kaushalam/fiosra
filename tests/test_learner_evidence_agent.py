"""
tests/test_learner_evidence_agent.py
Tests for the Learner Evidence Agent.
Validates:
- Authentic Effort Score calculation (dwell time, keystroke cadence, paste penalties)
- Graphiti bi-temporal belief evolution & self-correction detection
- Longitudinal Evidence Dossier synthesis via FastMCP client tools
"""
import pytest
from unittest.mock import AsyncMock, MagicMock

from fiosra.mvp.agents.learner_evidence_agent import LearnerEvidenceAgent
from fiosra.mvp.agents.contracts import EvidenceSessionState


@pytest.fixture
def mock_mcp_client():
    client = MagicMock()
    client.call_tool = AsyncMock()

    async def mock_call(tool_name, arguments):
        if tool_name == "fetch_telemetry_stats":
            return {
                "dwell_time_seconds": 180.0,
                "typing_cadence_wpm": 42.0,
                "revisions_count": 4,
                "hints_consumed": 1,
                "paste_events_count": 0,
            }
        elif tool_name == "query_student_belief_trajectory":
            return [
                {
                    "concept": "Feudal Obligations",
                    "claim": "Serfs were chattel property with zero rights.",
                    "status": "invalidated",
                    "invalidated_at": "2026-09-17T02:10:00Z",
                },
                {
                    "concept": "Feudal Obligations",
                    "claim": "Serfs possessed customary tenure rights governed by manorial court rolls.",
                    "status": "active",
                    "valid_at": "2026-09-17T02:15:30Z",
                    "invalidated_at": None,
                },
            ]
        return {}

    client.call_tool.side_effect = mock_call
    return client


def test_compute_authentic_effort_score_deliberate_reasoning():
    """
    Tests that a student demonstrating sustained dwell time, active revisions,
    and normal typing cadence receives a high authentic effort score.
    """
    agent = LearnerEvidenceAgent()
    telemetry = {
        "dwell_time_seconds": 150.0,
        "typing_cadence_wpm": 45.0,
        "revisions_count": 5,
        "hints_consumed": 0,
        "paste_events_count": 0,
    }
    score = agent.compute_authentic_effort_score(telemetry)
    assert score >= 0.85
    assert score <= 1.0


def test_compute_authentic_effort_score_paste_burst_anomaly():
    """
    Tests that rapid copy-pasting (high WPM, minimal dwell, paste events)
    is heavily penalized for educator review.
    """
    agent = LearnerEvidenceAgent()
    telemetry = {
        "dwell_time_seconds": 8.0,
        "typing_cadence_wpm": 165.0,
        "revisions_count": 0,
        "hints_consumed": 0,
        "paste_events_count": 2,
    }
    score = agent.compute_authentic_effort_score(telemetry)
    assert score <= 0.35


def test_detect_self_correction_from_graphiti_temporal_nodes():
    """
    Tests identification of self-correction when Graphiti records an invalidated
    misconception followed by a valid grounded belief.
    """
    agent = LearnerEvidenceAgent()
    temporal_beliefs = [
        {
            "concept": "Bread Shortage Causation",
            "claim": "The 1789 crisis was solely caused by baker price gouging.",
            "status": "invalidated",
            "invalidated_at": "2026-09-17T01:30:00Z",
        },
        {
            "concept": "Bread Shortage Causation",
            "claim": "Severe hailstorms in 1788 caused structural crop failures compounded by deregulation.",
            "status": "active",
            "valid_at": "2026-09-17T01:38:00Z",
            "invalidated_at": None,
        },
    ]

    corrections = agent.detect_self_correction(temporal_beliefs)
    assert len(corrections) == 1
    c = corrections[0]
    assert c["concept"] == "Bread Shortage Causation"
    assert "baker price gouging" in c["initial_misconception"]
    assert "hailstorms" in c["corrected_understanding"]
    assert c["resolution_verified"] is True
    assert c["invalidated_at"] == "2026-09-17T01:30:00Z"


@pytest.mark.asyncio
async def test_synthesize_longitudinal_dossier(mock_mcp_client):
    """
    Tests full dossier synthesis by querying FastMCP telemetry and Graphiti belief tools.
    """
    agent = LearnerEvidenceAgent(mcp_client=mock_mcp_client)
    state: EvidenceSessionState = {
        "student_id": "student-longitudinal-01",
        "assignment_id": "asn-french-rev",
        "course_id": "course-hist-101",
    }

    dossier = await agent.synthesize_longitudinal_dossier(state)

    assert dossier["student_id"] == "student-longitudinal-01"
    assert dossier["authentic_effort_score"] >= 0.80
    assert "High Autonomous Effort" in dossier["autonomy_rating"]
    assert dossier["self_corrections_count"] == 1
    assert len(dossier["self_corrections_detected"]) == 1
    assert "Serfs possessed customary tenure rights" in dossier["self_corrections_detected"][0]["corrected_understanding"]

    # Verify both MCP tools were called
    mock_mcp_client.call_tool.assert_any_call(
        "fetch_telemetry_stats",
        {"student_id": "student-longitudinal-01", "assignment_id": "asn-french-rev"},
    )
    mock_mcp_client.call_tool.assert_any_call(
        "query_student_belief_trajectory",
        {"student_id": "student-longitudinal-01", "concept_query": "*"},
    )
