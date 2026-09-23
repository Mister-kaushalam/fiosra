<script>
  import { onMount } from 'svelte';
  import ThinkingTimeline from './ThinkingTimeline.svelte';

  let {
    graphMetrics = { claims: 0, evidence: 0, warrants: 0, assumptions: 0, probes: 0 },
    graphSections = [],
    probes = [],
    readinessItems = [],
    readinessSummary = { met: 0, total: 0 },
    sessionStatus = 'active',
    submittedRevision = null,
    submittedAt = null,
    submissionNotice = '',
    submissionError = null,
    isSubmitting = false,
    onSubmitMilestone = async () => null,
    sessionEvents = [],
    sourceLookupResults = {},
    sourceActionBusy = false,
    sourceReferenceForBlock = () => [],
    openAssignedSource = () => null,
    findAssignedEvidence = () => null,
    useLocatedEvidenceForClaim = () => null,
    onJumpToBlock = () => null,
    onExamineProbe = () => null,
    promptTitle = '',
    cognitivePivots = [],
    sessionId = '',
    activeTraceSubTab = 'reasoning',
    onSubTabChange = () => null,
  } = $props();

  let currentSubTab = $state(activeTraceSubTab);

  $effect(() => {
    currentSubTab = activeTraceSubTab;
  });

  // Dual timeline data
  let reasoningNodes = $state([]);
  let activityNodes = $state([]);
  let expandedReasoningNode = $state(-1);
  let expandedActivityNode = $state(-1);
  let timelineLoading = $state(false);

  async function loadTimelines() {
    if (!sessionId) return;
    timelineLoading = true;
    try {
      const [reasoningRes, activityRes] = await Promise.all([
        fetch(`/evidence/trace/${sessionId}/reasoning`),
        fetch(`/evidence/trace/${sessionId}/activity`),
      ]);
      if (reasoningRes.ok) {
        const data = await reasoningRes.json();
        reasoningNodes = data.nodes || [];
      }
      if (activityRes.ok) {
        const data = await activityRes.json();
        activityNodes = data.nodes || [];
      }
    } catch (err) {
      console.warn('Loading thinking timelines:', err);
    } finally {
      timelineLoading = false;
    }
  }

  // Load timelines on mount and when sessionEvents change (new events arrive)
  onMount(() => { loadTimelines(); });

  // Reactively reload when session events change (new activity)
  $effect(() => {
    if (sessionEvents.length > 0 && sessionId) {
      loadTimelines();
    }
  });
</script>

<div class="engagement-trace-root" aria-label="Reasoning & Activity Timeline">
  <!-- Sub-tabs to easily switch between Reasoning Trace and Activity Log -->
  <div class="trace-subtab-bar">
    <button
      type="button"
      class="subtab-btn"
      class:active={currentSubTab === 'reasoning'}
      onclick={() => { currentSubTab = 'reasoning'; onSubTabChange('reasoning'); }}
    >
      💡 Reasoning
    </button>
    <button
      type="button"
      class="subtab-btn"
      class:active={currentSubTab === 'activity'}
      onclick={() => { currentSubTab = 'activity'; onSubTabChange('activity'); }}
    >
      ⏱️ Activity
    </button>
  </div>

  <div class="trace-scrollable-content">
    <!-- Top Metrics Summary (Compact 4-Tile Grid) -->
    <div class="trace-metrics-grid">
      <div class="metric-tile claims">
        <span class="metric-val">{graphMetrics.claims}</span>
        <span class="metric-lbl">Claims Drafted</span>
      </div>
      <div class="metric-tile evidence">
        <span class="metric-val">{graphMetrics.evidence}</span>
        <span class="metric-lbl">Evidence Grounded</span>
      </div>
      <div class="metric-tile warrants">
        <span class="metric-val">{graphMetrics.warrants}</span>
        <span class="metric-lbl">Causal Warrants</span>
      </div>
      <div class="metric-tile assumptions">
        <span class="metric-val">{graphMetrics.assumptions}</span>
        <span class="metric-lbl">Assumptions</span>
      </div>
    </div>

    {#if currentSubTab === 'reasoning'}
      <!-- TAB 1: CURATED REASONING TRACE -->
      <section class="trace-panel-card timeline-panel-card">
        <header class="panel-card-header">
          <div class="header-titles">
            <span class="card-eyebrow">Intellectual Evolution</span>
            <h4>Curated Reasoning Trace</h4>
          </div>
          <span class="node-count-badge">{reasoningNodes.length} milestones</span>
        </header>
        <p class="timeline-intro">Key moments where hypotheses formed, met friction, and evolved.</p>
        {#if timelineLoading}
          <div class="timeline-loading-state"><div class="spinner"></div><span>Tracing reasoning path…</span></div>
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
      </section>
    {:else if currentSubTab === 'activity'}
      <!-- TAB 2: CHRONOLOGICAL ACTIVITY LOG -->
      <section class="trace-panel-card timeline-panel-card">
        <header class="panel-card-header">
          <div class="header-titles">
            <span class="card-eyebrow">Append-Only Audit</span>
            <h4>Mechanical Activity Log</h4>
          </div>
          <span class="node-count-badge">{activityNodes.length} events</span>
        </header>
        <p class="timeline-intro">Complete chronological event record of draft saves, tutor exchanges, and marginalia probes.</p>
        {#if timelineLoading}
          <div class="timeline-loading-state"><div class="spinner"></div><span>Loading activity log…</span></div>
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
      </section>
    {/if}
  </div>
</div>

<style>
  .engagement-trace-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--color-obsidian, #ffffff);
    overflow: hidden;
  }

  :global([data-theme="dark"]) .engagement-trace-root {
    background: #0d1117;
  }

  .trace-subtab-bar {
    display: flex;
    gap: 4px;
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.03);
    border-bottom: 1px solid var(--color-graphite-border, #e2e8f0);
    flex-shrink: 0;
  }

  :global([data-theme="dark"]) .trace-subtab-bar {
    background: rgba(255, 255, 255, 0.03);
    border-color: #30363d;
  }

  .subtab-btn {
    flex: 1;
    padding: 6px 10px;
    font-size: 0.72rem;
    font-weight: 600;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-slate-subtle, #64748b);
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  :global([data-theme="dark"]) .subtab-btn {
    color: #8b949e;
  }

  .subtab-btn:hover {
    color: var(--color-slate-bright, #0f172a);
    background: rgba(0, 0, 0, 0.04);
  }

  :global([data-theme="dark"]) .subtab-btn:hover {
    color: #f0f6fc;
    background: rgba(255, 255, 255, 0.06);
  }

  .subtab-btn.active {
    background: var(--color-surface, #ffffff);
    color: var(--color-aurora, #7b61ff);
    border-color: var(--color-graphite-border, #cbd5e1);
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }

  :global([data-theme="dark"]) .subtab-btn.active {
    background: #21262d;
    color: #38bdf8;
    border-color: #30363d;
  }

  .trace-scrollable-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px 14px 40px 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* Metric 4-Tile Grid */
  .trace-metrics-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    flex-shrink: 0;
  }

  .metric-tile {
    background: var(--color-surface, #ffffff);
    border: 1px solid var(--color-graphite-border, #e2e8f0);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.03);
  }

  :global([data-theme="dark"]) .metric-tile {
    background: #161b22;
    border-color: #30363d;
  }

  .metric-val {
    font-size: 1.3rem;
    font-weight: 800;
    line-height: 1.1;
  }

  .metric-tile.claims .metric-val { color: #7b61ff; }
  .metric-tile.evidence .metric-val { color: #059669; }
  .metric-tile.warrants .metric-val { color: #7c3aed; }
  .metric-tile.assumptions .metric-val { color: #4f6bff; }

  :global([data-theme="dark"]) .metric-tile.claims .metric-val { color: #38bdf8; }
  :global([data-theme="dark"]) .metric-tile.evidence .metric-val { color: #34d399; }
  :global([data-theme="dark"]) .metric-tile.warrants .metric-val { color: #a78bfa; }
  :global([data-theme="dark"]) .metric-tile.assumptions .metric-val { color: #d89a3a; }

  .metric-lbl {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-slate-subtle, #64748b);
  }

  :global([data-theme="dark"]) .metric-lbl {
    color: #8b949e;
  }

  /* Card */
  .trace-panel-card {
    background: var(--color-surface, #ffffff);
    border: 1px solid var(--color-graphite-border, #e2e8f0);
    border-radius: 10px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  :global([data-theme="dark"]) .trace-panel-card {
    background: #161b22;
    border-color: #30363d;
  }

  .panel-card-header {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .header-titles {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .card-eyebrow {
    font-size: 0.62rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-aurora, #7b61ff);
  }

  .panel-card-header h4 {
    margin: 0;
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--color-slate-bright, #0f172a);
  }

  :global([data-theme="dark"]) .panel-card-header h4 {
    color: #f0f6fc;
  }

  .node-count-badge {
    font-size: 0.68rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 99px;
    background: rgba(123, 97, 255, 0.08);
    color: var(--color-aurora, #7b61ff);
    border: 1px solid rgba(123, 97, 255, 0.2);
    white-space: nowrap;
  }

  :global([data-theme="dark"]) .node-count-badge {
    background: rgba(56, 189, 248, 0.1);
    color: #38bdf8;
    border-color: rgba(56, 189, 248, 0.25);
  }

  .timeline-intro {
    font-size: 0.76rem;
    color: var(--color-slate-muted, #64748b);
    line-height: 1.45;
    margin: -4px 0 6px 0;
  }

  :global([data-theme="dark"]) .timeline-intro {
    color: #8b949e;
  }

  .timeline-loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 36px 12px;
    color: var(--color-slate-muted, #64748b);
    font-size: 0.8rem;
  }

  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(123, 97, 255, 0.2);
    border-top-color: var(--color-aurora, #7b61ff);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-trace-state, .empty-dossier-state {
    text-align: center;
    padding: 24px 12px;
    color: var(--color-slate-subtle, #64748b);
    font-size: 0.78rem;
  }

  .graph-root-node {
    padding: 8px 12px;
    background: rgba(123, 97, 255, 0.06);
    border: 1px solid rgba(123, 97, 255, 0.2);
    border-radius: 8px;
    margin-bottom: 8px;
  }

  .node-badge-chip.root {
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    color: #7b61ff;
  }

  .graph-root-node h5 {
    margin: 2px 0 0;
    font-size: 0.8rem;
    color: var(--color-slate-bright, #0f172a);
  }

  :global([data-theme="dark"]) .graph-root-node h5 {
    color: #f0f6fc;
  }

  /* Tree Sections */
  .trace-tree-sections {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .graph-section-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-branch-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.74rem;
    font-weight: 700;
    color: var(--color-slate-subtle, #475569);
  }

  :global([data-theme="dark"]) .section-branch-header {
    color: #8b949e;
  }

  .section-children-tree {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-left: 10px;
    border-left: 2px solid rgba(0, 0, 0, 0.06);
  }

  :global([data-theme="dark"]) .section-children-tree {
    border-left-color: rgba(255, 255, 255, 0.08);
  }

  .graph-claim-node {
    background: var(--color-surface, #ffffff);
    border: 1px solid var(--color-graphite-border, #e2e8f0);
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.76rem;
  }

  :global([data-theme="dark"]) .graph-claim-node {
    background: #0d1117;
    border-color: #30363d;
  }

  .graph-claim-node.claim { border-left: 3px solid #7b61ff; }
  .graph-claim-node.evidence { border-left: 3px solid #059669; }
  .graph-claim-node.reasoning { border-left: 3px solid #7c3aed; }
  .graph-claim-node.assumption { border-left: 3px solid #4f6bff; }

  .claim-node-top {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .claim-badge-icon { font-size: 0.82rem; }
  .claim-type-label { font-weight: 700; font-size: 0.72rem; }

  .claim-status-tag {
    font-size: 0.62rem;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 4px;
  }

  .claim-status-tag.grounded { background: rgba(5, 150, 105, 0.12); color: #059669; }
  .claim-status-tag.probe { background: rgba(79, 107, 255, 0.12); color: #4f6bff; }
  .claim-status-tag.premature { background: rgba(220, 38, 38, 0.12); color: #dc2626; }
  .claim-status-tag.ungrounded { background: rgba(100, 116, 139, 0.12); color: #64748b; }

  .claim-excerpt {
    margin: 0;
    font-size: 0.74rem;
    line-height: 1.4;
    color: var(--color-slate-bright, #1e293b);
  }

  :global([data-theme="dark"]) .claim-excerpt {
    color: #c9d1d9;
  }

  .claim-source-links {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .btn-ref-pill {
    background: rgba(123, 97, 255, 0.08);
    color: #7b61ff;
    border: none;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 0.68rem;
    cursor: pointer;
  }

  .claim-node-actions {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-top: 2px;
  }

  .node-jump-btn, .node-probe-btn, .node-source-btn {
    font-size: 0.68rem;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid var(--color-graphite-border, #cbd5e1);
    background: transparent;
    color: var(--color-slate-subtle, #475569);
    transition: all 0.12s ease;
  }

  :global([data-theme="dark"]) .node-jump-btn,
  :global([data-theme="dark"]) .node-probe-btn,
  :global([data-theme="dark"]) .node-source-btn {
    border-color: #30363d;
    color: #8b949e;
  }

  .node-jump-btn:hover { background: rgba(123, 97, 255, 0.08); color: #7b61ff; border-color: #7b61ff; }
  .node-probe-btn:hover { background: rgba(124, 58, 237, 0.08); color: #7c3aed; border-color: #7c3aed; }
  .node-source-btn:hover { background: rgba(5, 150, 105, 0.08); color: #059669; border-color: #059669; }

  .empty-leaf-note {
    font-size: 0.7rem;
    color: var(--color-slate-subtle, #94a3b8);
    font-style: italic;
    margin: 0;
  }

  /* Candidate article */
  .assigned-evidence-results {
    margin-top: 6px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 6px;
  }

  .candidate-article {
    margin-top: 4px;
    font-size: 0.7rem;
  }

  .candidate-actions {
    display: flex;
    gap: 4px;
    margin-top: 4px;
  }

  .candidate-actions button {
    font-size: 0.65rem;
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid var(--color-graphite-border, #cbd5e1);
    background: transparent;
    cursor: pointer;
  }

  /* Readiness */
  .readiness-self-review {
    padding: 12px;
    background: rgba(123, 97, 255, 0.04);
    border: 1px solid rgba(123, 97, 255, 0.16);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .readiness-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .readiness-header h5 {
    margin: 2px 0 0;
    font-size: 0.8rem;
    color: var(--color-slate-bright, #0f172a);
  }

  :global([data-theme="dark"]) .readiness-header h5 {
    color: #f0f6fc;
  }

  .readiness-count-badge {
    font-size: 0.68rem;
    font-weight: 700;
    padding: 2px 6px;
    background: rgba(123, 97, 255, 0.12);
    color: #7b61ff;
    border-radius: 999px;
  }

  .readiness-intro {
    font-size: 0.7rem;
    color: var(--color-slate-subtle, #64748b);
    margin: 0;
  }

  .readiness-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .readiness-item {
    display: flex;
    gap: 6px;
    font-size: 0.72rem;
    align-items: flex-start;
    color: var(--color-slate-subtle, #64748b);
  }

  .readiness-item.met {
    color: #059669;
  }

  .item-check { font-weight: 700; }
  .item-content { display: flex; flex-direction: column; }
  .item-content small { font-size: 0.65rem; color: #94a3b8; }

  /* Milestone Submission */
  .milestone-submission-banner {
    padding: 12px;
    background: rgba(0, 0, 0, 0.02);
    border: 1px solid var(--color-graphite-border, #e2e8f0);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  :global([data-theme="dark"]) .milestone-submission-banner {
    background: rgba(255, 255, 255, 0.02);
    border-color: #30363d;
  }

  .submission-meta h5 {
    margin: 4px 0 2px;
    font-size: 0.8rem;
  }

  .submission-meta p {
    font-size: 0.7rem;
    color: var(--color-slate-subtle, #64748b);
    margin: 0;
  }

  .sub-badge {
    display: inline-block;
    font-size: 0.62rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(79, 107, 255, 0.12);
    color: #4f6bff;
  }

  .sub-badge.submitted {
    background: rgba(5, 150, 105, 0.12);
    color: #059669;
  }

  .submission-complete-pill {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 6px;
    background: rgba(5, 150, 105, 0.08);
    border: 1px solid rgba(5, 150, 105, 0.25);
    color: #047857;
    font-size: 0.74rem;
  }

  .submission-msg {
    line-height: 1.4;
    font-weight: 500;
  }

  .btn-download-submission-pdf {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: 5px;
    background: #059669;
    color: #ffffff;
    font-size: 0.72rem;
    font-weight: 600;
    text-decoration: none;
    transition: background 0.15s ease;
  }

  .btn-download-submission-pdf:hover {
    background: #047857;
  }

  .btn-submit-milestone {
    width: 100%;
    padding: 8px 14px;
    border-radius: 6px;
    background: var(--color-aurora, #7b61ff);
    color: #ffffff;
    font-size: 0.76rem;
    font-weight: 700;
    border: none;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .btn-submit-milestone:hover:not(:disabled) {
    background: #6349e8;
  }

  .btn-submit-milestone:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .submission-status-note {
    font-size: 0.7rem;
    color: #059669;
    margin: 0;
  }

  .submission-status-note.submission-error {
    color: #dc2626;
  }

  /* Dossier */
  .dossier-section-title {
    font-size: 0.78rem;
    font-weight: 700;
    margin: 6px 0 2px;
    color: var(--color-slate-bright, #0f172a);
  }

  :global([data-theme="dark"]) .dossier-section-title {
    color: #f0f6fc;
  }

  .dossier-events-stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .dossier-event-item {
    padding: 8px 10px;
    background: rgba(0, 0, 0, 0.02);
    border: 1px solid var(--color-graphite-border, #e2e8f0);
    border-radius: 6px;
    font-size: 0.72rem;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  :global([data-theme="dark"]) .dossier-event-item {
    background: #0d1117;
    border-color: #30363d;
  }

  .event-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .event-type-pill {
    font-size: 0.62rem;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(124, 58, 237, 0.1);
    color: #7c3aed;
  }

  .event-time {
    font-size: 0.62rem;
    color: #94a3b8;
  }

  .event-text {
    margin: 0;
    font-size: 0.7rem;
  }

  .event-student-note {
    font-size: 0.68rem;
    background: rgba(123, 97, 255, 0.06);
    padding: 4px 6px;
    border-radius: 4px;
  }

  .event-move-tag {
    font-size: 0.62rem;
    color: #64748b;
  }

  /* Subtle Scholastic Additions */
  .scholastic-node-nav {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px dashed var(--color-graphite-border);
    font-size: 0.72rem;
    font-family: var(--font-ui);
  }

  .scholastic-nav-link {
    background: none;
    border: none;
    padding: 0;
    font-size: inherit;
    font-family: inherit;
    color: var(--color-slate-muted);
    cursor: pointer;
    transition: color 0.15s ease;
  }

  .scholastic-nav-link:hover {
    color: var(--color-heading);
    text-decoration: underline;
  }

  .scholastic-nav-link.jump {
    color: var(--color-horizon-blue, #4f6bff);
  }

  .scholastic-nav-link.probe {
    color: var(--color-aurora, #7b61ff);
  }

  .nav-sep {
    color: var(--color-graphite-border);
    font-size: 0.65rem;
  }

  .scholastic-pivots-section {
    margin-top: 20px;
    padding-top: 14px;
    border-top: 1px solid var(--color-graphite-border);
  }

  .pivots-section-header {
    margin-bottom: 12px;
  }

  .pivots-section-header h5 {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--color-heading);
    margin: 4px 0 0 0;
    font-family: var(--font-brand);
  }

  .pivot-cards-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .scholastic-pivot-diff {
    background: var(--color-graphite-card);
    border: 1px solid var(--color-graphite-border);
    border-left: 3px solid var(--color-signal-green, #059669);
    border-radius: 6px;
    padding: 10px 12px;
  }

  .pivot-meta-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    font-size: 0.7rem;
    font-family: var(--fio-font-mono);
  }

  .pivot-badge-dot {
    font-size: 6px;
    color: var(--color-signal-green, #059669);
  }

  .pivot-concept-name {
    font-weight: 600;
    color: var(--color-heading);
  }

  .pivot-timestamp {
    color: var(--color-slate-subtle);
    margin-left: auto;
  }

  .pivot-diff-body {
    display: flex;
    align-items: stretch;
    gap: 10px;
  }

  .diff-branch {
    flex: 1;
    padding: 8px;
    border-radius: 4px;
    font-size: 0.76rem;
    line-height: 1.4;
  }

  .diff-branch.prior {
    background: rgba(220, 38, 38, 0.04);
    border: 1px solid rgba(220, 38, 38, 0.15);
  }

  .diff-branch.grounded {
    background: rgba(5, 150, 105, 0.04);
    border: 1px solid rgba(5, 150, 105, 0.15);
  }

  .diff-eyebrow {
    display: block;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
    margin-bottom: 4px;
    font-family: var(--fio-font-mono);
  }

  .diff-branch.prior .diff-eyebrow { color: var(--color-rose-text, #991b1b); }
  .diff-branch.grounded .diff-eyebrow { color: var(--color-signal-green-text, #065f46); }

  .diff-quote {
    margin: 0;
    font-style: italic;
    color: var(--color-slate-light);
  }

  .diff-arrow-connector {
    display: flex;
    align-items: center;
    color: var(--color-slate-subtle);
    font-weight: 600;
  }

  .diff-evidence-cite {
    display: block;
    margin-top: 6px;
    font-size: 0.68rem;
    color: var(--color-signal-green-dark, #047857);
  }

  .empty-pivots-card {
    padding: 16px 12px;
    text-align: center;
    background: rgba(0, 0, 0, 0.02);
    border: 1px dashed var(--color-graphite-border);
    border-radius: 6px;
  }

  .empty-pivots-symbol {
    font-size: 1.2rem;
    color: var(--color-slate-subtle);
    display: block;
    margin-bottom: 4px;
    font-family: var(--fio-font-mono);
  }

  .empty-pivots-text {
    font-size: 0.76rem;
    color: var(--color-slate-muted);
    line-height: 1.45;
    max-width: 320px;
    margin: 0 auto;
  }
</style>
