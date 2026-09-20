"""
tests/test_socratic_agent_graph.py
Tests for the Socratic Tutor Multi-Agent System wired via LangGraph.
Validates:
- Adversarial deflection
- Normal Socratic progression
- Answer-Isolation Critic interception and loop
- Checkpoint persistence across turns
"""
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
    # Default tool returns
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


@pytest.mark.asyncio
async def test_socratic_graph_normal_flow(mock_mcp_client):
    """
    Tests standard pedagogical inquiry turn: adversarial check passes,
    Socratic turn generated via MCP, approved by Critic.
    """
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
    assert "Taking your argument regarding" not in final_state["final_verified_response"]
    assert final_state["current_rung"] == 0
    assert final_state["penalty_score"] == 0.0
    assert final_state["diagnosed_misconception"] is not None


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
async def test_socratic_graph_critic_rejection_and_remediation():
    """
    Tests that when a draft contains a direct solution leak, the Answer-Isolation Critic
    rejects it, causing a remediation cycle.
    """
    mcp = MagicMock()
    call_count = 0

    async def mock_call(tool_name, arguments):
        nonlocal call_count
        call_count += 1
        return []

    mcp.call_tool = AsyncMock(side_effect=mock_call)

    tutor = SocraticTutorAgent(mcp_client=mcp)
    critic = AnswerIsolationCriticAgent()
    checkpointer = MemorySaver()
    graph = create_socratic_tutor_graph(tutor_agent=tutor, critic_agent=critic, checkpointer=checkpointer)

    # We mock tutor.generate_socratic_turn to leak on attempt 0 and fix on attempt 1
    turn_attempt = 0
    original_generate = tutor.generate_socratic_turn

    async def simulated_generate(state):
        nonlocal turn_attempt
        turn_attempt += 1
        if turn_attempt == 1:
            return {
                "draft_response": "The correct answer is Option B because of the 1215 charter.",
                "current_rung": 1,
            }
        else:
            return {
                "draft_response": "Which specific provision of the 1215 charter addresses this?",
                "current_rung": 1,
            }

    tutor.generate_socratic_turn = simulated_generate

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
async def test_socratic_graph_state_persistence_across_turns(mock_mcp_client):
    """
    Tests that multi-turn dialogue maintains state in the checkpointer using thread_id.
    """
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
    Tests the 8-node LangGraph pipeline consuming the Pentagonal Context:
    co-presence ingestion, Toulmin decomposition, cognitive work allocation,
    and action packing into Action Capsules and Seminar Starters.
    """
    from fiosra.mvp.llm.orchestrator import GuardedGeneration, GenerationMetadata, llm_orchestrator
    import json as _json

    async def mock_enhance(*args, **kwargs):
        purpose = kwargs.get("purpose", "")
        if purpose in ("chip_entry_intentions", "chip_continuation_intentions"):
            chips = [
                {"title": "I found key evidence", "prompt": "I found something in the sources that may support my claim."},
                {"title": "I want to test alternatives", "prompt": "I want to explore a counter-explanation to my claim."},
            ]
            return GuardedGeneration(
                content=_json.dumps(chips),
                metadata=GenerationMetadata(provider="openai", model="gpt-4o-mini", used_live_provider=True),
            )
        return GuardedGeneration(
            content="This raises a key question about the causal warrant: what specific mechanism in Necker's data directly demonstrates sovereign insolvency?",
            metadata=GenerationMetadata(provider="openai", model="gpt-4o-mini", used_live_provider=True),
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
        "student_input": "Why did the crown go bankrupt in 1788?",
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

    # 2. Verify Toulmin Decomposition
    toulmin = final_state.get("toulmin_structure", {})
    assert toulmin.get("has_warrant") is True
    assert toulmin.get("has_evidence") is True
    assert toulmin.get("stance") == "Grounded"

    # 3. Verify Cognitive Work Allocation
    assert "intellectual_operation" in final_state

    # 4. Verify Epistemic Action Packing
    capsules = final_state.get("action_capsules", [])
    assert len(capsules) > 0
    assert capsules[0]["target_block_id"] == "block-para-1"
    assert capsules[0]["provenance"] == "action_capsule"

    launchers = final_state.get("prompt_launchers", [])
    assert len(launchers) >= 2

    radar = final_state.get("learner_radar", {})
    assert "stance" in radar
    assert "Causal Grounding" in radar.get("dimension", "")


@pytest.mark.asyncio
async def test_socratic_graph_structural_scaffold_turn(mock_mcp_client, monkeypatch):
    """
    Tests that requests for structuring, outlining, or organizing the assignment
    are routed to the structural scaffold node and return a live LLM-generated response.
    The scaffold node no longer uses hardcoded pillar templates — it calls the LLM.
    """
    from fiosra.mvp.llm.orchestrator import GuardedGeneration, GenerationMetadata, llm_orchestrator

    mock_scaffold_response = (
        "To build a rigorous argument, consider three analytical challenges: "
        "First, what causal mechanism links administrative reform to fiscal outcomes? "
        "Second, which specific exhibit best grounds your central claim? "
        "Third, where does the evidence reveal limits or counter-pressures to your argument? "
        "Which of these would you like to anchor your first section around?"
    )

    async def mock_enhance(*args, **kwargs):
        return GuardedGeneration(
            content=mock_scaffold_response,
            metadata=GenerationMetadata(provider="openai", model="gpt-4o-mini", used_live_provider=True),
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
        "student_input": "can you help me with structuring the assignment ?",
        "current_rung": 0,
        "hint_requested": False,
        "verification_attempts": 0,
    }

    config = {"configurable": {"thread_id": "sess-struct-1"}}
    final_state = await graph.ainvoke(initial_state, config=config)

    assert final_state["discourse_phase"] == "structural_scaffold"
    assert final_state["is_approved"] is True
    # Should be LLM-generated — no hardcoded pillar template text
    assert "Taking your argument regarding" not in final_state["final_verified_response"]
    assert "three structural pillars" not in final_state["final_verified_response"]
    assert len(final_state["final_verified_response"]) > 50
    assert "?" in final_state["final_verified_response"]


@pytest.mark.asyncio
async def test_socratic_graph_acknowledgment_turn(mock_mcp_client, monkeypatch):
    """
    Tests that conversational affirmations ('sure', 'ok', 'sounds good') are
    routed to the acknowledgment node and generate a live LLM response that
    naturally continues the dialogue rather than treating them as historical assertions.
    """
    from fiosra.mvp.llm.orchestrator import GuardedGeneration, GenerationMetadata, llm_orchestrator

    async def mock_enhance(*args, **kwargs):
        return GuardedGeneration(
            content="Great — which of those pillars would you like to anchor your first section around?",
            metadata=GenerationMetadata(provider="openai", model="gpt-4o-mini", used_live_provider=True),
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

    assert final_state["discourse_phase"] == "acknowledgment"
    assert final_state["is_approved"] is True
    # Verify it does NOT treat "sure" as a claim about being "sure"
    assert "Taking your argument regarding" not in final_state["final_verified_response"]
    assert "stated that you're \"sure\"" not in final_state["final_verified_response"]
    # LLM-generated acknowledgment — non-empty, contains a Socratic question
    assert len(final_state["final_verified_response"]) > 20
    assert "?" in final_state["final_verified_response"]


@pytest.mark.asyncio
async def test_socratic_graph_llm_unavailable_transparent_failure(mock_mcp_client, monkeypatch):
    """
    Tests that when live LLM provider is unavailable or disconnected,
    the graph fails transparently with LLMServiceUnavailableError rather than
    producing canned pseudo-AI fallback text.
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
    """Verify that exploratory student intents or boilerplate text produce 0 action capsules."""
    tutor = SocraticTutorAgent()

    # Case 1: Exploratory intent on blank canvas
    state_exploratory: TutorSessionState = {
        "student_id": "stu-1",
        "student_input": "I want to analyze primary sources from the Delhi Sultanate to understand its social changes.",
        "focused_block_id": None,
        "focused_block_text": "",
        "canvas_blocks": [],
        "dialogue_history": [],
    }
    decomp = tutor.decompose_toulmin(state_exploratory)
    state_exploratory["toulmin_structure"] = decomp["toulmin_structure"]
    actions = await tutor.pack_epistemic_actions(state_exploratory)
    assert actions["action_capsules"] == [], "Must produce zero action capsules on exploratory intent"

    # Case 2: Template instruction in focused_block_text must NOT become an action capsule
    state_boilerplate: TutorSessionState = {
        "student_id": "stu-2",
        "student_input": "I want to analyze primary sources from the Delhi Sultanate.",
        "focused_block_id": "current-block",
        "focused_block_text": "Working claim: State a provisional, bounded answer to the assignment question. Guidance: Write one claim.",
        "canvas_blocks": [],
        "dialogue_history": [],
    }
    decomp_bp = tutor.decompose_toulmin(state_boilerplate)
    state_boilerplate["toulmin_structure"] = decomp_bp["toulmin_structure"]
    actions_bp = await tutor.pack_epistemic_actions(state_boilerplate)
    assert actions_bp["action_capsules"] == [], "Must never surface rubric template text as an action capsule"

    # Case 3: Genuine student claim with active canvas block earns an action capsule
    state_claim: TutorSessionState = {
        "student_id": "stu-3",
        "student_input": "Price controls under Alauddin Khalji were maintained through coercion because Barani notes superintendents whipped merchants.",
        "focused_block_id": "paragraph-1",
        "focused_block_text": "",
        "canvas_blocks": [{"id": "paragraph-1", "text": ""}],
        "dialogue_history": [],
    }
    decomp_claim = tutor.decompose_toulmin(state_claim)
    state_claim["toulmin_structure"] = decomp_claim["toulmin_structure"]
    actions_claim = await tutor.pack_epistemic_actions(state_claim)
    assert len(actions_claim["action_capsules"]) == 1, "Substantive claim must earn exactly one action capsule"
    capsule = actions_claim["action_capsules"][0]
    assert "Alauddin Khalji" in capsule["suggested_student_text"]
    assert capsule["target_block_id"] == "paragraph-1"


