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
    """
    tutor = tutor_agent or SocraticTutorAgent()
    critic = critic_agent or AnswerIsolationCriticAgent()

    # 1. Define Node Callables
    async def ingest_co_presence_node(state: TutorSessionState) -> dict[str, Any]:
        return tutor.ingest_co_presence(state)

    async def toulmin_decomposition_node(state: TutorSessionState) -> dict[str, Any]:
        return tutor.decompose_toulmin(state)

    async def adversarial_guard_node(state: TutorSessionState) -> dict[str, Any]:
        return tutor.check_adversarial_input(state)

    async def deflection_node(state: TutorSessionState) -> dict[str, Any]:
        return tutor.build_deflection(state)

    async def cognitive_work_allocator_node(state: TutorSessionState) -> dict[str, Any]:
        return tutor.allocate_cognitive_work(state)

    async def socratic_generation_node(state: TutorSessionState) -> dict[str, Any]:
        return await tutor.generate_socratic_turn(state)

    async def answer_isolation_critic_node(state: TutorSessionState) -> dict[str, Any]:
        return critic.verify_response(state)

    async def epistemic_action_packer_node(state: TutorSessionState) -> dict[str, Any]:
        return tutor.pack_epistemic_actions(state)

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
    def route_adversarial(state: TutorSessionState) -> str:
        if state.get("adversarial_flag", False):
            return "deflection"
        return "socratic"

    def route_critic_verdict(state: TutorSessionState) -> str:
        if state.get("is_approved", False):
            return "approved"
        attempts = state.get("verification_attempts", 0)
        if attempts < 2:
            return "remediate"
        return "fallback"

    # 3. Assemble StateGraph (8-Node Epistemic Learning Loop Pipeline)
    builder = StateGraph(TutorSessionState)

    builder.add_node("ingest_co_presence", ingest_co_presence_node)
    builder.add_node("toulmin_decomposition", toulmin_decomposition_node)
    builder.add_node("adversarial_guard", adversarial_guard_node)
    builder.add_node("deflection_node", deflection_node)
    builder.add_node("cognitive_work_allocator", cognitive_work_allocator_node)
    builder.add_node("socratic_generation", socratic_generation_node)
    builder.add_node("answer_isolation_critic", answer_isolation_critic_node)
    builder.add_node("epistemic_action_packer", epistemic_action_packer_node)
    builder.add_node("safe_fallback", safe_fallback_node)

    # 4. Wire Edges and Branching
    builder.add_edge(START, "ingest_co_presence")
    builder.add_edge("ingest_co_presence", "toulmin_decomposition")
    builder.add_edge("toulmin_decomposition", "adversarial_guard")

    builder.add_conditional_edges(
        "adversarial_guard",
        route_adversarial,
        {
            "deflection": "deflection_node",
            "socratic": "cognitive_work_allocator",
        },
    )

    builder.add_edge("deflection_node", "epistemic_action_packer")
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
