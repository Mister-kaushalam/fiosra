[← Back to Views Architecture Index](./README.md)

# 01. Student View: Courses + Assignments Dashboard

**Route**: `#/student/portal` (alias: `#/student/courses`)  
**Component**: `frontend/src/routes/StudentPortal.svelte`  
**User Role**: Student  
**Primary Function**: The student's primary entry point. Displays the student's enrolled courses, curriculum progress, and active reasoning assignments.

---

## 1. Context Contract

### Inputs from Global Context / URL
- `studentId`: Extracted from `FiosraContextStore` or `localStorage.getItem('fiosra.student-id')`.
- `selectedCourseId` (optional URL filter): e.g. `#/student/portal?course_id=...`.

### Outputs Produced / Set into Context
When the student selects an assignment card:
- Sets `courseId`, `courseTitle`, `courseCode` in `FiosraContextStore`.
- Sets `assignmentId`, `assignmentTitle`, `targetKCIds` in `FiosraContextStore`.
- Routes to `#/student/home?assignment_id={id}&course_id={courseId}` (Assignment View).

---

## 2. Ideal UX Behavior & Layout

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ FIOSRA                                                  [Student: Clara V.] [Dark/Light]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ MY ENROLLED COURSES                                                                    │
│ ┌───────────────────────────┐ ┌───────────────────────────┐ ┌────────────────────────┐ │
│ │ HIST-201: Modern Europe   │ │ ECON-102: Fiscal Systems  │ │ + Join with Course Code│ │
│ │ 3 Modules • 2 Assignments │ │ 4 Modules • 1 Assignment  │ │                        │ │
│ └───────────────────────────┘ └───────────────────────────┘ └────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ACTIVE ASSIGNMENTS                                       [Filter: In-Progress / Due / All]│
│                                                                                        │
│ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 📝 The French Fiscal Crisis & Sovereign Debt Analysis                              │ │
│ │ Course: HIST-201 • Module: The Estates-General & Collapse                          │ │
│ │ Status: 🟡 In Progress (Turn 4 / Rung 1) • Last active: 2 hours ago                │ │
│ │ Target Concepts: [KC_HIST_FINANCE] [KC_HIST_CAUSATION]                             │ │
│ │ [Resume Reasoning Session]   [View Assignment Brief]                               │ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                        │
│ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 📝 Urban Sanitation & Social Stratification in Mohenjo-daro                        │ │
│ │ Course: ANTH-105 • Module: Indus Valley Civilization                               │ │
│ │ Status: ⚪ Not Started • Due in 4 days                                              │ │
│ │ Target Concepts: [KC_ARCH_DRAINAGE] [KC_ARCH_EVIDENCE]                             │ │
│ │ [Start Assignment]           [View Sources & Brief]                                │ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                        │
│ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 📜 Feudal Tenure & Manorial Obligations Essay                                      │ │
│ │ Course: HIST-201 • Module: Medieval Social Structures                              │ │
│ │ Status: 🟢 Submitted • Under Educator Review                                       │ │
│ │ [View My Submission & Review Dossier]                                              │ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Interaction Behaviors
1. **Durable Session Resumption**:
   - If the student has an active unsubmitted session for an assignment, the card displays `🟡 In Progress (Turn X)` with a prominent **Resume Reasoning Session** button.
   - Clicking it immediately restores the session capability from `localStorage.getItem('fiosra.session-access.{sessionId}')` and launches `#/student/workspace` with zero data loss.
2. **Post-Submission Handoff**:
   - If the assignment status is `submitted`, the button changes to **View My Submission & Review Dossier**, linking to `#/student/review?session_id={sessionId}`.
3. **Zero Data Hallucination**:
   - Course names, module counts, and assignment progress are retrieved from live API endpoints (`/courses`, `/assignments/public`); no hardcoded sample datasets are displayed.

---

## 3. Backend Data Connections

### Endpoints Invoked
1. `GET /courses`
   - Retrieves active course portfolio.
2. `GET /assignments/public`
   - Retrieves all published, answer-isolated assignment specifications.
3. `GET /events/session/active?student_id={studentId}`
   - Checks for active sessions and document drafts stored in the PostgreSQL EventStore.

### Data Model Mapping
```json
{
  "assignment_id": "c4a03282-30b5-4e5c-96f2-a2e4e0b7883a",
  "course_id": "00000000-0000-0000-0000-000000000001",
  "module_id": "00000000-0000-0000-0000-000000000002",
  "title": "The French Fiscal Crisis & Sovereign Debt Analysis",
  "status": "published",
  "active_session": {
    "session_id": "92de57f7-218d-41ca-9ba2-2890e75fcbd6",
    "status": "active",
    "current_rung": 1,
    "last_activity_at": "2026-09-17T21:40:00Z"
  }
}
```

---

## 4. Edge Cases & Safeguards
- **Unpublished Assignment Access**: If a student attempts to navigate directly to an unapproved draft assignment URL, the view redirects to `#/student/portal` with an alert: *"This assignment is currently in draft mode and not yet released by the instructor."*
- **Offline / Disconnected State**: If network connection drops, cached assignment briefs remain browsable, but the "Start Assignment" button displays a connectivity indicator.
