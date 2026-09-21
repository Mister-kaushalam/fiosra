"""
fiosra/mvp/agents/socratic_tutor_agent.py
Socratic Tutor Agent.
Conducts adaptive, answer-isolated Socratic dialogue using structured LLM output.
Consumes Fiosra FastMCP Server tools via AgentMCPClient.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any
from uuid import uuid4

from fiosra.mvp.agents.contracts import TutorSessionState, UniversalSocraticTurn
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

# Precompute the JSON schema description for structured output instructions.
_TURN_SCHEMA = json.dumps(UniversalSocraticTurn.model_json_schema(), indent=2)


class SocraticTutorAgent:
    """
    Socratic Tutor Agent acting as an MCP Client.

    Uses a single LLM call with structured JSON output to simultaneously
    classify student intent, identify analytical tensions, generate Socratic
    responses, and produce follow-up suggestion chips.

    Replaces the former regex-based discourse router, Toulmin decomposer,
    cognitive work allocator, and 6 bespoke generation methods.
    """

    def __init__(self, mcp_client=None) -> None:
        self.mcp = mcp_client or agent_mcp_client

    # ── Canvas Co-Presence ──────────────────────────────────────────────────

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

    # ── Adversarial Guard (Deterministic – regex is correct here) ───────────

    def check_adversarial_input(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Deterministic interception gate for prompt injection or direct answer extraction.
        Security guardrails must not depend on LLM judgment.
        """
        student_input = state.get("student_input", "").strip()
        is_adversarial = bool(ADVERSARIAL_REGEX.search(student_input))
        return {
            "adversarial_flag": is_adversarial,
            "adversarial_reason": (
                "Direct solution solicitation or constraint evasion attempt."
                if is_adversarial else None
            ),
        }

    def build_deflection(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Formulates a firm, encouraging Socratic deflection when adversarial intent is detected.
        """
        current_rung = state.get("current_rung", 0)
        probes = [
            "I hear you! However, in Fiosra, my mission is to help you master the material "
            "yourself rather than doing the thinking for you. Let's look back at the prompt "
            "together: what is the first clue or keyword you notice?",
            "I know this can feel challenging, but revealing the solution won't build your "
            "mastery. Let's take it one small step at a time: what do you think is happening "
            "in this scenario?",
            "My role as your Socratic guide is to walk beside you, not hand you the "
            "destination. What initial idea or assumption can we test first?",
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

    # ── Hint Scaffold (Distinct rung/penalty logic – stays separate) ────────

    async def generate_hint_scaffold_turn(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Handles the 3-rung scaffolded hint ladder explicitly requested by the student.
        Kept separate from unified generation because it has deterministic rung advancement
        and penalty scoring logic that should not be delegated to the LLM.
        """
        current_rung = state.get("current_rung", 0)
        active_rung = min(current_rung + 1, 3)
        hint_ladder = state.get("hint_ladder") or []
        domain = state.get("domain") or (state.get("assignment_meta") or {}).get("domain") or "academic"

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
                1: (
                    f"Consider the core principles and frameworks introduced in the assigned "
                    f"{domain} exhibits. How do they apply to this question?"
                ),
                2: (
                    "Looking at your working claim, what specific evidence, framework, or "
                    "mechanism from the exhibits connects your premise to your conclusion?"
                ),
                3: (
                    "Let's decompose this into three steps: 1) Identify key evidence from "
                    "the exhibits, 2) Explain how it supports your claim, and 3) Evaluate "
                    "potential limitations or alternatives."
                ),
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

    # ── Unified Socratic Generation ─────────────────────────────────────────

    async def generate_unified_turn(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Single LLM call with structured JSON output that simultaneously:
        1. Classifies the student's conversational move
        2. Identifies the key unexamined tension to probe
        3. Generates a Socratic response
        4. Produces 2 follow-up suggestion chips
        5. Flags if a claim is draft-ready

        Replaces the former: analyze_epistemic_discourse, decompose_toulmin,
        allocate_cognitive_work, generate_orientation_turn, generate_uncertainty_scaffold_turn,
        generate_topic_scoping_turn, generate_acknowledgment_turn,
        generate_structural_scaffold_turn, and generate_socratic_turn.
        """
        student_id = state.get("student_id", "anonymous_student")
        student_input = state.get("student_input", "")
        attempts = state.get("verification_attempts", 0)
        remediation = state.get("remediation_instructions")

        assignment_prompt = (
            (state.get("assignment_meta") or {}).get("question_prompt")
            or "An inquiry-based analysis assignment."
        )
        domain = state.get("domain") or (state.get("assignment_meta") or {}).get("domain") or "academic"
        focused_text = state.get("focused_block_text") or ""

        # ── Build dialogue history ──────────────────────────────────────────
        dialogue_history = state.get("dialogue_history") or []
        history_lines = []
        for t in dialogue_history[-8:]:
            speaker = "Student" if t.get("role") == "student" else "Tutor"
            history_lines.append(f"{speaker}: {t.get('text', '')}")

        # ── Build sources context ───────────────────────────────────────────
        assigned_sources = state.get("assigned_sources") or []
        sources_lines = []
        for s in assigned_sources[:4]:
            author_str = f" by {s['author']}" if s.get("author") else ""
            excerpt_str = f' — "{s["excerpt"]}"' if s.get("excerpt") else ""
            sources_lines.append(
                f"- {s.get('title', 'Primary Source')}{author_str}{excerpt_str}"
            )

        # ── System prompt: clean role framing ───────────────────────────────
        system_prompt = (
            f"You are a Socratic tutor in a rigorous university {domain} seminar.\n\n"
            "The student is analyzing a case study or primary source material. "
            "Any named individuals in the assignment (e.g., business owners, historical "
            "figures, characters) are subjects of the student's analysis — not the student "
            "themselves. Address the student as the analyst or advisor they are.\n\n"
            "Your task: Given the assignment, dialogue history, and the student's latest "
            "message, produce a structured JSON response.\n\n"
            "Guidelines:\n"
            "- Be conversational, warm, and intellectually rigorous\n"
            "- Your socratic_response must be 1-3 sentences (under 60 words) and end "
            "with exactly one question mark\n"
            "- Engage directly with whatever the student just said — follow their lead\n"
            "- When they make a claim or proposal, probe the trade-off or assumption "
            "they haven't examined\n"
            "- When they express uncertainty, reassure briefly and isolate the simplest "
            "starting question\n"
            "- When they greet or ask what to do, welcome them warmly and ask where "
            "they'd like to begin\n"
            "- Never give advice, recommendations, or direct answers\n"
            "- Never repeat a question already asked in the dialogue history\n"
            "- Generate 2 suggested_inquiries as first-person student intentions, not "
            "tutor questions\n\n"
            "Respond ONLY with a JSON object matching this schema:\n"
            f"{_TURN_SCHEMA}"
        )

        # ── User prompt: structured context sections ────────────────────────
        sections = [f"## Assignment\n{assignment_prompt}"]

        if sources_lines:
            sections.append("## Assigned Sources\n" + "\n".join(sources_lines))

        if history_lines:
            sections.append("## Dialogue History\n" + "\n".join(history_lines))

        sections.append(f"## Student's Latest Message\n{student_input}")

        if focused_text and focused_text != student_input:
            sections.append(f"## Student's Draft\n{focused_text}")

        if attempts > 0 and remediation:
            sections.append(f"## Correction Required\n{remediation}")

        user_prompt = "\n\n".join(sections)

        # ── Single LLM call with structured JSON output ─────────────────────
        gen = await llm_orchestrator.enhance(
            purpose="socratic_dialogue_turn",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            pseudonymous_seed=f"unified:{student_id}:{student_input[:64]}",
            max_characters=1200,
            max_tokens=300,
            allow_live=True,
            require_live=True,
            response_format={"type": "json_object"},
        )

        # ── Parse structured output ─────────────────────────────────────────
        try:
            raw = gen.content.strip()
            # Strip markdown code fences if the model wraps JSON in them
            raw = re.sub(r"^```[^\n]*\n?", "", raw).rstrip("`").strip()
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and "properties" in parsed and isinstance(parsed["properties"], dict):
                parsed = parsed["properties"]
            turn = UniversalSocraticTurn(**parsed)
            return turn.to_graph_state()
        except (json.JSONDecodeError, Exception) as exc:
            logger.warning(f"Structured output parsing failed: {exc}")
            extracted_text = None
            try:
                data = json.loads(re.sub(r"^```[^\n]*\n?", "", gen.content.strip()).rstrip("`").strip())
                if isinstance(data, dict):
                    if "properties" in data and isinstance(data["properties"], dict):
                        data = data["properties"]
                    extracted_text = data.get("socratic_response")
            except Exception:
                pass
            fallback_response = extracted_text or (
                gen.content if len(gen.content.split()) <= 60 and "?" in gen.content
                else "How would you like to begin analyzing the materials for this assignment?"
            )
            return {
                "draft_response": fallback_response,
                "discourse_phase": "orientation",
                "prompt_launchers": [],
                "hint_rung": None,
                "penalty_score": 0.0,
                "thoughts_of_tutorbot": {
                    "strategy_selected": "Unified LLM generation (structured parse fallback)",
                },
            }

    # ── Epistemic Action Packer ─────────────────────────────────────────────

    async def pack_epistemic_actions(self, state: TutorSessionState) -> dict[str, Any]:
        """
        Action Capsule & Learner Radar Packer.

        Suggestion chips (prompt_launchers) are now generated by the unified LLM call
        and arrive pre-populated in state. This method handles:
        - Action capsules: 1-click transfer of draft-ready claims to canvas
        - Learner radar: metacognitive progress indicator
        """
        focused_id = state.get("focused_block_id")
        is_hint = state.get("is_hint_requested", False)
        thoughts = state.get("thoughts_of_tutorbot") or {}

        # ── Action capsules ─────────────────────────────────────────────────
        capsules = []
        is_claim_ready = thoughts.get("is_claim_ready_for_draft", False)
        claim_summary = thoughts.get("student_claim_summary")

        if focused_id and not is_hint and is_claim_ready and claim_summary:
            snippet = (
                claim_summary if len(claim_summary) <= 180
                else claim_summary[:177] + "..."
            )
            capsules.append({
                "capsule_id": f"cap-{uuid4().hex[:8]}",
                "label": "Transfer formulated insight to draft",
                "suggested_student_text": snippet,
                "text_payload": snippet,
                "target_block_id": str(focused_id),
                "role": "claim",
                "rationale": "Transfer your formulated reasoning into your active canvas draft",
                "provenance": "action_capsule",
            })

        # ── Learner radar ───────────────────────────────────────────────────
        student_move = thoughts.get("student_move", "orientation")
        unexamined_tension = thoughts.get("unexamined_tension", "")

        stance_map = {
            "orientation": "Getting Started",
            "focus_selection": "Selecting Focus",
            "seeking_clarity": "Building Understanding",
            "structural_request": "Organizing Thinking",
            "substantive_claim": "Developing Argument",
        }
        stance = stance_map.get(student_move, "Exploring")

        learner_radar = {
            "dimension": "Socratic Inquiry Progress",
            "stance": stance,
            "summary": (
                f"Phase: {stance}"
                + (f" · Tension: {unexamined_tension[:60]}" if unexamined_tension else "")
            ),
            "next_step": "Continue developing your reasoning",
        }

        return {
            "action_capsules": capsules,
            "learner_radar": learner_radar,
        }
