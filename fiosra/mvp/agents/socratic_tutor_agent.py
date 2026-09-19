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
from fiosra.mvp.llm.orchestrator import llm_orchestrator

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

    def analyze_epistemic_discourse(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Discourse Phase Router:
        Classifies incoming interaction into distinct epistemic modes:
        - hint_scaffold: Explicit hint ladder requested
        - adversarial: Direct answer begging or prompt injection attempt
        - orientation: Greetings, check-ins, polite openings
        - structural_scaffold: Structuring, outlining, and brainstorming requests
        - substantive_inquiry: Actual claims, warrants, arguments, or domain questions
        """
        student_input = (state.get("student_input") or "").strip()
        is_hint = bool(state.get("hint_requested") or state.get("is_hint_requested"))

        if is_hint:
            return {
                "discourse_phase": "hint_scaffold",
                "adversarial_flag": False,
            }

        if bool(ADVERSARIAL_REGEX.search(student_input)):
            return {
                "discourse_phase": "adversarial",
                "adversarial_flag": True,
                "adversarial_reason": "Direct solution solicitation or guardrail evasion attempt.",
            }

        text_lower = student_input.lower()

        # Orientation / Greeting
        greeting_pattern = r"^\s*(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|greetings|howdy)(?:[!,.\s]|$)"
        if re.match(greeting_pattern, text_lower) and len(student_input.split()) <= 4:
            return {
                "discourse_phase": "orientation",
                "adversarial_flag": False,
            }

        # Structural Scaffolding & Brainstorming
        structural_keywords = [
            "structure", "brainstorm", "outline", "organize",
            "how to start", "where do i begin", "help me structure",
            "help with the assignment", "how should i structure",
            "how do i organize", "come up with a structure"
        ]
        if any(k in text_lower for k in structural_keywords):
            return {
                "discourse_phase": "structural_scaffold",
                "adversarial_flag": False,
            }

        return {
            "discourse_phase": "substantive_inquiry",
            "adversarial_flag": False,
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
        student_input = (state.get("student_input") or "").strip()
        is_hint = state.get("is_hint_requested", False)

        # Action capsules must be earned: only formulate a transfer capsule when the
        # student has articulated substantive reasoning (enforcing Zero AI Ghostwriting).
        if focused_id and not is_hint and len(student_input) > 20 and not student_input.endswith("?"):
            claim_fragment = toulmin.get("claim") or student_input
            snippet = claim_fragment if len(claim_fragment) <= 180 else claim_fragment[:177] + "..."
            capsules.append({
                "capsule_id": f"cap-{uuid4().hex[:8]}",
                "label": "Transfer formulated insight to draft",
                "suggested_student_text": snippet,
                "text_payload": snippet,
                "target_block_id": focused_id,
                "role": "claim" if not toulmin.get("has_warrant") else "warrant",
                "rationale": "Transfer your formulated reasoning into your active canvas draft",
                "provenance": "action_capsule",
            })

        rung = state.get("current_rung", 1)
        if is_hint:
            rung_phases = {
                1: ("Orienting Inquiry", "Orientation", "Formulate provisional scope"),
                2: ("Warrant Inquest", "Inquiring", "Clarify unstated causal assumptions"),
                3: ("Procedural Decomposition", "Scaffolding", "Synthesize primary exhibit evidence"),
            }
            phase, stance, next_step = rung_phases.get(rung, ("Orienting Inquiry", "Orientation", "Ground claim"))
            learner_radar = {
                "dimension": "Socratic Scaffold & Causal Grounding",
                "stance": stance,
                "summary": f"Rung {rung} · {phase}",
                "next_step": next_step,
            }
        else:
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

    async def generate_orientation_turn(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Generates a warm, collegial seminar carrel welcome without adversarial pedantry.
        """
        response_text = (
            "Hello! Welcome to your seminar carrel. I'm here to help you examine the assigned exhibits "
            "and develop your own evidence-grounded arguments on medieval and early modern Indian institutions. "
            "What aspect of the assignment prompt or sources would you like to explore first?"
        )
        return {
            "final_verified_response": response_text,
            "draft_response": response_text,
            "is_approved": True,
            "hint_rung": None,
            "penalty_score": 0.0,
            "thoughts_of_tutorbot": {
                "strategy_selected": "Seminar orientation & entry facilitation",
                "affective_adjustment": "Warm, encouraging, scholarly collegiality.",
            },
        }

    async def generate_structural_scaffold_turn(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Provides Socratic structural scaffolding: outlines the 3 historical analytical pillars
        and invites the student to choose an anchor.
        """
        response_text = (
            "Certainly. A rigorous historical analysis for this assignment typically rests on three structural pillars:\n\n"
            "1. Central Thesis: How administrative and economic institutions evolved across dynastic transitions (continuity vs. disruption).\n"
            "2. Causal & Fiscal Mechanisms: Grounding your claims in specific reforms from the exhibits (e.g., Todar Mal's Zabt revenue system, silver currency monetization, or regional market integration).\n"
            "3. Limits & Counter-Evidence: Analyzing where imperial centralization met local autonomy or resistance.\n\n"
            "To begin building your outline, which of these pillars or assigned exhibits would you like to anchor your first section around?"
        )
        return {
            "final_verified_response": response_text,
            "draft_response": response_text,
            "is_approved": True,
            "hint_rung": None,
            "penalty_score": 0.0,
            "thoughts_of_tutorbot": {
                "strategy_selected": "Socratic structural decomposition into 3 analytical pillars",
                "affective_adjustment": "Supportive academic scaffolding.",
            },
        }

    async def generate_hint_scaffold_turn(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Handles the 3-rung scaffolded hint ladder explicitly requested by the student.
        """
        current_rung = state.get("current_rung", 0)
        active_rung = min(current_rung + 1, 3)
        hint_ladder = state.get("hint_ladder") or []

        assignment_hint = None
        for hint in hint_ladder:
            lvl = hint.get("level") if isinstance(hint, dict) else getattr(hint, "level", None)
            if lvl == active_rung:
                is_locked = hint.get("is_locked", False) if isinstance(hint, dict) else getattr(hint, "is_locked", False)
                if not is_locked:
                    assignment_hint = hint.get("content") if isinstance(hint, dict) else getattr(hint, "content", None)
                break

        if assignment_hint:
            probe_text = assignment_hint
        else:
            rung_ladders = {
                1: "What were the key institutional and economic transformations that occurred across medieval and early modern India, and how did dynastic transitions shape regional networks?",
                2: "Looking at your working claim, what specific causal mechanism connects these administrative reforms to changes in agricultural productivity or rural credit?",
                3: "Let's decompose this into three analytical steps: 1) Identify one specific reform from the assigned exhibits, 2) Note how primary accounts quantify its revenue impact, and 3) Contrast this with an alternative regional interpretation.",
            }
            probe_text = rung_ladders.get(active_rung, rung_ladders[1])

        return {
            "current_rung": active_rung,
            "hint_rung": active_rung,
            "penalty_score": active_rung * 0.25,
            "final_verified_response": probe_text,
            "draft_response": probe_text,
            "is_approved": True,
            "thoughts_of_tutorbot": {
                "strategy_selected": f"Rung {active_rung} Scaffolded Pedagogical Hint",
                "active_rung": active_rung,
                "affective_adjustment": "Calibrated cognitive support.",
            },
        }

    async def generate_socratic_turn(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Generates a scaffolded Socratic probe for substantive claims by querying
        misconceptions, analyzing Toulmin warrants, and engaging LLM enhancement.
        """
        student_id = state.get("student_id", "anonymous_student")
        student_input = state.get("student_input", "")
        active_kc_id = state.get("active_kc_id", "*")
        current_rung = state.get("current_rung", 0)
        attempts = state.get("verification_attempts", 0)
        remediation = state.get("remediation_instructions")

        # 1. Query Graphiti MCP for past student claims (temporal context)
        temporal_context = await self.mcp.call_tool(
            "query_student_belief_trajectory",
            {"student_id": student_id, "concept_query": student_input[:100]},
        ) or []

        # 2. Query Neo4j MCP for matching Misconception & Socratic Probes
        misconceptions = await self.mcp.call_tool(
            "search_misconceptions",
            {"student_claim": student_input, "kc_id": active_kc_id, "limit": 2},
        ) or []

        matched_trap = misconceptions[0] if misconceptions else None
        probe_text = None

        if matched_trap:
            probes = matched_trap.get("probes", [])
            matching = [p for p in probes if p.get("rung") == min(current_rung, 2)]
            if matching:
                probe_text = matching[0].get("probe_text")
            elif probes:
                probe_text = probes[0].get("probe_text")

        # 3. Fallback generic Socratic inquiry if no specific catalogued probe matched
        if not probe_text:
            text_lower = student_input.lower()
            if any(w in text_lower for w in ["counter", "challenge", "alternative", "against"]):
                probe_text = "If we test your claim against the assigned exhibits, what contradictory evidence or alternative institutional explanation presents the strongest challenge?"
            elif any(w in text_lower for w in ["premise", "assumption", "presuppose"]):
                probe_text = "What implicit premise are you taking for granted regarding the causal mechanisms connecting these institutional changes to economic outcomes?"
            elif any(w in text_lower for w in ["evidence", "ground", "source", "document", "exhibit"]):
                probe_text = "Which specific passage, fiscal table, or administrative record in the assigned exhibit best substantiates this interpretation over an alternative?"
            else:
                probe_text = f"Taking your argument regarding '{student_input[:60]}': what specific primary evidence or historical mechanism connects this assertion to the prompt's central themes?"

        if attempts > 0 and remediation:
            probe_text = f"{probe_text} In your own words, what is the most significant evidence here?"

        # 4. LLM Enhancement with Answer Isolation guardrails
        try:
            gen = await llm_orchestrator.enhance(
                purpose="socratic_dialogue_turn",
                system_prompt=(
                    "You are an expert Socratic tutor in a university history seminar. "
                    "Guide the student toward independent critical thinking and evidence-grounded analysis. "
                    "Engage directly with the student's historical reasoning. "
                    "Output exactly one focused, intellectually rigorous inquiry ending in a question mark. "
                    "Never ghostwrite the student's essay, give direct answers, or provide pre-written thesis statements."
                ),
                user_prompt=(
                    f"Student's Claim / Argument:\n{student_input}\n\n"
                    f"Focused Context:\n{state.get('focused_block_text') or 'Draft paragraph'}\n\n"
                    f"Socratic Probe Target:\n{probe_text}"
                ),
                deterministic_fallback=probe_text,
                pseudonymous_seed=f"socratic:{student_id}:{student_input[:64]}",
                max_characters=450,
                max_tokens=120,
                allow_live=True,
            )
            probe_text = gen.content
        except Exception as err:
            logger.warning(f"LLM enhancement failed, falling back to deterministic probe: {err}")

        thoughts = {
            "student_claim_analyzed": student_input[:120],
            "identified_error": matched_trap.get("name") if matched_trap else "Under-evidenced premise",
            "active_rung": current_rung,
            "flawed_rule_detected": matched_trap.get("flawed_rule") if matched_trap else None,
            "strategy_selected": "Substantive Socratic inquiry targeting causal warrant & exhibit grounding.",
            "affective_adjustment": "Intellectually rigorous, supportive, encouraging.",
        }

        return {
            "current_rung": current_rung,
            "hint_rung": None,  # Substantive turns must never emit a hint_rung
            "penalty_score": 0.0,
            "temporal_context": temporal_context,
            "diagnosed_misconception": matched_trap,
            "thoughts_of_tutorbot": thoughts,
            "draft_response": probe_text,
        }
