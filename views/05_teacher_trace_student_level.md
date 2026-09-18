[← Back to Views Architecture Index](./README.md)

# 05. Teacher View: Student-Level Trace (Epistemic Flight Recorder)

**Route**: `#/studio/trace` (alias: `#/student/trace?session_id={id}`)  
**Component**: `frontend/src/routes/StudentTrace.svelte`  
**User Role**: Teacher / Educator / Teaching Assistant  
**Primary Function**: The "Epistemic Flight Recorder" for an individual student attempt. Transforms raw telemetry into a readable cognitive journey. Enables an educator to diagnose in under 60 seconds whether a student authentically mastered the material, self-corrected through Socratic prompting, relied on rote copy-paste, or struggled at a specific reasoning plateau.

---

## 1. Context Contract

### Inputs from Global Context / URL
- `sessionId`: URL param `?session_id=...` or `FiosraContextStore.sessionId`.
- `assignmentId`: Inherited from session metadata.
- `studentId`: Inherited from session metadata.
- `teacherId`: Authenticated instructor credential from `FiosraContextStore`.

### Outputs Produced / Set into Context
- Selected turn index or scrubber timestamp for time-travel document inspection.
- Target student context sent to `#/studio/interventions?student_id={id}&session_id={id}`.

---

## 2. Ideal UX Behavior & Layout

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ FIOSRA TEACHER STUDIO > Student Trace: Clara V. (HIST-201)             [Back to Cohort] [Intervene ⚡] │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ⏱️ REASONING SCRUBBER (Total Active Time: 38 min • Total Turns: 4 • Epistemic State: STATE_5_MASTERY)  │
│ [0m: Start]───────[12m: Pivot 1]──────────────[24m: Turn 3]──────────────[36m: Rev 14]────[38m: Submit]│
│      ▲                   ▲                           ▲                         ▲              ▲        │
│   Anchored         Invalidated                 Corroborated                Pasted Text    Submitted    │
│   Royal Debt       Monarchy Spend              Exhibits A & B               Flag: 12 words (Verified)   │
├──────────────────────────────────────────────────────┬─────────────────────────────────────────────────┤
│ 🔍 COGNITIVE PIVOT INSPECTOR (Turn 2 / Minute 12)    │ 📊 TELEMETRY & AUTHENTICITY METRICS             │
├──────────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
│ 🛑 BEFORE SOCRATIC PROBE (Draft Revision 4):         │ • Active Dwell Time: 34m 12s (Clamped)          │
│ "The royal government collapsed because the King was │ • Idle Periods: 2 (Total: 4m 10s)               │
│ spending too much on Versailles and luxury parties." │ • Keystroke Velocity: 54 WPM (Organic)          │
│                                                      │ • Paste Events: 1 (14 chars: "Estates-General") │
│ 🤖 SOCRATIC COPILOT PROBE:                           │ • Authenticity Confidence: 96%                  │
│ "How does Necker's 1781 Compte Rendu (Exhibit A)     ├─────────────────────────────────────────────────┤
│ complicate this narrative regarding public solvency?"│ 🧬 GRAPHITI BI-TEMPORAL BELIEF EVOLUTION        │
│                                                      │                                                 │
│ ✅ AFTER SOCRATIC PROBE (Draft Revision 7):          │ ❌ INVALIDATED BELIEFS:                         │
│ "While royal spending caused resentment, Necker's    │ • Believes(RoyalExtravagance = PrimaryCause)    │
│ Compte Rendu masked structural debt from the         │   valid_at: 10:04 → invalidated_at: 10:16       │
│ American War, which archaic tax immunities prevented │                                                 │
│ the Crown from funding through ordinary revenue."    │ 🟢 ADOPTED & VERIFIED BELIEFS:                  │
│                                                      │ • Believes(TaxImmunity = StructuralCause)       │
│ 🎯 Epistemic Transition:                             │   valid_at: 10:16 → active                      │
│ STATE_1_CLAIM_ANCHORED → STATE_2_EVIDENCE_ATTACHED   │ • Believes(NeckerMaskedAmericanWarDebt)         │
│                                                      │   valid_at: 10:28 → active                      │
└──────────────────────────────────────────────────────┴─────────────────────────────────────────────────┘
```

### Key Interaction Behaviors
1. **The 60-Second Micro-Timeline Scrubber**:
   - The scrubber displays discrete milestone nodes:
     - 🟢 *Claim Anchored* (Rung 0)
     - 🔄 *Cognitive Pivot / Self-Correction* (Turn 2)
     - 📚 *Source Anchored* (Turn 3)
     - ⚠️ *Anomaly / Long Inactivity / Fast Paste* (Flagged if detected)
     - 🏁 *Final Submission*
   - Scrubbing along the timeline updates the document view on the left, allowing the teacher to see the student's text at that exact millisecond.
2. **Before / After Cognitive Pivot Inspector**:
   - Automatically identifies turns where the student revised their writing following a Socratic question.
   - Highlights the deleted misconception in red and the new evidence-backed reasoning in green.
3. **Clamped Active Dwell Time vs Idle Filtering**:
   - Raw elapsed time is filtered: idle gaps >3 minutes are highlighted in gray (e.g. bathroom break or distraction) and excluded from cognitive effort scoring.
4. **Authenticity & Provenance Heatmap**:
   - Displays color coding across all blocks:
     - **Green**: Organically typed text with natural cadence and backspace edits.
     - **Blue**: Quoted from Exhibit with recognized citation provenance.
     - **Red / Amber**: Pasted text without matching source exhibits (flags potential LLM generated paste).
5. **Direct Intervention Action**:
   - A sticky header button **"Intervene ⚡"** immediately routes the teacher to `#/studio/interventions` with this student and session pre-loaded.

---

## 3. Backend Data Connections

### Endpoints Invoked
1. `GET /events/session/{session_id}/trace`
   - Retrieves full event sequence from PostgreSQL `events` table (filtered to milestones, turns, and document revisions).
2. `GET /sessions/{session_id}/graphiti-state`
   - Queries Graphiti bi-temporal sub-graph for this student session:
     ```cypher
     MATCH (s:Student {id: $student_id})-[e:BELIEVES]->(kc:KnowledgeComponent)
     WHERE e.session_id = $session_id
     RETURN e.statement, e.valid_at, e.invalidated_at, e.status, e.confidence
     ORDER BY e.valid_at ASC
     ```
3. `GET /events/session/{session_id}/authenticity`
   - Returns aggregated dwell time, typing velocity, paste events, and authenticity risk index.

---

## 4. Edge Cases & Safeguards
- **Massive Keystroke Event Logs**: The backend pre-aggregates keystrokes into 5-second interval deltas so the browser never attempts to parse 10,000 raw DOM events.
- **In-Progress Sessions**: If the session is currently active (student is typing live), the scrubber displays a `🔴 LIVE` badge, with events appending via WebSocket or SSE.
- **Student Privacy & Instructor Role**: Teacher access requires valid role authorization (`teacher` or `admin`); student users are blocked with a `403 Forbidden` response.
