[← Back to Views Architecture Index](./README.md)

# 03. Student View: In-Situ Evidentiary Workspace (Canvas & Socratic Marginalia)

**Route**: `#/student` (alias: `#/student/workspace?session_id={id}`)  
**Component**: `frontend/src/routes/StudentWorkspace.svelte`  
**Sub-Components**:  
- `frontend/src/lib/LongFormDocumentEditor.svelte` (Structured Reasoning Canvas - ProseMirror)  
- `frontend/src/lib/SocraticMarginaliaGutter.svelte` (In-Situ Paragraph-Anchored Probe Cards)  
- `frontend/src/lib/PrimarySourcesSidebar.svelte` (Evidentiary Well - Interactive Exhibit Reader)  
- `frontend/src/lib/TutorChatDrawer.svelte` (On-Demand Macro-Dialogue Drawer)  
**User Role**: Student  
**Primary Function**: The core active learning and reasoning environment. Integrates a structured long-form writing canvas with an interactive primary source reader and cursor-anchored Socratic marginalia. Eliminates chat-induced cognitive offloading and the split-attention effect by embedding pedagogical challenges directly in the margin adjacent to the student's claims.

---

## 1. Pedagogical Rationale & Scientific Pivot: Why We Moved Away from Generic Chat

### The Research-Backed Pivot
In traditional edtech implementations, AI tutoring is bolted onto a document editor as a **50/50 split-screen chatbox** (document on left, ChatGPT-style conversation on right).

Recent empirical research across **Cognitive Load Theory (John Sweller)**, **HCI literature (CHI 2024/2025 papers on Human-AI Writing Interfaces)**, and the **Learning Sciences (Stanford HAI, Harvard Derek Bok Center)** reveals that the generic sidebar chatbox produces four severe learning failures:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                   THE 4 PATHOLOGIES OF TRADITIONAL SIDEBAR CHAT TUTORING                         │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. The Split-Attention Effect (Sweller, CLT):                                                    │
│    Learners must constantly shift gaze between a 500-word document and an external chat column,  │
│    burning working memory on spatial-temporal remapping rather than deep conceptual synthesis.   │
│                                                                                                  │
│ 2. The "Oracle / Copy-Paste" Reflex:                                                             │
│    Conversational chat interfaces condition students into passive consumers. Instead of writing, │
│    students ask: "What should I write next?" or "Summarize Exhibit A", offloading critical sense-│
│    making to the model.                                                                          │
│                                                                                                  │
│ 3. Context De-anchoring & Discussion Drift:                                                      │
│    Within 3 chat turns, the dialogue wanders into high-level abstractions, leaving the actual    │
│    draft on the canvas abandoned and unrevised.                                                  │
│                                                                                                  │
│ 4. "Blank Prompt" Paralysis:                                                                     │
│    Novice learners do not possess the metacognitive maturity to formulate effective prompts in a │
│    blank text area (`[Type your message...]`), leading to frustration and disengagement.        │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### The In-Situ Solution
Fiosra pivots to an **In-Situ Evidentiary Reasoning Workbench**:
- **Zero Gaze Shift (Spatial Proximity)**: Socratic inquiries appear in the **gutter directly adjacent to the active claim paragraph**, mirroring traditional academic marginalia.
- **Evidentiary Drag-and-Drop**: Primary sources are an active evidentiary well where students highlight historical text and drag it into their essay as `#evidence` blocks.
- **Visual Epistemic Feedback**: Rewriting a flawed sentence immediately turns the margin probe green, visually capturing the self-correction in real time.
- **On-Demand Macro Dialogue**: The full chat drawer is retained but repositioned as a secondary, on-demand tool for open-ended brainstorming and structural outlining.

---

## 2. In-Situ Workspace Layout Wireframe

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ FIOSRA > HIST-201 > French Fiscal Crisis                  [Rung 1/3: Evidentiary Anchor] [Auto-saved]  │
├──────────────────────────────┬───────────────────────────────────────────┬─────────────────────────────┤
│ 📚 PRIMARY SOURCE EXHIBITS   │ 📝 STRUCTURED REASONING CANVAS            │ 🧠 SOCRATIC MARGINALIA      │
│ (The Evidentiary Well)       │ (The Student's Voice)                     │ (Anchored to Focused Block) │
├──────────────────────────────┼───────────────────────────────────────────┼─────────────────────────────┤
│ [Exhibit A: Necker 1781]     │ Title: The Structural Breakdown of 1788   │                             │
│ "...the ordinary accounts of │                                           │                             │
│ the King showed an apparent  │ [Claim Block 1] 🏷️ #claim                 │ ┌─────────────────────────┐ │
│ surplus of 10M livres, while │ The French monarchy collapsed in 1788     │ │ 🎯 Socratic Challenge:  │ │
│ extraordinary war debt was   │ primarily because of the lavish spending  │ │ You've claimed royal    │ │
│ sustained by Dutch loans..." │ of Louis XVI at Versailles. |             │ │ luxury caused collapse. │ │
│                              │                                           │ │ Look at line 2 of       │ │
│ [Exhibit B: Calonne 1787]    │ [Evidence Block 2] 🏷️ #evidence           │ │ Exhibit A. How does     │ │
│ "...impossible to tax the    │ [Highlight from Exhibit A or drag quote]  │ │ Necker's ordinary       │ │
│ Third Estate further; we     │                                           │ │ budget surplus challenge│ │
│ must establish a universal   │ [Reasoning Block 3] 🏷️ #reasoning         │ │ this premise?           │ │
│ territorial subvention..."   │ The public was unaware of the true debt...│ └─────────────────────────┘ │
│                              │                                           │ [Reply in Margin] [Dismiss] │
│ [Drag excerpt to Canvas ➔]   │ [+ Add Block: Claim / Evidence / Nuance]  │                             │
├──────────────────────────────┴───────────────────────────────────────────┴─────────────────────────────┤
│ 💬 NEED A MACRO-DISCUSSION? [Open Full Socratic Dialogue Drawer ↗]                         [Submit Work]│
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Context Contract

### Inputs from Global Context / URL
- `sessionId`: URL param `?session_id=...` or `FiosraContextStore.sessionId`.
- `capabilityToken`: `localStorage.getItem('fiosra.session-access.' + sessionId)`. Required for all write/event/chat requests.
- `assignmentId`: Inherited from active session.
- `courseId`: Inherited from active session.

### Outputs Produced / Set into Context
- `activeBlock`: `{ blockId: "b1", type: "claim", text: "...", offsetTop: 240 }`.
- `activeSourceQuote`: Highlighted text from exhibits with source ID and offsets.
- `documentRevision`: Monotonically increasing revision integer emitted on every snapshot.
- `epistemicState`: Dynamically updated from Socratic turn metadata (`STATE_0_UNANCHORED` $\to$ `STATE_5_MASTERY`).
- `currentRung`: Socratic rung progression (Rung 0: Anchor $\to$ Rung 1: Evidence $\to$ Rung 2: Counter $\to$ Rung 3: Synthesis).

---

## 4. Key Interaction Behaviors

### A. The In-Situ Socratic Marginalia Gutter
1. **Vertical Alignment with Focused Paragraph**:
   - As the student clicks into or types in `Claim Block 1`, the Socratic probe card slides smoothly in the right gutter to align with `Block 1`'s vertical coordinate (`offsetTop`).
   - The probe targets the active sentence under the cursor, eliminating ambiguous context.
2. **Dual Reaction Pathways (Write or Reply)**:
   - **Path 1 (Edit directly in Canvas)**: The student can simply rewrite their sentence in the document. The backend debouncer checks the new text; if the misconception is resolved, the card turns green:
     *`✅ Epistemic Pivot Captured: Shifted from Monocausal Luxury to Structural Deficit`*.
   - **Path 2 (Reply in Margin)**: The student can click `[Reply in Margin]` to type a 1-sentence clarification or defense directly on the card without switching screens.
3. **Quiet Timer Guardrail**:
   - The Socratic gutter is not hyperactive. It enforces a **90-second Quiet Drafting Window** when a student is actively typing to prevent distracting interruptions during flow states.

### B. The Evidentiary Well (Primary Source Sidebar)
1. **Interactive Text Highlighting & Citation Drag**:
   - The student opens Exhibit A (Necker) or Exhibit B (Calonne).
   - Highlighting a key sentence reveals a floating tooltip: `[+ Add as Evidence to Active Block]`.
   - Clicking or dragging drops the quoted text into an `#evidence` block with automatic source attribution:  
     `"ordinary accounts showed an apparent surplus..." (Necker, Compte Rendu, 1781)`.
2. **Entailment Pre-Check**:
   - When evidence is anchored, the backend verifies whether the quoted passage logically entails or supports the claim in Block 1.

### C. The On-Demand Socratic Dialogue Drawer (Macro-Level)
1. **Collapsible Bottom/Side Sheet**:
   - Accessible via the bottom bar `[💬 Open Full Socratic Dialogue Drawer ↗]`.
   - Used specifically for:
     - Outlining and thesis development before writing.
     - Deep-dive historical debate when the student is fundamentally stuck.
     - Stepping down scaffolding abstraction levels (analogies, guided questions).
2. **Bi-Directional Context Preservation**:
   - Any discussion in the drawer preserves the full canvas state and margin history.

---

## 5. Backend Data Connections

### Endpoints Invoked
1. `GET /events/session/{session_id}/state`
   - Retrieves document blocks, active margin probes, and current epistemic state.
2. `POST /events/document/snapshot`
   - Headers: `Authorization: Bearer {capability_token}`
   - Body:
     ```json
     {
       "session_id": "8f3b6154-1b4e-4f8e-a982-19e34e567890",
       "revision": 15,
       "blocks": [
         { "id": "b1", "type": "claim", "text": "...", "provenance": "typed" },
         { "id": "b2", "type": "evidence", "text": "...", "provenance": "quoted_exhibit_a" }
       ],
       "word_count": 342,
       "active_block_id": "b1"
     }
     ```
3. `POST /events/socratic/probe` (In-Situ Gutter Probe)
   - Headers: `Authorization: Bearer {capability_token}`
   - Body:
     ```json
     {
       "session_id": "8f3b6154-1b4e-4f8e-a982-19e34e567890",
       "focused_block": { "id": "b1", "type": "claim", "text": "The French monarchy collapsed..." },
       "trigger": "quiet_timer_expired_or_block_blur"
     }
     ```
   - Response:
     ```json
     {
       "probe_id": "prb_9918",
       "target_block_id": "b1",
       "probe_text": "You've claimed royal luxury caused the collapse. Look at line 2 of Exhibit A...",
       "current_rung": 1,
       "target_kc": "KC_HIST_FINANCE",
       "critic_passed": true
     }
     ```
4. `POST /events/socratic/turn` (On-Demand Dialogue Drawer)
   - Invokes `socratic_tutor_graph` for extended conversational debate.
5. `POST /sessions/{session_id}/submit`
   - Finalizes submission, generates post-submission dossier, and navigates to `04_student_review_page.md`.

---

## 6. Defensive Edge Cases & Safeguards
- **Narrow Viewport / Mobile Layout**: On screens $<1024\text{px}$, the 3-column layout collapses gracefully: the right gutter transforms into interactive margin pins attached to paragraph badges. Tapping a pin opens a floating popover probe.
- **Answer-Isolation Critic Gate**: Every probe in the marginalia gutter must score $\ge 0.85$ on the `AnswerIsolationCriticAgent`. If an AI response attempts to ghostwrite the sentence or state the historical answer directly, it is intercepted and converted to a targeted inquiry.
- **Anti-Paste Anomaly Telemetry**: Pasting $>150$ characters within $500\text{ms}$ creates an `event: "paste_detected"`, flags the block in PostgreSQL, and schedules a verification defense probe on that specific paragraph.
- **Offline Draft Protection**: In-flight keystrokes are backed up every 2 seconds into IndexedDB (`fiosra.offline_draft.{sessionId}`).
