<script>
  import { onMount } from 'svelte';
  import ThinkingTimeline from '../lib/ThinkingTimeline.svelte';
  import { formatDate, responseError, routeParams } from '../lib/session.js';

  let {
    courseId: propCourseId = '',
    assignmentId: propAssignmentId = '',
  } = $props();

  let courseId = $state(propCourseId || '');
  let assignmentId = $state(propAssignmentId || '');

  $effect(() => {
    let changed = false;
    if (propCourseId && propCourseId !== courseId) {
      courseId = propCourseId;
      changed = true;
    }
    if (propAssignmentId !== undefined && propAssignmentId !== assignmentId) {
      assignmentId = propAssignmentId;
      changed = true;
    }
    if (changed) {
      loadQueue();
    }
  });
  let queue = $state([]);
  let selected = $state(null);
  let dossier = $state(null);
  let trace = $state([]);
  let reasoningNodes = $state([]);
  let activityNodes = $state([]);
  let canvasData = $state(null);
  let activeReviewTimelineTab = $state('reasoning'); // 'reasoning' | 'activity'
  let expandedReasoningNode = $state(-1);
  let expandedActivityNode = $state(-1);
  let grade = $state('');
  let feedback = $state('');
  let teacherId = $state('educator_workspace');
  let isLoading = $state(true);
  let isFinalizing = $state(false);
  let notice = $state('');
  let error = $state('');

  async function loadQueue() {
    error = '';
    const params = new URLSearchParams();
    if (courseId) params.set('course_id', courseId);
    if (assignmentId) params.set('assignment_id', assignmentId);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`/evidence/review-queue${suffix}`);
    if (!response.ok) throw new Error(await responseError(response, 'The evaluation review queue could not be loaded.'));
    queue = await response.json();
    if (selected) selected = queue.find((item) => item.session_id === selected.session_id) || null;
    if (!selected && queue.length) await selectItem(queue[0]);
  }

  async function selectItem(item) {
    selected = item;
    dossier = null;
    trace = [];
    reasoningNodes = [];
    activityNodes = [];
    canvasData = null;
    feedback = '';
    grade = item.suggested_grade && item.suggested_grade !== 'Pending' ? item.suggested_grade : '';
    error = '';
    const [dossierResponse, traceResponse, reasoningRes, activityRes, canvasRes] = await Promise.all([
      fetch(`/evidence/dossier/${item.session_id}`),
      fetch(`/evidence/trace/${item.session_id}`),
      fetch(`/evidence/trace/${item.session_id}/reasoning`),
      fetch(`/evidence/trace/${item.session_id}/activity`),
      fetch(`/canvas/sessions/${item.session_id}`),
    ]);
    if (!dossierResponse.ok) {
      error = await responseError(dossierResponse, 'The evidence dossier could not be loaded.');
      return;
    }
    dossier = await dossierResponse.json();
    if (traceResponse.ok) trace = (await traceResponse.json()).trace_nodes || [];
    if (reasoningRes.ok) reasoningNodes = (await reasoningRes.json()).nodes || [];
    if (activityRes.ok) activityNodes = (await activityRes.json()).nodes || [];
    if (canvasRes.ok) canvasData = await canvasRes.json();
  }

  async function finalise() {
    if (!selected || !grade.trim()) return;
    isFinalizing = true;
    error = '';
    notice = '';
    try {
      const response = await fetch(`/evidence/dossier/${selected.session_id}/finalise-grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved_grade: grade.trim(),
          teacher_id: teacherId.trim() || 'educator_workspace',
          teacher_override: grade.trim() !== selected.suggested_grade,
          feedback_comments: feedback.trim(),
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'The final grade could not be recorded.'));
      notice = `Grade ${grade.trim()} finalized for ${selected.student_id}. Session is sealed in event log.`;
      selected = null;
      dossier = null;
      await loadQueue();
    } catch (err) {
      error = err.message || 'The final grade could not be recorded.';
    } finally {
      isFinalizing = false;
    }
  }

  onMount(async () => {
    const params = routeParams();
    if (!courseId) courseId = params.get('course_id') || '';
    if (!assignmentId) assignmentId = params.get('assignment_id') || '';
    try {
      await loadQueue();
    } catch (err) {
      error = err.message || 'The evaluation queue could not be initialized.';
    } finally {
      isLoading = false;
    }
  });
</script>

<main class="review-main">
  <header class="review-header">
    <div>
      <div class="eyebrow">Educator Workspace</div>
      <h1>Evaluation Window</h1>
      <p>Review submitted assignments, examine student intellectual progression, and exercise sovereign grade authority.</p>
    </div>
    <div class="queue-count">
      <span>Submissions Awaiting Review</span>
      <strong>{queue.length}</strong>
    </div>
  </header>

  {#if isLoading}
    <div class="loading"><div class="spinner"></div><span>Loading submitted assignments…</span></div>
  {:else if error && queue.length === 0}
    <section class="load-error" role="alert">
      <strong>The evaluation queue could not be loaded.</strong>
      <p>{error}</p>
      <button class="btn btn-secondary" onclick={loadQueue}>Try again</button>
    </section>
  {:else}
    <div class="review-grid">
      <!-- Left Sidebar: Submitted Assignments Queue -->
      <section class="queue-card">
        <div class="card-heading">
          <h2>Submitted Assignments</h2>
          <button class="refresh" onclick={loadQueue}>Refresh</button>
        </div>
        {#if queue.length === 0}
          <div class="empty-queue">
            <strong>No submissions awaiting evaluation.</strong>
            <p>When a learner submits an assignment, it will populate here automatically with its reasoning trace.</p>
          </div>
        {:else}
          <div class="queue-list">
            {#each queue as item (item.session_id)}
              <button
                class:active={selected?.session_id === item.session_id}
                class="queue-item"
                onclick={() => selectItem(item)}
              >
                <span class="student-mark">{item.student_id.slice(0, 2).toUpperCase()}</span>
                <span class="item-copy">
                  <strong>{item.student_id}</strong>
                  <small class="assignment-chip-title">{item.assignment_title}</small>
                  <small>{formatDate(item.submitted_at)}</small>
                </span>
                <span class="grade-pill">Evaluate</span>
              </button>
            {/each}
          </div>
        {/if}
      </section>

      <!-- Right Panel: Evaluation Dossier -->
      <section class="dossier-card">
        {#if !selected}
          <div class="empty-dossier">
            <strong>Select a submitted assignment</strong>
            <p>The student's reasoning trace, submitted work, and rubric evidence will load here.</p>
          </div>
        {:else if !dossier}
          <div class="loading small"><div class="spinner"></div><span>Opening evaluation dossier…</span></div>
        {:else}
          <!-- Dossier Header -->
          <header class="dossier-header">
            <div>
              <div class="eyebrow">Evaluation Dossier</div>
              <h2>{selected.student_id}</h2>
              <p class="dossier-assignment-sub">{selected.assignment_title} • Submitted: {formatDate(selected.submitted_at)}</p>
            </div>
            <div class="suggestion">
              <span>Authority</span>
              <strong>Teacher Review</strong>
            </div>
          </header>

          <!-- 1. Prominent Dual Timeline: Intellectual Development & Activity Log -->
          <section class="review-timeline-section">
            <div class="review-timeline-header">
              <div>
                <h3>Student Reasoning &amp; Engagement Trace</h3>
                <p>Track how the learner formed hypotheses, responded to Socratic challenges, and evolved their thinking.</p>
              </div>
              <div class="review-timeline-toggle">
                <button
                  type="button"
                  class="review-tab-btn"
                  class:active={activeReviewTimelineTab === 'reasoning'}
                  onclick={() => activeReviewTimelineTab = 'reasoning'}
                >
                  💡 Reasoning ({reasoningNodes.length})
                </button>
                <button
                  type="button"
                  class="review-tab-btn"
                  class:active={activeReviewTimelineTab === 'activity'}
                  onclick={() => activeReviewTimelineTab = 'activity'}
                >
                  ⏱️ Activity ({activityNodes.length})
                </button>
                <a
                  class="review-flight-link"
                  href={`#/student/trace?session_id=${selected.session_id}`}
                  title="Open full-page flight recorder"
                >
                  Flight Recorder ↗
                </a>
              </div>
            </div>

            {#if activeReviewTimelineTab === 'reasoning'}
              {#if reasoningNodes.length === 0}
                <p class="timeline-empty-hint">No reasoning milestones recorded for this session.</p>
              {:else}
                <ThinkingTimeline
                  nodes={reasoningNodes}
                  showContent={true}
                  showDiff={true}
                  expandedNodeIndex={expandedReasoningNode}
                  onNodeClick={(idx) => {
                    expandedReasoningNode = expandedReasoningNode === idx ? -1 : idx;
                  }}
                />
              {/if}
            {:else}
              {#if activityNodes.length === 0}
                <p class="timeline-empty-hint">No activity events recorded.</p>
              {:else}
                <ThinkingTimeline
                  nodes={activityNodes}
                  showContent={true}
                  showDiff={false}
                  expandedNodeIndex={expandedActivityNode}
                  onNodeClick={(idx) => {
                    expandedActivityNode = expandedActivityNode === idx ? -1 : idx;
                  }}
                />
              {/if}
            {/if}
          </section>

          <!-- 2. Submitted Student Work (Generic Canvas Sections) -->
          {@const displaySections = (canvasData?.sections?.length ? canvasData.sections.map(s => {
            const draft = canvasData.drafts?.find(d => d.section_id === s.section_id);
            return {
              section_id: s.section_id,
              title: s.title || s.section_id.replaceAll('_', ' '),
              prompt: s.prompt,
              text: draft?.text || '',
              revision: draft?.revision || 1,
              source_references: draft?.source_references || []
            };
          }) : null) || dossier.canvas_sections || []}

          {#if displaySections.length > 0}
            <section class="student-work-section">
              <div class="section-title-row">
                <div>
                  <h3>Submitted Student Work</h3>
                  <p>Authored text across all defined sections for this assignment.</p>
                </div>
                <span class="badge badge-info">{displaySections.length} Sections</span>
              </div>

              <div class="canvas-sections-list">
                {#each displaySections as sec (sec.section_id)}
                  <article class="canvas-section-card">
                    <div class="canvas-card-meta">
                      <span class="canvas-section-title">{sec.title || sec.section_id.replaceAll('_', ' ')}</span>
                      {#if sec.revision}
                        <span class="revision-pill">Rev {sec.revision}</span>
                      {/if}
                    </div>
                    {#if sec.prompt}
                      <p class="canvas-section-prompt">{sec.prompt}</p>
                    {/if}
                    {#if sec.text}
                      <div class="canvas-draft-text">
                        {sec.text}
                      </div>
                    {:else}
                      <p class="canvas-draft-empty">No text authored for this section.</p>
                    {/if}
                    {#if sec.source_references?.length}
                      <div class="canvas-sources">
                        <span class="sources-label">Cited Sources:</span>
                        {#each sec.source_references as src}
                          <span class="source-tag">{src.document_title || 'Reference'}{src.page_number ? ` (p. ${src.page_number})` : ''}</span>
                        {/each}
                      </div>
                    {/if}
                  </article>
                {/each}
              </div>
            </section>
          {/if}

          <!-- 3. Rubric Criterion Evidence -->
          <section class="evidence-section">
            <div class="section-title-row">
              <div>
                <h3>Published Rubric Criteria Entailment</h3>
                <p>Algorithmic verification against assignment rubric hypotheses. Final grade authority rests with educator.</p>
              </div>
            </div>
            {#each dossier.per_question_evidence || [] as question}
              {#each Object.entries(question.rubric_evidence || {}) as [, criterion]}
                <article class:met={criterion.met} class="criterion">
                  <div class="criterion-header">
                    <strong>{criterion.label || (criterion.met ? 'Evidence found' : 'Needs review')}</strong>
                    <span class="confidence-pill">{Math.round((criterion.confidence || 0) * 100)}% evidence confidence</span>
                  </div>
                  <p class="criterion-description">{criterion.description}</p>
                  <p class="criterion-quote">{criterion.evidence}</p>
                  <small class="criterion-explanation">{criterion.explanation}</small>
                </article>
              {/each}
            {/each}
          </section>

          <!-- 4. Sovereign Educator Finalization -->
          <section class="grade-form">
            <h3>Sovereign Educator Finalization</h3>
            <div class="form-grid">
              <label>
                Approved Grade
                <input bind:value={grade} placeholder="A, B+, 92%" />
              </label>
              <label>
                Educator Identifier
                <input bind:value={teacherId} />
              </label>
            </div>
            <label>
              Formative Feedback
              <textarea bind:value={feedback} rows="3" placeholder="Optional feedback for the student’s next reasoning cycle."></textarea>
            </label>
            <button class="btn btn-success" onclick={finalise} disabled={isFinalizing}>
              {isFinalizing ? 'Finalizing…' : 'Finalize Grade & Seal Session ➔'}
            </button>
          </section>
        {/if}
      </section>
    </div>
  {/if}

  {#if notice}<div class="notice success">{notice}</div>{/if}
  {#if error && queue.length > 0}<div class="notice error">{error}</div>{/if}
</main>

<style>
  .review-main {
    max-width: 1280px;
    margin: 0 auto;
    padding: 32px 28px 80px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .review-header {
    border-bottom: 1px solid var(--color-graphite-border);
    display: flex;
    justify-content: space-between;
    gap: 20px;
    padding-bottom: 20px;
  }

  .eyebrow {
    color: var(--color-slate-muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.55px;
    text-transform: uppercase;
  }

  .review-header h1 {
    color: var(--color-heading);
    font-family: var(--font-brand);
    font-size: 26px;
    margin: 4px 0 6px;
  }

  .review-header p {
    color: var(--color-slate-light);
    font-size: 13px;
    line-height: 1.5;
    margin: 0;
    max-width: 740px;
  }

  .queue-count {
    align-self: flex-end;
    background: rgba(59, 130, 246, 0.12);
    border: 1px solid rgba(59, 130, 246, 0.28);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    padding: 10px 14px;
    text-align: right;
  }

  .queue-count span {
    color: var(--color-slate-muted);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .queue-count strong {
    color: var(--color-horizon-bright);
    font-family: var(--font-brand);
    font-size: 24px;
  }

  .load-error {
    align-items: center;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.32);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 250px;
    justify-content: center;
    text-align: center;
  }

  .load-error strong { color: #fecaca; }
  .load-error p { color: var(--color-slate-light); font-size: 12px; margin: 0; max-width: 540px; }

  .review-grid {
    display: grid;
    grid-template-columns: minmax(280px, 0.7fr) minmax(0, 1.5fr);
    gap: 22px;
    align-items: start;
  }

  .queue-card, .dossier-card {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-lg);
    padding: 20px;
  }

  .dossier-card {
    min-height: 460px;
  }

  .card-heading {
    align-items: center;
    border-bottom: 1px solid var(--color-graphite-border);
    display: flex;
    justify-content: space-between;
    padding-bottom: 12px;
  }

  .card-heading h2, .dossier-header h2 {
    color: var(--color-heading);
    font-size: 16px;
    margin: 0;
  }

  .refresh {
    background: none;
    border: 0;
    color: var(--color-horizon-bright);
    cursor: pointer;
    font-size: 11.5px;
    font-weight: 700;
  }

  .queue-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
  }

  .queue-item {
    align-items: center;
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-sm);
    color: inherit;
    cursor: pointer;
    display: flex;
    gap: 10px;
    padding: 11px;
    text-align: left;
    width: 100%;
    transition: all 0.15s;
  }

  .queue-item:hover, .queue-item.active {
    border-color: var(--color-horizon-bright);
    background: rgba(59, 130, 246, 0.11);
  }

  .student-mark {
    align-items: center;
    background: linear-gradient(135deg, var(--color-horizon-blue), var(--color-aurora));
    border-radius: 50%;
    color: #fff;
    display: flex;
    flex: 0 0 32px;
    font-size: 10.5px;
    font-weight: 700;
    height: 32px;
    justify-content: center;
  }

  .item-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .item-copy strong {
    color: var(--color-heading);
    font-size: 12.5px;
  }

  .assignment-chip-title {
    color: var(--color-slate-light);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .item-copy small {
    color: var(--color-slate-muted);
    font-size: 10px;
  }

  .grade-pill {
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.28);
    border-radius: 99px;
    color: #6ee7b7;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
  }

  .empty-queue, .empty-dossier {
    color: var(--color-slate-muted);
    font-size: 12px;
    line-height: 1.6;
    padding: 36px 10px;
    text-align: center;
  }

  .empty-queue strong, .empty-dossier strong {
    color: var(--color-heading);
    display: block;
    font-size: 13.5px;
  }

  .dossier-header {
    border-bottom: 1px solid var(--color-graphite-border);
    display: flex;
    justify-content: space-between;
    gap: 15px;
    padding-bottom: 16px;
  }

  .dossier-assignment-sub {
    color: var(--color-slate-light);
    font-size: 12px;
    margin: 4px 0 0;
  }

  .suggestion {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.25);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    padding: 8px 12px;
    text-align: right;
  }

  .suggestion span {
    color: var(--color-slate-muted);
    font-size: 9.5px;
    text-transform: uppercase;
  }

  .suggestion strong {
    color: #6ee7b7;
    font-size: 14px;
    margin-top: 2px;
  }

  .review-timeline-section {
    border-bottom: 1px solid var(--color-graphite-border);
    padding: 18px 0 20px;
  }

  .review-timeline-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }

  .review-timeline-header h3 {
    color: var(--color-heading);
    font-size: 14px;
    margin: 0 0 4px;
  }

  .review-timeline-header p {
    color: var(--color-slate-muted);
    font-size: 11.5px;
    margin: 0;
  }

  .review-timeline-toggle {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .review-tab-btn {
    background: transparent;
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-sm, 6px);
    color: var(--color-slate-muted);
    cursor: pointer;
    font-size: 11.5px;
    font-weight: 600;
    padding: 5px 11px;
    transition: all 0.15s ease;
  }

  .review-tab-btn:hover {
    color: var(--color-slate-bright);
    border-color: var(--color-horizon-bright);
  }

  .review-tab-btn.active {
    background: rgba(59, 130, 246, 0.15);
    border-color: var(--color-horizon-bright);
    color: #38bdf8;
  }

  .review-flight-link {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: var(--radius-sm, 6px);
    color: #6ee7b7;
    font-size: 11.5px;
    font-weight: 600;
    padding: 5px 11px;
    text-decoration: none;
    transition: all 0.15s ease;
  }

  .review-flight-link:hover {
    background: rgba(16, 185, 129, 0.2);
    color: #a7f3d0;
  }

  .timeline-empty-hint {
    color: var(--color-slate-muted);
    font-size: 12px;
    margin: 12px 0;
    font-style: italic;
  }

  .student-work-section {
    border-bottom: 1px solid var(--color-graphite-border);
    padding: 18px 0 20px;
  }

  .section-title-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .section-title-row h3 {
    color: var(--color-heading);
    font-size: 14px;
    margin: 0 0 4px;
  }

  .section-title-row p {
    color: var(--color-slate-muted);
    font-size: 11.5px;
    margin: 0;
  }

  .canvas-sections-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 10px;
  }

  .canvas-section-card {
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-sm);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .canvas-card-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .canvas-section-title {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--color-horizon-bright);
    text-transform: capitalize;
  }

  .revision-pill {
    font-size: 10px;
    color: var(--color-slate-muted);
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 6px;
    border-radius: var(--radius-xs);
  }

  .canvas-section-prompt {
    color: var(--color-slate-muted);
    font-size: 11px;
    margin: 0 0 4px;
    font-style: italic;
  }

  .canvas-draft-text {
    color: var(--color-slate-bright);
    font-size: 12.5px;
    line-height: 1.55;
    background: rgba(255, 255, 255, 0.02);
    padding: 10px 12px;
    border-radius: var(--radius-xs);
    border-left: 2px solid var(--color-horizon-blue);
    white-space: pre-wrap;
  }

  .canvas-draft-empty {
    color: var(--color-slate-muted);
    font-size: 11.5px;
    font-style: italic;
    margin: 0;
  }

  .canvas-sources {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 6px;
  }

  .sources-label {
    font-size: 10.5px;
    color: var(--color-slate-muted);
    font-weight: 600;
  }

  .source-tag {
    font-size: 10.5px;
    color: var(--color-slate-light);
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.25);
    padding: 2px 7px;
    border-radius: var(--radius-xs);
  }

  .evidence-section {
    border-bottom: 1px solid var(--color-graphite-border);
    padding: 18px 0 20px;
  }

  .criterion {
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    border-left: 3px solid var(--color-amber);
    border-radius: var(--radius-sm);
    margin-top: 10px;
    padding: 12px;
  }

  .criterion.met {
    border-left-color: var(--color-signal-green);
  }

  .criterion-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .criterion strong {
    color: #fcd34d;
    font-size: 12px;
    text-transform: uppercase;
  }

  .criterion.met strong {
    color: #6ee7b7;
  }

  .confidence-pill {
    color: var(--color-slate-muted);
    font-size: 10.5px;
  }

  .criterion-description {
    color: var(--color-slate-light);
    font-size: 11.5px;
    margin: 6px 0 4px;
  }

  .criterion-quote {
    color: var(--color-slate-bright);
    font-size: 11.5px;
    background: rgba(255, 255, 255, 0.03);
    padding: 8px 10px;
    border-radius: var(--radius-xs);
    margin: 6px 0 4px;
    font-family: var(--font-mono);
  }

  .criterion-explanation {
    color: var(--color-slate-muted);
    font-size: 10.5px;
    display: block;
  }

  .grade-form {
    padding: 18px 0 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .grade-form h3 {
    color: var(--color-heading);
    font-size: 14px;
    margin: 0;
  }

  .grade-form label {
    color: var(--color-slate-light);
    display: flex;
    flex-direction: column;
    font-size: 10.5px;
    font-weight: 700;
    gap: 6px;
    letter-spacing: 0.35px;
    text-transform: uppercase;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .grade-form input, .grade-form textarea {
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-sm);
    color: var(--color-slate-bright);
    font: inherit;
    font-size: 12.5px;
    padding: 10px;
  }

  .grade-form input:focus, .grade-form textarea:focus {
    border-color: var(--color-horizon-blue);
    outline: none;
  }

  .notice {
    border-radius: var(--radius-sm);
    font-size: 12px;
    padding: 11px 14px;
  }

  .notice.success {
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #86efac;
  }

  .notice.error {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }

  .loading {
    align-items: center;
    color: var(--color-slate-light);
    display: flex;
    gap: 12px;
    justify-content: center;
    min-height: 280px;
  }

  .loading.small { min-height: 390px; }

  .spinner {
    animation: spin 0.8s linear infinite;
    border: 3px solid rgba(59, 130, 246, 0.2);
    border-radius: 50%;
    border-top-color: var(--color-horizon-bright);
    height: 26px;
    width: 26px;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 850px) {
    .review-grid { grid-template-columns: 1fr; }
    .review-header { flex-direction: column; }
    .queue-count { align-self: flex-start; }
  }
</style>
