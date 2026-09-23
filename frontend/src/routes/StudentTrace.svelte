<script>
  import { onMount } from 'svelte';
  import ThinkingTimeline from '../lib/ThinkingTimeline.svelte';
  import {
    formatDate,
    getStudentId,
    responseError,
    routeParams,
    sessionAccessTokenStorageKey,
    sessionStorageKey,
  } from '../lib/session.js';

  let courseId = $state('');
  let assignmentId = $state('');
  let sessionId = $state('');
  let sessionAccessToken = $state('');
  let trace = $state([]);
  let reasoningNodes = $state([]);
  let activityNodes = $state([]);
  let activeTimelineTab = $state('reasoning'); // 'reasoning' | 'activity'
  let expandedReasoningNode = $state(-1);
  let expandedActivityNode = $state(-1);
  let dossier = $state(null);
  let activeNode = $state(null);
  let isLoading = $state(true);
  let isSubmitting = $state(false);
  let status = $state('');
  let error = $state('');

  function eventTitle(event) {
    const titles = {
      student_prompt_submitted: 'Reasoning attempt',
      tutor_turn_completed: 'Socratic probe',
      hint_delivered: 'Requested scaffold',
      adversarial_probe_defended: 'Integrity boundary',
      misconception_flagged: 'Misconception signal',
      canvas_section_saved: 'Canvas section revised',
      canvas_suggestion_offered: 'Optional support offered',
      canvas_suggestion_accepted: 'Support frame applied and edited',
      canvas_suggestion_dismissed: 'Support frame dismissed',
      student_submitted_for_review: 'Submitted for educator review',
      grade_finalised_by_educator: 'Educator finalization',
    };
    return titles[event.event_type] || event.event_type.replaceAll('_', ' ');
  }

  function eventClass(event) {
    if (event.event_type === 'student_prompt_submitted') return 'student';
    if (event.event_type === 'hint_delivered') return 'hint';
    if (event.event_type.startsWith('canvas_')) return 'canvas';
    if (event.event_type === 'adversarial_probe_defended') return 'guardrail';
    if (event.event_type.includes('submitted') || event.event_type.includes('finalised')) return 'complete';
    return 'tutor';
  }

  async function loadTrace() {
    const params = routeParams();
    courseId = params.get('course_id') || '';
    assignmentId = params.get('assignment_id') || '';
    sessionId = params.get('session_id') || '';

    // If session_id is not in URL, try restoring persisted session for the assignment
    if (!sessionId && assignmentId) {
      const persisted = localStorage.getItem(sessionStorageKey(assignmentId, getStudentId()));
      if (persisted) sessionId = persisted;
    }

    if (!sessionId) return;

    sessionAccessToken = localStorage.getItem(sessionAccessTokenStorageKey(sessionId)) || '';
    const sessionHeaders = sessionAccessToken ? { 'X-Fiosra-Session-Token': sessionAccessToken } : {};

    const [traceResponse, reasoningRes, activityRes, dossierResponse] = await Promise.all([
      fetch(`/evidence/trace/${sessionId}`),
      fetch(`/evidence/trace/${sessionId}/reasoning`),
      fetch(`/evidence/trace/${sessionId}/activity`),
      fetch(`/evidence/dossier/${sessionId}`),
    ]);

    if (!traceResponse.ok) throw new Error(await responseError(traceResponse, 'The reasoning trace could not be loaded.'));
    trace = (await traceResponse.json()).trace_nodes || [];

    if (reasoningRes.ok) {
      const rData = await reasoningRes.json();
      reasoningNodes = rData.nodes || [];
    }
    if (activityRes.ok) {
      const aData = await activityRes.json();
      activityNodes = aData.nodes || [];
    }
    if (dossierResponse.ok) {
      dossier = await dossierResponse.json();
    }

    try {
      const sessionResponse = await fetch(`/events/session/${sessionId}`, { headers: sessionHeaders });
      if (sessionResponse.ok) {
        status = (await sessionResponse.json()).session?.status || '';
      }
    } catch {
      // Session status is optional
    }
    activeNode = trace[trace.length - 1]?.event_id || null;
  }

  async function submitForReview() {
    if (!sessionId || status !== 'active') return;
    isSubmitting = true;
    error = '';
    try {
      const response = await fetch(`/events/session/${sessionId}/submit`, {
        method: 'POST',
        headers: { 'X-Fiosra-Session-Token': sessionAccessToken },
      });
      if (!response.ok) throw new Error(await responseError(response, 'The work could not be submitted.'));
      status = 'submitted';
      await loadTrace();
    } catch (err) {
      error = err.message || 'The work could not be submitted.';
    } finally {
      isSubmitting = false;
    }
  }

  onMount(async () => {
    try {
      await loadTrace();
    } catch (err) {
      error = err.message || 'The reasoning trace could not be initialized.';
    } finally {
      isLoading = false;
    }
  });
</script>

<main class="trace-page">
  {#if isLoading}
    <div class="loading"><div class="spinner"></div><span>Assembling your evidence packet…</span></div>
  {:else if !sessionId}
    <div class="empty">
      <div class="empty-icon" style="font-size: 36px; margin-bottom: 8px;">🔍</div>
      <h1>No Active Reasoning Session Selected</h1>
      <p>The Evidence Flight Recorder captures claims, Socratic probes, and self-corrections during an active reasoning session.</p>
      <div style="display: flex; gap: 12px; margin-top: 14px; justify-content: center; flex-wrap: wrap;">
        <a class="btn btn-primary" href={courseId ? `#/student?course_id=${encodeURIComponent(courseId)}` : '#/student'}>
          ✍️ Open Reasoning Canvas
        </a>
        <a class="btn btn-secondary" href={courseId ? `#/student/home?course_id=${encodeURIComponent(courseId)}` : '#/student/portal'}>
          Course Map
        </a>
        <a class="btn btn-secondary" href="#/student/timeline">
          📈 View Progression Timeline
        </a>
      </div>
    </div>
  {:else if error && !dossier}
    <div class="empty">
      <h1>Trace Unavailable</h1>
      <p>{error}</p>
      <div style="display: flex; gap: 12px; margin-top: 14px; justify-content: center;">
        <a class="btn btn-primary" href={courseId ? `#/student?course_id=${encodeURIComponent(courseId)}` : '#/student'}>
          Return to Canvas
        </a>
        <a class="btn btn-secondary" href="#/student/portal">
          All Courses
        </a>
      </div>
    </div>
  {:else}
    <header class="trace-header">
      <div><div class="eyebrow">Student evidence packet</div><h1>A path made visible</h1><p>Review the chronological record of your claims, requested support, and revisions before sharing it with your educator.</p></div>
      <div class="score-card"><span>Suggested AutoSCORE</span><strong>{dossier?.executive_summary?.suggested_grade || '—'}</strong><small>{dossier?.executive_summary?.autonomy_rating || 'No score yet'}</small></div>
    </header>

    <section class="metric-grid">
      <div><span>Reasoning events</span><strong>{trace.length}</strong></div>
      <div><span>Hint dependency</span><strong>{Math.round((dossier?.aggregate_metrics?.hint_dependency_ratio || 0) * 100)}%</strong></div>
      <div><span>Misconceptions encountered</span><strong>{dossier?.aggregate_metrics?.total_misconceptions_encountered || 0}</strong></div>
      <div><span>Session status</span><strong class:active={status === 'active'} class:submitted={status === 'submitted'}>{status || 'unknown'}</strong></div>
    </section>

    <section class="trace-card">
      <div class="card-heading">
        <div>
          <h2>Chronological reasoning trace</h2>
          <p>Dual timeline: intellectual development vs append-only audit log.</p>
        </div>
        <div class="trace-subtab-bar">
          <button
            type="button"
            class="subtab-btn"
            class:active={activeTimelineTab === 'reasoning'}
            onclick={() => activeTimelineTab = 'reasoning'}
          >
            💡 Reasoning Trace ({reasoningNodes.length})
          </button>
          <button
            type="button"
            class="subtab-btn"
            class:active={activeTimelineTab === 'activity'}
            onclick={() => activeTimelineTab = 'activity'}
          >
            ⏱️ Activity Log ({activityNodes.length})
          </button>
        </div>
      </div>

      {#if activeTimelineTab === 'reasoning'}
        {#if reasoningNodes.length === 0}
          <div class="empty-trace">No reasoning milestones have been recorded yet. Return to the canvas and articulate an initial claim.</div>
        {:else}
          <div class="timeline-container">
            <ThinkingTimeline
              nodes={reasoningNodes}
              showContent={true}
              showDiff={true}
              expandedNodeIndex={expandedReasoningNode}
              onNodeClick={(idx) => {
                expandedReasoningNode = expandedReasoningNode === idx ? -1 : idx;
              }}
            />
          </div>
        {/if}
      {:else}
        {#if activityNodes.length === 0}
          <div class="empty-trace">No activity events recorded yet.</div>
        {:else}
          <div class="timeline-container">
            <ThinkingTimeline
              nodes={activityNodes}
              showContent={true}
              showDiff={false}
              expandedNodeIndex={expandedActivityNode}
              onNodeClick={(idx) => {
                expandedActivityNode = expandedActivityNode === idx ? -1 : idx;
              }}
            />
          </div>
        {/if}
      {/if}
    </section>

    {#if activeNode}
      {@const selected = trace.find((event) => event.event_id === activeNode)}
      {#if selected}
        <section class="detail-card">
          <div class="eyebrow">Selected trace evidence</div>
          <h2>{eventTitle(selected)}</h2>
          <p>{selected.summary}</p>
          {#if selected.payload?.thoughts_of_tutorbot}<div class="reflection"><strong>Socratic strategy</strong><span>{selected.payload.thoughts_of_tutorbot.strategy_selected}</span></div>{/if}
        </section>
      {/if}
    {/if}

    <section class="submission-card">
      <div><h2>{status === 'completed' ? 'Educator review completed' : status === 'submitted' ? 'Submitted for educator review' : 'Ready for educator review?'}</h2><p>{status === 'active' ? 'Submitting sends your complete event trace and evidence dossier to the educator’s review queue. It does not assign a grade.' : status === 'submitted' ? 'Your reasoning trace is now waiting for a sovereign educator decision.' : 'The educator has recorded a final outcome for this session.'}</p></div>
      <div class="submission-actions">
        <a class="btn btn-secondary" href={`#/student?course_id=${encodeURIComponent(courseId)}&assignment_id=${encodeURIComponent(assignmentId)}`}>Back to canvas</a>
        {#if status === 'active'}<button class="btn btn-success" onclick={submitForReview} disabled={isSubmitting || trace.length === 0}>{isSubmitting ? 'Submitting…' : 'Submit for review'}</button>{/if}
        {#if status === 'submitted'}<a class="btn btn-primary" href={`#/review?course_id=${encodeURIComponent(courseId)}`}>Open review queue →</a>{/if}
      </div>
    </section>
    {#if error}<div class="error-banner">{error}</div>{/if}
  {/if}
</main>

<style>
  .trace-page{background:var(--color-obsidian);color:var(--color-slate-bright);min-height:calc(100vh - 56px);padding:38px 24px 80px}
  .trace-header,.metric-grid,.trace-card,.detail-card,.submission-card{max-width:1120px;margin-left:auto;margin-right:auto}
  .trace-header{border-bottom:1px solid var(--color-graphite-border);display:flex;justify-content:space-between;gap:28px;padding-bottom:24px}
  .eyebrow{color:var(--color-slate-muted);font-size:11px;font-weight:700;letter-spacing:.55px;text-transform:uppercase}
  .trace-header h1{color:var(--color-heading);font-family:var(--font-brand);font-size:29px;margin:5px 0 6px}
  .trace-header p{color:var(--color-slate-light);font-size:13px;line-height:1.5;margin:0;max-width:720px}
  .score-card{background:var(--color-graphite);border:1px solid var(--color-graphite-border);border-radius:var(--fio-radius-md);display:flex;flex-direction:column;gap:3px;min-width:160px;padding:15px;text-align:right}
  .score-card span,.score-card small{color:var(--color-slate-muted);font-size:10px;text-transform:uppercase}
  .score-card strong{color:#3e7f58;font-family:var(--font-brand);font-size:30px}
  .metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:24px}
  .metric-grid>div{background:var(--color-graphite);border:1px solid var(--color-graphite-border);border-radius:var(--fio-radius-md);display:flex;flex-direction:column;gap:5px;padding:15px}
  .metric-grid span{color:var(--color-slate-muted);font-size:10px;font-weight:700;text-transform:uppercase}
  .metric-grid strong{color:var(--color-heading);font-family:var(--font-brand);font-size:20px;text-transform:capitalize}
  .metric-grid strong.active{color:#3e7f58}
  .metric-grid strong.submitted{color:#8a6018}
  .trace-card,.detail-card,.submission-card{background:var(--color-graphite);border:1px solid var(--color-graphite-border);border-radius:var(--fio-radius-lg);margin-top:20px;padding:22px}
  .card-heading{align-items:flex-start;border-bottom:1px solid var(--color-graphite-border);display:flex;justify-content:space-between;gap:15px;padding-bottom:14px;flex-wrap:wrap}
  .card-heading h2,.detail-card h2,.submission-card h2{color:var(--color-heading);font-size:16px;margin:0 0 4px}
  .card-heading p,.submission-card p{color:var(--color-slate-muted);font-size:12px;margin:0}
  .card-heading>span{color:var(--color-horizon-bright);font-size:11px;font-weight:700}
  .trace-subtab-bar{display:flex;gap:8px;align-items:center}
  .subtab-btn{background:transparent;border:1px solid var(--color-graphite-border);border-radius:var(--fio-radius-sm,6px);color:var(--color-slate-muted);cursor:pointer;font-size:12px;font-weight:600;padding:6px 12px;transition:all .15s ease}
  .subtab-btn:hover{color:var(--color-slate-bright);border-color:var(--color-horizon-bright)}
  .subtab-btn.active{background:rgba(59,130,246,.15);border-color:var(--color-horizon-bright);color:#38bdf8}
  .timeline-container{margin-top:12px}
  .timeline{display:flex;flex-direction:column;margin-top:8px}
  .timeline-row{align-items:flex-start;background:transparent;border:0;border-left:2px solid var(--color-graphite-border);color:inherit;cursor:pointer;display:flex;gap:13px;padding:13px 0 13px 16px;text-align:left;width:100%}
  .timeline-row:hover,.timeline-row.active{background:rgba(59,130,246,.07);border-left-color:var(--color-horizon-bright)}
  .node{align-items:center;background:var(--color-graphite-card);border:1px solid var(--color-graphite-border);border-radius:50%;color:var(--color-slate-light);display:flex;flex:0 0 28px;font-size:11px;font-weight:700;height:28px;justify-content:center}
  .student .node{border-color:#0ea5e9;color:#7dd3fc}
  .hint .node{border-color:#d89a3a;color:#8a6018}
  .guardrail .node{border-color:#ef4444;color:#8a3535}
  .complete .node{border-color:#10b981;color:#3e7f58}
  .event-copy{display:flex;flex-direction:column;gap:2px;min-width:0}
  .event-copy strong{color:var(--color-heading);font-size:12px;text-transform:capitalize}
  .event-copy small{color:var(--color-slate-muted);font-size:10px}
  .event-copy>span{color:var(--color-slate-light);font-size:12px;line-height:1.5;margin-top:3px;overflow-wrap:anywhere}
  .detail-card p{color:var(--color-slate-light);font-size:13px;line-height:1.6;margin:9px 0}
  .reflection{background:var(--color-obsidian);border:1px solid var(--color-graphite-border);border-radius:var(--fio-radius-sm);display:flex;flex-direction:column;gap:4px;padding:12px}
  .reflection strong{color:var(--color-horizon-bright);font-size:11px;text-transform:uppercase}
  .reflection span{color:var(--color-slate-light);font-size:12px}
  .submission-card{align-items:center;background:linear-gradient(135deg,rgba(16,185,129,.11),rgba(59,130,246,.1));border-color:rgba(16,185,129,.3);display:flex;justify-content:space-between;gap:22px}
  .submission-card p{line-height:1.5;max-width:650px}
  .submission-actions{display:flex;gap:10px;flex-shrink:0}
  .error-banner{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:var(--fio-radius-sm);color:#8a3535;font-size:12px;margin:12px auto 0;max-width:1120px;padding:10px 12px}
  .empty-trace{color:var(--color-slate-muted);font-size:13px;padding:28px 0;text-align:center}
  .loading,.empty{align-items:center;display:flex;flex-direction:column;gap:13px;justify-content:center;min-height:calc(100vh - 160px);text-align:center}
  .empty h1{color:var(--color-heading);font-family:var(--font-brand);font-size:25px}
  .empty p{color:var(--color-slate-light);max-width:500px}
  .spinner{animation:spin .8s linear infinite;border:3px solid rgba(59,130,246,.2);border-radius:50%;border-top-color:var(--color-horizon-bright);height:28px;width:28px}
  @keyframes spin{to{transform:rotate(360deg)}}
  @media(max-width:780px){.trace-page{padding:26px 16px 60px}.trace-header,.submission-card{align-items:flex-start;flex-direction:column}.metric-grid{grid-template-columns:repeat(2,1fr)}.submission-actions{width:100%}.submission-actions .btn{flex:1}}
  @media(max-width:460px){.metric-grid{grid-template-columns:1fr}.submission-actions{flex-direction:column}.score-card{text-align:left;width:100%}}
</style>
