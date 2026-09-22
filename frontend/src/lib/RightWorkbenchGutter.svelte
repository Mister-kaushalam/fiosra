<script>
  import SocraticMarginaliaGutter from './SocraticMarginaliaGutter.svelte';
  import SocraticAgentGutter from './SocraticAgentGutter.svelte';
  import EngagementTraceView from './EngagementTraceView.svelte';
  import PdfViewer from './PdfViewer.svelte';

  let {
    probes = [],
    documentBlocks = [],
    activeProbeId = '',
    focusedBlockId = '',
    focusedBlockOffsetTop = 0,
    onRespond = async () => null,
    onDismiss = async () => null,
    onDefer = async () => null,
    onSelectBlock = () => null,
    isProbeBusy = false,
    probeNotice = '',
    sessionId = '',
    assignment = null,
    currentRung = 0,
    turns = [],
    chatSessions = [],
    activeChatSessionId = '',
    onNewChatSession = () => null,
    onSwitchChatSession = () => null,
    focusedBlockTitle = '',
    openExhibitTitle = '',
    onSendMessage = async () => null,
    onRequestHint = async () => null,
    onCommitCapsule = async () => null,
    onEscalateToAgent = () => null,
    onAssumptionAction = async () => null,
    isAgentBusy = false,
    activeTab = 'marginalia',
    isCollapsed = false,
    onToggleCollapse = () => null,
    onSelectTab = () => null,
    sessionEvents = [],
    graphMetrics = { claims: 0, evidence: 0, warrants: 0, assumptions: 0, probes: 0 },
    sessionStatus = 'active',
    submittedAt = '',
    isSubmitting = false,
    onSubmitMilestone = async () => null,
    submissionError = null,
    submissionNotice = '',
  } = $props();

  let activeProbeCount = $derived(
    probes.filter((p) => p && p.status === 'offered').length
  );
  let engagementSubTab = $state('reasoning');
</script>

<aside
  class="workbench-gutter-container"
  class:collapsed={isCollapsed}
  aria-label="Socratic Reasoning Gutter & Engagement Trace"
>
  {#if isCollapsed}
    <!-- Collapsed vertical strip docked to the right -->
    <div class="collapsed-gutter-strip">
      <button
        type="button"
        class="collapsed-tab-btn"
        class:active={activeTab === 'marginalia'}
        onclick={() => { onSelectTab('marginalia'); onToggleCollapse(false); }}
        title="Open Socratic Marginalia"
        aria-label="Open Socratic Marginalia"
      >
        <span class="collapsed-tab-icon">🧠</span>
        {#if activeProbeCount > 0}
          <span class="collapsed-badge">{activeProbeCount}</span>
        {/if}
      </button>

      <button
        type="button"
        class="collapsed-tab-btn"
        class:active={activeTab === 'agent'}
        onclick={() => { onSelectTab('agent'); onToggleCollapse(false); }}
        title="Open Socratic Agent"
        aria-label="Open Socratic Agent"
      >
        <span class="collapsed-tab-icon">🤖</span>
      </button>

      <button
        type="button"
        class="collapsed-tab-btn"
        class:active={activeTab === 'engagement' || activeTab === 'reasoning' || activeTab === 'activity'}
        onclick={() => { onSelectTab('engagement'); onToggleCollapse(false); }}
        title="Open Engagement (Reasoning & Activity)"
        aria-label="Open Engagement (Reasoning & Activity)"
      >
        <span class="collapsed-tab-icon">📊</span>
      </button>

      <button
        type="button"
        class="collapsed-tab-btn"
        class:active={activeTab === 'submission'}
        onclick={() => { onSelectTab('submission'); onToggleCollapse(false); }}
        title="Open Submission & PDF Viewer"
        aria-label="Open Submission & PDF Viewer"
      >
        <span class="collapsed-tab-icon">📄</span>
      </button>

      <button
        type="button"
        class="btn-expand-gutter"
        onclick={() => onToggleCollapse(false)}
        title="Expand Socratic Gutter"
        aria-label="Expand Socratic Gutter"
      >
        ◀
      </button>

      <div
        class="vertical-gutter-label"
        onclick={() => onToggleCollapse(false)}
        role="button"
        tabindex="0"
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggleCollapse(false); }}
      >
        SOCRATIC GUTTER
      </div>
    </div>
  {:else}
    <!-- Full Gutter Header with Four Tabs & Collapse Control -->
    <div class="gutter-tab-header">
      <div class="gutter-tab-nav">
        <button
          type="button"
          class="gutter-tab-btn"
          class:active={activeTab === 'marginalia'}
          onclick={() => onSelectTab('marginalia')}
        >
          <span class="tab-icon">🧠</span>
          <span class="tab-label">Marginalia</span>
          {#if activeProbeCount > 0}
            <span class="tab-pill-count">{activeProbeCount}</span>
          {/if}
        </button>

        <button
          type="button"
          class="gutter-tab-btn"
          class:active={activeTab === 'agent'}
          onclick={() => onSelectTab('agent')}
        >
          <span class="tab-icon">🤖</span>
          <span class="tab-label">Agent</span>
          {#if currentRung > 0}
            <span class="tab-pill-rung">Rung {currentRung}</span>
          {/if}
        </button>

        <button
          type="button"
          class="gutter-tab-btn"
          class:active={activeTab === 'engagement' || activeTab === 'reasoning' || activeTab === 'activity'}
          onclick={() => onSelectTab('engagement')}
        >
          <span class="tab-icon">📊</span>
          <span class="tab-label">Engagement</span>
        </button>

        <button
          type="button"
          class="gutter-tab-btn"
          class:active={activeTab === 'submission'}
          onclick={() => onSelectTab('submission')}
        >
          <span class="tab-icon">📄</span>
          <span class="tab-label">Submission</span>
          {#if sessionStatus === 'submitted'}
            <span class="tab-pill-submitted">✓</span>
          {/if}
        </button>
      </div>

      <button
        type="button"
        class="btn-collapse-toggle"
        onclick={() => onToggleCollapse(true)}
        title="Collapse gutter to right"
        aria-label="Collapse gutter to right"
      >
        ▶
      </button>
    </div>

    <!-- Active Tab Body -->
    <div class="gutter-body">
      {#if activeTab === 'marginalia'}
        <SocraticMarginaliaGutter
          {probes}
          {documentBlocks}
          {activeProbeId}
          {focusedBlockId}
          {focusedBlockOffsetTop}
          {onRespond}
          {onDismiss}
          {onDefer}
          {onSelectBlock}
          onEscalateToAgent={(probe) => {
            onSelectTab('agent');
            onEscalateToAgent(probe);
          }}
          {onAssumptionAction}
          isBusy={isProbeBusy}
          notice={probeNotice}
        />
      {:else if activeTab === 'agent'}
        <SocraticAgentGutter
          {sessionId}
          {assignment}
          {currentRung}
          {turns}
          {chatSessions}
          {activeChatSessionId}
          {onNewChatSession}
          {onSwitchChatSession}
          {focusedBlockId}
          {focusedBlockTitle}
          {openExhibitTitle}
          {onSendMessage}
          {onRequestHint}
          {onCommitCapsule}
          isBusy={isAgentBusy}
        />
      {:else if activeTab === 'engagement' || activeTab === 'reasoning' || activeTab === 'activity'}
        <EngagementTraceView
          {sessionId}
          {sessionEvents}
          {graphMetrics}
          activeTraceSubTab={activeTab === 'activity' ? 'activity' : engagementSubTab}
          onSubTabChange={(subTab) => { engagementSubTab = subTab; }}
        />
      {:else if activeTab === 'submission'}
        <div class="gutter-submission-panel">
          <header class="submission-toolbar">
            <div class="submission-meta-left">
              <span class="submission-panel-title">Assignment Submission</span>
              {#if sessionStatus === 'submitted'}
                <span class="status-pill submitted">✓ Submitted</span>
                {#if submittedAt}
                  <small class="submission-time">{new Date(submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
                {/if}
              {:else}
                <span class="status-pill draft">● Draft In Progress</span>
              {/if}
            </div>

            <div class="submission-meta-right">
              {#if sessionId}
                <a
                  class="btn-dl-pdf-compact"
                  href={`/evidence/dossier/${sessionId}/pdf`}
                  download
                  title="Download submission PDF directly"
                >
                  ⬇ Download PDF
                </a>
              {/if}
              {#if sessionStatus !== 'submitted'}
                <button
                  type="button"
                  class="btn-submit-action"
                  onclick={onSubmitMilestone}
                  disabled={isSubmitting}
                  title="Submit your assignment draft for educator evaluation"
                >
                  {isSubmitting ? 'Submitting…' : 'Submit Assignment ➔'}
                </button>
              {/if}
            </div>
          </header>

          {#if submissionError}
            <div class="submission-error-alert" role="alert">
              <span>⚠️ {submissionError.message || 'Submission failed'}</span>
              {#if submissionError.retryable}
                <button type="button" class="btn-retry" onclick={onSubmitMilestone}>Retry</button>
              {/if}
            </div>
          {/if}

          {#if submissionNotice && sessionStatus === 'submitted'}
            <div class="submission-success-alert" role="status">
              <span>✓ {submissionNotice}</span>
            </div>
          {/if}

          <div class="submission-pdf-viewport">
            {#if sessionId}
              {#key sessionId + (submittedAt || '')}
                <PdfViewer
                  url={`/evidence/dossier/${sessionId}/pdf`}
                  title={assignment?.title || 'Assignment Submission'}
                />
              {/key}
            {:else}
              <div class="empty-pdf-state">
                <p>No active session found to preview PDF.</p>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</aside>

<style>
  .workbench-gutter-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: var(--color-obsidian, #ffffff);
    border-left: 1px solid var(--color-graphite-border, #e2e8f0);
    position: relative;
    overflow: hidden;
    transition: width 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  :global([data-theme="dark"]) .workbench-gutter-container {
    background: #0d1117;
    border-color: #30363d;
  }

  .workbench-gutter-container.collapsed {
    width: 44px;
    overflow: hidden;
  }

  /* Collapsed Strip */
  .collapsed-gutter-strip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 0;
    height: 100%;
    width: 44px;
    background: rgba(0, 0, 0, 0.02);
    box-sizing: border-box;
  }

  :global([data-theme="dark"]) .collapsed-gutter-strip {
    background: rgba(255, 255, 255, 0.02);
  }

  .collapsed-tab-btn {
    position: relative;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    padding: 0;
  }

  .collapsed-tab-btn:hover {
    background: rgba(2, 132, 199, 0.08);
    border-color: rgba(2, 132, 199, 0.2);
  }

  .collapsed-tab-btn.active {
    background: var(--color-aurora-glow, rgba(2, 132, 199, 0.12));
    border-color: var(--color-aurora, #0284c7);
  }

  .collapsed-tab-icon {
    font-size: 1.1rem;
  }

  .collapsed-badge {
    position: absolute;
    top: -2px;
    right: -2px;
    background: var(--color-aurora, #0284c7);
    color: #ffffff;
    font-size: 0.62rem;
    font-weight: 700;
    border-radius: 999px;
    min-width: 15px;
    height: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 2px;
  }

  .btn-expand-gutter {
    background: transparent;
    border: 1px solid var(--color-graphite-border, #cbd5e1);
    border-radius: 4px;
    color: var(--color-slate-subtle, #64748b);
    width: 26px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.72rem;
    margin-top: 4px;
    transition: all 0.15s ease;
  }

  :global([data-theme="dark"]) .btn-expand-gutter {
    border-color: #30363d;
    color: #8b949e;
  }

  .btn-expand-gutter:hover {
    color: var(--color-aurora, #0284c7);
    border-color: var(--color-aurora, #0284c7);
    background: rgba(2, 132, 199, 0.08);
  }

  .vertical-gutter-label {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    transform: rotate(180deg);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--color-slate-subtle, #94a3b8);
    cursor: pointer;
    margin-top: 18px;
    user-select: none;
  }

  .vertical-gutter-label:hover {
    color: var(--color-aurora, #0284c7);
  }

  /* Full Header */
  .gutter-tab-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px 8px 12px;
    border-bottom: 1px solid var(--color-graphite-border, #e2e8f0);
    background: rgba(248, 250, 252, 0.95);
    backdrop-filter: blur(8px);
    flex-shrink: 0;
  }

  :global([data-theme="dark"]) .gutter-tab-header {
    background: rgba(22, 27, 34, 0.95);
    border-color: #30363d;
  }

  .gutter-tab-nav {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .gutter-tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 5px 9px;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--color-slate-subtle, #64748b);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  :global([data-theme="dark"]) .gutter-tab-btn {
    color: #8b949e;
  }

  .gutter-tab-btn:hover {
    color: var(--color-slate-bright, #0f172a);
    background: rgba(0, 0, 0, 0.04);
  }

  :global([data-theme="dark"]) .gutter-tab-btn:hover {
    color: #f0f6fc;
    background: rgba(255, 255, 255, 0.06);
  }

  .gutter-tab-btn.active {
    color: var(--color-aurora, #0284c7);
    background: var(--color-aurora-glow, rgba(2, 132, 199, 0.09));
    border-color: rgba(2, 132, 199, 0.22);
  }

  .tab-icon { font-size: 0.95rem; }
  .tab-label { white-space: nowrap; }

  .tab-pill-count {
    font-size: 0.68rem;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--color-aurora, #0284c7);
    color: #ffffff;
    font-weight: 700;
  }

  .tab-pill-rung {
    font-size: 0.65rem;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(2, 132, 199, 0.12);
    color: var(--color-aurora, #0284c7);
    border: 1px solid rgba(2, 132, 199, 0.25);
    font-weight: 600;
  }

  .btn-collapse-toggle {
    background: transparent;
    border: 1px solid var(--color-graphite-border, #cbd5e1);
    border-radius: 4px;
    color: var(--color-slate-subtle, #64748b);
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.7rem;
    transition: all 0.15s ease;
  }

  :global([data-theme="dark"]) .btn-collapse-toggle {
    border-color: #30363d;
    color: #8b949e;
  }

  .btn-collapse-toggle:hover {
    color: var(--color-aurora, #0284c7);
    border-color: var(--color-aurora, #0284c7);
    background: rgba(2, 132, 199, 0.08);
  }

  .gutter-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Submission Tab & Embedded PDF Viewport */
  .gutter-submission-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: #ffffff;
  }

  :global([data-theme="dark"]) .gutter-submission-panel {
    background: #0d1117;
  }

  .submission-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.02);
    border-bottom: 1px solid var(--color-graphite-border, #e2e8f0);
    flex-shrink: 0;
  }

  :global([data-theme="dark"]) .submission-toolbar {
    background: rgba(255, 255, 255, 0.02);
    border-color: #30363d;
  }

  .submission-meta-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .submission-panel-title {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--color-slate-bright, #0f172a);
  }

  :global([data-theme="dark"]) .submission-panel-title {
    color: #f8fafc;
  }

  .status-pill {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 9999px;
  }

  .status-pill.draft {
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #fde68a;
  }

  .status-pill.submitted {
    background: #ecfdf5;
    color: #065f46;
    border: 1px solid #a7f3d0;
  }

  .submission-time {
    font-size: 0.65rem;
    color: #64748b;
  }

  .submission-meta-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .btn-dl-pdf-compact {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 9px;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 5px;
    color: #0284c7;
    font-size: 0.72rem;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.12s ease;
  }

  :global([data-theme="dark"]) .btn-dl-pdf-compact {
    background: #1e293b;
    border-color: #334155;
    color: #38bdf8;
  }

  .btn-dl-pdf-compact:hover {
    background: #f0f9ff;
    border-color: #0284c7;
  }

  .btn-submit-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 12px;
    background: #0284c7;
    color: #ffffff;
    border: none;
    border-radius: 5px;
    font-size: 0.74rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(2, 132, 199, 0.25);
    transition: all 0.12s ease;
  }

  .btn-submit-action:hover:not(:disabled) {
    background: #0369a1;
  }

  .btn-submit-action:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .tab-pill-submitted {
    font-size: 0.62rem;
    font-weight: 700;
    padding: 0 4px;
    border-radius: 9999px;
    background: #10b981;
    color: #ffffff;
  }

  .submission-error-alert {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 12px;
    background: #fef2f2;
    border-bottom: 1px solid #fecaca;
    color: #b91c1c;
    font-size: 0.72rem;
    font-weight: 600;
  }

  .submission-success-alert {
    padding: 6px 12px;
    background: #f0fdf4;
    border-bottom: 1px solid #bbf7d0;
    color: #15803d;
    font-size: 0.72rem;
    font-weight: 600;
  }

  .btn-retry {
    background: #b91c1c;
    color: #ffffff;
    border: none;
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 0.65rem;
    cursor: pointer;
  }

  .submission-pdf-viewport {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  .empty-pdf-state {
    padding: 32px 16px;
    text-align: center;
    color: #64748b;
    font-size: 0.78rem;
  }
</style>
