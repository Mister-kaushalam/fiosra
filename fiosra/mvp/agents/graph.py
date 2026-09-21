"""
fiosra/mvp/agents/graph.py
LangGraph StateGraph wiring for the Socratic Tutor Multi-Agent System.

Simplified 9-node architecture:
  START → ingest_co_presence → adversarial_check →
    ├─ [adversarial] → deflection → epistemic_action_packer → END
    ├─ [hint_requested] → hint_scaffold → critic → epistemic_action_packer → END
    └─ [all other] → unified_generation → critic → epistemic_action_packer → END
  critic →
    ├─ [approved] → epistemic_action_packer → END
    ├─ [remediate] → unified_generation (retry)
    └─ [fallback] → safe_fallback → epistemic_action_packer → END
"""
from __future__ import annotations

import logging
from typing import Any

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

    9-node architecture replacing the former 15-node graph:
    - Adversarial check (deterministic regex) routes to deflection
    - Hint requests route to the scaffolded hint ladder
    - Everything else goes through unified_generation (single LLM structured output call)
    - All generative nodes pass through the answer-isolation critic
    """
    tutor = tutor_agent or SocraticTutorAgent()
    critic = critic_agent or AnswerIsolationCriticAgent()

    # ── Node Callables ──────────────────────────────────────────────────────

    async def ingest_co_presence_node(state: TutorSessionState) -> dict[str, Any]:
        return tutor.ingest_co_presence(state)

    async def adversarial_check_node(state: TutorSessionState) -> dict[str, Any]:
        return tutor.check_adversarial_input(state)

    async def deflection_node(state: TutorSessionState) -> dict[str, Any]:
        return tutor.build_deflection(state)

    async def hint_scaffold_node(state: TutorSessionState) -> dict[str, Any]:
        return await tutor.generate_hint_scaffold_turn(state)

    async def unified_generation_node(state: TutorSessionState) -> dict[str, Any]:
        return await tutor.generate_unified_turn(state)

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

    # ── Conditional Routing ─────────────────────────────────────────────────

    def route_after_adversarial_check(state: TutorSessionState) -> str:
        """Three-way split: adversarial → deflection, hint → scaffold, else → generate."""
        if state.get("adversarial_flag"):
            return "adversarial"
        if state.get("hint_requested") or state.get("is_hint_requested"):
            return "hint"
        return "generate"

    def route_critic_verdict(state: TutorSessionState) -> str:
        if state.get("is_approved", False):
            return "approved"
        attempts = state.get("verification_attempts", 0)
        if attempts < 2:
            return "remediate"
        return "fallback"

    # ── Assemble StateGraph ─────────────────────────────────────────────────

    builder = StateGraph(TutorSessionState)

    builder.add_node("ingest_co_presence", ingest_co_presence_node)
    builder.add_node("adversarial_check", adversarial_check_node)
    builder.add_node("deflection_node", deflection_node)
    builder.add_node("hint_scaffold_node", hint_scaffold_node)
    builder.add_node("unified_generation", unified_generation_node)
    builder.add_node("answer_isolation_critic", answer_isolation_critic_node)
    builder.add_node("epistemic_action_packer", epistemic_action_packer_node)
    builder.add_node("safe_fallback", safe_fallback_node)

    # ── Wire Edges ──────────────────────────────────────────────────────────

    builder.add_edge(START, "ingest_co_presence")
    builder.add_edge("ingest_co_presence", "adversarial_check")

    # Three-way branch after adversarial check
    builder.add_conditional_edges(
        "adversarial_check",
        route_after_adversarial_check,
        {
            "adversarial": "deflection_node",
            "hint": "hint_scaffold_node",
            "generate": "unified_generation",
        },
    )

    # Deflection bypasses critic (deterministic, already safe)
    builder.add_edge("deflection_node", "epistemic_action_packer")

    # Hint scaffold goes through critic
    builder.add_edge("hint_scaffold_node", "answer_isolation_critic")

    # Unified generation goes through critic
    builder.add_edge("unified_generation", "answer_isolation_critic")

    # Critic verdict: approve, remediate, or fallback
    builder.add_conditional_edges(
        "answer_isolation_critic",
        route_critic_verdict,
        {
            "approved": "epistemic_action_packer",
            "remediate": "unified_generation",
            "fallback": "safe_fallback",
        },
    )

    builder.add_edge("safe_fallback", "epistemic_action_packer")
    builder.add_edge("epistemic_action_packer", END)

    # ── Compile ─────────────────────────────────────────────────────────────

    active_checkpointer = checkpointer if checkpointer is not None else MemorySaver()
    return builder.compile(checkpointer=active_checkpointer)


# Global default compiled graph instance
socratic_tutor_graph = create_socratic_tutor_graph()
