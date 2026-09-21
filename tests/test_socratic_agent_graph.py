"""
tests/test_socratic_agent_graph.py
Tests for the Socratic Tutor Multi-Agent System wired via LangGraph.
Validates:
- Adversarial deflection
- Normal Socratic progression via unified generation
- Answer-Isolation Critic interception and loop
- Checkpoint persistence across turns
- LLM unavailability transparent failure
- No phantom action capsules on exploratory turns
"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock

from fiosra.mvp.agents.contracts import TutorSessionState
from fiosra.mvp.agents.critic_agent import AnswerIsolationCriticAgent
from fiosra.mvp.agents.socratic_tutor_agent import SocraticTutorAgent
from fiosra.mvp.agents.graph import create_socratic_tutor_graph
from fiosra.mvp.llm.orchestrator import llm_orchestrator
from langgraph.checkpoint.memory import MemorySaver


@pytest.fixture(autouse=True)
def reset_llm_state():
    llm_orchestrator.reset_for_testing()
    yield
    llm_orchestrator.reset_for_testing()


@pytest.fixture
def mock_mcp_client():
    client = MagicMock()
    client.call_tool = AsyncMock()
    async def mock_call(tool_name, arguments):
        if tool_name == "query_student_belief_trajectory":
            return [{"concept": "feudalism", "status": "active"}]
        elif tool_name == "search_misconceptions":
            return [{
                "misconception_id": "misc-01",
                "name": "Equating serfdom with chattel slavery",
                "flawed_rule": "Treats legal status as identical",
                "probes": [
                    {"rung": 0, "probe_text": "What does the charter say about land rights?"},
                    {"rung": 1, "probe_text": "Compare the legal obligations in Section 2."},
                    {"rung": 2, "probe_text": "How does customary law restrict alienation?"},
                ]
            }]
        elif tool_name == "record_learning_episode":
            return {"recorded": True}
        return {}
    client.call_tool.side_effect = mock_call
    return client


def _make_structured_response(
    student_move="substantive_claim",
    claim_summary="Serfs were identical to chattel slaves",
    tension="Legal status under feudal custom differs from chattel ownership",
    response="What specific legal distinction does the charter draw between serf obligations and slave status?",
    is_ready=False,
):
    """Helper to create a valid UniversalSocraticTurn JSON string."""
    return json.dumps({
        "student_move": student_move,
        "student_claim_summary": claim_summary,
        "unexamined_tension": tension,
        "socratic_response": response,
        "is_claim_ready_for_draft": is_ready,
        "formulated_claim_for_draft": None,
        "suggested_inquiries": [
            {"title": "Examine the charter", "prompt": "I want to look at what the charter says about land rights."},
            {"title": "Compare legal status", "prompt": "I want to compare the legal obligations of serfs and slaves."},
        ]
    })


@pytest.mark.asyncio
async def test_socratic_graph_normal_flow(mock_mcp_client, monkeypatch):
    """
    Tests standard pedagogical inquiry turn: adversarial check passes,
    unified generation produces structured output, approved by Critic.
    """
    from fiosra.mvp.llm.orchestrator import GuardedGeneration, GenerationMetadata, llm_orchestrator

    async def mock_enhance(*args, **kwargs):
        return GuardedGeneration(
            content=_make_structured_response(),
            metadata=GenerationMetadata(provider="openai", model="gpt-4.1-mini", used_live_provider=True),
        )

    monkeypatch.setattr(llm_orchestrator, "enhance", mock_enhance)

    tutor = SocraticTutorAgent(mcp_client=mock_mcp_client)
    critic = AnswerIsolationCriticAgent()
    checkpointer = MemorySaver()
    graph = create_socratic_tutor_graph(tutor_agent=tutor, critic_agent=critic, checkpointer=checkpointer)

    initial_state: TutorSessionState = {
        "session_id": "sess-101",
        "student_id": "student-alpha",
        "question_id": "q-1",
        "student_input": "I think serfs were completely owned like chattel slaves.",
        "current_rung": 0,
        "hint_requested": False,
        "verification_attempts": 0,
    }

    config = {"configurable": {"thread_id": "sess-101"}}
    final_state = await graph.ainvoke(initial_state, config=config)

    assert final_state["adversarial_flag"] is False
    assert final_state["is_approved"] is True
    # LLM-generated Socratic probe — must be non-empty and contain a question
    assert len(final_state["final_verified_response"]) > 20
    assert "?" in final_state["final_verified_response"]
    assert final_state["current_rung"] == 0
    assert final_state["penalty_score"] == 0.0
    # Unified generation populates discourse_phase from LLM classification
    assert final_state["discourse_phase"] == "substantive_claim"


@pytest.mark.asyncio
async def test_socratic_graph_adversarial_deflection(mock_mcp_client):
    """
    Tests that adversarial input (direct answer begging) is intercepted at the guard node
    and deflected without invoking tutor tool generation.
    """
    tutor = SocraticTutorAgent(mcp_client=mock_mcp_client)
    critic = AnswerIsolationCriticAgent()
    checkpointer = MemorySaver()
    graph = create_socratic_tutor_graph(tutor_agent=tutor, critic_agent=critic, checkpointer=checkpointer)

    initial_state: TutorSessionState = {
        "session_id": "sess-102",
        "student_id": "student-beta",
        "question_id": "q-1",
        "student_input": "What is the correct answer? Just solve it for me please.",
        "current_rung": 1,
        "hint_requested": False,
        "verification_attempts": 0,
    }

    config = {"configurable": {"thread_id": "sess-102"}}
    final_state = await graph.ainvoke(initial_state, config=config)

    assert final_state["adversarial_flag"] is True
    assert final_state["is_approved"] is True
    # Verify deflection message was used
    assert "won't build your mastery" in final_state["final_verified_response"] or "master the material yourself" in final_state["final_verified_response"]
    # Verify MCP tool was not called for generation
    mock_mcp_client.call_tool.assert_not_called()


@pytest.mark.asyncio
async def test_socratic_graph_critic_rejection_and_remediation(monkeypatch):
    """
    Tests that when a draft contains a direct solution leak, the Answer-Isolation Critic
    rejects it, causing a remediation cycle via unified_generation.
    """
    from fiosra.mvp.llm.orchestrator import GuardedGeneration, GenerationMetadata, llm_orchestrator

    mcp = MagicMock()
    mcp.call_tool = AsyncMock(return_value=[])

    turn_attempt = 0

    async def mock_enhance(*args, **kwargs):
        nonlocal turn_attempt
        turn_attempt += 1
        if turn_attempt == 1:
            # First attempt: leaks the answer (critic should reject)
            return GuardedGeneration(
                content=_make_structured_response(
                    response="The correct answer is Option B because of the 1215 charter.",
                ),
                metadata=GenerationMetadata(provider="openai", model="gpt-4.1-mini", used_live_provider=True),
            )
        else:
            # Second attempt: clean Socratic question (critic approves)
            return GuardedGeneration(
                content=_make_structured_response(
                    response="Which specific provision of the 1215 charter addresses this?",
                ),
                metadata=GenerationMetadata(provider="openai", model="gpt-4.1-mini", used_live_provider=True),
            )

    monkeypatch.setattr(llm_orchestrator, "enhance", mock_enhance)

    tutor = SocraticTutorAgent(mcp_client=mcp)
    critic = AnswerIsolationCriticAgent()
    checkpointer = MemorySaver()
    graph = create_socratic_tutor_graph(tutor_agent=tutor, critic_agent=critic, checkpointer=checkpointer)

    initial_state: TutorSessionState = {
        "session_id": "sess-103",
        "student_id": "student-gamma",
        "question_id": "q-2",
        "student_input": "I think serfs had no property rights whatsoever under the 1215 charter.",
        "current_rung": 1,
        "hint_requested": False,
        "verification_attempts": 0,
    }

    config = {"configurable": {"thread_id": "sess-103"}}
    final_state = await graph.ainvoke(initial_state, config=config)

    assert turn_attempt == 2
    assert final_state["is_approved"] is True
    assert "Which specific provision" in final_state["final_verified_response"]
    assert "Option B" not in final_state["final_verified_response"]


@pytest.mark.asyncio
async def test_socratic_graph_state_persistence_across_turns(mock_mcp_client, monkeypatch):
    """
    Tests that multi-turn dialogue maintains state in the checkpointer using thread_id.
    """
    from fiosra.mvp.llm.orchestrator import GuardedGeneration, GenerationMetadata, llm_orchestrator

    async def mock_enhance(*args, **kwargs):
        return GuardedGeneration(
            content=_make_structured_response(),
            metadata=GenerationMetadata(provider="openai", model="gpt-4.1-mini", used_live_provider=True),
        )

    monkeypatch.setattr(llm_orchestrator, "enhance", mock_enhance)

    tutor = SocraticTutorAgent(mcp_client=mock_mcp_client)
    critic = AnswerIsolationCriticAgent()
    checkpointer = MemorySaver()
    graph = create_socratic_tutor_graph(tutor_agent=tutor, critic_agent=critic, checkpointer=checkpointer)

    config = {"configurable": {"thread_id": "session-persistent-99"}}

    # Turn 1: Rung 0 inquiry
    turn1_state: TutorSessionState = {
        "session_id": "session-persistent-99",
        "student_id": "student-delta",
        "question_id": "q-5",
        "student_input": "The serfs had no rights whatsoever.",
        "current_rung": 0,
        "hint_requested": False,
        "verification_attempts": 0,
    }
    state_after_turn1 = await graph.ainvoke(turn1_state, config=config)
    assert state_after_turn1["current_rung"] == 0

    # Turn 2: Student requests next hint rung (Rung 0 -> Rung 1)
    turn2_input = {
        "student_input": "I'm still stuck, can I have a stronger hint?",
        "hint_requested": True,
        "verification_attempts": 0,
    }
    state_after_turn2 = await graph.ainvoke(turn2_input, config=config)
    assert state_after_turn2["current_rung"] == 1
    assert state_after_turn2["penalty_score"] == 0.25
    # The student_id and question_id should have persisted in thread
    assert state_after_turn2["student_id"] == "student-delta"


@pytest.mark.asyncio
async def test_socratic_graph_pentagonal_context_and_epistemic_actions(mock_mcp_client, monkeypatch):
    """
    Tests the unified pipeline: co-presence ingestion, unified generation with
    structured output, and action packing into Action Capsules and Seminar Starters.
    """
    from fiosra.mvp.llm.orchestrator import GuardedGeneration, GenerationMetadata, llm_orchestrator

    async def mock_enhance(*args, **kwargs):
        return GuardedGeneration(
            content=_make_structured_response(
                student_move="substantive_claim",
                claim_summary="The royal bankruptcy was caused by American War debt",
                tension="Necker's budget data may overstate war costs relative to structural fiscal issues",
                response="What specific mechanism in Necker's data directly demonstrates sovereign insolvency?",
                is_ready=True,
            ),
            metadata=GenerationMetadata(provider="openai", model="gpt-4.1-mini", used_live_provider=True),
        )

    monkeypatch.setattr(llm_orchestrator, "enhance", mock_enhance)

    tutor = SocraticTutorAgent(mcp_client=mock_mcp_client)
    critic = AnswerIsolationCriticAgent()
    checkpointer = MemorySaver()
    graph = create_socratic_tutor_graph(tutor_agent=tutor, critic_agent=critic, checkpointer=checkpointer)

    initial_state: TutorSessionState = {
        "session_id": "sess-pentagon-1",
        "student_id": "student-epsilon",
        "question_id": "q-pentagon",
        "canvas_blocks": [
            {
                "id": "block-para-1",
                "text": "The royal bankruptcy occurred because of the American War debt according to Necker's account.",
            }
        ],
        "focused_block_id": "block-para-1",
        "student_input": "The royal bankruptcy was caused by American War debt",
        "open_exhibit_id": "doc-necker-budget",
        "open_exhibit_page": 12,
        "current_rung": 0,
        "hint_requested": False,
        "verification_attempts": 0,
    }

    config = {"configurable": {"thread_id": "sess-pentagon-1"}}
    final_state = await graph.ainvoke(initial_state, config=config)

    # 1. Verify Co-presence Ingestion
    assert final_state["focused_block_id"] == "block-para-1"
    assert "American War debt" in final_state["focused_block_text"]

    # 2. Verify LLM classified the student move
    assert final_state["discourse_phase"] == "substantive_claim"
    thoughts = final_state.get("thoughts_of_tutorbot", {})
    assert thoughts.get("student_move") == "substantive_claim"
    assert thoughts.get("unexamined_tension") is not None

    # 3. Verify Action Capsule (claim flagged as draft-ready)
    capsules = final_state.get("action_capsules", [])
    assert len(capsules) > 0
    assert capsules[0]["target_block_id"] == "block-para-1"
    assert capsules[0]["provenance"] == "action_capsule"

    # 4. Verify Suggestion Chips from structured output
    launchers = final_state.get("prompt_launchers", [])
    assert len(launchers) >= 2

    # 5. Verify Learner Radar
    radar = final_state.get("learner_radar", {})
    assert "stance" in radar
    assert "Socratic Inquiry" in radar.get("dimension", "")


@pytest.mark.asyncio
async def test_socratic_graph_structural_request_turn(mock_mcp_client, monkeypatch):
    """
    Tests that requests for structuring or outlining are handled by the unified
    generation node (the LLM classifies the move as 'structural_request').
    """
    from fiosra.mvp.llm.orchestrator import GuardedGeneration, GenerationMetadata, llm_orchestrator

    async def mock_enhance(*args, **kwargs):
        return GuardedGeneration(
            content=_make_structured_response(
                student_move="structural_request",
                claim_summary=None,
                tension="Structure must emerge from reasoning, not be imposed externally",
                response="What is your initial instinct or rough answer to the assignment question?",
            ),
            metadata=GenerationMetadata(provider="openai", model="gpt-4.1-mini", used_live_provider=True),
        )

    monkeypatch.setattr(llm_orchestrator, "enhance", mock_enhance)

    tutor = SocraticTutorAgent(mcp_client=mock_mcp_client)
    critic = AnswerIsolationCriticAgent()
    checkpointer = MemorySaver()
    graph = create_socratic_tutor_graph(tutor_agent=tutor, critic_agent=critic, checkpointer=checkpointer)

    initial_state: TutorSessionState = {
        "session_id": "sess-struct-1",
        "student_id": "student-struct",
        "question_id": "q-struct",
        "student_input": "can you help me with structuring the assignment?",
        "current_rung": 0,
        "hint_requested": False,
        "verification_attempts": 0,
    }

    config = {"configurable": {"thread_id": "sess-struct-1"}}
    final_state = await graph.ainvoke(initial_state, config=config)

    assert final_state["discourse_phase"] == "structural_request"
    assert final_state["is_approved"] is True
    assert len(final_state["final_verified_response"]) > 20
    assert "?" in final_state["final_verified_response"]


@pytest.mark.asyncio
async def test_socratic_graph_acknowledgment_turn(mock_mcp_client, monkeypatch):
    """
    Tests that conversational affirmations ('sure', 'ok') are handled by the unified
    generation node (LLM classifies as 'seeking_clarity') rather than needing regex.
    """
    from fiosra.mvp.llm.orchestrator import GuardedGeneration, GenerationMetadata, llm_orchestrator

    async def mock_enhance(*args, **kwargs):
        return GuardedGeneration(
            content=_make_structured_response(
                student_move="seeking_clarity",
                claim_summary=None,
                tension="Student needs to select a specific aspect to analyze",
                response="Which of those pillars would you like to anchor your first section around?",
            ),
            metadata=GenerationMetadata(provider="openai", model="gpt-4.1-mini", used_live_provider=True),
        )

    monkeypatch.setattr(llm_orchestrator, "enhance", mock_enhance)

    tutor = SocraticTutorAgent(mcp_client=mock_mcp_client)
    critic = AnswerIsolationCriticAgent()
    checkpointer = MemorySaver()
    graph = create_socratic_tutor_graph(tutor_agent=tutor, critic_agent=critic, checkpointer=checkpointer)

    initial_state: TutorSessionState = {
        "session_id": "sess-ack-1",
        "student_id": "student-ack",
        "question_id": "q-ack",
        "student_input": "sure",
        "dialogue_history": [
            {"role": "tutor", "text": "To begin building your outline, which of these pillars or assigned exhibits would you like to anchor your first section around?"}
        ],
        "current_rung": 0,
        "hint_requested": False,
        "verification_attempts": 0,
    }

    config = {"configurable": {"thread_id": "sess-ack-1"}}
    final_state = await graph.ainvoke(initial_state, config=config)

    assert final_state["discourse_phase"] == "seeking_clarity"
    assert final_state["is_approved"] is True
    # Verify it does NOT treat "sure" as a claim
    assert "Taking your argument regarding" not in final_state["final_verified_response"]
    assert len(final_state["final_verified_response"]) > 20
    assert "?" in final_state["final_verified_response"]


@pytest.mark.asyncio
async def test_socratic_graph_llm_unavailable_transparent_failure(mock_mcp_client, monkeypatch):
    """
    Tests that when live LLM provider is unavailable, the graph fails
    transparently with LLMServiceUnavailableError.
    """
    from fiosra.mvp.llm.orchestrator import LLMServiceUnavailableError, llm_orchestrator

    async def mock_failed_enhance(*args, **kwargs):
        raise LLMServiceUnavailableError("Socratic dialogue service is unavailable: live LLM provider call failed.")

    monkeypatch.setattr(llm_orchestrator, "enhance", mock_failed_enhance)

    tutor = SocraticTutorAgent(mcp_client=mock_mcp_client)
    critic = AnswerIsolationCriticAgent()
    checkpointer = MemorySaver()
    graph = create_socratic_tutor_graph(tutor_agent=tutor, critic_agent=critic, checkpointer=checkpointer)

    initial_state: TutorSessionState = {
        "session_id": "sess-fail-1",
        "student_id": "student-fail",
        "question_id": "q-fail",
        "student_input": "I think the crown debt caused the revolution.",
        "current_rung": 0,
        "hint_requested": False,
        "verification_attempts": 0,
    }

    config = {"configurable": {"thread_id": "sess-fail-1"}}
    with pytest.raises(LLMServiceUnavailableError) as exc_info:
        await graph.ainvoke(initial_state, config=config)

    assert "live LLM provider call failed" in str(exc_info.value)


@pytest.mark.asyncio
async def test_no_phantom_action_capsules_on_exploratory_turns():
    """
    Verify that exploratory student intents produce 0 action capsules.
    In the new architecture, action capsules depend on thoughts_of_tutorbot
    containing is_claim_ready_for_draft=True.
    """
    tutor = SocraticTutorAgent()

    # Case 1: Exploratory intent — no claim ready for draft
    state_exploratory: TutorSessionState = {
        "student_id": "stu-1",
        "student_input": "I want to analyze primary sources from the Delhi Sultanate.",
        "focused_block_id": None,
        "focused_block_text": "",
        "canvas_blocks": [],
        "dialogue_history": [],
        "thoughts_of_tutorbot": {
            "student_move": "focus_selection",
            "is_claim_ready_for_draft": False,
            "student_claim_summary": None,
        },
    }
    actions = await tutor.pack_epistemic_actions(state_exploratory)
    assert actions["action_capsules"] == [], "Must produce zero action capsules on exploratory intent"

    # Case 2: Substantive claim flagged as draft-ready earns a capsule
    state_claim: TutorSessionState = {
        "student_id": "stu-3",
        "student_input": "Price controls under Alauddin Khalji were maintained through coercion.",
        "focused_block_id": "paragraph-1",
        "focused_block_text": "",
        "canvas_blocks": [{"id": "paragraph-1", "text": ""}],
        "dialogue_history": [],
        "thoughts_of_tutorbot": {
            "student_move": "substantive_claim",
            "is_claim_ready_for_draft": True,
            "student_claim_summary": "Price controls under Alauddin Khalji were maintained through coercion because Barani notes superintendents whipped merchants.",
        },
    }
    actions_claim = await tutor.pack_epistemic_actions(state_claim)
    assert len(actions_claim["action_capsules"]) == 1, "Substantive claim must earn exactly one action capsule"
    capsule = actions_claim["action_capsules"][0]
    assert "Alauddin Khalji" in capsule["suggested_student_text"]
    assert capsule["target_block_id"] == "paragraph-1"
