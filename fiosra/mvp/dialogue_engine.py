import logging
import re
from typing import Any

from fiosra.mvp.llm.orchestrator import llm_orchestrator
from fiosra.mvp.graph_service import graph_service

logger = logging.getLogger(__name__)

# Patterns attempting to elicit ground-truth solutions or execute jailbreaks
ADVERSARIAL_PATTERNS = [
    r"\b(?:give|tell|show|reveal|hand|output|write)\s+(?:me\s+)?(?:the\s+)?(?:exact\s+)?(?:final\s+)?(?:answer|solution|result|key|thesis\s+statement)\b",
    r"\bjust\s+(?:tell|give|show|write)\s+(?:me)?\b",
    r"\bwhat\s+(?:is|are)\s+the\s+(?:exact\s+)?(?:final\s+)?(?:answer|solution|rubric|key)\b",
    r"\bsolve\s+(?:it|this)\s+(?:for\s+me)?\b",
    r"\bdo\s+(?:the\s+)?(?:math|calculation|essay|writing)\s+for\s+me\b",
    r"\b(?:ignore|disregard)\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions|rules|constraints|guidelines)\b",
    r"\byou\s+are\s+now\s+in\s+dan\s+mode\b",
    r"\brepeat\s+(?:the\s+)?(?:system\s+prompt|prompt\s+above)\b",
    r"\bdump\s+(?:all\s+)?(?:hidden\s+)?(?:prompt|instructions|keys|answers)\b",
    r"\b(?:admin|administrator|teacher|superintendent)\s+mode\b",
    r"\bi\s+am\s+(?:your\s+)?(?:teacher|instructor|professor|evaluator)\b",
    r"\bbypass\s+(?:safety|rules|guardrails)\b",
]

ADVERSARIAL_REGEX = re.compile("|".join(ADVERSARIAL_PATTERNS), re.IGNORECASE)



class SocraticDialogueEngine:
    """
    Answer-Isolated Socratic Dialogue Engine.
    Enforces strict Answer Isolation (ground-truth reference keys are never passed into prompt context),
    deterministic adversarial guardrails against solution extraction, and 4-rung non-manipulable
    hint ladders with penalty progression (Δ = 0.25 per rung).
    """

    def is_adversarial_attempt(self, student_input: str) -> bool:
        """Checks whether the student is attempting to force-extract solutions or jailbreak constraints."""
        return bool(ADVERSARIAL_REGEX.search(student_input.strip()))

    def generate_hint_ladder(self, question_prompt: str) -> list[dict[str, Any]]:
        """Generate a generic answer-blind ladder when an assignment-specific one is unavailable."""
        return [
            {"rung": 0, "label": "Orientation", "text": "What observation or course detail would make your claim most defensible?"},
            {"rung": 1, "label": "Conceptual Anchor", "text": "Separate the evidence stated in the source from the inference you are making from it."},
            {"rung": 2, "label": "Mechanistic Bridge", "text": "Write one sentence connecting a specific detail to your claim, then test an alternative explanation."},
            {"rung": 3, "label": "Target Synthesis", "text": "Revise your claim so it remains bounded by the evidence and addresses a reasonable limitation."},
        ]

    def build_adversarial_rejection(

        self,
        question_prompt: str,
        current_rung: int = 0,
    ) -> dict[str, Any]:
        """
        Constructs a firm, supportive Socratic rejection refusing to provide answers.
        """
        probes = [
            "I hear you! However, in Fiosra, my mission is to help you master the material yourself rather than doing the thinking for you. Let's look back at the prompt together: what is the first clue or keyword you notice?",
            "I know this can feel challenging, but revealing the solution won't build your mastery. Let's take it one small step at a time: what do you think is happening in this scenario?",
            "My role as your Socratic guide is to walk beside you, not hand you the destination. What initial idea or assumption can we test first?",
        ]
        chosen_probe = probes[current_rung % len(probes)]
        return {
            "is_adversarial": True,
            "thoughts_of_tutorbot": {
                "student_claim_analyzed": "Direct solution solicitation / guardrail evasion attempt.",
                "identified_error": "Adversarial answer begging detected.",
                "max_permitted_hint_level": current_rung,
                "strategy_selected": "Deflect solution demand with Socratic redirection.",
                "affective_adjustment": "Warm, encouraging, and firm on boundary.",
            },
            "response_text": chosen_probe,
            "hint_rung": current_rung,
            "penalty_score": current_rung * 0.25,
        }

    async def generate_response(
        self,
        student_input: str,
        question_prompt: str,
        domain: str = "history",
        current_rung: int = 0,
        hint_requested: bool = False,
        hint_ladder: list[Any] | None = None,
        target_kcs: list[str] | None = None,
        is_course_grounded: bool = False,
        active_section_context: str | None = None,
        student_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Generates a Socratic response while strictly maintaining Answer Isolation.
        """
        # 1. Adversarial Guardrail Check
        if self.is_adversarial_attempt(student_input):
            return self.build_adversarial_rejection(question_prompt, current_rung)

        # 2. Advance Hint Rung if requested
        active_rung = current_rung
        if hint_requested:
            active_rung = min(current_rung + 1, 3)

        penalty_score = active_rung * 0.25

        # 2b. Agentic LangGraph State Machine Execution
        if not (hint_ladder and is_course_grounded):
            try:
                from fiosra.mvp.agents.graph import socratic_tutor_graph
                agent_state = {
                    "session_id": str(student_id or "anonymous_session"),
                    "student_id": str(student_id or "anonymous_student"),
                    "question_prompt": question_prompt,
                    "student_input": student_input,
                    "active_kc_id": target_kcs[0] if target_kcs else "*",
                    "current_rung": current_rung,
                    "hint_requested": hint_requested,
                    "domain": domain,
                }
                graph_result = await socratic_tutor_graph.ainvoke(
                    agent_state,
                    config={"configurable": {"thread_id": str(student_id or "anonymous_session")}},
                )
                if graph_result.get("adversarial_flag"):
                    return {
                        "is_adversarial": True,
                        "thoughts_of_tutorbot": graph_result.get("thoughts_of_tutorbot", {}),
                        "response_text": graph_result.get("final_verified_response") or graph_result.get("draft_response"),
                        "hint_rung": graph_result.get("current_rung", current_rung),
                        "penalty_score": graph_result.get("penalty_score", 0.0),
                    }
                if graph_result.get("is_approved") and graph_result.get("final_verified_response"):
                    diag_trap = graph_result.get("diagnosed_misconception")
                    return {
                        "is_adversarial": False,
                        "thoughts_of_tutorbot": graph_result.get("thoughts_of_tutorbot", {}),
                        "response_text": graph_result["final_verified_response"],
                        "hint_rung": graph_result.get("current_rung", active_rung),
                        "penalty_score": graph_result.get("penalty_score", penalty_score),
                        "matched_misconception_id": diag_trap.get("misconception_id") if diag_trap else None,
                        "matched_probe_id": None,
                        "matched_kc_id": diag_trap.get("kc_id") if diag_trap else None,
                        "generation_metadata": {
                            "orchestrator": "LangGraph",
                            "critic_approved": True,
                        },
                    }
            except Exception as e:
                logger.warning(f"LangGraph socratic_tutor_graph execution fallback: {e}")

        # 3. Diagnose Potential Misconceptions via Neo4j Pedagogical Graph search
        matched_misconception = None
        matching_probe = None
        traps = []
        if not (hint_ladder and is_course_grounded):
            try:
                target_kc_filter = target_kcs[0] if target_kcs else "*"
                traps = await graph_service.search_misconceptions(query=student_input, kc_id=target_kc_filter, limit=1)
                if not traps and target_kc_filter != "*":
                    traps = await graph_service.search_misconceptions(query=student_input, kc_id="*", limit=1)
            except Exception as e:
                logger.error(f"Failed to search misconceptions via pedagogical graph: {e}")
                
        if traps:
            matched_misconception = traps[0]
        if (
            matched_misconception
            and is_course_grounded
            and target_kcs
            and matched_misconception.get("kc_id") not in target_kcs
        ):
            # A domain-wide taxonomy match is not enough: it must be relevant to the
            # public assignment's own learning objectives before it can shape a tutor turn.
            matched_misconception = None

        # 4. Generate Socratic Dialogue output based on hint rung and diagnosis
        if matched_misconception:
            probes = matched_misconception.get("probes") or []
            matching_probe = next((p for p in probes if p.get("rung") == active_rung), None) or (probes[0] if probes else None)
            rung_hint = matching_probe.get("probe_text") if matching_probe else None

            if not rung_hint:
                hints = matched_misconception.get("remediation_hint", "").split("\n")
                for h in hints:
                    if f"[Rung {active_rung}]" in h:
                        rung_hint = h.replace(f"[Rung {active_rung}]: ", "").strip()
                        break
                if not rung_hint and hints:
                    rung_hint = hints[0].replace("[Rung 0]: ", "").strip()

            strategy = f"Address diagnosed misconception: '{matched_misconception['name']}' at Rung {active_rung}."
            tutor_thoughts = {
                "student_claim_analyzed": student_input,
                "identified_error": matched_misconception["flawed_rule"],
                "max_permitted_hint_level": active_rung,
                "strategy_selected": strategy,
                "affective_adjustment": "Supportive inquiry targeted at flawed rule.",
            }
            response_text = rung_hint or (
                f"Consider how '{matched_misconception['name']}' might be influencing your reasoning. "
                "How would you re-examine this claim?"
            )
        else:
            # Contextual Socratic Scaffolding based on student input and active rung
            assignment_hint = None
            if hint_ladder and hint_requested:
                for hint in hint_ladder:
                    hint_level = hint.get("level") if isinstance(hint, dict) else getattr(hint, "level", None)
                    if hint_level == active_rung:
                        is_locked = hint.get("is_locked", False) if isinstance(hint, dict) else getattr(hint, "is_locked", False)
                        if not is_locked:
                            assignment_hint = hint.get("content") if isinstance(hint, dict) else getattr(hint, "content", None)
                        break

            text_lower = student_input.lower()
            if any(w in text_lower for w in ["counter", "challenge", "alternative", "against"]):
                strat = "Challenge claim with counter-evidence"
                resp = "If we test your claim against the assigned exhibits, what contradictory evidence or alternative framework presents the strongest challenge?"
            elif any(w in text_lower for w in ["premise", "assumption", "presuppose", "unstated"]):
                strat = "Unpack unstated premise and causal assumption"
                resp = "What implicit premise are you taking for granted regarding the causal mechanisms connecting these actions to the observed outcomes?"
            elif any(w in text_lower for w in ["evidence", "ground", "source", "document", "exhibit", "citation"]):
                strat = "Guide evidence grounding in assigned exhibits"
                resp = "Which specific passage, data point, or case record in the assigned exhibit best substantiates this interpretation over an alternative?"
            elif len(student_input.split()) <= 4:
                strat = "Elaborate conceptual focus"
                resp = f"How would you connect your focus on '{student_input.strip()}' to the core questions and frameworks in the assignment prompt?"
            else:
                rung_strategies = {
                    0: (
                        "Metacognitive probe: Prompt student to inspect their assumptions.",
                        f"Take a moment to reflect on your explanation: what evidence or reason led you to this conclusion regarding '{student_input[:60]}'?",
                    ),
                    1: (
                        "Conceptual nudge: Highlight foundational concepts without giving away steps.",
                        "Which specific evidence, data, or concept in the assigned exhibits supports this interpretation?",
                    ),
                    2: (
                        "Procedural guide: Point to concrete next analytical step.",
                        "Name the observation, the inference, and one alternative explanation in three connected sentences.",
                    ),
                    3: (
                        "Worked analogy: Provide isomorphic model with different context.",
                        "How can you synthesize these points into a qualified thesis that addresses alternative interpretations?",
                    ),
                }
                strat, resp = rung_strategies.get(active_rung, rung_strategies[0])

            tutor_thoughts = {
                "student_claim_analyzed": student_input,
                "identified_error": "No specific catalogued misconception trap triggered.",
                "max_permitted_hint_level": active_rung,
                "strategy_selected": strat,
                "affective_adjustment": "Inquisitive and guided reflection.",
            }
            response_text = assignment_hint if (hint_requested and assignment_hint) else resp

        # Pedagogical Knowledge Graph: Fetch student's active cognitive traps & mastered components
        historical_context = ""
        if student_id:
            try:
                ped_state = await graph_service.get_student_pedagogical_state(str(student_id))
                active_misconceptions = ped_state.get("active_misconceptions", [])
                mastered_kcs = ped_state.get("mastered_kcs", [])
                parts = []
                if active_misconceptions:
                    misc_desc = ", ".join([f"{m.get('name')}: {m.get('flawed_rule', '')}" for m in active_misconceptions if m.get('name')])
                    if misc_desc:
                        parts.append(f"Student has known cognitive traps: {misc_desc}")
                if mastered_kcs:
                    parts.append(f"Student has mastered concepts: {', '.join(mastered_kcs)}")
                if parts:
                    historical_context = " | ".join(parts)
            except Exception as e:
                logger.warning(f"Pedagogical state retrieval failed: {e}")

        generation = await llm_orchestrator.enhance(
            purpose="socratic_dialogue_turn",
            system_prompt=(
                f"You are an expert Socratic tutor in a university {domain} seminar. "
                "Your pedagogical mission is to guide the student toward independent critical thinking and evidence-grounded analysis. "
                "Engage directly and specifically with the student's message, claim, or question. "
                "Output exactly one focused, intellectually rigorous Socratic inquiry ending in a question mark. "
                "Never give away the final thesis, direct answers, or do the writing for the student. "
                "Push the student to interrogate their assumptions, substantiate their claims with specific exhibits, "
                "or explain the causal links between principles and real-world outcomes."
                + (f"\n\nStudent's learning context:\n{historical_context}" if historical_context else "")
            ),
            user_prompt=(
                f"Course Assignment Prompt:\n{question_prompt}\n\n"
                f"Student's Message / Inquiry:\n{student_input}\n\n"
                f"Active Canvas Draft Context:\n{active_section_context or 'General reasoning'}\n\n"
                f"Tutor Guidance Objective (Rung {active_rung}):\n{response_text}"
            ),
            deterministic_fallback=response_text,
            pseudonymous_seed=f"dialogue:{student_id}:{student_input[:64]}:{active_rung}",
            max_characters=450,
            max_tokens=120,
            allow_live=True,
        )
        response_text = generation.content

        return {
            "is_adversarial": False,
            "thoughts_of_tutorbot": tutor_thoughts,
            "response_text": response_text,
            "hint_rung": active_rung,
            "penalty_score": penalty_score,
            "matched_misconception_id": matched_misconception["misconception_id"] if matched_misconception else None,
            "matched_probe_id": matching_probe.get("probe_id") if matching_probe else None,
            "matched_kc_id": matched_misconception.get("kc_id") if matched_misconception else None,
            "generation_metadata": generation.metadata.as_dict(),
        }


dialogue_engine = SocraticDialogueEngine()
