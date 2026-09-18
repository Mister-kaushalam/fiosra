[← Back to Views Architecture Index](./README.md)

# 02. Student View: Assignment Brief & Orientation

**Route**: `#/student/home` (alias: `#/student/assignment?assignment_id={id}`)  
**Component**: `frontend/src/routes/StudentHome.svelte`  
**User Role**: Student  
**Primary Function**: The cognitive orientation gateway for an assignment. Presents the central inquiry prompt, primary source exhibits, target Knowledge Components (KCs), and cognitive demand level (Bloom taxonomy). Issues or resumes a secure session capability token before launching the workspace.

---

## 1. Context Contract

### Inputs from Global Context / URL
- `assignmentId`: Extracted from query string `?assignment_id=...` or `FiosraContextStore.assignmentId`.
- `courseId`: Extracted from `FiosraContextStore.courseId` or query string `?course_id=...`.
- `studentId`: Extracted from `FiosraContextStore.studentId` or session authentication cookie.

### Outputs Produced / Set into Context
When the student clicks **"Begin Reasoning Session"** or **"Resume Session"**:
1. Checks for an active session via `GET /events/session/active?student_id={studentId}&assignment_id={assignmentId}`.
2. If none exists, issues `POST /sessions` with `{ student_id, assignment_id }`, receiving `{ session_id, capability_token, current_rung: 0 }`.
3. Persists token into `localStorage.setItem('fiosra.session-access.' + session_id, capability_token)`.
4. Updates `FiosraContextStore`:
   - `sessionId = session_id`
   - `currentRung = 0`
   - `epistemicState = 'STATE_0_UNANCHORED'`
   - `assignmentTitle = response.title`
   - `targetKCIds = response.target_kc_ids`
5. Navigates to `#/student/workspace?session_id={sessionId}`.

---

## 2. Ideal UX Behavior & Layout

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ FIOSRA > HIST-201 > Assignment Brief                     [Student: Clara V.] [Back]    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 📜 The French Fiscal Crisis & Sovereign Debt Analysis                                  │
│ Module 2: The Estates-General & Collapse • Target Bloom Level: [EVALUATE / SYNTHESIZE] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│ ┌───────────────────────────────────────────────────┐ ┌──────────────────────────────┐ │
│ │ 🎯 CENTRAL INQUIRY PROMPT                         │ │ 🧠 TARGET COMPETENCIES       │ │
│ │ "Evaluate whether the collapse of the French      │ │ • [KC_HIST_FINANCE]          │ │
│ │ Crown's finances in 1788 was caused primarily by  │ │   Structural deficits & debt │ │
│ │ archaic tax immunities or by short-term fiscal    │ │ • [KC_HIST_CAUSATION]        │ │
│ │ mismanagement under Calonne and Brienne. Your     │ │   Multi-causal synthesis     │ │
│ │ analysis must cite at least two primary source    │ │ • [KC_HIST_EVIDENCE]         │ │
│ │ documents and address counter-arguments."         │ │   Corroborating perspectives │ │
│ │                                                   │ ├──────────────────────────────┤ │
│ │ Estimated Duration: 45-60 min                     │ │ 📊 RUBRIC DIMENSIONS FOCUS   │ │
│ │ Recommended Structure: Claim - Evidence - Refute  │ │ 1. Evidentiary Rigor         │ │
│ └───────────────────────────────────────────────────┘ │ 2. Structural Fiscal Logic   │ │
│                                                       │ 3. Counter-Hypothesis Weighing││
│ ┌───────────────────────────────────────────────────┐ └──────────────────────────────┘ │
│ │ 📚 PRIMARY SOURCE EXHIBITS (Click to Preview)     │                                  │
│ │ ┌───────────────────────────────────────────────┐ │                                  │
│ │ │ 📄 Exhibit A: Compte Rendu au Roi (Necker)    │ │                                  │
│ │ │ 1781 Public accounting of the royal treasury  │ │                                  │
│ │ ├───────────────────────────────────────────────┤ │                                  │
│ │ │ 📄 Exhibit B: Calonne's Address to Notables   │ │                                  │
│ │ │ 1787 Proposal for universal territorial tax   │ │                                  │
│ │ ├───────────────────────────────────────────────┤ │                                  │
│ │ │ 📄 Exhibit C: Cahiers de Doléances Excerpts   │ │                                  │
│ │ │ Grievances of the Third Estate regarding salt │ │                                  │
│ │ └───────────────────────────────────────────────┘ │                                  │
│ └───────────────────────────────────────────────────┘                                  │
│                                                                                        │
│ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ ⚡ READY TO BEGIN?                                                                  │ │
│ │ The Socratic Copilot will challenge and support your reasoning step-by-step.       │ │
│ │ You will write claims, cite evidence, and defend your conclusions on the Canvas.   │ │
│ │                                                                                    │ │
│ │ [🚀 Begin Reasoning Session (Turn 1)]    [💾 Resume Saved Draft (Turn 3 / Rung 1)] │ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Interaction Behaviors
1. **Answer-Isolation Guardrail**:
   - The view requests `GET /assignments/public/{id}`. The backend guarantees that model solutions, hidden probe strategies, and critic scoring rubrics are completely stripped from this payload.
2. **Primary Source Document Pre-reader**:
   - Clicking an exhibit card opens an inline slide-over reader showing the full excerpt with source provenance, translation notes, and historical context.
   - Text can be highlighted and selected, preparing the student to pull evidence directly into the Canvas workspace.
3. **Session State Auto-Detection**:
   - If an active unsubmitted session is found in PostgreSQL for this student + assignment combination, the view disables "Begin New Session" (to prevent orphan sessions) and prompts "Resume Saved Draft (Turn X)", restoring the exact draft text and Socratic chat history.

---

## 3. Backend Data Connections

### Endpoints Invoked
1. `GET /assignments/public/{assignment_id}`
   - Returns public assignment metadata, inquiry prompt, sources, Bloom level, and target KC IDs.
2. `GET /events/session/active?student_id={studentId}&assignment_id={assignment_id}`
   - Returns existing session ID, draft document, and current rung if active.
3. `POST /sessions`
   - Payload:
     ```json
     {
       "student_id": "00000000-0000-0000-0000-000000000001",
       "assignment_id": "c4a03282-30b5-4e5c-96f2-a2e4e0b7883a",
       "initial_state": "STATE_0_UNANCHORED"
     }
     ```
   - Response:
     ```json
     {
       "session_id": "8f3b6154-1b4e-4f8e-a982-19e34e567890",
       "capability_token": "fiosra-cap-8f3b6154-...",
       "created_at": "2026-09-17T22:15:00Z"
     }
     ```

---

## 4. Edge Cases & Safeguards
- **Student Already Submitted**: If the student has already finalized and submitted this assignment, the primary CTA changes to `[View Review Dossier & Grade]`, redirecting to `#/student/review?session_id={sessionId}`.
- **Concurrent Tab Collision**: If the student has this assignment open in another browser tab, the capability token heartbeat verifies single-writer concurrency to prevent draft overwrites.
- **Missing Assignment ID**: If accessed without an `assignment_id` param, redirects automatically to `#/student/portal` with an error toast.
