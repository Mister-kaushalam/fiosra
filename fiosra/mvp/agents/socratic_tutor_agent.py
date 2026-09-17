"""
fiosra/mvp/agents/socratic_tutor_agent.py
Socratic Tutor Agent.
Conducts adaptive, answer-isolated Socratic dialogue across a 3-rung scaffolding ladder.
Consumes Fiosra FastMCP Server tools via AgentMCPClient.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from fiosra.mvp.agents.contracts import TutorSessionState
from fiosra.mvp.agents.mcp_client import agent_mcp_client

logger = logging.getLogger(__name__)

ADVERSARIAL_PATTERNS = [
    r"\b(?:what is|tell me|give me|show me)\s+(?:the\s+)?(?:answer|solution|correct option|key)\b",
    r"\bsolve\s+(?:it|this)\s+(?:for\s+me)?\b",
    r"\bdo\s+(?:the\s+)?(?:math|calculation|essay|writing)\s+for\s+me\b",
    r"\b(?:ignore|disregard)\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions|rules|constraints|guidelines)\b",
    r"\byou\s+are\s+now\s+in\s+dan\s+mode\b",
    r"\brepeat\s+(?:the\s+)?(?:system\s+prompt|prompt\s+above)\b",
    r"\bdump\s+(?:all\s+)?(?:hidden\s+)?(?:prompt|instructions|keys|answers)\b",
    r"\bbypass\s+(?:safety|rules|guardrails)\b",
]

ADVERSARIAL_REGEX = re.compile("|".join(ADVERSARIAL_PATTERNS), re.IGNORECASE)


class SocraticTutorAgent:
    """
    Socratic Tutor Agent acting as an MCP Client.
    Advances through the 3-Rung Socratic Inquiry Ladder:
      - Rung 0: Metacognitive Reflection
      - Rung 1: Conceptual Confrontation (Primary source excerpt focus)
      - Rung 2: Evaluative Synthesis
    """

    def __init__(self, mcp_client=None) -> None:
        self.mcp = mcp_client or agent_mcp_client

    def check_adversarial_input(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Interception gate evaluating student input for prompt injection or direct answer extraction.
        """
        student_input = state.get("student_input", "").strip()
        is_adversarial = bool(ADVERSARIAL_REGEX.search(student_input))
        return {
            "adversarial_flag": is_adversarial,
            "adversarial_reason": "Direct solution solicitation or constraint evasion attempt." if is_adversarial else None,
        }

    def build_deflection(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Formulates a firm, encouraging Socratic deflection when adversarial intent is detected.
        """
        current_rung = state.get("current_rung", 0)
        probes = [
            "I hear you! However, in Fiosra, my mission is to help you master the material yourself rather than doing the thinking for you. Let's look back at the prompt together: what is the first clue or keyword you notice?",
            "I know this can feel challenging, but revealing the solution won't build your mastery. Let's take it one small step at a time: what do you think is happening in this scenario?",
            "My role as your Socratic guide is to walk beside you, not hand you the destination. What initial idea or assumption can we test first?",
        ]
        chosen = probes[current_rung % len(probes)]
        return {
            "final_verified_response": chosen,
            "draft_response": chosen,
            "is_approved": True,
            "penalty_score": current_rung * 0.25,
            "thoughts_of_tutorbot": {
                "student_claim_analyzed": "Direct solution solicitation / guardrail evasion attempt.",
                "identified_error": "Adversarial answer begging detected.",
                "max_permitted_hint_level": current_rung,
                "strategy_selected": "Deflect solution demand with Socratic redirection.",
                "affective_adjustment": "Warm, encouraging, and firm on boundary.",
            },
        }

    async def generate_socratic_turn(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Generates a scaffolded Socratic probe by calling FastMCP tools for misconception lookup,
        source chunk grounding, and episodic recording.
        """
        student_id = state.get("student_id", "anonymous_student")
        student_input = state.get("student_input", "")
        active_kc_id = state.get("active_kc_id", "*")
        current_rung = state.get("current_rung", 0)
        hint_requested = state.get("hint_requested", False)
        attempts = state.get("verification_attempts", 0)
        remediation = state.get("remediation_instructions")

        # 1. Advance rung if requested
        active_rung = min(current_rung + 1, 3) if hint_requested else current_rung
        penalty_score = active_rung * 0.25

        # 2. Query Graphiti MCP for past student claims (temporal context)
        temporal_context = await self.mcp.call_tool(
            "query_student_belief_trajectory",
            {"student_id": student_id, "concept_query": student_input[:100]},
        ) or []

        # 3. Query Neo4j MCP for matching Misconception & Socratic Probes
        misconceptions = await self.mcp.call_tool(
            "search_misconceptions",
            {"student_claim": student_input, "kc_id": active_kc_id, "limit": 2},
        ) or []

        matched_trap = misconceptions[0] if misconceptions else None
        probe_text = None

        if matched_trap:
            probes = matched_trap.get("probes", [])
            # Find probe matching active_rung (0, 1, or 2)
            matching = [p for p in probes if p.get("rung") == min(active_rung, 2)]
            if matching:
                probe_text = matching[0].get("probe_text")
            elif probes:
                probe_text = probes[0].get("probe_text")

        # 4. Fallback generic Socratic scaffold if no specific probe matched
        if not probe_text:
            generic_ladders = [
                "What initial assumption are you making about the actors or causes in this scenario?",
                "Which specific primary document or piece of evidence supports this interpretation over an alternative?",
                "How might you restate your argument so that it accounts for the contradictory details mentioned in the text?",
                "Consider the broader institutional context: what underlying policy directly produced these outcomes?",
            ]
            probe_text = generic_ladders[min(active_rung, len(generic_ladders) - 1)]

        # If this is a re-prompt due to critic rejection, ensure it ends with an explicit guiding question
        if attempts > 0 and remediation:
            probe_text = f"{probe_text} In your own words, what is the most significant evidence here?"

        # 5. Build thoughts_of_tutorbot
        thoughts = {
            "student_claim_analyzed": student_input[:120],
            "identified_error": matched_trap.get("name") if matched_trap else "Under-evidenced premise",
            "active_rung": active_rung,
            "flawed_rule_detected": matched_trap.get("flawed_rule") if matched_trap else None,
            "strategy_selected": f"Rung {active_rung} Socratic guidance targeting evidence grounding.",
            "affective_adjustment": "Intellectually rigorous, supportive, encouraging.",
        }

        # 6. Record turn into Graphiti temporal memory via MCP
        await self.mcp.call_tool(
            "record_learning_episode",
            {
                "student_id": student_id,
                "turn_type": "socratic_turn",
                "text_content": f"Student claimed: '{student_input}' | Socratic guide asked: '{probe_text}'",
            },
        )

        return {
            "current_rung": active_rung,
            "penalty_score": penalty_score,
            "temporal_context": temporal_context,
            "diagnosed_misconception": matched_trap,
            "thoughts_of_tutorbot": thoughts,
            "draft_response": probe_text,
        }
