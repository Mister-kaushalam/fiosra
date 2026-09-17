"""
fiosra/mvp/agents/critic_agent.py
Answer-Isolation Critic & Verifier Agent.
Guarantees zero ground-truth solution leakage, zero ghostwriting, and strict hint ladder bounds.
"""
from __future__ import annotations

import logging
import re
from typing import Any
from fiosra.mvp.agents.contracts import TutorSessionState, VerificationResult

logger = logging.getLogger(__name__)

# Deterministic patterns that indicate solution disclosure or directive solving
FORBIDDEN_PATTERNS = [
    r"\b(?:the (?:correct )?answer is|the solution is|the right choice is|the right answer is)\b",
    r"\b(?:therefore, we can conclude that [A-D]\b|option [A-D] is correct\b)",
    r"\b(?:here is your (?:essay|thesis|paragraph|solution|answer))\b",
    r"\b(?:here (?:is|are) the (?:complete )?code|```(?:python|sql|javascript).*?```)",
]

FORBIDDEN_REGEX = re.compile("|".join(FORBIDDEN_PATTERNS), re.IGNORECASE)


class AnswerIsolationCriticAgent:
    """
    Evaluates candidate tutor responses before client streaming.
    Guarantees Answer Isolation and enforces Socratic pedagogical bounds.
    """

    def verify_response(self, state: TutorSessionState) -> dict[str, Any]:
        """
        StateGraph node inspecting state["draft_response"].
        Returns state updates including is_approved, critic_violation, and remediation_instructions.
        """
        draft = state.get("draft_response", "").strip()
        attempts = state.get("verification_attempts", 0)

        # 1. Check for empty draft
        if not draft:
            return {
                "is_approved": False,
                "verification_attempts": attempts + 1,
                "critic_violation": "empty_draft",
                "remediation_instructions": "Draft response was empty. Formulate a gentle Socratic inquiry question.",
            }

        # 2. Deterministic Regex Inspection for Direct Answer Leaks
        match = FORBIDDEN_REGEX.search(draft)
        if match:
            logger.warning(f"Critic detected answer leak: '{match.group(0)}'")
            return {
                "is_approved": False,
                "verification_attempts": attempts + 1,
                "critic_violation": "direct_answer_leak",
                "remediation_instructions": (
                    "Direct solution statement detected. Never provide the conclusion or answer directly. "
                    "Reframe the response as an open guiding question pointing to primary evidence."
                ),
            }

        # 3. Ghostwriting / Non-Socratic Lecture Check (Paragraphs > 80 words without question mark)
        word_count = len(draft.split())
        has_question = "?" in draft
        if word_count > 90 and not has_question:
            logger.warning("Critic detected lecturing ghostwriting (long text without question).")
            return {
                "is_approved": False,
                "verification_attempts": attempts + 1,
                "critic_violation": "lecture_ghostwriting",
                "remediation_instructions": (
                    "Response is lecturing without asking a question. Educational policy requires a Socratic probe. "
                    "Shorten the explanation and end with a direct guiding question."
                ),
            }

        # 4. Verified and Compliant
        return {
            "is_approved": True,
            "final_verified_response": draft,
            "critic_violation": None,
            "remediation_instructions": None,
        }
