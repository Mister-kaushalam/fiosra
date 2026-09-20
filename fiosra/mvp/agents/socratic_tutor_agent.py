"""
fiosra/mvp/agents/socratic_tutor_agent.py
Socratic Tutor Agent.
Conducts adaptive, answer-isolated Socratic dialogue across a 3-rung scaffolding ladder.
Consumes Fiosra FastMCP Server tools via AgentMCPClient.
"""
from __future__ import annotations

import json
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

        # Conversational Acknowledgments / Affirmations ('sure', 'ok', 'sounds good', 'yes', etc.)
        acknowledgment_pattern = r"^\s*(?:sure|ok|okay|yes|yeah|yep|sounds\s+good|sounds\s+great|cool!?|got\s+it|alright|fine|understood|makes\s+sense|right|let's\s+do\s+it|sure\s+thing)(?:[!,.\s]|$)"
        if re.match(acknowledgment_pattern, text_lower) and len(student_input.split()) <= 4:
            return {
                "discourse_phase": "acknowledgment",
                "adversarial_flag": False,
            }

        # Structural Scaffolding & Brainstorming (outlining, structuring, organizing, beginning)
        structural_pattern = (
            r"\b(?:"
            r"structur(?:e|ing|ed|es)?|"
            r"outlin(?:e|ing|ed|es)?|"
            r"organiz(?:e|ing|ed|es|ation|ations)?|"
            r"organis(?:e|ing|ed|es|ation|ations)?|"
            r"brainstorm(?:ing)?|"
            r"framework|"
            r"layout|"
            r"format(?:ting)?|"
            r"how\s+to\s+start|where\s+(?:do|should|can)\s+i\s+begin|how\s+should\s+i\s+begin|"
            r"how\s+(?:do|can|should|would)\s+i\s+(?:approach|tackle|proceed|write|structure|organize|outline)|"
            r"help\s+(?:me\s+)?(?:with\s+)?(?:structuring|organizing|outlining|writing|the\s+assignment|my\s+essay|my\s+paper)"
            r")\b"
        )
        if re.search(structural_pattern, text_lower):
            return {
                "discourse_phase": "structural_scaffold",
                "adversarial_flag": False,
            }

        # Meta-questions about the tutor itself (orientation-style, not substantive claims)
        meta_pattern = (
            r"^\s*(?:"
            r"what(?:\s+(?:can|do|will|would))?\s+you\s+(?:do|help|assist|support|offer|cover|handle)|"
            r"how\s+(?:can|do)\s+you\s+help|"
            r"what\s+(?:are\s+you|is\s+this)|"
            r"who\s+are\s+you|"
            r"can\s+you\s+help\s+(?:me\s+)?(?:with\s+this|today|please)?|"
            r"what\s+should\s+(?:i|we)\s+(?:do|start\s+with)"
            r")"
        )
        if re.search(meta_pattern, text_lower) and len(student_input.split()) <= 10:
            return {
                "discourse_phase": "orientation",
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
        Guards against extracting claims from rubric boilerplate or exploratory student intent.
        """
        text = (state.get("focused_block_text") or "").strip()
        student_input = (state.get("student_input") or "").strip()
        existing = state.get("toulmin_structure") or {}

        # Discard instructional schema boilerplate
        is_boilerplate = bool(
            re.search(r"\b(?:working claim|provisional, bounded|completion guidance|assignment question)\b", text, re.I)
        )
        if is_boilerplate:
            text = ""

        # Distinguish genuine claims from exploratory intents, queries, or greetings
        is_intent_or_q = bool(
            re.match(r"^\s*(?:i\s+(?:want|would like|need|wish|prefer|plan)\b|can\s+you\b|could\s+you\b|how\b|what\b|why\b|where\b|when\b|is\b|are\b|hi\b|hello\b|hey\b)", student_input, re.I)
            or student_input.endswith("?")
        )

        analysis_text = text or (student_input if not is_intent_or_q else "")
        sentences = [s.strip() for s in re.split(r"[.!?]\s+", analysis_text) if s.strip()]
        claim = sentences[0] if sentences else ""

        has_warrant = bool(re.search(r"\b(?:because|since|therefore|thus|which implies|demonstrates that)\b", analysis_text, re.I))
        has_evidence = bool(re.search(r"\b(?:according to|source|document|figure|exhibit|page|quotes?)\b", analysis_text, re.I) or '"' in analysis_text)
        has_qualification = bool(re.search(r"\b(?:however|although|unless|might|may|provisional|partially)\b", analysis_text, re.I))

        assumptions = []
        if "feudal" in analysis_text.lower() or "serf" in analysis_text.lower():
            assumptions.append("Assumes legal serfdom was uniform across all royal manors")
        elif "bankrupt" in analysis_text.lower() or "debt" in analysis_text.lower() or "necker" in analysis_text.lower():
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

    async def pack_epistemic_actions(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Action Capsule & Discussion Starter Packer:
        Assembles 1-click text-first transfer capsules, state-contingent student intention chips,
        and 2-line metacognitive progress radar.

        Chips are student-voiced intentions (not tutor questions) and are:
        - Absent on a blank canvas with no prior dialogue
        - 2 LLM-generated entry intentions when canvas is empty but dialogue has started
        - 2 LLM-generated continuation intentions when the canvas has content
        - Capped at 2 maximum (Zero Button Bloat)
        """
        focused_id = state.get("focused_block_id")
        toulmin = state.get("toulmin_structure") or {}
        student_id = state.get("student_id", "anonymous")
        student_input = (state.get("student_input") or "").strip()
        assignment_prompt = (state.get("assignment_meta") or {}).get("question_prompt") or ""
        dialogue_history = state.get("dialogue_history") or []
        canvas_blocks = state.get("canvas_blocks") or []

        has_canvas_content = any((b.get("text") or "").strip() for b in canvas_blocks)
        has_dialogue = len(dialogue_history) > 0

        # ── State-contingent launcher generation ────────────────────────────
        launchers: list[dict] = []

        if not has_canvas_content and not has_dialogue:
            # Truly blank state — no dialogue, no canvas — no chips
            launchers = []

        elif not has_canvas_content:
            # After first exchange, canvas still blank — progressive entry/inquiry intentions
            recent_history = dialogue_history[-4:]
            history_snippet = "\n".join(
                f"{t.get('role','').capitalize()}: {t.get('text','')[:120]}"
                for t in recent_history
            )
            assigned_sources = state.get("assigned_sources") or []
            sources_summary = ", ".join(s.get("title", "") for s in assigned_sources[:4] if s.get("title"))

            turns_count = len(dialogue_history)
            if turns_count <= 2:
                stage_guidance = (
                    "Stage: Initial Focus. Generate 2 distinct entry intentions pointing to specific primary source exhibits or historical angles to explore."
                )
            elif turns_count <= 5:
                stage_guidance = (
                    "Stage: Evidence Deepening. The student has begun exploring. Generate 2 intentions that probe evidence, specific chronicler claims, or comparative tensions."
                )
            else:
                stage_guidance = (
                    "Stage: Toward Claim Formulation. Several exchanges have occurred. Generate 2 intentions prompting the student to synthesize an observation or draft an initial claim."
                )

            system_prompt = (
                "You are generating 2 short conversation-starter chips for a student in a Socratic history seminar. "
                "Each chip is a natural, first-person student intention they can click to send to the tutor. "
                "Ground them specifically in the ongoing dialogue, the assignment prompt, and assigned exhibits. "
                "Chips must be student requests or intentions — NOT tutor questions. "
                "Do NOT loop or repeat previous student choices. Move the reasoning arc forward. "
                "Examples: 'I want to examine market price controls in Barani', 'What does this passage reveal about agrarian taxes?'. "
                "Output ONLY a JSON array of exactly 2 objects, each with 'title' (3-5 words) and 'prompt' (one natural student sentence). "
                "No other text before or after the JSON."
            )
            user_prompt = (
                f"Assignment Question Prompt:\n{assignment_prompt}\n\n"
                f"Assigned Sources in Pack:\n{sources_summary or 'General seminar exhibits'}\n\n"
                f"Recent Seminar Dialogue:\n{history_snippet or 'None'}\n\n"
                f"Last student message: {student_input[:120]}\n\n"
                f"{stage_guidance}"
            )
            try:
                gen = await llm_orchestrator.enhance(
                    purpose="chip_entry_intentions",
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    pseudonymous_seed=f"chips:entry:{student_id}:{turns_count}:{student_input[:32]}",
                    max_characters=400,
                    max_tokens=120,
                    allow_live=True,
                    require_live=True,
                )
                raw = gen.content.strip()
                # strip markdown fences if present
                raw = re.sub(r"^```[^\n]*\n?", "", raw).rstrip("`").strip()
                chips = json.loads(raw)
                launchers = [
                    {"title": c.get("title", ""), "prompt": c.get("prompt", "")}
                    for c in chips if c.get("title") and c.get("prompt")
                ][:2]
            except Exception:
                launchers = []  # fail silently — no chips beats wrong chips

        else:
            # Canvas has content — 2 reasoning-continuation intentions
            recent_history = dialogue_history[-4:]
            history_snippet = "\n".join(
                f"{t.get('role','').capitalize()}: {t.get('text','')[:120]}"
                for t in recent_history
            )
            canvas_snippet = " ".join(
                (b.get("text") or "")[:200] for b in canvas_blocks[:3]
            ).strip()
            system_prompt = (
                "You are generating 2 short conversation-starter chips for a student in a Socratic history seminar. "
                "The student has already written something in their draft canvas. "
                "Each chip is a natural, first-person student intention they can click to send to the tutor. "
                "Ground them in the student's current draft and recent dialogue. "
                "Chips must be student requests — NOT tutor questions. "
                "Examples: 'I am not sure this evidence is strong enough', 'I want to test an alternative explanation', 'I found a source that challenges my claim'. "
                "Output ONLY a JSON array of exactly 2 objects, each with 'title' (3-5 words) and 'prompt' (one natural student sentence). "
                "No other text before or after the JSON."
            )
            user_prompt = (
                f"Assignment Prompt:\n{assignment_prompt}\n\n"
                f"Student's current draft (excerpt):\n{canvas_snippet or 'No content yet.'}\n\n"
                f"Recent dialogue:\n{history_snippet}"
            )
            try:
                gen = await llm_orchestrator.enhance(
                    purpose="chip_continuation_intentions",
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    pseudonymous_seed=f"chips:cont:{student_id}:{canvas_snippet[:32]}",
                    max_characters=400,
                    max_tokens=120,
                    allow_live=True,
                    require_live=True,
                )
                raw = gen.content.strip()
                raw = re.sub(r"^```[^\n]*\n?", "", raw).rstrip("`").strip()
                chips = json.loads(raw)
                launchers = [
                    {"title": c.get("title", ""), "prompt": c.get("prompt", "")}
                    for c in chips if c.get("title") and c.get("prompt")
                ][:2]
            except Exception:
                launchers = []  # fail silently — no chips beats wrong chips

        capsules = []
        is_hint = state.get("is_hint_requested", False)

        # Action capsules must be earned: only formulate a transfer capsule when the
        # student has articulated substantive reasoning (enforcing Zero AI Ghostwriting).
        claim_candidate = (toulmin.get("claim") or "").strip()
        is_boilerplate = bool(
            re.search(r"\b(?:working claim|provisional, bounded|completion guidance|assignment question)\b", claim_candidate, re.I)
        )
        is_intent_or_q = bool(
            re.match(r"^\s*(?:i\s+(?:want|would like|need|wish|prefer|plan)\b|can\s+you\b|could\s+you\b|how\b|what\b|why\b|where\b|when\b|is\b|are\b|hi\b|hello\b|hey\b)", student_input, re.I)
            or student_input.endswith("?")
        )

        has_substantive_input = (
            len(student_input) > 25
            and not is_intent_or_q
            and not is_boilerplate
        )
        has_substantive_block = bool(
            (toulmin.get("has_warrant") or toulmin.get("has_evidence"))
            and len(claim_candidate) > 20
            and not is_boilerplate
        )

        if focused_id and not is_hint and not is_boilerplate and (has_substantive_input or has_substantive_block):
            claim_fragment = claim_candidate if (has_substantive_block and student_input.endswith("?")) else (student_input if has_substantive_input else claim_candidate)
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
        Generates a warm, context-aware welcome via live LLM generation.
        Responds naturally to greetings and meta-questions about the tutor's capabilities,
        grounded in the actual assignment prompt. Fails transparently if LLM is unavailable.
        """
        student_id = state.get("student_id", "anonymous_student")
        student_input = state.get("student_input", "")
        assignment_prompt = (state.get("assignment_meta") or {}).get("question_prompt") or "A historical analysis assignment."

        system_prompt = (
            "You are an expert Socratic tutor in a university history seminar. "
            "The student has just started a session or asked a meta-question about what you can help with. "
            "Respond warmly and briefly. Introduce yourself as a Socratic tutor who helps students "
            "develop their own evidence-grounded arguments — you do not write for them or give direct answers. "
            "Mention the assignment topic briefly, and invite the student to pick a starting point. "
            "Keep it to 2-3 sentences. Do not start with 'I' as the first word."
        )

        user_prompt = (
            f"Assignment Question Prompt:\n{assignment_prompt}\n\n"
            f"Student's Opening Message:\n{student_input}"
        )

        gen = await llm_orchestrator.enhance(
            purpose="socratic_orientation",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            pseudonymous_seed=f"orientation:{student_id}:{student_input[:32]}",
            max_characters=600,
            max_tokens=120,
            allow_live=True,
            require_live=True,
        )
        response_text = gen.content

        return {
            "final_verified_response": response_text,
            "draft_response": response_text,
            "is_approved": True,
            "hint_rung": None,
            "penalty_score": 0.0,
            "thoughts_of_tutorbot": {
                "strategy_selected": "Live LLM seminar orientation",
                "affective_adjustment": "Warm, encouraging, scholarly collegiality.",
            },
        }

    async def generate_acknowledgment_turn(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Handles brief conversational agreements or affirmations ('sure', 'ok', 'sounds good')
        via live LLM generation, aware of the prior tutor message and assignment context.
        Fails transparently if LLM is unavailable.
        """
        student_id = state.get("student_id", "anonymous_student")
        student_input = state.get("student_input", "")
        assignment_prompt = (state.get("assignment_meta") or {}).get("question_prompt") or "A historical analysis assignment."

        # Surface the most recent tutor message as context
        dialogue_history = state.get("dialogue_history") or []
        last_tutor_msg = ""
        for turn in reversed(dialogue_history):
            if turn.get("role") == "tutor":
                last_tutor_msg = turn.get("text", "")
                break

        system_prompt = (
            "You are an expert Socratic tutor in a university history seminar. "
            "The student has just responded with a brief conversational affirmation (e.g. 'sure', 'ok', 'sounds good'). "
            "Acknowledge warmly and naturally, then move the seminar forward with a single focused question "
            "that picks up exactly where your last message left off. "
            "Do not repeat yourself or re-explain what you just said. "
            "Keep it to 1-2 sentences ending in a question."
        )

        user_prompt = (
            f"Assignment Prompt:\n{assignment_prompt}\n\n"
            f"Your Previous Message:\n{last_tutor_msg or '(Start of conversation)'}\n\n"
            f"Student's Affirmation:\n{student_input}"
        )

        gen = await llm_orchestrator.enhance(
            purpose="socratic_acknowledgment",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            pseudonymous_seed=f"ack:{student_id}:{student_input[:32]}",
            max_characters=600,
            max_tokens=120,
            allow_live=True,
            require_live=True,
        )
        response_text = gen.content

        return {
            "final_verified_response": response_text,
            "draft_response": response_text,
            "is_approved": True,
            "hint_rung": None,
            "penalty_score": 0.0,
            "thoughts_of_tutorbot": {
                "strategy_selected": "Live LLM conversational affirmation & next-step Socratic invitation",
                "affective_adjustment": "Warm, encouraging, action-oriented.",
            },
        }

    async def generate_structural_scaffold_turn(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Handles structuring/brainstorming requests by beginning the Socratic inquiry —
        NOT by delivering a structure. Structure emerges from dialogue as an artefact
        of the student's developing reasoning. This method redirects the student's
        desire to "get a structure" into the question that starts the reasoning process:
        "What is your initial instinct about the assignment question?"
        Fails transparently if the LLM is unavailable.
        """
        student_id = state.get("student_id", "anonymous_student")
        student_input = state.get("student_input", "")
        assignment_prompt = (state.get("assignment_meta") or {}).get("question_prompt") or "Analyze the historical problem grounded in assigned exhibits."
        focused_text = state.get("focused_block_text") or ""

        # Build multi-turn context
        history_snippet = ""
        dialogue_history = state.get("dialogue_history") or []
        if dialogue_history:
            recent = dialogue_history[-6:]
            formatted = []
            for t in recent:
                speaker = "Student" if t.get("role") == "student" else "Socratic Tutor"
                formatted.append(f"{speaker}: {t.get('text', '')}")
            history_snippet = "Recent Seminar Dialogue Context:\n" + "\n".join(formatted) + "\n\n"

        system_prompt = (
            "You are an expert Socratic tutor in a university history seminar. "
            "The student has asked for help structuring or brainstorming their assignment. "
            "Do NOT give them a structure, skeleton, list of sections, or outline. "
            "The structure of a historical argument must emerge from the student's own reasoning — "
            "it is not something to be handed to them. "
            "In one sentence, warmly acknowledge that structure is built step by step through the argument itself. "
            "Then ask one single focused question: what is their initial instinct or provisional answer "
            "to the assignment question? Make clear that even a rough, uncertain answer is a valid starting point. "
            "Maximum 2-3 sentences total. End on the question. No lists, no headings, no sections."
        )

        user_prompt = (
            f"Assignment Question Prompt:\n{assignment_prompt}\n\n"
            f"{history_snippet}"
            f"Student's Request:\n{student_input}"
        )

        gen = await llm_orchestrator.enhance(
            purpose="socratic_structural_scaffold",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            pseudonymous_seed=f"scaffold:{student_id}:{student_input[:64]}",
            max_characters=600,
            max_tokens=120,
            allow_live=True,
            require_live=True,
        )
        response_text = gen.content

        return {
            "final_verified_response": response_text,
            "draft_response": response_text,
            "is_approved": True,
            "hint_rung": None,
            "penalty_score": 0.0,
            "thoughts_of_tutorbot": {
                "strategy_selected": "Live LLM Socratic structural scaffolding",
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
        Generates an adaptive Socratic probe using live LLM generation conditioned
        on the student's reasoning, active canvas block, and assigned exhibits.
        Fails transparently if live LLM generation is unavailable.
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
        target_guidance = ""
        if matched_trap:
            probes = matched_trap.get("probes", [])
            matching = [p for p in probes if p.get("rung") == min(current_rung, 2)]
            probe_hint = matching[0].get("probe_text") if matching else (probes[0].get("probe_text") if probes else None)
            target_guidance = f"Identified Misconception: {matched_trap.get('name')}. Suggested pedagogical probe direction: {probe_hint}"
        else:
            target_guidance = "Pedagogical Target: Deepen causal grounding, evaluate counter-evidence, and connect claims to assigned exhibits."

        # 3. Build multi-turn dialogue context
        history_snippet = ""
        dialogue_history = state.get("dialogue_history") or []
        if dialogue_history:
            recent = dialogue_history[-6:]
            formatted = []
            for t in recent:
                speaker = "Student" if t.get("role") == "student" else "Socratic Tutor"
                formatted.append(f"{speaker}: {t.get('text', '')}")
            history_snippet = "Recent Seminar Dialogue Context:\n" + "\n".join(formatted) + "\n\n"

        remediation_snippet = ""
        if attempts > 0 and remediation:
            remediation_snippet = f"\nCorrection Notice from Answer-Isolation Critic: {remediation}\n"

        assignment_prompt = (state.get("assignment_meta") or {}).get("question_prompt") or "Analyze the historical problem grounded in assigned exhibits."
        focused_text = state.get("focused_block_text") or ""

        assigned_sources = state.get("assigned_sources") or []
        sources_snippet = ""
        if assigned_sources:
            sources_list = []
            for s in assigned_sources[:4]:
                author_str = f" by {s['author']}" if s.get("author") else ""
                excerpt_str = f" — \"{s['excerpt']}\"" if s.get("excerpt") else ""
                sources_list.append(f"- Exhibit: {s.get('title', 'Primary Source')}{author_str}{excerpt_str}")
            sources_snippet = "Assigned Primary Sources / Exhibits in Course Pack:\n" + "\n".join(sources_list) + "\n\n"

        system_prompt = (
            "You are an expert Socratic tutor in a rigorous university history seminar. "
            "Your goal is to guide the student toward independent critical thinking, historical causation, and evidence-grounded analysis.\n"
            "STRICT PEDAGOGICAL CONSTRAINTS:\n"
            "1. NO SYCOPHANCY: NEVER open with formulaic praise or filler validation. Do NOT say 'That's a focused direction!', 'That's a focused approach!', 'That's a crucial aspect!', 'Great question!', etc. Jump directly and conversationally into the inquiry.\n"
            "2. SINGLE QUESTION ONLY: Ask strictly ONE focused, intellectually substantive question per turn. Never fire multiple questions, and do not append secondary inquiries with 'Additionally...', 'Furthermore...', 'What about...', or 'And how...'.\n"
            "3. GROUND IN ASSIGNED EXHIBITS: When the student expresses interest in a period or topic (e.g. Delhi Sultanate, Mughal economy, British revenue), immediately steer them to the specific assigned exhibit in the course pack covering that topic, asking what specific historical observation or evidence they draw from it.\n"
            "4. NEVER GHOSTWRITE: Do not write thesis statements or give direct answers. Guide the student to formulate their own claims from the sources.\n"
            "5. NO LITERALISM ON SLANG: Never take casual rhetorical checks literally (e.g. 'cool?' means 'sound good?')."
        )

        user_prompt = (
            f"Assignment Question Prompt:\n{assignment_prompt}\n\n"
            f"{sources_snippet}"
            f"{history_snippet}"
            f"Active Canvas Block under Examination:\n{focused_text or 'Canvas draft is currently blank.'}\n\n"
            f"Student's Latest Message:\n{student_input}\n\n"
            f"{target_guidance}"
            f"{remediation_snippet}"
        )

        # 4. Live LLM Generation (fails transparently if unavailable)
        gen = await llm_orchestrator.enhance(
            purpose="socratic_dialogue_turn",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            pseudonymous_seed=f"socratic:{student_id}:{student_input[:64]}",
            max_characters=1200,
            max_tokens=250,
            allow_live=True,
            require_live=True,
        )
        response_text = gen.content

        thoughts = {
            "student_claim_analyzed": student_input[:120],
            "identified_error": matched_trap.get("name") if matched_trap else "Under-evidenced premise",
            "active_rung": current_rung,
            "flawed_rule_detected": matched_trap.get("flawed_rule") if matched_trap else None,
            "strategy_selected": "Live LLM Socratic inquiry targeting causal warrant & exhibit grounding.",
            "affective_adjustment": "Intellectually rigorous, supportive, encouraging.",
        }

        return {
            "current_rung": current_rung,
            "hint_rung": None,  # Substantive turns must never emit a hint_rung
            "penalty_score": 0.0,
            "temporal_context": temporal_context,
            "diagnosed_misconception": matched_trap,
            "thoughts_of_tutorbot": thoughts,
            "draft_response": response_text,
        }
