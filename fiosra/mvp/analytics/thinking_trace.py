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
    content: str | None = None


@dataclass
class ReasoningNode:
    """A curated intellectual milestone on the reasoning trace."""
    timestamp: str
    kind: str  # premise, challenge, struggle, pivot, evidence, synthesis, submitted
    icon: str
    label: str
    content: str | None = None
    diff: dict[str, str] | None = None  # For pivots: {"before": "...", "after": "..."}
    insight: str | None = None


# ---------------------------------------------------------------------------
# Event → Activity Node mapping
# ---------------------------------------------------------------------------

_ACTIVITY_MAP: dict[str, tuple[str, str]] = {
    # (icon, label)
    "assignment_opened":              ("📋", "Opened assignment"),
    "source_document_opened":         ("📖", "Opened source material"),
    "source_exhibit_read":            ("📖", "Read case brief"),
    "student_prompt_submitted":       ("💬", "Sent message to tutor"),
    "tutor_turn_completed":           ("🤖", "Tutor responded"),
    "hint_delivered":                  ("🤖", "Tutor responded"),
    "canvas_section_saved":           ("✏️", "Saved draft"),
    "canvas_suggestion_offered":      ("💡", "Writing support offered"),
    "canvas_suggestion_accepted":     ("✅", "Applied writing support"),
    "canvas_suggestion_dismissed":    ("🙈", "Dismissed writing support"),
    "socratic_probe_offered":         ("⚡", "Marginalia probe offered"),
    "socratic_probe_response_submitted": ("💬", "Responded to probe"),
    "socratic_probe_deferred":        ("⏸️", "Deferred probe"),
    "socratic_probe_dismissed":       ("🙈", "Dismissed probe"),
    "student_submitted_for_review":   ("🏁", "Submitted for review"),
    "grade_finalised_by_educator":    ("🎓", "Educator finalized grade"),
    "misconception_flagged":          ("⚠️", "Misconception flagged"),
    "adversarial_probe_defended":     ("🛡️", "Integrity check passed"),
    "speech_to_thought_crystallized": ("💎", "Reflection crystallized"),
    "action_capsule_committed":       ("📌", "Applied action capsule"),
    "socratic_move_triggered":        ("🎯", "Socratic move triggered"),
}


def _event_to_activity_node(event: dict[str, Any]) -> ActivityNode:
    """Convert a raw session_event row into an ActivityNode."""
    event_type = event.get("event_type", "")
    payload = event.get("payload", {})
    timestamp = event.get("created_at", "")

    icon, label = _ACTIVITY_MAP.get(
        event_type, ("📋", event_type.replace("_", " ").title()),
    )

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
                    label="Initial premise",
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
                    label="Socratic challenge",
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
                    label="Marginalia probe",
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
                    label="Student wrestled with this",
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
                    label="Responded to probe",
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
                diff = payload.get("diff")
                if not diff and explicit_milestone == "pivot" and prev_save:
                    diff = {"before": prev_save["text"][:300], "after": text[:300]}
                nodes.append(ReasoningNode(
                    timestamp=timestamp,
                    kind=explicit_milestone,
                    icon=icon,
                    label=label,
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
                    label="Revised draft — mind changed",
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
                        label="Connected the decisions",
                        content=text[:500] if len(text) > 500 else text,
                    ))
                elif has_data:
                    nodes.append(ReasoningNode(
                        timestamp=timestamp,
                        kind="evidence",
                        icon="📊",
                        label="Grounded in evidence",
                        content=text[:500] if len(text) > 500 else text,
                    ))
                elif prev_save and _texts_differ_meaningfully(prev_save["text"], text):
                    nodes.append(ReasoningNode(
                        timestamp=timestamp,
                        kind="pivot",
                        icon="🔄",
                        label="Revised draft — mind changed",
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
                label="Submitted for review",
                content=f"Document revision {rev}" if rev else "Final submission",
            ))
            continue

    return [asdict(node) for node in nodes]
