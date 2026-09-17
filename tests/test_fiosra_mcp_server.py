import pytest
from fiosra.mvp.mcp.server import mcp_server, get_fiosra_mcp_server

@pytest.mark.asyncio
async def test_fiosra_mcp_server_lists_all_tools():
    tools = await mcp_server.list_tools()
    tool_names = [t.name for t in tools]
    expected_tools = [
        "search_misconceptions",
        "query_prerequisite_chain",
        "record_student_mastery",
        "fetch_grounded_source_chunks",
        "record_learning_episode",
        "query_student_belief_trajectory",
        "fetch_telemetry_stats",
    ]
    for expected in expected_tools:
        assert expected in tool_names, f"Expected tool '{expected}' not found in MCP server."


@pytest.mark.asyncio
async def test_search_misconceptions_tool_execution():
    result = await mcp_server.call_tool(
        "search_misconceptions",
        {"student_claim": "The landlords acted alone in the crisis", "kc_id": "*"},
    )
    assert not result.is_error
    assert result.structured_content is not None
    assert isinstance(result.structured_content.get("result"), list)


@pytest.mark.asyncio
async def test_record_learning_episode_fallback():
    result = await mcp_server.call_tool(
        "record_learning_episode",
        {
            "student_id": "test_student_123",
            "turn_type": "socratic_turn",
            "text_content": "Student asserts tariff changes exacerbated the 1770 conditions.",
        },
    )
    assert not result.is_error
    content = result.structured_content if "status" in result.structured_content else result.structured_content.get("result", {})
    assert content.get("status") in {"success", "recorded_mock", "fallback"}
