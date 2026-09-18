[← Back to Views Architecture Index](./README.md)

# 07. Teacher View: Evaluation Window & Rubric Mapping

**Route**: `#/studio/review` (alias: `#/studio/evaluations?assignment_id={id}&session_id={id}`)  
**Component**: `frontend/src/routes/StudioReview.svelte`  
**User Role**: Teacher / Grader / Teaching Assistant  
**Primary Function**: The educator's grading and assessment cockpit. Replaces traditional manual grading with an evidence-anchored workflow: filters submissions by shared misconceptions, pre-maps essays to rubric criteria using the Critic Agent's AutoSCORE engine with verbatim citations, and allows side-by-side comparative grading to eliminate evaluation drift.

---

## 1. Context Contract

### Inputs from Global Context / URL
- `assignmentId`: Extracted from query `?assignment_id=...` or `FiosraContextStore.assignmentId`.
- `sessionId`: Currently selected student attempt to evaluate (`?session_id=...`).
- `filter`: Optional triage filter (`misconception_cluster=...`, `struggling_only=true`, `unreviewed_only=true`).

### Outputs Produced / Set into Context
- `activeEvaluation`: The finalized or draft evaluation object.
- Updates PostgreSQL `evaluations` table upon approval.
- Emits notification event to student: `SESSION_EVALUATED`.

---

## 2. Ideal UX Behavior & Layout

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ FIOSRA TEACHER STUDIO > Evaluation Cockpit: HIST-201 > French Fiscal Crisis [32/48 Graded] [Auto-Save]│
├──────────────────────────────────────────────────────┬─────────────────────────────────────────────────┤
│ 📋 SUBMISSION QUEUE (Grouped by Misconception)       │ ⚖️ COMPARATIVE MODE: [Single] [Side-by-Side (2)] │
│ 🔍 Filter: [All] [Struggling] [Unreviewed]           │ Currently Reviewing: Clara V. (Session: 8f3b61) │
├──────────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
│ ▼ Misconception: Royal Extravagance (12 students)    │ 📄 STUDENT ESSAY & REASONING BLOCKS             │
│   • Alex M.     [Draft: 280w | State: 1 | 🟡 Needs RV]│                                                 │
│   • Sarah K.    [Draft: 310w | State: 2 | 🟡 Needs RV]│ [Claim]                                         │
│ ▼ Cluster: Structural Tax Immunity (18 students)     │ "The collapse of the French Crown's finances in │
│   ► Clara V.    [Draft: 482w | State: 5 | 🟢 Auto-94] │ 1788 was not caused by individual royal         │
│   • David L.    [Draft: 440w | State: 4 | 🟢 Auto-88] │ extravagance, but by structural tax immunities  │
│ ▼ Flagged Anomalies (2 students)                     │ of the First and Second Estates..."             │
│   • Jason B.    [Draft: 510w | State: 3 | 🚩 Paste]   │                                                 │
├──────────────────────────────────────────────────────┤ [Evidence - Exhibit A]                          │
│ 🎯 AUTOSCORE RUBRIC CRITERIA (Critic Agent Mapped)   │ "In Necker's 1781 Compte Rendu, ordinary        │
│                                                      │ accounts masked significant extraordinary war   │
│ 1. Evidentiary Rigor & Source Corroboration [4/4]    │ obligations incurred during the American War..."│
│    🤖 AI Justification: Student correctly cited     │                                                 │
│    Exhibits A and B to contrast Necker & Calonne.    │ [Reasoning Block]                               │
│    [Agree / Keep 4] [Override: 1  2  3  4]           │ "This created an intractable structural deficit │
│                                                      │ that ordinary taxation could not address..."    │
│ 2. Structural Fiscal Causation [3.5/4]               │                                                 │
│    🤖 AI Justification: Student distinguished       │ 💬 INSTRUCTOR MARGINALIA & FEEDBACK             │
│    short-term liquidity shock from long-term debt.   │ ┌─────────────────────────────────────────────┐ │
│    [Agree / Keep 3.5] [Override: 1  2  3  4]         │ │ Excellent synthesis of Necker's hidden war  │ │
│                                                      │ │ debt. Consider noting how the Parlement of  │ │
│ 3. Counter-Hypothesis Weighing [3.5/4]               │ │ Paris weaponized public perception in 1787. │ │
│    🤖 AI Justification: Addressed Brienne but could │ └─────────────────────────────────────────────┘ │
│    elaborate on the Assembly of Notables' motives.   │                                                 │
│    [Agree / Keep 3.5] [Override: 1  2  3  4]         │ Final Calculated Grade: [ 94 ] / 100            │
├──────────────────────────────────────────────────────┴─────────────────────────────────────────────────┤
│ [Save Draft Evaluation]                     [⚡ Publish Grade & Send Dossier to Student] [Next Student ➤]│
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Interaction Behaviors
1. **Misconception-Centric Queueing**:
   - Instead of sorting students alphabetically, the sidebar groups submissions by the cognitive hurdles they encountered (extracted from Graphiti).
   - The instructor can grade all 12 students who struggled with "Royal Extravagance vs. Tax Immunities" in one sitting, drastically improving grading speed and feedback consistency.
2. **AutoSCORE Rubric Engine with Verbatim Anchoring**:
   - The `critic_agent` pre-evaluates the submitted essay against the assignment's defined rubric dimensions.
   - For every criterion score, the UI displays the exact sentence from the student's text that justified the mark.
   - The teacher can click to accept the AI suggestion with zero typing, or click an override pill (1–4) to adjust.
3. **Side-by-Side Comparative Grading Mode**:
   - Clicking **"Side-by-Side"** splits the main viewport to show two essays simultaneously (e.g., Clara V. vs. David L.).
   - Enables instructors to calibrate borderline grades and maintain equitable grading standards across the cohort.
4. **Instant Publishing to Student Review**:
   - Upon clicking **"Publish Grade & Send Dossier"**, the evaluation is committed to PostgreSQL, updating the status on the student's Review Page (`04_student_review_page.md`).

---

## 3. Backend Data Connections

### Endpoints Invoked
1. `GET /assignments/{assignment_id}/submissions`
   - Returns all student submissions with status, word count, epistemic state, and detected misconception cluster.
2. `GET /evaluations/autoscore/{session_id}`
   - Invokes or retrieves the `critic_agent` rubric assessment for this session.
3. `POST /evaluations/submit`
   - Commits finalized grade, criteria scores, and teacher comments.
   - Body:
     ```json
     {
       "session_id": "8f3b6154-1b4e-4f8e-a982-19e34e567890",
       "teacher_id": "00000000-0000-0000-0000-000000000002",
       "total_score": 94,
       "max_score": 100,
       "criteria_scores": [
         { "criterion_id": "evid_rigor", "score": 4, "max": 4, "override": false },
         { "criterion_id": "fiscal_causation", "score": 3.5, "max": 4, "override": false },
         { "criterion_id": "counter_weighing", "score": 3.5, "max": 4, "override": false }
       ],
       "feedback_text": "Excellent synthesis of Necker's hidden war debt...",
       "status": "published"
     }
     ```

---

## 4. Edge Cases & Safeguards
- **AI Hallucination Guardrail**: The Critic Agent's AutoSCORE output must link every point awarded to a character range offset in the student's submitted text. If no citation offset exists, the criterion is marked `⚠️ Requires Teacher Inspection`.
- **Grade Overwrite Protection**: If a teaching assistant and lead instructor open the same student evaluation concurrently, optimistic concurrency locking (`version_id`) prevents silent overwrites.
