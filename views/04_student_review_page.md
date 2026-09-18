[← Back to Views Architecture Index](./README.md)

# 04. Student View: Review & Reflection Dossier

**Route**: `#/student/review` (alias: `#/student/timeline?session_id={id}`)  
**Component**: `frontend/src/routes/StudentTimeline.svelte` (or `StudentReview.svelte`)  
**User Role**: Student  
**Primary Function**: Post-submission cognitive reflection and evaluation debrief. Allows the student to review their final submitted essay alongside an interactive epistemic timeline that visualizes their reasoning journey: the initial claims they made, misconceptions they encountered and self-corrected, primary source citations anchored, and feedback from the instructor.

---

## 1. Context Contract

### Inputs from Global Context / URL
- `sessionId`: URL param `?session_id=...` or `FiosraContextStore.sessionId`.
- `studentId`: Verified against the session owner in `FiosraContextStore` (students may only view their own submissions).

### Outputs Produced / Set into Context
- `reviewMode`: Active (`true`).
- `submissionDossier`: Full immutable record of the submitted document and epistemic timeline loaded from PostgreSQL and Graphiti.

---

## 2. Ideal UX Behavior & Layout

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ FIOSRA > HIST-201 > Assignment Review                    [Student: Clara V.] [Back]    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 📜 The French Fiscal Crisis & Sovereign Debt Analysis                                  │
│ Status: 🟢 Submitted on Sept 17, 2026 • Instructor Review: 🟡 In Progress              │
├──────────────────────────────────────────────────────┬─────────────────────────────────┤
│ 📄 FINAL SUBMITTED ESSAY                             │ 🧠 YOUR REASONING JOURNEY       │
├──────────────────────────────────────────────────────┼─────────────────────────────────┤
│ [Claim]                                              │ ⏱️ Epistemic Milestone Timeline │
│ The collapse of the French Crown's finances in 1788  │                                 │
│ was not caused by individual royal extravagance, but │ 🟢 Turn 1: Initial Formulation  │
│ by structural tax immunities of the First and Second │ • Anchored initial claim on     │
│ Estates, compounded by opaque war debt.              │   royal extravagance.           │
│                                                      │                                 │
│ [Evidence 1 - Exhibit A]                             │ 🔄 Turn 2: Cognitive Pivot      │
│ In Necker's 1781 Compte Rendu, ordinary accounts     │ • Confronted with Exhibit A.    │
│ masked significant extraordinary war obligations     │ • Invalidated naive claim:      │
│ incurred during the American Revolution.             │   "Royal debt was all lavish"   │
│                                                      │ • Adopted structural thesis.    │
│ [Evidence 2 - Exhibit B]                             │                                 │
│ When Calonne proposed a universal territorial stamp  │ 📚 Turn 3: Primary Evidence     │
│ duty to the Assembly of Notables in 1787, the        │ • Corroborated Calonne's land   │
│ privileged orders resisted reform, precipitating the │   tax resistance in 1787.       │
│ fiscal deadlock that forced the Estates-General.     │                                 │
│                                                      │ 🏆 Turn 4: Synthesis Reached    │
│ [Counter-Argument Refutation]                        │ • Addressed Brienne's short-term│
│ While Brienne's monetary maneuvers exacerbated bank  │   missteps vs long-term causes. │
│ runs in August 1788, the fundamental insolvency was  │                                 │
│ an institutional failure of tax exemptions.          ├─────────────────────────────────┤
│                                                      │ 📊 DEMONSTRATED COMPETENCIES    │
│ Word Count: 482 words • Reading Time: 2 min          │ • [KC_HIST_FINANCE] ⭐ Mastered │
│ Citations: 2 Primary Exhibits Verified               │ • [KC_HIST_CAUSATION] ⭐ Mastered│
│                                                      │ • [KC_HIST_EVIDENCE] ⭐ Mastered │
└──────────────────────────────────────────────────────┴─────────────────────────────────┘
```

### Key Interaction Behaviors
1. **Self-Correction Highlighting (Before / After)**:
   - When the student clicks on **"Turn 2: Cognitive Pivot"** in the timeline, the essay viewer highlights the exact paragraph that was rewritten, showing a diff or side-by-side view:
     - *Draft 1*: "The King spent all the money on Versailles and luxury parties."
     - *Final Revision*: "Structural tax immunities of the privileged estates prevented the Crown from servicing sovereign debt."
2. **Epistemic Growth Graph**:
   - Visualizes the transition through the deterministic state policy:
     `STATE_0_UNANCHORED` $\to$ `STATE_1_CLAIM_ANCHORED` $\to$ `STATE_2_EVIDENCE_ATTACHED` $\to$ `STATE_3_COUNTER_WEIGHED` $\to$ `STATE_5_MASTERY`.
3. **Teacher Evaluation Card (When Available)**:
   - Once the instructor reviews the submission via the Evaluation Window, the status pill changes from `🟡 In Progress` to `🟢 Graded: 94 / 100`, revealing qualitative rubric scores, targeted teacher marginalia, and recommended next modules.

---

## 3. Backend Data Connections

### Endpoints Invoked
1. `GET /sessions/{session_id}/dossier`
   - Returns the complete immutable evidence dossier compiled by `learner_evidence_agent`:
     - Submitted document blocks and timestamps.
     - Socratic dialogue turns.
     - Graphiti belief evolution (`valid_at`, `invalidated_at` records).
     - Automated rubric check scores and educator feedback if finalized.
2. `GET /evaluations/session/{session_id}`
   - Returns teacher evaluation record if already reviewed.

### Data Model Mapping
```json
{
  "session_id": "8f3b6154-1b4e-4f8e-a982-19e34e567890",
  "student_id": "00000000-0000-0000-0000-000000000001",
  "submitted_at": "2026-09-17T22:30:00Z",
  "final_epistemic_state": "STATE_5_MASTERY",
  "competencies_mastered": [
    "KC_HIST_FINANCE",
    "KC_HIST_CAUSATION",
    "KC_HIST_EVIDENCE"
  ],
  "epistemic_pivots": [
    {
      "turn": 2,
      "invalidated_belief": "Royal extravagance was the primary driver of 1788 bankruptcy",
      "adopted_belief": "Archaic tax immunities created irrecoverable structural deficits",
      "trigger_exhibit": "Exhibit A (Compte Rendu)"
    }
  ],
  "teacher_review": {
    "status": "pending",
    "grade": null,
    "comments": null
  }
}
```

---

## 4. Edge Cases & Safeguards
- **In-Progress Access Block**: If a student navigates to `#/student/review` for a session that has not yet been submitted, the router redirects them back to `#/student/workspace?session_id={sessionId}` with a notice: *"This assignment has not been submitted yet. Continue working on your canvas."*
- **Privacy Enforcement**: The backend verifies `student_id` against the authenticated session token. A student cannot access another student's review dossier.
