"""
tests/test_curriculum_and_designer_agents.py
Tests for Curriculum Architect Agent and Assignment Designer Agent.
Validates:
- 4-Stage Curriculum extraction pipeline with Human-in-the-Loop review gate
- Primary-source grounded assignment design
- Diagnostic distractor synthesis mapped to Neo4j cognitive traps
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fiosra.mvp.agents.contracts import CurriculumExtractionState, AssignmentDesignerState
from fiosra.mvp.agents.curriculum_architect_agent import CurriculumArchitectAgent
from fiosra.mvp.agents.assignment_designer_agent import AssignmentDesignerAgent


@pytest.mark.asyncio
async def test_curriculum_architect_pipeline_review_gate():
    """
    Tests that the CurriculumArchitectAgent stops at the review gate (Stage 3)
    when review_approved is False, allowing teacher inspection.
    """
    agent = CurriculumArchitectAgent()

    initial_state: CurriculumExtractionState = {
        "course_id": "00000000-0000-0000-0000-000000000001",
        "module_id": "00000000-0000-0000-0000-000000000002",
        "module_title": "Medieval Social Structures",
        "domain": "history",
        "source_chunks": [
            {"heading": "Feudal Tenure", "content": "Medieval serfdom was tied directly to manorial land..."},
            {"heading": "Manorial Courts", "content": "Customary law regulated obligations and dues..."},
        ],
        "review_approved": False,
    }

    # Run pipeline without auto-approve
    res = await agent.run_pipeline(initial_state, auto_approve=False)

    assert res["is_paused_for_review"] is True
    assert len(res["knowledge_components"]) == 2
    assert len(res["prerequisite_edges"]) == 1
    # Misconceptions should NOT have been generated yet
    assert "misconceptions" not in res


@pytest.mark.asyncio
async def test_curriculum_architect_pipeline_full_completion():
    """
    Tests that when review_approved is True (or auto_approve=True), the agent
    proceeds through Stages 3, 4, and 5 to commit the graph.
    """
    agent = CurriculumArchitectAgent()

    initial_state: CurriculumExtractionState = {
        "course_id": "00000000-0000-0000-0000-000000000001",
        "module_id": "00000000-0000-0000-0000-000000000002",
        "module_title": "Medieval Social Structures",
        "domain": "history",
        "source_chunks": [
            {"heading": "Feudal Tenure", "content": "Medieval serfdom was tied directly to manorial land..."},
        ],
        "review_approved": True,
    }

    with patch("fiosra.mvp.courses.pedagogical_extractor.pedagogical_extractor.seed_pedagogical_graph", new=AsyncMock(return_value={"knowledge_components": 1, "misconceptions": 2, "socratic_probes": 6})):
        res = await agent.run_pipeline(initial_state, auto_approve=True)

        assert res["is_paused_for_review"] is False
        assert len(res["knowledge_components"]) == 1
        assert len(res["misconceptions"]) == 2  # Exactly 2 per KC
        assert len(res["socratic_probes"]) == 6  # 3 rungs per trap = 6 probes
        assert res["nodes_written"] == 9


@pytest.mark.asyncio
async def test_assignment_designer_grounded_generation():
    """
    Tests that AssignmentDesignerAgent retrieves pgvector source chunks and Neo4j
    misconceptions via FastMCP tools and synthesizes grounded questions with diagnostic distractors.
    """
    mock_mcp = MagicMock()
    mock_mcp.call_tool = AsyncMock()

    async def mock_call(tool_name, args):
        if tool_name == "fetch_grounded_source_chunks":
            return [{
                "chunk_id": "chk_source_99",
                "heading": "Estates-General Financial Records 1789",
                "content": "The royal treasury faced sovereign default following naval expenditures in the American War.",
                "similarity": 0.89,
            }]
        elif tool_name == "search_misconceptions":
            return [{
                "misconception_id": "misc_hist_sole_cause",
                "name": "Single Actor Fallacy",
                "flawed_rule": "Attributes default solely to royal extravagance",
            }]
        return []

    mock_mcp.call_tool.side_effect = mock_call

    agent = AssignmentDesignerAgent(mcp_client=mock_mcp)

    state: AssignmentDesignerState = {
        "course_id": "course-123",
        "module_id": "module-456",
        "target_kc_ids": ["KC_HIST_FINANCE"],
        "assignment_title": "French Fiscal Crisis Inquiry",
    }

    result = await agent.design_assignment(state)

    assert result["is_published"] is True
    assert len(result["questions"]) == 1
    q = result["questions"][0]

    # Verify prompt grounding in retrieved chunk
    assert "Estates-General Financial Records" in q["prompt"]
    assert q["source_chunk_reference"] == "chk_source_99"

    # Verify diagnostic distractors are linked to misconception IDs
    options = q["options"]
    assert len(options) >= 2
    correct = [o for o in options if o["is_correct"]]
    assert len(correct) == 1
    assert correct[0]["diagnostic_misconception_id"] is None

    distractors = [o for o in options if not o["is_correct"]]
    assert len(distractors) >= 1
    # Check that distractor option captures the misconception flawed rule
    assert any("Single Actor Fallacy" in d["text"] or d["diagnostic_misconception_id"] == "misc_hist_sole_cause" for d in distractors)

    # Verify Bloom rubrics
    assert len(result["rubric_criteria"]) == 2
    assert result["rubric_criteria"][0]["bloom_level"] in {"analyze", "evaluate"}
