[← Back to Views Architecture Index](./README.md)

# 00. Global Substrate: Unified Reactive Context Engine (`FiosraContextStore`)

**Category**: Global Context Infrastructure  
**Core Implementation**: `frontend/src/lib/contextStore.svelte.js` (Svelte 5 Runes)  
**Primary Function**: Guarantees that every view in Fiosra is 100% context-aware across courses, assignments, reasoning sessions, student attempts, and active canvas document blocks. Eliminates fragmented state, stale AI prompts, and session synchronization errors.

---

## 1. Problem & Architectural Rationale

In educational web applications, view state frequently fractures:
- **Editor / AI Disconnect**: Navigating or typing in an essay editor fails to inform the AI copilot what sentence or paragraph the student is working on. The student is forced to awkwardly copy-paste their text into the chat box.
- **Lost Multi-Tier Filters**: Moving from a cohort dashboard to an individual student trace loses the active course, module, or assignment filter.
- **Session Drift & Dropped Drafts**: Browser reloads cause session capability mismatches, premature draft overwrites, or `403 Forbidden` errors.

### The Invariant
> **No view in Fiosra renders in a context vacuum.**  
> Every component has immediate, reactive access to the active Course, Assignment, Session, Student, Active Document Block, and Target Knowledge Components.

---

## 2. Global Context Schema Specification

```typescript
interface FiosraContext {
  // Course Boundary
  courseId: string;              // Active course UUID (e.g. "00000000-0000-0000-0000-000000000001")
  courseTitle: string;           // E.g. "European Historical Transitions"
  courseCode: string;            // E.g. "HIST-201"
  
  // Curriculum Module Boundary
  moduleId: string;              // Active module UUID
  moduleTitle: string;           // E.g. "The French Fiscal Crisis & Estates-General"
  
  // Assignment Contract
  assignmentId: string;          // Public assignment UUID
  assignmentTitle: string;       // E.g. "Structural Causation in 1789"
  targetKCIds: string[];         // Target Knowledge Components (e.g. ["KC_HIST_FINANCE", "KC_HIST_CAUSATION"])
  bloomDemandLevel: string;      // "understand" | "analyze" | "evaluate" | "create"
  
  // Learner Session & Security Capability
  studentId: string;             // Persistent student ID (e.g. "student_clara_10")
  sessionId: string;             // Active reasoning session UUID
  sessionToken: string;          // Opaque capability token sent in 'X-Fiosra-Session-Token'
  sessionStatus: 'active' | 'submitted' | 'completed';
  
  // Canvas Active Document Focus (Dynamic Micro-Context)
  activeQuestionId: string;      // Current question context (e.g. "Q1")
  activeBlockId: string | null;  // UUID of the document block currently focused by cursor
  activeBlockType: string;       // "heading" | "paragraph" | "blockquote" | "claim" | "evidence"
  activeBlockText: string;       // Plaintext content of the focused block (injected into Socratic prompt)
  
  // Epistemic State & Telemetry Snapshot
  currentEpistemicState: string; // "STATE_0_UNANCHORED" | ... | "STATE_5_MASTERY"
  currentHintRung: number;       // 0 | 1 | 2 | 3
  authenticEffortScore: number;  // 0.0 - 1.0 (clamped active dwell / velocity)
}
```

---

## 3. Context Synchronization Topology

```
         ┌─────────────────────────────────────────────────────────┐
         │                       URL HASH                          │
         │  #/student/workspace?course_id=...&assignment_id=...    │
         └───────────────────────────┬─────────────────────────────┘
                                     │ (Bi-directional Sync)
                                     ▼
         ┌─────────────────────────────────────────────────────────┐
         │           FiosraContextStore (Svelte 5 Runes)           │
         │  • Reactive state: courseId, assignmentId, sessionId    │
         │  • Micro-state: activeBlockId, activeBlockText          │
         └─────────────┬─────────────────────────────┬─────────────┘
                       │                             │
        (Auto-Persist) │                             │ (Request Headers)
                       ▼                             ▼
         ┌───────────────────────────┐ ┌───────────────────────────┐
         │       localStorage        │ │    FastAPI / MCP Headers  │
         │ • Session Capability Token│ │ • X-Fiosra-Session-Token  │
         │ • Unsubmitted Auto-Save   │ │ • X-Assignment-ID         │
         └───────────────────────────┘ └───────────────────────────┘
```

### Synchronization Rules
1. **URL Hash as Single Routing Source of Truth**:
   - Every view synchronizes its primary entity IDs (`course_id`, `assignment_id`, `session_id`) to the URL query string.
   - Deep-linking directly to `#/studio/trace?session_id=8f3b6154` hydrates the entire context chain (fetching course, assignment, student metadata) without requiring the user to navigate through intermediate screens.
2. **Micro-Context Injection (Cursor $\to$ Copilot Drawer)**:
   - When the student clicks or types in a block on the Normal Canvas (`LongFormDocumentEditor.svelte`), the editor emits `fiosraContext.setFocusedBlock(blockId, type, text)`.
   - The Gemini UI drawer (`TutorChatDrawer.svelte`) automatically attaches this `activeBlockText` as context in the payload to `POST /events/socratic/turn`.
3. **Session Capability Shield**:
   - Whenever a session starts or resumes, the backend signs an ephemeral capability token: `fiosra-cap-{session_id}-{timestamp}`.
   - This token is saved to `localStorage.setItem('fiosra.session-access.' + sessionId, token)` and automatically attached as an `X-Fiosra-Session-Token` header on all API calls, preventing session spoofing.

---

## 4. Cross-View Context Transition Table

| Source View | Action / Transition | Context Hydrated / Forwarded | Target View |
| :--- | :--- | :--- | :--- |
| `01_student_courses_and_assignments.md` | Student clicks "Start Assignment" | Sets `courseId`, `assignmentId`, `targetKCIds` | `02_student_assignment_brief.md` |
| `02_student_assignment_brief.md` | Student clicks "Begin Reasoning Session" | Mints `sessionId`, saves `capabilityToken`, sets `currentRung = 0` | `03_student_canvas_workspace.md` |
| `03_student_canvas_workspace.md` | Student clicks "Submit Assignment" | Finalizes `sessionId`, sets `sessionStatus = 'submitted'` | `04_student_review_page.md` |
| `06_teacher_trace_cohort_level.md` | Teacher clicks a student dot on radar | Forwards `sessionId`, `studentId`, `assignmentId` | `05_teacher_trace_student_level.md` |
| `06_teacher_trace_cohort_level.md` | Teacher clicks "Intervene on Cluster" | Passes `assignmentId`, `clusterMisconceptionId`, `studentIds[]` | `08_teacher_intervention_view.md` |
| `07_teacher_evaluation_window.md` | Teacher clicks "Inspect Trace" | Forwards `sessionId` | `05_teacher_trace_student_level.md` |

---

## 5. Defensive Edge Cases & Safeguards
- **Malformed or Orphan URL Parameters**: If a user pastes a URL with an invalid `assignment_id`, the store catches the 404 from `GET /assignments/public/{id}` and cleanly redirects to `#/student/portal` with a notification toast.
- **Multi-Tab Concurrency**: Storage event listeners on `localStorage` detect if a newer draft revision was saved in another browser tab, warning the student before overwriting.
- **Offline Resiliency**: In the event of network disconnection, the context store caches the latest 5 minutes of telemetry and draft diffs locally in IndexedDB until connectivity is restored.
