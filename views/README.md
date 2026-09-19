# Fiosra View Architecture & Implementation Blueprint

This directory contains the detailed architectural specifications, behavioral models, and data contracts for all **Student** and **Teacher** views in Fiosra.

The specifications directly translate the **whiteboard pedagogical blueprint** into actionable, context-aware software components aligned with Fiosra's **Tri-Database Substrate** (PostgreSQL/pgvector, Neo4j, and Graphiti) and **LangGraph Multi-Agent Engine**.

---

## 🗺️ View Map & Navigation Topology

```
                                  STUDENT ATTEMPT
                           (Keystrokes, Dwell, Claims)
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
         [STUDENT VIEWS]                                  [TEACHER VIEWS]
  ┌─────────────────────────────┐                 ┌─────────────────────────────┐
  │ 01. Courses & Assignments   │                 │ 05. Student-Level Trace     │
  │     (Catalog & Enrolled)    │                 │     (Epistemic Recorder)    │
  │                             │                 │                             │
  │ 02. Assignment View         │                 │ 06. Cohort-Level Trace      │
  │     (Brief, Sources, KCs)   │                 │     (Class Radar & Triage)  │
  │                             │                 │                             │
  │ 03. In-Situ Workspace       │                 │ 07. Evaluation Window       │
  │     • Reasoning Canvas      │                 │     • Misconception Clusters│
  │     • Socratic Marginalia   │                 │     • Horizontal Grouping   │
  │     • Evidentiary Well      │                 │     • AutoSCORE Rubrics     │
  │                             │                 │                             │
  │ 04. Student Review Page     │                 │ 08. Intervention View       │
  │     (Reflection Dossier)    │                 │     • Seal Grade            │
  │     • Bi-temporal Timeline  │                 │     • Push Socratic Nudge   │
  │     • Self-Correction Diff  │                 │     • Prerequisite Bridge   │
  └─────────────────────────────┘                 └─────────────────────────────┘
                                         │
                                         ▼
                   09. DETERMINISTIC POLICY ENGINE
                    Initial State ────────► Ideal State
               (Flawed Rule / Bias)     (Grounded Multi-Causal Mastery)
```

---

## 📑 Specification Documents

| Document | View / Substrate Name | Role | Primary Function |
| :--- | :--- | :--- | :--- |
| **[`00_context_awareness.md`](./00_context_awareness.md)** | **Global Context Engine** | System | Reactive Context Store (`FiosraContextStore`), Session Capabilities, URL hash sync, and cursor micro-context. |
| **[`01_student_courses_and_assignments.md`](./01_student_courses_and_assignments.md)** | **Courses + Assignments** | Student | Course catalog, enrolled assignment dashboard, and status tracker (`#/student/portal`). |
| **[`02_student_assignment_brief.md`](./02_student_assignment_brief.md)** | **Assignment View** | Student | Prompt briefing, Bloom level, primary source excerpts, and session initialization (`#/student/home`). |
| **[`03_student_canvas_workspace.md`](./03_student_canvas_workspace.md)** | **In-Situ Workspace** | Student | In-situ reasoning workbench: Structured Canvas + cursor-anchored Socratic Marginalia + drag-and-drop Evidentiary Well (`#/student/workspace`). |
| **[`04_student_review_page.md`](./04_student_review_page.md)** | **Student Review Page** | Student | Post-submission reflection dossier, verbatim evidence citations, and Graphiti self-correction timeline (`#/student/review`). |
| **[`05_teacher_trace_student_level.md`](./05_teacher_trace_student_level.md)** | **Student Trace** | Teacher | 60-second micro-timeline scrubber, active dwell/provenance heatmap, before/after self-correction delta (`#/studio/trace`). |
| **[`06_teacher_trace_cohort_level.md`](./06_teacher_trace_cohort_level.md)** | **Cohort Trace** | Teacher | 3-minute class radar, 4-quadrant student triage matrix, class-wide misconception heatmap (`#/studio/cohort`). |
| **[`07_teacher_evaluation_window.md`](./07_teacher_evaluation_window.md)** | **Evaluation Window** | Teacher | Misconception clustering, horizontal multi-student grading, AutoSCORE rubric mapping with quote verification (`#/studio/review`). |
| **[`08_teacher_intervention_view.md`](./08_teacher_intervention_view.md)** | **Intervention Station** | Teacher | Action console: grade finalization, live Socratic probe injection, and Neo4j prerequisite bridge assignments (`#/studio/interventions`). |
| **[`09_deterministic_epistemic_policy.md`](./09_deterministic_epistemic_policy.md)** | **Deterministic Policy Engine** | Cognitive FSM | Formal cognitive state machine: Initial State (misconception/bias) $\to$ Ideal State (evidence-grounded mastery), Graphiti bi-temporal invalidation, and loop limits ($N=2$). |
| **[`10_epistemic_learning_loop_and_marginalia.md`](./10_epistemic_learning_loop_and_marginalia.md)** | **Epistemic Learning Loop & Marginalia** | Pedagogical FSM | The 7-step closed learning loop, Socratic Marginalia cognitive work allocation, Toulmin decomposition, and desirable difficulty slider. |
| **[`11_epistemic_trace_student_and_teacher_architecture.md`](./11_epistemic_trace_student_and_teacher_architecture.md)** | **Epistemic Trace Architecture** | Flight Recorder & Radar | Full trace lifecycle: in-situ Living Argument Tree, post-submission reflection dossier, student-level 60s scrubber, and cohort 4-quadrant radar. |

---

## 🔒 Core Invariants Across All Views

1. **Strict Context Awareness**: No view renders disconnected from its `course_id`, `assignment_id`, `session_id`, or `student_id`. Hash changes, page reloads, and browser storage remain bi-directionally synchronized.
2. **Answer Isolation**: Students never see reference answers, grading keys, or ghostwritten prose. The Answer-Isolation Critic intercepts every draft before client rendering.
3. **Data Provenance & Truthfulness**: Every badge, status, and quote is verified against PostgreSQL EventStore and Neo4j. The UI never mixes mock/example data with live student traces.
4. **Non-Manipulable Evaluation**: Suggested grades and rubrics are transparently anchored to verbatim student quote events (`Event #ID at Timestamp`); AI never determines grades autonomously without educator confirmation.
