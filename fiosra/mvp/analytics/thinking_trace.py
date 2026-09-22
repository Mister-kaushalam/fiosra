"""Dual Timeline Trace: Reasoning Trace + Activity Log.

Reads session_events chronologically and produces two views:
1. **Activity Log** — every event as a timeline node.
2. **Reasoning Trace** — curated intellectual milestones only.
"""

from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

@dataclass
class ActivityNode:
    """A single mechanical event on the activity timeline."""
    timestamp: str
    kind: str
    icon: str
    label: str
    stage: str | None = None
    eyebrow: str | None = None
    content: str | None = None


@dataclass
class ReasoningNode:
    """A curated intellectual milestone on the reasoning trace."""
    timestamp: str
    kind: str  # premise, challenge, struggle, pivot, evidence, synthesis, submitted
    icon: str
    label: str
    stage: str | None = None
    eyebrow: str | None = None
    content: str | None = None
    diff: dict[str, str] | None = None  # For pivots: {"before": "...", "after": "..."}
    insight: str | None = None


# ---------------------------------------------------------------------------
# Event → Activity Node mapping
# ---------------------------------------------------------------------------

_ACTIVITY_MAP: dict[str, tuple[str, str, str, str]] = {
    # (icon, label, stage, eyebrow)
    "assignment_opened":              ("📋", "Opened assignment", "Framing", "INITIALIZATION"),
    "source_document_opened":         ("📖", "Opened source material", "Exploration", "SOURCE INQUIRY"),
    "source_exhibit_read":            ("📖", "Read case brief", "Exploration", "EXHIBIT STUDY"),
    "student_prompt_submitted":       ("💬", "Sent message to tutor", "Deliberation", "LEARNER PROMPT"),
    "tutor_turn_completed":           ("🤖", "Tutor responded", "Deliberation", "SOCRATIC DIALOGUE"),
    "hint_delivered":                  ("🤖", "Tutor responded", "Deliberation", "SOCRATIC HINT"),
    "canvas_section_saved":           ("✏️", "Saved draft", "Drafting", "CANVAS REVISION"),
    "canvas_suggestion_offered":      ("💡", "Writing support offered", "Guidance", "WRITING SUPPORT"),
    "canvas_suggestion_accepted":     ("✅", "Applied writing support", "Drafting", "SUPPORT APPLIED"),
    "canvas_suggestion_dismissed":    ("🙈", "Dismissed writing support", "Drafting", "SUPPORT DISMISSED"),
    "socratic_probe_offered":         ("⚡", "Marginalia probe offered", "Friction", "CONCEPT PROBE"),
    "socratic_probe_response_submitted": ("💬", "Responded to probe", "Reflection", "PROBE RESPONSE"),
    "socratic_probe_deferred":        ("⏸️", "Deferred probe", "Reflection", "PROBE DEFERRED"),
    "socratic_probe_dismissed":       ("🙈", "Dismissed probe", "Reflection", "PROBE DISMISSED"),
    "student_submitted_for_review":   ("🏁", "Submitted for review", "Submission", "FINAL SUBMISSION"),
    "grade_finalised_by_educator":    ("🎓", "Educator finalized grade", "Evaluation", "SEALED GRADE"),
    "misconception_flagged":          ("⚠️", "Misconception flagged", "Friction", "MISCONCEPTION"),
    "adversarial_probe_defended":     ("🛡️", "Integrity check passed", "Reflection", "INTEGRITY CHECK"),
    "speech_to_thought_crystallized": ("💎", "Reflection crystallized", "Reflection", "CRYSTALLIZATION"),
    "action_capsule_committed":       ("📌", "Applied action capsule", "Drafting", "ACTION CAPSULE"),
    "socratic_move_triggered":        ("🎯", "Socratic move triggered", "Guidance", "SOCRATIC MOVE"),
}


def _event_to_activity_node(event: dict[str, Any]) -> ActivityNode:
    """Convert a raw session_event row into an ActivityNode."""
    event_type = event.get("event_type", "")
    payload = event.get("payload", {})
    timestamp = event.get("created_at", "")

    mapping = _ACTIVITY_MAP.get(
        event_type, ("📋", event_type.replace("_", " ").title(), "Activity", event_type.upper().replace("_", " ")),
    )
    icon, label, stage, eyebrow = mapping[0], mapping[1], mapping[2], mapping[3]

    # Extract content snippet
    content = None
    if event_type == "student_prompt_submitted":
        content = payload.get("student_input", "")
    elif event_type in ("tutor_turn_completed", "hint_delivered"):
        content = payload.get("response_text", "")
        if content and len(content) > 200:
            content = content[:200] + "…"
    elif event_type in ("source_document_opened", "source_exhibit_read"):
        content = payload.get("title") or payload.get("source_title") or payload.get("section", "")
    elif event_type == "assignment_opened":
        content = payload.get("title") or "Assignment workspace initialized"
    elif event_type == "canvas_section_saved":
        section_id = payload.get("section_id", "")
        revision = payload.get("revision", "")
        content = f"{section_id} — revision {revision}" if section_id else None
    elif event_type == "socratic_probe_offered":
        content = payload.get("question") or payload.get("focus_type", "")
    elif event_type == "socratic_probe_response_submitted":
        content = payload.get("response_text", "")
    elif event_type == "student_submitted_for_review":
        rev = payload.get("document_revision", "")
        content = f"Document revision {rev}" if rev else None

    return ActivityNode(
        timestamp=timestamp,
        kind=event_type,
        icon=icon,
        label=label,
        stage=stage,
        eyebrow=eyebrow,
        content=content,
    )


# ---------------------------------------------------------------------------
# Canvas text extraction helpers
# ---------------------------------------------------------------------------

def _extract_canvas_text(payload: dict[str, Any]) -> str:
    """Extract the student's written text from a canvas_section_saved payload."""
    text = (
        payload.get("plaintext")
        or payload.get("content_text")
        or payload.get("text")
        or payload.get("student_text")
        or ""
    )
    if not text:
        blocks = payload.get("blocks") or payload.get("content", {}).get("blocks", [])
        if isinstance(blocks, list):
            text = " ".join(
                b.get("plaintext", "") or b.get("text", "")
                for b in blocks
                if isinstance(b, dict)
            )
    return text.strip()


def _texts_differ_meaningfully(text_a: str, text_b: str) -> bool:
    """Check if two canvas texts differ beyond trivial whitespace/punctuation."""
    def normalize(t: str) -> str:
        return " ".join(t.lower().split())
    na, nb = normalize(text_a), normalize(text_b)
    if na == nb:
        return False
    words_a, words_b = set(na.split()), set(nb.split())
    diff = words_a.symmetric_difference(words_b)
    return len(diff) > 3


_DATA_PATTERN = re.compile(
    r"\d+%|\d+\.\d+|€\d+|\$\d+|\bsurvey\b|\bdata\b|\btable\b|\bfigure\b|\bcase\b",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_activity_log(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build the full mechanical activity timeline from raw session events."""
    return [asdict(_event_to_activity_node(event)) for event in events]


def build_reasoning_trace(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build the curated intellectual timeline from raw session events.

    Extracts meaningful reasoning milestones:
    - First canvas save → premise
    - Socratic challenges (tutor turns, probes) → challenge
    - Student responses to challenges → struggle
    - Canvas revisions with changed content → pivot
    - Canvas saves citing data/evidence → evidence
    - Final submission → submitted
    """
    nodes: list[ReasoningNode] = []
    canvas_saves: list[dict[str, Any]] = []
    first_canvas_seen = False
    challenge_pending = False

    for event in events:
        event_type = event.get("event_type", "")
        payload = event.get("payload", {})
        timestamp = event.get("created_at", "")

        # --- PREMISE: First meaningful canvas save ---
        if event_type == "canvas_section_saved" and not first_canvas_seen:
            text = _extract_canvas_text(payload)
            if text and len(text) > 20:
                first_canvas_seen = True
                section_id = payload.get("section_id") or "location"
                canvas_saves.append({"timestamp": timestamp, "text": text, "section_id": section_id})
                nodes.append(ReasoningNode(
                    timestamp=timestamp,
                    kind="premise",
                    icon="💡",
                    label="Reframed problem into initial hypothesis",
                    stage="Framing",
                    eyebrow="FRAMING",
                    content=text[:500] if len(text) > 500 else text,
                ))
            continue

        # --- CHALLENGE: Socratic tutor turn or marginalia probe ---
        if event_type in ("tutor_turn_completed", "hint_delivered"):
            response = payload.get("response_text", "")
            if "?" in response:
                nodes.append(ReasoningNode(
                    timestamp=timestamp,
                    kind="challenge",
                    icon="⚠️",
                    label="Socratic friction introduced",
                    stage="Exploration",
                    eyebrow="EXPLORATION",
                    content=response[:500] if len(response) > 500 else response,
                ))
                challenge_pending = True
            continue

        if event_type == "socratic_probe_offered":
            question = payload.get("question", "")
            if question:
                nodes.append(ReasoningNode(
                    timestamp=timestamp,
                    kind="challenge",
                    icon="⚠️",
                    label="Marginalia probe prompted reconsideration",
                    stage="Exploration",
                    eyebrow="EXPLORATION",
                    content=question[:500] if len(question) > 500 else question,
                ))
                challenge_pending = True
            continue

        # --- STRUGGLE: Student responding to a challenge ---
        if event_type == "student_prompt_submitted" and challenge_pending:
            text = payload.get("student_input", "")
            if text:
                nodes.append(ReasoningNode(
                    timestamp=timestamp,
                    kind="struggle",
                    icon="🤔",
                    label="Deliberated key trade-offs and tensions",
                    stage="Deliberation",
                    eyebrow="DELIBERATION",
                    content=text[:500] if len(text) > 500 else text,
                ))
                challenge_pending = False
            continue

        if event_type == "socratic_probe_response_submitted":
            text = payload.get("response_text", "")
            if text:
                nodes.append(ReasoningNode(
                    timestamp=timestamp,
                    kind="struggle",
                    icon="🤔",
                    label="Addressed friction with clarified rationale",
                    stage="Deliberation",
                    eyebrow="DELIBERATION",
                    content=text[:500] if len(text) > 500 else text,
                ))
                challenge_pending = False
            continue

        # --- PIVOT / EVIDENCE / SYNTHESIS: Subsequent canvas saves ---
        if event_type == "canvas_section_saved" and first_canvas_seen:
            text = _extract_canvas_text(payload)
            if not text or len(text) < 20:
                continue

            section_id = payload.get("section_id") or "general"
            explicit_milestone = payload.get("milestone")
            prev_save = canvas_saves[-1] if canvas_saves else None
            canvas_saves.append({"timestamp": timestamp, "text": text, "section_id": section_id})

            if explicit_milestone:
                icon = payload.get("icon") or (
                    "🔄" if explicit_milestone == "pivot" else
                    "📊" if explicit_milestone == "evidence" else
                    "🧩" if explicit_milestone == "synthesis" else "💡"
                )
                label = payload.get("label") or explicit_milestone.replace("_", " ").title()
                stage_val = "Assumption testing" if explicit_milestone == "pivot" else ("Evidence grounding" if explicit_milestone == "evidence" else ("Synthesis" if explicit_milestone == "synthesis" else "Exploration"))
                eyebrow_val = explicit_milestone.upper().replace("_", " ")
                diff = payload.get("diff")
                if not diff and explicit_milestone == "pivot" and prev_save:
                    diff = {"before": prev_save["text"][:300], "after": text[:300]}
                nodes.append(ReasoningNode(
                    timestamp=timestamp,
                    kind=explicit_milestone,
                    icon=icon,
                    label=label,
                    stage=stage_val,
                    eyebrow=eyebrow_val,
                    content=text[:500] if len(text) > 500 else text,
                    diff=diff,
                    insight=payload.get("insight"),
                ))
                continue

            # Check if this section was saved before (a revision of the same section)
            prior_same_section = [s for s in canvas_saves[:-1] if s.get("section_id") == section_id]
            is_revision = bool(prior_same_section) and _texts_differ_meaningfully(prior_same_section[-1]["text"], text)

            if is_revision:
                base = prior_same_section[-1]["text"]
                nodes.append(ReasoningNode(
                    timestamp=timestamp,
                    kind="pivot",
                    icon="🔄",
                    label="Reframed hypothesis after testing assumptions",
                    stage="Assumption testing",
                    eyebrow="ASSUMPTION TESTING",
                    content=text[:500] if len(text) > 500 else text,
                    diff={
                        "before": base[:300],
                        "after": text[:300],
                    },
                ))
            else:
                # Check for synthesis: connecting multiple decisions together
                _SYNTHESIS_PATTERN = re.compile(r"\ball 4\b|\ball four\b|\binterlock\b|\bconnect\b|\bstrategy\b|\bmarketing mix\b", re.IGNORECASE)
                is_synthesis = bool(_SYNTHESIS_PATTERN.search(text))
                has_data = bool(_DATA_PATTERN.search(text))

                if is_synthesis:
                    nodes.append(ReasoningNode(
                        timestamp=timestamp,
                        kind="synthesis",
                        icon="🧩",
                        label="Connected decisions into unified strategic argument",
                        stage="Synthesis",
                        eyebrow="SYNTHESIS",
                        content=text[:500] if len(text) > 500 else text,
                    ))
                elif has_data:
                    nodes.append(ReasoningNode(
                        timestamp=timestamp,
                        kind="evidence",
                        icon="📊",
                        label="Grounded argument in empirical case evidence",
                        stage="Evidence grounding",
                        eyebrow="EVIDENCE GROUNDING",
                        content=text[:500] if len(text) > 500 else text,
                    ))
                elif prev_save and _texts_differ_meaningfully(prev_save["text"], text):
                    nodes.append(ReasoningNode(
                        timestamp=timestamp,
                        kind="pivot",
                        icon="🔄",
                        label="Reframed hypothesis after testing assumptions",
                        stage="Assumption testing",
                        eyebrow="ASSUMPTION TESTING",
                        content=text[:500] if len(text) > 500 else text,
                        diff={
                            "before": prev_save["text"][:300],
                            "after": text[:300],
                        },
                    ))
            continue

        # --- SUBMITTED ---
        if event_type == "student_submitted_for_review":
            rev = payload.get("document_revision", "")
            nodes.append(ReasoningNode(
                timestamp=timestamp,
                kind="submitted",
                icon="🏁",
                label="Assignment authored and submitted for review",
                stage="Submission",
                eyebrow="FINAL SUBMISSION",
                content=f"Document revision {rev}" if rev else "Final submission",
            ))
            continue

    return [asdict(node) for node in nodes]
