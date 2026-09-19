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
from uuid import uuid4

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

    def ingest_co_presence(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Layer 5 Co-Presence Ingestion: Synchronizes live ProseMirror paragraph context,
        cursor dwell, and open primary document exhibit.
        """
        blocks = state.get("canvas_blocks") or []
        focused_id = state.get("focused_block_id")
        focused_text = state.get("focused_block_text")

        if not focused_text and focused_id and blocks:
            for b in blocks:
                if b.get("id") == focused_id or b.get("block_id") == focused_id:
                    focused_text = b.get("text", "")
                    break

        if not focused_text and blocks:
            for b in blocks:
                if b.get("text"):
                    focused_id = b.get("id") or b.get("block_id")
                    focused_text = b.get("text", "")
                    break

        return {
            "focused_block_id": focused_id,
            "focused_block_text": focused_text or state.get("student_input", ""),
        }

    def decompose_toulmin(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Toulmin Argumentation Decomposition:
        Extracts claim, warrant, evidence, and implicit assumptions from active student text.
        """
        text = state.get("focused_block_text") or state.get("student_input", "")
        existing = state.get("toulmin_structure") or {}

        sentences = [s.strip() for s in re.split(r"[.!?]\s+", text) if s.strip()]
        claim = sentences[0] if sentences else text

        has_warrant = bool(re.search(r"\b(?:because|since|therefore|thus|which implies|demonstrates that)\b", text, re.I))
        has_evidence = bool(re.search(r"\b(?:according to|source|document|figure|exhibit|page|quotes?)\b", text, re.I) or '"' in text)
        has_qualification = bool(re.search(r"\b(?:however|although|unless|might|may|provisional|partially)\b", text, re.I))

        assumptions = []
        if "feudal" in text.lower() or "serf" in text.lower():
            assumptions.append("Assumes legal serfdom was uniform across all royal manors")
        elif "bankrupt" in text.lower() or "debt" in text.lower() or "necker" in text.lower():
            assumptions.append("Assumes crown finances were solely drained by foreign war rather than structural exemptions")
        elif len(sentences) > 0 and not has_warrant:
            assumptions.append("Assumes direct correlation without articulating underlying causal mechanism")

        stance = "Grounded" if (has_evidence and has_warrant) else ("Provisional" if has_warrant or has_evidence else "Intuitive")

        toulmin = {
            "claim": existing.get("claim") or claim,
            "warrant": existing.get("warrant") or ("Identified in text" if has_warrant else None),
            "evidence": existing.get("evidence") or ("Cited in draft" if has_evidence else None),
            "implicit_assumptions": existing.get("implicit_assumptions") or assumptions,
            "has_warrant": has_warrant,
            "has_evidence": has_evidence,
            "has_qualification": has_qualification,
            "stance": stance,
        }

        return {"toulmin_structure": toulmin}

    def allocate_cognitive_work(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Epistemic Work Allocator (Desirable Difficulties / Bjork & Sweller):
        Determines the next unresolved intellectual operation and sets the minimum AI assistance rung.
        Preserves student synthesis while removing mechanical lookup friction.
        """
        toulmin = state.get("toulmin_structure") or {}
        current_rung = state.get("current_rung", 0)
        hint_requested = state.get("hint_requested", False)

        if not toulmin.get("has_warrant"):
            intellectual_operation = "Missing Causal Warrant"
        elif not toulmin.get("has_evidence"):
            intellectual_operation = "Missing Primary Grounding"
        elif toulmin.get("implicit_assumptions") and not toulmin.get("has_qualification"):
            intellectual_operation = "Unexamined Implicit Assumption"
        else:
            intellectual_operation = "Synthesis & Qualification"

        effective_rung = min(current_rung + (1 if hint_requested else 0), 2)

        return {
            "intellectual_operation": intellectual_operation,
            "current_rung": effective_rung,
        }

    def pack_epistemic_actions(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Action Capsule & Discussion Starter Packer:
        Assembles 1-click text-first transfer capsules, subtle scholastic seminar starters,
        and 2-line metacognitive progress radar.
        """
        focused_id = state.get("focused_block_id")
        toulmin = state.get("toulmin_structure") or {}

        launchers = [
            {"title": "Examine structural assumptions", "prompt": "What unstated premise underlies this historical interpretation?"},
            {"title": "Test against primary exhibit", "prompt": "How does the primary document challenge this causal explanation?"},
            {"title": "Refine causal warrant", "prompt": "Can you articulate the exact mechanism connecting the debt to the collapse?"},
        ]

        capsules = []
        if focused_id:
            capsules.append({
                "capsule_id": f"cap-{uuid4().hex[:8]}",
                "label": "Transfer qualification to draft",
                "suggested_student_text": "However, this interpretation must be qualified by primary accounting evidence...",
                "text_payload": "However, this interpretation must be qualified by primary accounting evidence...",
                "target_block_id": focused_id,
                "role": "qualification",
                "rationale": "Add essential qualification to provisional claim",
                "provenance": "action_capsule",
            })

        stance = toulmin.get("stance", "Provisional")
        learner_radar = {
            "dimension": "Causal Grounding & Toulmin Structure",
            "stance": stance,
            "summary": f"Stance: {stance} · Warrant: {'Articulated' if toulmin.get('has_warrant') else 'Needs development'}",
            "next_step": "Ground claim against primary exhibit source",
        }

        return {
            "prompt_launchers": launchers,
            "action_capsules": capsules,
            "learner_radar": learner_radar,
        }

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
