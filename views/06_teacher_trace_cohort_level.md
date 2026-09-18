[← Back to Views Architecture Index](./README.md)

# 06. Teacher View: Cohort-Level Trace & Class Diagnostic Radar

**Route**: `#/studio/cohort` (alias: `#/studio/diagnostics?course_id={courseId}&assignment_id={assignmentId}`)  
**Component**: `frontend/src/routes/CohortDiagnostics.svelte`  
**User Role**: Teacher / Course Instructor / Department Chair  
**Primary Function**: The "3-Minute Class Diagnostic Radar". Aggregates real-time and completed student traces across an entire class section (30–200 students). Triages learners into a 4-Quadrant Diagnostic Matrix, clusters prevailing misconceptions across the cohort, and reveals system-level learning bottlenecks before the next lecture.

---

## 1. Context Contract

### Inputs from Global Context / URL
- `courseId`: URL param `?course_id=...` or `FiosraContextStore.courseId`.
- `assignmentId`: URL param `?assignment_id=...` or `FiosraContextStore.assignmentId`.
- `cohortFilter`: Optional section filter (e.g., `section_id=A`).

### Outputs Produced / Set into Context
- Selected student subset for bulk or single intervention: `targetStudentIds`.
- Click on any student dot transitions directly to `#/studio/trace?session_id={studentSessionId}`.
- Click on **"Intervene on Cluster"** transitions to `#/studio/interventions?cluster_id={misconceptionId}`.

---

## 2. Ideal UX Behavior & Layout

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ FIOSRA TEACHER STUDIO > Cohort Radar: HIST-201 > French Fiscal Crisis    [Active Students: 42/48]       │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 🎯 4-QUADRANT COHORT TRIAGE MATRIX                                                                     │
│                                                                                                        │
│   Epistemic Mastery (State 0-5)                                                                        │
│   ▲                                                                                                    │
│ 5 │    [ASSISTED MASTERY]               │            [INDEPENDENT MASTERY]                             │
│   │    • 8 Students                     │            • 19 Students                                     │
│ 4 │    (High mastery, moderate effort)  │            (High authentic effort, deep citations)          │
│   │                                     │                                                              │
│ 3 │─────────────────────────────────────┼─────────────────────────────────────────────                 │
│   │    [DISENGAGED / ANOMALOUS]         │            [PRODUCTIVE STRUGGLE / AT-RISK] ⚠️                │
│ 2 │    • 3 Students                     │            • 12 Students                                     │
│   │    (🚩 Flagged: High paste volume)  │            (High dwell time, repeated misconception loop)    │
│ 1 │                                     │                                                              │
│ 0 └─────────────────────────────────────┴─────────────────────────────────────────────► Active Dwell   │
│   0m                                   20m                                           60m               │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ⚠️ DOMINANT COHORT MISCONCEPTIONS & REASONING BOTTLENECK CLUSTERS                                      │
│                                                                                                        │
│ ┌────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 🔴 Cluster 1: "Royal Extravagance as Primary Insolvency Cause" (16 Students Stuck)                 │ │
│ │ • Targeted KC: KC_HIST_FINANCE (Deficit Structuring) • Turn Plateau: Turn 2 (Rung 1)               │ │
│ │ • Affected: Alex M., Sarah K., David L., +13 others...                                            │ │
│ │ [View Cluster Trace]  [⚡ Broadcast Socratic Counter-Probe to Cluster]  [Schedule Prerequisite]   │ │
│ └────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                        │
│ ┌────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 🟡 Cluster 2: "Necker's Compte Rendu Mistaken for Genuine Surplus" (9 Students Stuck)              │ │
│ │ • Targeted KC: KC_HIST_EVIDENCE (Auditing Primary Accounting) • Turn Plateau: Turn 3 (Rung 2)      │ │
│ │ • Affected: Marcus T., Elena P., +7 others...                                                      │ │
│ │ [View Cluster Trace]  [⚡ Broadcast Socratic Counter-Probe to Cluster]                             │ │
│ └────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 STUDENT ROSTER TRIAGE TABLE                                     [Export CSV] [Batch Intervene (0)]  │
│ Student Name   Status     Dwell Time   Pivots   Current State     Authenticity   Action                │
│ Clara V.       Submitted  38 min       2        STATE_5_MASTERY   96% (Organic)  [Inspect Trace]       │
│ David L.       Active 🟢  42 min       0        STATE_1_CLAIM     92% (Organic)  [⚡ Intervene]         │
│ Jason B.       Submitted   6 min       0        STATE_3_COUNTER   18% (🚩 Paste) [Flag for Review]     │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Interaction Behaviors
1. **Interactive 4-Quadrant Scatter Plot**:
   - Each bubble represents a student's attempt.
   - Bubble size = Word count of canvas essay.
   - Bubble color = Epistemic State (Red = State 0-1, Yellow = State 2-3, Green = State 4-5, Violet = Flagged Anomaly).
   - Hovering over a dot shows student name, active block, dwell time, and current Socratic turn.
   - Clicking a dot opens a quick slide-out with their live draft and link to full trace.
2. **Misconception Clustering Engine**:
   - Backend queries Graphiti bi-temporal edges to detect shared active `invalidated_at IS NULL` edges on known false beliefs.
   - Ranks misconception clusters by frequency and severity.
   - Offers one-click **"Broadcast Socratic Counter-Probe"** that feeds into the teacher intervention station.
3. **Pasting & LLM Plagiarism Guardrail**:
   - Students whose sessions register >60% pasted characters with typing velocity >200 WPM are automatically grouped into the **Anomalous** quadrant and highlighted in the roster.

---

## 3. Backend Data Connections

### Endpoints Invoked
1. `GET /analytics/cohort/{assignment_id}`
   - Returns aggregated student quadrant coordinates, dwell times, and current epistemic states.
2. `GET /analytics/cohort/{assignment_id}/misconceptions`
   - Queries Neo4j & Graphiti for co-occurring misconception nodes across students in this assignment:
     ```cypher
     MATCH (s:Student)-[e:BELIEVES]->(m:Misconception)
     WHERE e.assignment_id = $assignment_id AND e.invalidated_at IS NULL
     RETURN m.id, m.description, count(s) as affected_students, collect(s.id) as student_ids
     ORDER BY affected_students DESC
     ```
3. `POST /interventions/batch`
   - Dispatches a targeted scaffolding prompt or hint to an entire cluster of students simultaneously.

---

## 4. Edge Cases & Safeguards
- **Real-Time Polling vs SSE**: For active class sessions, the view uses Server-Sent Events (`GET /events/stream/cohort/{assignment_id}`) to update student positions on the quadrant without page reloads.
- **Large Cohort Performance (>500 students)**: Scatter plot switches from SVG DOM nodes to HTML5 Canvas / WebGL rendering to preserve 60fps interaction during large multi-section courses.
