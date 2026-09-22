<script>
  import { onMount } from 'svelte';
  import ThinkingTimeline from '../lib/ThinkingTimeline.svelte';
  import PdfViewer from '../lib/PdfViewer.svelte';
  import { formatDate, responseError, routeParams } from '../lib/session.js';

  let {
    courseId: propCourseId = '',
    assignmentId: propAssignmentId = '',
    targetStudentId = '',
    targetSessionId = '',
  } = $props();

  let courseId = $state(propCourseId || '');
  let assignmentId = $state(propAssignmentId || '');
  let filterStatus = $state('all'); // 'all' | 'submitted' | 'active'
  let searchQuery = $state('');

  // Accordion and tabs state
  let openSections = $state({ reasoning: true, work: false, rubric: false });
  let activeWorkTab = $state('sections'); // 'sections' | 'pdf'

  function toggleSection(key) {
    openSections = { ...openSections, [key]: !openSections[key] };
  }

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

  $effect(() => {
    if (targetSessionId && selected?.session_id !== targetSessionId && queue.length) {
      const match = queue.find((item) => item.session_id === targetSessionId);
      if (match) selectItem(match);
    } else if (targetStudentId && selected?.student_id !== targetStudentId && queue.length) {
      const match = queue.find((item) => item.student_id === targetStudentId);
      if (match) selectItem(match);
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

  let filteredQueue = $derived.by(() => {
    let q = queue;
    if (filterStatus === 'submitted') q = q.filter((item) => item.status === 'submitted');
    else if (filterStatus === 'active') q = q.filter((item) => item.status !== 'submitted');
    if (searchQuery.trim()) {
      const term = searchQuery.trim().toLowerCase();
      q = q.filter((item) => item.student_id.toLowerCase().includes(term));
    }
    return q;
  });

  let submittedCount = $derived(queue.filter((item) => item.status === 'submitted').length);
  let activeCount = $derived(queue.filter((item) => item.status !== 'submitted').length);

  async function loadQueue() {
    error = '';
    const params = new URLSearchParams();
    if (courseId) params.set('course_id', courseId);
    if (assignmentId) params.set('assignment_id', assignmentId);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`/evidence/review-queue${suffix}`);
    if (!response.ok) throw new Error(await responseError(response, 'The evaluation review queue could not be loaded.'));
    queue = await response.json();

    let targetToSelect = null;
    if (targetSessionId) {
      targetToSelect = queue.find((item) => item.session_id === targetSessionId);
    }
    if (!targetToSelect && targetStudentId) {
      targetToSelect = queue.find((item) => item.student_id === targetStudentId);
    }
    if (!targetToSelect && selected) {
      targetToSelect = queue.find((item) => item.session_id === selected.session_id);
    }
    if (!targetToSelect && queue.length) {
      targetToSelect = queue[0];
    }
    if (targetToSelect) {
      await selectItem(targetToSelect);
    } else {
      selected = null;
    }
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
    // Reset accordion: expand reasoning by default
    openSections = { reasoning: true, work: false, rubric: false };
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

<main class="review-main" class:embedded-container={!!assignmentId}>
  {#if !assignmentId}
    <!-- Standalone Mode Header -->
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
  {/if}

  {#if isLoading}
    <div class="loading"><div class="spinner"></div><span>Loading submitted assignments…</span></div>
  {:else if error && queue.length === 0}
    <section class="load-error" role="alert">
      <strong>The evaluation queue could not be loaded.</strong>
      <p>{error}</p>
      <button class="btn btn-secondary" onclick={loadQueue}>Try again</button>
    </section>
  {:else}
    <div class="review-layout" class:split-pane={!!assignmentId} class:standalone-grid={!assignmentId}>

      {#if assignmentId}
        <!-- ═══════════════════════════════════════════════════════════ -->
        <!-- SPLIT-PANE MODE: Left Sidebar Roster + Right Dossier Pane -->
        <!-- ═══════════════════════════════════════════════════════════ -->
        <aside class="roster-sidebar">
          <div class="roster-header">
            <input
              type="text"
              class="roster-search"
              placeholder="Search students…"
              bind:value={searchQuery}
            />
            <div class="roster-filters">
              <button
                type="button"
                class="filter-pill"
                class:active={filterStatus === 'all'}
                onclick={() => filterStatus = 'all'}
              >All ({queue.length})</button>
              <button
                type="button"
                class="filter-pill"
                class:active={filterStatus === 'submitted'}
                onclick={() => filterStatus = 'submitted'}
              >Submitted ({submittedCount})</button>
              <button
                type="button"
                class="filter-pill"
                class:active={filterStatus === 'active'}
                onclick={() => filterStatus = 'active'}
              >In Progress ({activeCount})</button>
            </div>
          </div>

          <div class="roster-list">
            {#if filteredQueue.length === 0}
              <div class="roster-empty">No students match this filter.</div>
            {:else}
              {#each filteredQueue as item (item.session_id)}
                <button
                  type="button"
                  class="roster-card"
                  class:active={selected?.session_id === item.session_id}
                  onclick={() => selectItem(item)}
                >
                  <span class="roster-avatar">{item.student_id.slice(0, 2).toUpperCase()}</span>
                  <div class="roster-card-info">
                    <span class="roster-name">{item.student_id}</span>
                    <span class="roster-time">{formatDate(item.submitted_at)}</span>
                  </div>
                  {#if item.status === 'submitted'}
                    <span class="roster-badge submitted">✓ Submitted</span>
                  {:else if item.status === 'completed'}
                    <span class="roster-badge completed">✓ Finalized</span>
                  {:else}
                    <span class="roster-badge in-progress">● In Progress</span>
                  {/if}
                </button>
              {/each}
            {/if}
          </div>

          <button type="button" class="roster-refresh" onclick={loadQueue} title="Check for new submissions">
            ↻ Refresh
          </button>
        </aside>

        <!-- Right Pane: Dossier Content -->
        <section class="dossier-pane">
          {#if !selected}
            <div class="empty-dossier">
              <div class="empty-icon">📋</div>
              <strong>No student selected</strong>
              <p>Select a learner from the roster to inspect their reasoning trace and deliverables.</p>
            </div>
          {:else if !dossier}
            <div class="loading small"><div class="spinner"></div><span>Opening evaluation dossier…</span></div>
          {:else}
            <!-- Dossier Header -->
            <header class="dossier-header">
              <div>
                <div class="eyebrow">
                  {selected.status === 'submitted' ? 'Evaluation Dossier' : selected.status === 'completed' ? 'Finalized Dossier' : 'Learner Progress Dossier'}
                </div>
                <h2>{selected.student_id}</h2>
                <p class="dossier-sub">
                  {selected.status === 'submitted' ? 'Submitted' : selected.status === 'completed' ? 'Finalized' : 'Last Active'}: {formatDate(selected.submitted_at)}
                </p>
              </div>
              <div class="dossier-header-actions">
                <button
                  type="button"
                  class="btn-view-pdf-tab"
                  class:active={openSections.work && activeWorkTab === 'pdf'}
                  onclick={() => {
                    openSections.work = true;
                    activeWorkTab = 'pdf';
                  }}
                  title="Render student's submitted assignment as a PDF document"
                >
                  <span class="btn-icon">📄</span> Rendered PDF
                </button>
                <a
                  class="btn-download-pdf"
                  href={`/evidence/dossier/${selected.session_id}/pdf`}
                  download
                  title="Download student assignment submission as a PDF"
                >
                  <span class="btn-icon">⬇</span> Download PDF
                </a>
                <div
                  class="status-badge"
                  class:submitted={selected.status === 'submitted'}
                  class:completed={selected.status === 'completed'}
                  class:in-progress={selected.status !== 'submitted' && selected.status !== 'completed'}
                >
                  {#if selected.status === 'submitted'}
                    <span>✓ Ready for Grading</span>
                  {:else if selected.status === 'completed'}
                    <span>✓ Grade Finalized</span>
                  {:else}
                    <span>● In Progress (Live Draft)</span>
                  {/if}
                </div>
              </div>
            </header>

            <!-- Accordion: Reasoning Trace -->
            <section class="accordion-section">
              <div class="accordion-trigger" role="button" tabindex="0" onclick={() => toggleSection('reasoning')} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSection('reasoning'); }}>
                <span class="accordion-chevron" class:open={openSections.reasoning}>▶</span>
                <span class="accordion-icon">💡</span>
                <span class="accordion-title">Reasoning & Engagement Trace</span>
                <span class="accordion-count">{reasoningNodes.length + activityNodes.length}</span>
              </div>
              <div class="accordion-toolbar">
                <button
                  type="button"
                  class="acc-tab-btn"
                  class:active={activeReviewTimelineTab === 'reasoning'}
                  onclick={() => { activeReviewTimelineTab = 'reasoning'; if (!openSections.reasoning) toggleSection('reasoning'); }}
                >
                  Intellectual Milestones ({reasoningNodes.length})
                </button>
                <button
                  type="button"
                  class="acc-tab-btn"
                  class:active={activeReviewTimelineTab === 'activity'}
                  onclick={() => { activeReviewTimelineTab = 'activity'; if (!openSections.reasoning) toggleSection('reasoning'); }}
                >
                  Full Activity Log ({activityNodes.length})
                </button>
                <a class="acc-flight-link" href={`#/student/trace?session_id=${selected.session_id}`}>
                  Live Flight Recorder ↗
                </a>
              </div>
              {#if openSections.reasoning}
                <div class="accordion-body">
                  {#if activeReviewTimelineTab === 'reasoning'}
                    {#if reasoningNodes.length === 0}
                      <p class="accordion-empty">No reasoning trace events logged yet for this session.</p>
                    {:else}
                      <ThinkingTimeline
                        nodes={reasoningNodes}
                        expandedNodeIndex={expandedReasoningNode}
                        onToggleNode={(idx) => {
                          expandedReasoningNode = expandedReasoningNode === idx ? -1 : idx;
                        }}
                      />
                    {/if}
                  {:else}
                    {#if activityNodes.length === 0}
                      <p class="accordion-empty">No activity events logged for this session.</p>
                    {:else}
                      <ThinkingTimeline
                        nodes={activityNodes}
                        expandedNodeIndex={expandedActivityNode}
                        onToggleNode={(idx) => {
                          expandedActivityNode = expandedActivityNode === idx ? -1 : idx;
                        }}
                      />
                    {/if}
                  {/if}
                </div>
              {/if}
            </section>

            <!-- Accordion: Student Work -->
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

            <section class="accordion-section">
              <div class="accordion-trigger" role="button" tabindex="0" onclick={() => toggleSection('work')} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSection('work'); }}>
                <span class="accordion-chevron" class:open={openSections.work}>▶</span>
                <span class="accordion-icon">📝</span>
                <span class="accordion-title">Student Work &amp; Assignment Deliverables</span>
                <span class="accordion-count">{displaySections.length} Sections</span>
              </div>
              <div class="accordion-toolbar work-toolbar">
                <div class="work-tab-group">
                  <button
                    type="button"
                    class="acc-tab-btn"
                    class:active={activeWorkTab === 'sections'}
                    onclick={() => { activeWorkTab = 'sections'; if (!openSections.work) toggleSection('work'); }}
                  >
                    📝 Canvas Sections ({displaySections.length})
                  </button>
                  <button
                    type="button"
                    class="acc-tab-btn"
                    class:active={activeWorkTab === 'pdf'}
                    onclick={() => { activeWorkTab = 'pdf'; if (!openSections.work) toggleSection('work'); }}
                  >
                    📄 Rendered PDF View
                  </button>
                </div>
                <a
                  class="btn-download-pdf btn-sm"
                  href={`/evidence/dossier/${selected.session_id}/pdf`}
                  download
                  title="Download complete student assignment submission as a PDF"
                >
                  <span class="btn-icon">⬇</span> Download PDF
                </a>
              </div>
              {#if openSections.work}
                <div class="accordion-body">
                  {#if activeWorkTab === 'pdf'}
                    <div class="pdf-render-pane">
                      <div class="pdf-render-header">
                        <div class="pdf-render-title">
                          <span class="pdf-icon">📄</span>
                          <strong>Official Submission PDF Document</strong>
                          <span class="pdf-meta">&bull; Submitted assignment document</span>
                        </div>
                        <div class="pdf-render-actions">
                          <a
                            class="btn-fallback-open"
                            href={`/evidence/dossier/${selected.session_id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open PDF in a new browser tab"
                          >
                            Open in Tab ↗
                          </a>
                          <a
                            class="btn-download-pdf btn-sm"
                            href={`/evidence/dossier/${selected.session_id}/pdf`}
                            download
                            title="Download PDF to device"
                          >
                            <span class="btn-icon">⬇</span> Download PDF
                          </a>
                        </div>
                      </div>
                      <div class="pdf-render-viewport">
                        {#key selected.session_id}
                          <PdfViewer
                            url={`/evidence/dossier/${selected.session_id}/pdf`}
                            title={`${selected.student_id} - ${selected.assignment_title || 'Assignment Submission'}`}
                          />
                        {/key}
                      </div>
                    </div>
                  {:else}
                    {#if displaySections.length === 0}
                      <p class="accordion-empty">No authored work found for this session.</p>
                    {:else}
                      <div class="work-sections">
                        {#each displaySections as sec (sec.section_id)}
                          <article class="work-card">
                            <div class="work-card-header">
                              <span class="work-title">{sec.title || sec.section_id.replaceAll('_', ' ')}</span>
                              {#if sec.revision}
                                <span class="revision-tag">Rev {sec.revision}</span>
                              {/if}
                            </div>
                            {#if sec.prompt}
                              <p class="work-prompt">{sec.prompt}</p>
                            {/if}
                            {#if sec.text}
                              <div class="work-text">{sec.text}</div>
                            {:else}
                              <p class="work-empty">No text authored for this section.</p>
                            {/if}
                            {#if sec.source_references?.length}
                              <div class="work-sources">
                                <span class="sources-label">Cited Sources:</span>
                                {#each sec.source_references as src}
                                  <span class="source-tag">{src.document_title || 'Reference'}{src.page_number ? ` (p. ${src.page_number})` : ''}</span>
                                {/each}
                              </div>
                            {/if}
                          </article>
                        {/each}
                      </div>
                    {/if}
                  {/if}
                </div>
              {/if}
            </section>

            <!-- Accordion: Rubric Assessment -->
            <section class="accordion-section">
              <div class="accordion-trigger" role="button" tabindex="0" onclick={() => toggleSection('rubric')} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSection('rubric'); }}>
                <span class="accordion-chevron" class:open={openSections.rubric}>▶</span>
                <span class="accordion-icon">📊</span>
                <span class="accordion-title">Rubric Assessment</span>
                <span class="accordion-count">
                  {(dossier.per_question_evidence || []).reduce((sum, q) => sum + Object.keys(q.rubric_evidence || {}).length, 0)} Criteria
                </span>
              </div>
              {#if openSections.rubric}
                <div class="accordion-body">
                  {#each dossier.per_question_evidence || [] as question}
                    {#each Object.entries(question.rubric_evidence || {}) as [, criterion]}
                      <article class="criterion" class:met={criterion.met}>
                        <div class="criterion-header">
                          <strong>{criterion.label || (criterion.met ? 'Evidence found' : 'Needs review')}</strong>
                          <span class="confidence-pill">{Math.round((criterion.confidence || 0) * 100)}%</span>
                        </div>
                        <p class="criterion-desc">{criterion.description}</p>
                        <div class="criterion-quote">{criterion.evidence}</div>
                        <small class="criterion-explanation">{criterion.explanation}</small>
                      </article>
                    {/each}
                  {/each}
                </div>
              {/if}
            </section>

            <!-- Sticky Bottom Bar: Grade Finalization or In-Progress Info -->
            {#if selected.status === 'submitted'}
              <div class="sticky-grade-bar">
                <div class="grade-bar-inner">
                  <label class="grade-field">
                    <span>Grade</span>
                    <input bind:value={grade} placeholder="A, B+, 92%" />
                  </label>
                  <label class="feedback-field">
                    <span>Formative Feedback</span>
                    <input bind:value={feedback} placeholder="Optional feedback for next reasoning cycle…" />
                  </label>
                  <button class="btn btn-success grade-submit" onclick={finalise} disabled={isFinalizing}>
                    {isFinalizing ? 'Finalizing…' : 'Finalize Grade & Seal ➔'}
                  </button>
                </div>
              </div>
            {:else if selected.status === 'completed'}
              <div class="sticky-progress-bar completed-bar">
                <span class="progress-badge completed-badge">✓ Grade Finalized</span>
                <span class="progress-text">This submission is officially evaluated and sealed in the sovereign event ledger.</span>
                <a class="btn btn-secondary btn-sm" href={`/evidence/dossier/${selected.session_id}/pdf`} download>
                  ⬇ Download Sealed PDF
                </a>
              </div>
            {:else}
              <div class="sticky-progress-bar">
                <span class="progress-badge">● Live Session</span>
                <span class="progress-text">This student is actively working. Observe their reasoning trace and draft work above.</span>
                <a class="btn btn-secondary btn-sm" href={`#/student/trace?session_id=${selected.session_id}`}>
                  Open Flight Recorder ↗
                </a>
              </div>
            {/if}
          {/if}
        </section>

      {:else}
        <!-- ═══════════════════════════════════════════════════════════ -->
        <!-- STANDALONE MODE: Original Left Sidebar + Right Dossier    -->
        <!-- ═══════════════════════════════════════════════════════════ -->
        <section class="queue-card">
          <div class="card-heading">
            <h2>Submitted Assignments</h2>
            <button class="refresh" onclick={loadQueue}>Refresh</button>
          </div>
          {#if queue.length === 0}
            <div class="empty-dossier">
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
                  <span class="roster-avatar">{item.student_id.slice(0, 2).toUpperCase()}</span>
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

        <!-- Standalone: Right Panel Dossier -->
        <section class="dossier-card">
          {#if !selected}
            <div class="empty-dossier">
              <strong>No submission selected</strong>
              <p>Select a learner submission to inspect their reasoning trace and deliverables.</p>
            </div>
          {:else if !dossier}
            <div class="loading small"><div class="spinner"></div><span>Opening evaluation dossier…</span></div>
          {:else}
            <header class="dossier-header">
              <div>
                <div class="eyebrow">Evaluation Dossier</div>
                <h2>{selected.student_id}</h2>
                <p class="dossier-sub">{selected.assignment_title} • Submitted: {formatDate(selected.submitted_at)}</p>
              </div>
              <div class="status-badge submitted">
                <span>✓ Ready for Grading</span>
              </div>
            </header>

            <!-- Reasoning Trace (always open in standalone) -->
            <section class="review-timeline-section">
              <div class="review-timeline-header">
                <div>
                  <h3>Student Reasoning &amp; Engagement Trace</h3>
                  <p>Track how the learner formed hypotheses, responded to Socratic challenges, and evolved their thinking.</p>
                </div>
                <div class="review-timeline-toggle">
                  <button type="button" class="acc-tab-btn" class:active={activeReviewTimelineTab === 'reasoning'} onclick={() => activeReviewTimelineTab = 'reasoning'}>
                    💡 Reasoning ({reasoningNodes.length})
                  </button>
                  <button type="button" class="acc-tab-btn" class:active={activeReviewTimelineTab === 'activity'} onclick={() => activeReviewTimelineTab = 'activity'}>
                    ⏱️ Activity ({activityNodes.length})
                  </button>
                  <a class="acc-flight-link" href={`#/student/trace?session_id=${selected.session_id}`}>Flight Recorder ↗</a>
                </div>
              </div>
              {#if activeReviewTimelineTab === 'reasoning'}
                {#if reasoningNodes.length === 0}
                  <p class="accordion-empty">No reasoning milestones recorded.</p>
                {:else}
                  <ThinkingTimeline nodes={reasoningNodes} showContent={true} showDiff={true} expandedNodeIndex={expandedReasoningNode} onNodeClick={(idx) => { expandedReasoningNode = expandedReasoningNode === idx ? -1 : idx; }} />
                {/if}
              {:else}
                {#if activityNodes.length === 0}
                  <p class="accordion-empty">No activity events recorded.</p>
                {:else}
                  <ThinkingTimeline nodes={activityNodes} showContent={true} showDiff={false} expandedNodeIndex={expandedActivityNode} onNodeClick={(idx) => { expandedActivityNode = expandedActivityNode === idx ? -1 : idx; }} />
                {/if}
              {/if}
            </section>

            <!-- Student Work -->
            {@const standaloneSections = (canvasData?.sections?.length ? canvasData.sections.map(s => {
              const draft = canvasData.drafts?.find(d => d.section_id === s.section_id);
              return { section_id: s.section_id, title: s.title || s.section_id.replaceAll('_', ' '), prompt: s.prompt, text: draft?.text || '', revision: draft?.revision || 1, source_references: draft?.source_references || [] };
            }) : null) || dossier.canvas_sections || []}
            {#if standaloneSections.length > 0}
              <section class="review-timeline-section">
                <h3>Submitted Student Work</h3>
                <div class="work-sections">
                  {#each standaloneSections as sec (sec.section_id)}
                    <article class="work-card">
                      <div class="work-card-header">
                        <span class="work-title">{sec.title}</span>
                        {#if sec.revision}<span class="revision-tag">Rev {sec.revision}</span>{/if}
                      </div>
                      {#if sec.text}<div class="work-text">{sec.text}</div>{:else}<p class="work-empty">No text authored.</p>{/if}
                    </article>
                  {/each}
                </div>
              </section>
            {/if}

            <!-- Rubric -->
            <section class="review-timeline-section">
              <h3>Published Rubric Criteria Entailment</h3>
              {#each dossier.per_question_evidence || [] as question}
                {#each Object.entries(question.rubric_evidence || {}) as [, criterion]}
                  <article class="criterion" class:met={criterion.met}>
                    <div class="criterion-header">
                      <strong>{criterion.label || (criterion.met ? 'Evidence found' : 'Needs review')}</strong>
                      <span class="confidence-pill">{Math.round((criterion.confidence || 0) * 100)}%</span>
                    </div>
                    <p class="criterion-desc">{criterion.description}</p>
                    <div class="criterion-quote">{criterion.evidence}</div>
                    <small class="criterion-explanation">{criterion.explanation}</small>
                  </article>
                {/each}
              {/each}
            </section>

            <!-- Standalone Grade Form -->
            <section class="grade-form">
              <h3>Sovereign Educator Finalization</h3>
              <div class="form-grid">
                <label>Approved Grade<input bind:value={grade} placeholder="A, B+, 92%" /></label>
                <label>Educator Identifier<input bind:value={teacherId} /></label>
              </div>
              <label>Formative Feedback<textarea bind:value={feedback} rows="3" placeholder="Optional feedback for the student's next reasoning cycle."></textarea></label>
              <button class="btn btn-success" onclick={finalise} disabled={isFinalizing}>
                {isFinalizing ? 'Finalizing…' : 'Finalize Grade & Seal Session ➔'}
              </button>
            </section>
          {/if}
        </section>
      {/if}

    </div>
  {/if}

  {#if notice}<div class="notice success">{notice}</div>{/if}
  {#if error && queue.length > 0}<div class="notice error">{error}</div>{/if}
</main>

<style>
  /* ================================================================
     BASE LAYOUT
     ================================================================ */
  .review-main {
    max-width: 1280px;
    margin: 0 auto;
    padding: 32px 28px 80px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .review-main.embedded-container {
    padding: 0;
    max-width: 100%;
    margin: 0;
  }

  /* ================================================================
     STANDALONE MODE (no assignmentId) — original two-column grid
     ================================================================ */
  .standalone-grid {
    display: grid;
    grid-template-columns: minmax(280px, 0.7fr) minmax(0, 1.5fr);
    gap: 22px;
    align-items: start;
  }

  /* ================================================================
     SPLIT-PANE MODE (assignmentId present) — sidebar + dossier
     ================================================================ */
  .split-pane {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 0;
    align-items: stretch;
    min-height: calc(100vh - 260px);
  }

  /* ── Left Sidebar: Student Roster ────────────────────────────── */
  .roster-sidebar {
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--color-graphite-border);
    background: var(--color-graphite);
    position: sticky;
    top: 0;
    height: calc(100vh - 260px);
    overflow: hidden;
  }

  .roster-header {
    padding: 14px 14px 10px;
    border-bottom: 1px solid var(--color-graphite-border);
    flex-shrink: 0;
  }

  .roster-search {
    width: 100%;
    padding: 8px 10px;
    font-size: 12.5px;
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-sm);
    background: var(--color-obsidian);
    color: var(--color-slate-bright);
    font-family: var(--font-ui);
    box-sizing: border-box;
  }

  .roster-search:focus {
    outline: none;
    border-color: var(--color-horizon-blue);
  }

  .roster-search::placeholder {
    color: var(--color-slate-muted);
  }

  .roster-filters {
    display: flex;
    gap: 5px;
    margin-top: 10px;
  }

  .filter-pill {
    background: var(--pill-bg, rgba(0, 0, 0, 0.04));
    border: 1px solid var(--pill-border, rgba(0, 0, 0, 0.08));
    border-radius: 999px;
    color: var(--color-slate-muted);
    font-size: 10.5px;
    font-weight: 600;
    padding: 3px 9px;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: var(--font-ui);
  }

  .filter-pill:hover {
    background: var(--pill-hover, rgba(0, 0, 0, 0.07));
    color: var(--color-slate-bright);
  }

  .filter-pill.active {
    background: var(--pill-active-bg, rgba(217, 119, 6, 0.14));
    border-color: var(--pill-active-border, rgba(217, 119, 6, 0.35));
    color: var(--pill-active-color, #92400e);
  }

  .roster-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .roster-empty {
    color: var(--color-slate-muted);
    font-size: 12px;
    text-align: center;
    padding: 28px 10px;
    font-style: italic;
  }

  .roster-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--color-bone-surface, #fff);
    border: 1px solid var(--color-graphite-border);
    border-left: 3px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: all 0.15s ease;
    font-family: var(--font-ui);
    color: inherit;
  }

  .roster-card:hover {
    border-left-color: var(--color-horizon-blue);
    background: var(--color-graphite-hover, #f1f2ed);
  }

  .roster-card.active {
    border-left-color: var(--color-horizon-blue);
    background: var(--color-horizon-glow, rgba(217, 119, 6, 0.12));
    box-shadow: inset 0 0 0 1px rgba(217, 119, 6, 0.15);
  }

  .roster-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--color-horizon-blue), var(--color-aurora));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10.5px;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
  }

  .roster-card-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .roster-name {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--color-heading);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .roster-time {
    font-size: 10px;
    color: var(--color-slate-muted);
  }

  .roster-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 999px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .roster-badge.submitted {
    background: var(--color-signal-green-bg, #ecfdf5);
    color: var(--color-signal-green-text, #065f46);
    border: 1px solid rgba(5, 150, 105, 0.2);
  }

  .roster-badge.completed {
    background: #ecfdf5;
    color: #047857;
    border: 1px solid rgba(16, 185, 129, 0.25);
  }

  .roster-badge.in-progress {
    background: var(--color-aurora-glow, rgba(2, 132, 199, 0.12));
    color: var(--color-aurora-bright, #0369a1);
    border: 1px solid rgba(2, 132, 199, 0.2);
  }

  .roster-refresh {
    flex-shrink: 0;
    padding: 8px;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-horizon-bright);
    background: none;
    border: none;
    border-top: 1px solid var(--color-graphite-border);
    cursor: pointer;
    font-family: var(--font-ui);
    transition: background 0.15s;
  }

  .roster-refresh:hover {
    background: var(--color-graphite-hover, #f1f2ed);
  }

  /* ── Right Pane: Dossier Content ─────────────────────────────── */
  .dossier-pane {
    display: flex;
    flex-direction: column;
    background: var(--color-bone-surface, #fff);
    padding: 24px 28px 0;
    overflow-y: auto;
    max-height: calc(100vh - 260px);
    position: relative;
  }

  .dossier-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 15px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--color-graphite-border);
    margin-bottom: 4px;
  }

  .dossier-header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .btn-download-pdf {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 600;
    color: #1d4ed8;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-download-pdf:hover {
    background: #dbeafe;
    color: #1e40af;
    border-color: #93c5fd;
  }

  .btn-download-pdf.btn-sm {
    padding: 4px 8px;
    font-size: 11px;
  }

  .btn-view-pdf-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 600;
    color: #334155;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    cursor: pointer;
    font-family: var(--font-ui);
    transition: all 0.15s ease;
  }

  .btn-view-pdf-tab:hover {
    background: #e2e8f0;
    color: #0f172a;
    border-color: #94a3b8;
  }

  .btn-view-pdf-tab.active {
    background: #e0e7ff;
    color: #3730a3;
    border-color: #a5b4fc;
  }

  .work-tab-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pdf-render-pane {
    display: flex;
    flex-direction: column;
    background: #f8fafc;
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
    margin-bottom: 12px;
  }

  .pdf-render-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: #ffffff;
    border-bottom: 1px solid var(--color-graphite-border);
  }

  .pdf-render-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--color-heading);
  }

  .pdf-meta {
    font-size: 11px;
    color: var(--color-slate-muted);
  }

  .pdf-render-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-fallback-open {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-horizon-blue, #2563eb);
    text-decoration: none;
    padding: 4px 8px;
    border-radius: var(--radius-xs);
    border: 1px solid transparent;
    transition: all 0.15s;
  }

  .btn-fallback-open:hover {
    background: #eff6ff;
    border-color: #bfdbfe;
  }

  .pdf-render-viewport {
    height: 650px;
    min-height: 480px;
    position: relative;
    background: #0f172a;
    overflow: hidden;
  }

  .dossier-header h2 {
    color: var(--color-heading);
    font-size: 18px;
    font-family: var(--font-brand);
    margin: 4px 0 0;
  }

  .dossier-sub {
    color: var(--color-slate-muted);
    font-size: 12px;
    margin: 4px 0 0;
  }

  .status-badge {
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .status-badge.submitted,
  .status-badge.completed {
    background: var(--color-signal-green-bg, #ecfdf5);
    color: var(--color-signal-green-text, #065f46);
    border: 1px solid rgba(5, 150, 105, 0.25);
  }

  .status-badge.in-progress {
    background: var(--color-aurora-glow, rgba(2, 132, 199, 0.12));
    color: var(--color-aurora-bright, #0369a1);
    border: 1px solid rgba(2, 132, 199, 0.25);
  }

  /* ── Accordion Sections ──────────────────────────────────────── */
  .accordion-section {
    border-bottom: 1px solid var(--color-graphite-border);
  }

  .accordion-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 14px 4px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--font-ui);
    color: inherit;
    text-align: left;
    transition: background 0.12s;
  }

  .accordion-trigger:hover {
    background: var(--color-bone-muted, #f4f5f0);
    border-radius: var(--radius-sm);
  }

  .accordion-chevron {
    font-size: 10px;
    color: var(--color-slate-muted);
    transition: transform 0.2s ease;
    flex-shrink: 0;
    width: 14px;
    text-align: center;
  }

  .accordion-chevron.open {
    transform: rotate(90deg);
  }

  .accordion-icon {
    font-size: 15px;
    flex-shrink: 0;
  }

  .accordion-title {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--color-heading);
    flex: 1;
  }

  .accordion-count {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--color-slate-muted);
    background: var(--pill-bg, rgba(0, 0, 0, 0.04));
    padding: 2px 8px;
    border-radius: 999px;
  }

  .accordion-toolbar {
    display: flex;
    gap: 4px;
    align-items: center;
    padding: 0 4px 8px 22px;
  }

  .acc-tab-btn {
    background: transparent;
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-sm, 6px);
    color: var(--color-slate-muted);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 9px;
    transition: all 0.15s ease;
    font-family: var(--font-ui);
  }

  .acc-tab-btn:hover {
    color: var(--color-heading);
    border-color: var(--color-horizon-bright);
  }

  .acc-tab-btn.active {
    background: var(--pill-active-bg, rgba(217, 119, 6, 0.14));
    border-color: var(--pill-active-border, rgba(217, 119, 6, 0.35));
    color: var(--pill-active-color, #92400e);
  }

  .acc-flight-link {
    background: var(--color-signal-green-bg, #ecfdf5);
    border: 1px solid rgba(5, 150, 105, 0.25);
    border-radius: var(--radius-sm, 6px);
    color: var(--color-signal-green-text, #065f46);
    font-size: 11px;
    font-weight: 600;
    padding: 4px 9px;
    text-decoration: none;
    transition: all 0.15s ease;
  }

  .acc-flight-link:hover {
    background: rgba(5, 150, 105, 0.12);
  }

  .accordion-body {
    padding: 0 4px 16px 22px;
  }

  .accordion-empty {
    color: var(--color-slate-muted);
    font-size: 12px;
    font-style: italic;
    margin: 8px 0;
  }

  /* ── Student Work Cards ──────────────────────────────────────── */
  .work-sections {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .work-card {
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-sm);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .work-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .work-title {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--color-horizon-bright);
    text-transform: capitalize;
  }

  .revision-tag {
    font-size: 10px;
    color: var(--color-slate-muted);
    background: var(--pill-bg, rgba(0, 0, 0, 0.04));
    padding: 2px 6px;
    border-radius: var(--radius-xs);
  }

  .work-prompt {
    color: var(--color-slate-muted);
    font-size: 11px;
    margin: 0;
    font-style: italic;
  }

  .work-text {
    color: var(--color-slate-bright);
    font-size: 12.5px;
    line-height: 1.55;
    background: var(--color-bone-muted, #f4f5f0);
    padding: 10px 12px;
    border-radius: var(--radius-xs);
    border-left: 2px solid var(--color-horizon-blue);
    white-space: pre-wrap;
  }

  .work-empty {
    color: var(--color-slate-muted);
    font-size: 11.5px;
    font-style: italic;
    margin: 0;
  }

  .work-sources {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 4px;
  }

  .sources-label {
    font-size: 10.5px;
    color: var(--color-slate-muted);
    font-weight: 600;
  }

  .source-tag {
    font-size: 10.5px;
    color: var(--color-aurora-bright, #0369a1);
    background: var(--color-aurora-glow, rgba(2, 132, 199, 0.12));
    border: 1px solid rgba(2, 132, 199, 0.2);
    padding: 2px 7px;
    border-radius: var(--radius-xs);
  }

  /* ── Rubric Criteria ─────────────────────────────────────────── */
  .criterion {
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    border-left: 3px solid var(--color-amber);
    border-radius: var(--radius-sm);
    margin-top: 8px;
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
    color: var(--color-amber-text, #92400e);
    font-size: 12px;
    text-transform: uppercase;
  }

  .criterion.met strong {
    color: var(--color-signal-green-text, #065f46);
  }

  .confidence-pill {
    color: var(--color-slate-muted);
    font-size: 10.5px;
    font-weight: 600;
  }

  .criterion-desc {
    color: var(--color-slate-light);
    font-size: 11.5px;
    margin: 6px 0 4px;
  }

  .criterion-quote {
    color: var(--color-slate-bright);
    font-size: 11.5px;
    background: var(--color-bone-muted, #f4f5f0);
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

  /* ── Sticky Grade Bar (Split-Pane Mode) ──────────────────────── */
  .sticky-grade-bar {
    position: sticky;
    bottom: 0;
    background: var(--color-graphite, #fff);
    border-top: 1px solid var(--color-graphite-border);
    padding: 12px 0;
    margin-top: auto;
    z-index: 10;
  }

  .grade-bar-inner {
    display: flex;
    align-items: flex-end;
    gap: 12px;
  }

  .grade-field, .feedback-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .grade-field {
    flex: 0 0 120px;
  }

  .feedback-field {
    flex: 1;
  }

  .grade-field span, .feedback-field span {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.35px;
    color: var(--color-slate-muted);
  }

  .grade-field input, .feedback-field input {
    padding: 8px 10px;
    font-size: 12.5px;
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-sm);
    background: var(--input-bg, #fff);
    color: var(--color-slate-bright);
    font-family: var(--font-ui);
  }

  .grade-field input:focus, .feedback-field input:focus {
    outline: none;
    border-color: var(--input-focus-border, var(--color-horizon-blue));
  }

  .grade-submit {
    flex-shrink: 0;
    white-space: nowrap;
  }

  /* ── Sticky Progress Bar (In-Progress / Completed Student) ────── */
  .sticky-progress-bar {
    position: sticky;
    bottom: 0;
    background: var(--color-aurora-glow, rgba(2, 132, 199, 0.08));
    border: 1px solid rgba(2, 132, 199, 0.2);
    border-radius: var(--radius-sm);
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: auto;
    z-index: 10;
  }

  .sticky-progress-bar.completed-bar {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }

  .progress-badge {
    font-size: 12px;
    font-weight: 700;
    color: var(--color-aurora-bright, #0369a1);
    white-space: nowrap;
  }

  .progress-badge.completed-badge {
    color: #166534;
  }

  .progress-text {
    flex: 1;
    font-size: 12px;
    color: var(--color-slate-light);
  }

  .work-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 4px 10px 22px;
  }

  .work-toolbar-note {
    font-size: 11px;
    color: var(--color-slate-muted);
  }

  /* ── Standalone Mode Styles ──────────────────────────────────── */
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
    background: var(--color-aurora-glow, rgba(2, 132, 199, 0.12));
    border: 1px solid rgba(2, 132, 199, 0.28);
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
    color: var(--color-aurora-bright, #0369a1);
    font-family: var(--font-brand);
    font-size: 24px;
  }

  .queue-card, .dossier-card {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-lg);
    padding: 20px;
  }

  .dossier-card { min-height: 460px; }

  .card-heading {
    align-items: center;
    border-bottom: 1px solid var(--color-graphite-border);
    display: flex;
    justify-content: space-between;
    padding-bottom: 12px;
  }

  .card-heading h2 {
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
    background: var(--color-horizon-glow, rgba(217, 119, 6, 0.08));
  }

  .item-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .item-copy strong { color: var(--color-heading); font-size: 12.5px; }

  .assignment-chip-title {
    color: var(--color-slate-light);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .item-copy small { color: var(--color-slate-muted); font-size: 10px; }

  .grade-pill {
    background: var(--color-signal-green-bg, #ecfdf5);
    border: 1px solid rgba(5, 150, 105, 0.2);
    border-radius: 99px;
    color: var(--color-signal-green-text, #065f46);
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
  }

  .empty-dossier {
    color: var(--color-slate-muted);
    font-size: 12px;
    line-height: 1.6;
    padding: 48px 20px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .empty-icon { font-size: 36px; }
  .empty-dossier strong { color: var(--color-heading); font-size: 14px; }
  .empty-dossier p { max-width: 340px; margin: 0; }

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

  /* ── Standalone Grade Form ───────────────────────────────────── */
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
    background: var(--input-bg, #fff);
    border: 1px solid var(--input-border, #d5d8ce);
    border-radius: var(--radius-sm);
    color: var(--color-slate-bright);
    font: inherit;
    font-size: 12.5px;
    padding: 10px;
  }

  .grade-form input:focus, .grade-form textarea:focus {
    border-color: var(--input-focus-border, var(--color-horizon-blue));
    outline: none;
  }

  /* ── Shared Utilities ────────────────────────────────────────── */
  .load-error {
    align-items: center;
    background: var(--color-rose-bg, #fef2f2);
    border: 1px solid rgba(220, 38, 38, 0.2);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 250px;
    justify-content: center;
    text-align: center;
  }

  .load-error strong { color: var(--color-rose-text, #991b1b); }
  .load-error p { color: var(--color-slate-light); font-size: 12px; margin: 0; max-width: 540px; }

  .notice {
    border-radius: var(--radius-sm);
    font-size: 12px;
    padding: 11px 14px;
  }

  .notice.success {
    background: var(--color-signal-green-bg, #ecfdf5);
    border: 1px solid rgba(5, 150, 105, 0.2);
    color: var(--color-signal-green-text, #065f46);
  }

  .notice.error {
    background: var(--color-rose-bg, #fef2f2);
    border: 1px solid rgba(220, 38, 38, 0.2);
    color: var(--color-rose-text, #991b1b);
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
    border: 3px solid rgba(217, 119, 6, 0.2);
    border-radius: 50%;
    border-top-color: var(--color-horizon-bright);
    height: 26px;
    width: 26px;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 900px) {
    .split-pane {
      grid-template-columns: 1fr;
    }

    .roster-sidebar {
      position: static;
      height: auto;
      max-height: 240px;
      border-right: none;
      border-bottom: 1px solid var(--color-graphite-border);
    }

    .dossier-pane {
      max-height: none;
    }

    .standalone-grid { grid-template-columns: 1fr; }
    .review-header { flex-direction: column; }
    .queue-count { align-self: flex-start; }
  }
</style>
