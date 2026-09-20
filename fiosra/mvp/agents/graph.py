"""
fiosra/mvp/agents/graph.py
LangGraph StateGraph wiring for the Socratic Tutor Multi-Agent System.
Includes:
- Adversarial Input Guard node
- Socratic Generation node (interacting with Fiosra FastMCP Server)
- Answer-Isolation Critic node with cyclic remediation loop
- Safe Fallback node
- Checkpoint persistence (MemorySaver / PostgresSaver)
"""
from __future__ import annotations

import logging
from typing import Any, Callable

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from fiosra.mvp.agents.contracts import TutorSessionState
from fiosra.mvp.agents.critic_agent import AnswerIsolationCriticAgent
from fiosra.mvp.agents.socratic_tutor_agent import SocraticTutorAgent

logger = logging.getLogger(__name__)


def create_socratic_tutor_graph(
    tutor_agent: SocraticTutorAgent | None = None,
    critic_agent: AnswerIsolationCriticAgent | None = None,
    checkpointer: Any = None,
):
    """
    Constructs and compiles the Socratic Tutor LangGraph StateGraph.
    Incorporates the Epistemic Discourse Router with specialized pedagogical nodes:
    - Orientation (collegial welcome, entry point guidance)
    - Structural Scaffold (3 analytical essay pillars)
    - Hint Scaffold (3-rung ladder with strictly decoupled hint_rung)
    - Adversarial Deflection (safe boundaries)
    - Substantive Inquiry (Toulmin, cognitive allocator, socratic gen, answer-isolation critic)
    """
    tutor = tutor_agent or SocraticTutorAgent()
    critic = critic_agent or AnswerIsolationCriticAgent()

    # 1. Define Node Callables
    async def ingest_co_presence_node(state: TutorSessionState) -> dict[str, Any]:
        return tutor.ingest_co_presence(state)

    async def analyze_epistemic_discourse_node(state: TutorSessionState) -> dict[str, Any]:
        return tutor.analyze_epistemic_discourse(state)

    async def orientation_node(state: TutorSessionState) -> dict[str, Any]:
        return await tutor.generate_orientation_turn(state)

    async def structural_scaffold_node(state: TutorSessionState) -> dict[str, Any]:
        return await tutor.generate_structural_scaffold_turn(state)

    async def acknowledgment_node(state: TutorSessionState) -> dict[str, Any]:
        return await tutor.generate_acknowledgment_turn(state)

    async def hint_scaffold_node(state: TutorSessionState) -> dict[str, Any]:
        return await tutor.generate_hint_scaffold_turn(state)

    async def deflection_node(state: TutorSessionState) -> dict[str, Any]:
        return tutor.build_deflection(state)

    async def toulmin_decomposition_node(state: TutorSessionState) -> dict[str, Any]:
        return tutor.decompose_toulmin(state)

    async def cognitive_work_allocator_node(state: TutorSessionState) -> dict[str, Any]:
        return tutor.allocate_cognitive_work(state)

    async def socratic_generation_node(state: TutorSessionState) -> dict[str, Any]:
        return await tutor.generate_socratic_turn(state)

    async def answer_isolation_critic_node(state: TutorSessionState) -> dict[str, Any]:
        return critic.verify_response(state)

    async def epistemic_action_packer_node(state: TutorSessionState) -> dict[str, Any]:
        return await tutor.pack_epistemic_actions(state)

    async def safe_fallback_node(state: TutorSessionState) -> dict[str, Any]:
        logger.warning(
            f"Critic remediation exceeded max attempts for session {state.get('session_id')}. "
            "Engaging safe Socratic fallback."
        )
        return {
            "is_approved": True,
            "final_verified_response": (
                "Let's pause and reflect on the core passage together. "
                "Which specific detail in the text seems most relevant to your claim?"
            ),
            "critic_violation": "max_attempts_exceeded_fallback",
            "remediation_instructions": None,
        }

    # 2. Define Conditional Routing Functions
    def route_discourse(state: TutorSessionState) -> str:
        phase = state.get("discourse_phase", "substantive_inquiry")
        if phase in ("orientation", "structural_scaffold", "hint_scaffold", "adversarial", "acknowledgment"):
            return phase
        return "substantive_inquiry"

    def route_critic_verdict(state: TutorSessionState) -> str:
        if state.get("is_approved", False):
            return "approved"
        attempts = state.get("verification_attempts", 0)
        if attempts < 2:
            return "remediate"
        return "fallback"

    # 3. Assemble StateGraph
    builder = StateGraph(TutorSessionState)

    builder.add_node("ingest_co_presence", ingest_co_presence_node)
    builder.add_node("analyze_epistemic_discourse", analyze_epistemic_discourse_node)
    builder.add_node("orientation_node", orientation_node)
    builder.add_node("structural_scaffold_node", structural_scaffold_node)
    builder.add_node("acknowledgment_node", acknowledgment_node)
    builder.add_node("hint_scaffold_node", hint_scaffold_node)
    builder.add_node("deflection_node", deflection_node)
    builder.add_node("toulmin_decomposition", toulmin_decomposition_node)
    builder.add_node("cognitive_work_allocator", cognitive_work_allocator_node)
    builder.add_node("socratic_generation", socratic_generation_node)
    builder.add_node("answer_isolation_critic", answer_isolation_critic_node)
    builder.add_node("epistemic_action_packer", epistemic_action_packer_node)
    builder.add_node("safe_fallback", safe_fallback_node)

    # 4. Wire Edges and Branching
    builder.add_edge(START, "ingest_co_presence")
    builder.add_edge("ingest_co_presence", "analyze_epistemic_discourse")

    builder.add_conditional_edges(
        "analyze_epistemic_discourse",
        route_discourse,
        {
            "orientation": "orientation_node",
            "structural_scaffold": "structural_scaffold_node",
            "acknowledgment": "acknowledgment_node",
            "hint_scaffold": "hint_scaffold_node",
            "adversarial": "deflection_node",
            "substantive_inquiry": "toulmin_decomposition",
        },
    )

    builder.add_edge("orientation_node", "epistemic_action_packer")
    builder.add_edge("structural_scaffold_node", "epistemic_action_packer")
    builder.add_edge("acknowledgment_node", "epistemic_action_packer")
    builder.add_edge("hint_scaffold_node", "epistemic_action_packer")
    builder.add_edge("deflection_node", "epistemic_action_packer")

    builder.add_edge("toulmin_decomposition", "cognitive_work_allocator")
    builder.add_edge("cognitive_work_allocator", "socratic_generation")
    builder.add_edge("socratic_generation", "answer_isolation_critic")

    builder.add_conditional_edges(
        "answer_isolation_critic",
        route_critic_verdict,
        {
            "approved": "epistemic_action_packer",
            "remediate": "socratic_generation",
            "fallback": "safe_fallback",
        },
    )

    builder.add_edge("safe_fallback", "epistemic_action_packer")
    builder.add_edge("epistemic_action_packer", END)

    # 5. Compile with Checkpointer
    active_checkpointer = checkpointer if checkpointer is not None else MemorySaver()
    return builder.compile(checkpointer=active_checkpointer)


# Global default compiled graph instance
socratic_tutor_graph = create_socratic_tutor_graph()
