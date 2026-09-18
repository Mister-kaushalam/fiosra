[← Back to Views Architecture Index](./README.md)

# 08. Teacher View: Intervention Station & Pedagogical Steering

**Route**: `#/studio/interventions` (alias: `#/studio/intervene?student_id={id}&session_id={id}`)  
**Component**: `frontend/src/routes/StudioIntervention.svelte`  
**User Role**: Teacher / Academic Mentor / Teaching Assistant  
**Primary Function**: The pedagogical steering control center. When a student or cohort cluster is diagnosed as at-risk, struggling at an epistemic plateau, or caught in an uncorrected misconception, this view provides actionable intervention levers: live Socratic probe injection, Neo4j prerequisite bridge assignments, and one-click diagnostic debrief generation.

---

## 1. Context Contract

### Inputs from Global Context / URL
- `studentId`: Single student ID (`?student_id=...`) or comma-separated list for cluster intervention (`?student_ids=...`).
- `sessionId`: The student's active or submitted reasoning session.
- `misconceptionId`: Optional target misconception to address (e.g., `MIS_TAX_IMMUNITY_1788`).

### Outputs Produced / Set into Context
- Emits real-time event: `TEACHER_INTERVENTION_DISPATCHED` to PostgreSQL and WebSocket stream.
- Injects a tagged Socratic prompt into the student's Gemini Copilot drawer.
- Links student to recommended prerequisite nodes in Neo4j.

---

## 2. Ideal UX Behavior & Layout

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ FIOSRA TEACHER STUDIO > Intervention Station > Target: Clara V. (or Cluster: 12 Students) [Back]       │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 🎯 DIAGNOSED REASONING PLATEAU                                                                         │
│ • Struggling Concept: [KC_HIST_FINANCE] Structural Debt vs Liquidity Shock                             │
│ • Detected Misconception: Attributing 1788 state bankruptcy solely to royal personal expenditures    │
│ • Current Epistemic State: STATE_1_CLAIM_ANCHORED (Stuck for 18 min on Rung 1)                        │
├──────────────────────────────────────────────────────┬─────────────────────────────────────────────────┤
│ 🛠️ INTERVENTION MODALITY 1: LIVE SOCRATIC PROBE       │ 🛠️ INTERVENTION MODALITY 2: KNOWLEDGE BRIDGE    │
├──────────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
│ Inject a targeted prompt directly into the student's │ Automatically traverse Neo4j upstream to assign │
│ active Gemini Copilot drawer in real time.           │ foundational prerequisite micro-exercises.      │
│                                                      │                                                 │
│ 🤖 Suggested AI Probes (Click to Adopt):             │ 🗺️ Upstream Neo4j Prerequisite Graph:           │
│ [A] "Look specifically at Table 3 of Exhibit A. Why  │ ┌──────────────────────┐                        │
│      did Necker separate 'ordinary' from             │ │ KC_HIST_REV_TAXATION │ (Prerequisite)         │
│      'extraordinary' war expenditures?"              │ └──────────┬───────────┘                        │
│                                                      │            │ -[:REQUIRES_PREREQUISITE]->        │
│ [B] "If royal luxury was the only cause, why did the │            ▼                                    │
│      Assembly of Notables refuse Calonne's land tax?"│ ┌──────────────────────┐                        │
│                                                      │ │ KC_HIST_FINANCE      │ (Currently Blocked)    │
│ ✍️ Custom Teacher Probe:                             │ └──────────────────────┘                        │
│ ┌──────────────────────────────────────────────────┐ │                                                 │
│ │ Clara, check line 14 of Exhibit B. Notice how    │ │ [⚡ Assign 5-Min Prerequisite Refresh Module]   │
│ │ Calonne describes the territorial subvention.    │ │                                                 │
│ └──────────────────────────────────────────────────┘ ├─────────────────────────────────────────────────┤
│ [🚀 Send Real-Time Probe with 🎓 Instructor Badge]  │ 🛠️ INTERVENTION MODALITY 3: ONE-ON-ONE DEBRIEF │
├──────────────────────────────────────────────────────┤                                                 │
│ 🛠️ INTERVENTION MODALITY 4: DRAFT BRANCHING          │ 📄 Auto-Generated Socratic Conference Sheet     │
│                                                      │ Includes student's current draft, exact missed  │
│ [🌱 Branch Draft to Turn 2 Checkpoint]               │ questions, and 3 discussion prompts for office  │
│ Allows student to rethink thesis without losing work.│ hours.                                          │
│                                                      │ [📥 Export PDF / Send Calendar Invite]          │
└──────────────────────────────────────────────────────┴─────────────────────────────────────────────────┘
```

### Key Interaction Behaviors
1. **Live Socratic Probe Injection**:
   - The instructor can draft a custom message or select from dynamically generated Socratic questions tailored to the student's exact misconception.
   - When dispatched, the message immediately arrives in the student's Gemini UI (`03_student_canvas_workspace.md`), tagged with a distinctive visual banner:  
     `🎓 Note from Instructor Professor Vance: "Check line 14 of Exhibit B..."`.
   - The student's subsequent reply is routed back through the Socratic engine with this instructor context preserved.
2. **Neo4j Prerequisite Knowledge Bridge**:
   - If the student lacks the foundational schema needed to answer the prompt, the teacher can click **"Assign 5-Min Prerequisite Refresh Module"**.
   - The backend creates an auxiliary learning ticket linked to the upstream Neo4j concept node (`KC_HIST_REV_TAXATION`) and surfaces a slide-over micro-lesson on the student's workspace.
3. **Cluster-Wide Broadcast Mode**:
   - If navigating from the Cohort Trace view with a cluster of 12 students selected, the intervention dispatches concurrently to all 12 active sessions.
   - Each student receives the scaffolding hint tailored to that specific misconception cluster.
4. **Pedagogical Branching & Rollback**:
   - If a student has backed themselves into an intellectual dead-end, the teacher can grant a "Cognitive Branching Token" allowing the student to fork their canvas back to Rung 1 with their earlier draft safely archived.

---

## 3. Backend Data Connections

### Endpoints Invoked
1. `POST /interventions/probe/inject`
   - Body:
     ```json
     {
       "session_id": "8f3b6154-1b4e-4f8e-a982-19e34e567890",
       "teacher_id": "00000000-0000-0000-0000-000000000002",
       "probe_text": "Clara, check line 14 of Exhibit B...",
       "priority": "high",
       "badge": "instructor_note"
     }
     ```
2. `POST /interventions/prerequisite/assign`
   - Queries Neo4j for upstream prerequisite modules and adds them to the student's study plan:
     ```cypher
     MATCH (kc:KnowledgeComponent {id: $target_kc})<-[:REQUIRES_PREREQUISITE]-(pre:KnowledgeComponent)
     RETURN pre.id, pre.title, pre.micro_module_url
     ```
3. `POST /interventions/branch/create`
   - Clones session document state at specified revision, creating a clean branch in the PostgreSQL EventStore.

---

## 4. Edge Cases & Safeguards
- **Student Offline / Disconnected**: If an intervention probe is sent while the student is offline, the message is queued in the PostgreSQL `events` table with status `pending_delivery` and automatically pinned to the Copilot drawer when the student next logs in.
- **Probe Flood Prevention**: An instructor cannot send more than 3 consecutive probes without a student response, preventing cognitive overwhelm.
- **Audit Logging**: All teacher interventions are timestamped and logged into the session audit ledger to measure intervention efficacy across the department.
