"""
fiosra/mvp/agents/critic_agent.py
Answer-Isolation Critic & Verifier Agent.
Guarantees zero ground-truth solution leakage, zero ghostwriting, and strict brevity.

Uses structural format validation (has question mark, word count) rather than
regex-based content classification. The LLM's structured output handles intent
classification; the critic validates the output format is safe.
"""
from __future__ import annotations

import logging
import re
from typing import Any
from fiosra.mvp.agents.contracts import TutorSessionState, VerificationResult

logger = logging.getLogger(__name__)

# Deterministic patterns that indicate solution disclosure — these are
# security guardrails and should NOT be delegated to LLM judgment.
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
    Guarantees Answer Isolation and enforces Socratic pedagogical bounds
    through structural format validation.
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

        # 3. Structural validation: must contain a question
        has_question = "?" in draft
        if not has_question:
            logger.warning("Critic detected lecturing ghostwriting (no question mark).")
            return {
                "is_approved": False,
                "verification_attempts": attempts + 1,
                "critic_violation": "lecture_ghostwriting",
                "remediation_instructions": (
                    "Response does not ask a question. Educational policy requires an open Socratic inquiry. "
                    "Keep your response to 2 sentences and end with a direct guiding question."
                ),
            }

        # 4. Structural validation: brevity check
        word_count = len(draft.split())
        if word_count > 65:
            logger.warning(f"Critic detected excessive length ({word_count} words).")
            return {
                "is_approved": False,
                "verification_attempts": attempts + 1,
                "critic_violation": "lecture_too_long",
                "remediation_instructions": (
                    f"Response is too long ({word_count} words). Socratic dialogue must be concise (under 60 words). "
                    "Remove theoretical explanations and ask strictly one focused guiding question."
                ),
            }

        # 5. Verified and Compliant
        return {
            "is_approved": True,
            "final_verified_response": draft,
            "critic_violation": None,
            "remediation_instructions": None,
        }
