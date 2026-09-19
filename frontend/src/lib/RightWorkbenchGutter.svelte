<script>
  import SocraticMarginaliaGutter from './SocraticMarginaliaGutter.svelte';
  import SocraticAgentGutter from './SocraticAgentGutter.svelte';
  import EngagementTraceView from './EngagementTraceView.svelte';

  let {
    probes = [],
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
    traceProps = {},
  } = $props();

  let activeProbeCount = $derived(
    probes.filter((p) => p && p.status === 'offered').length
  );
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
        class:active={activeTab === 'trace'}
        onclick={() => { onSelectTab('trace'); onToggleCollapse(false); }}
        title="Open Engagement Trace & Argument Tree"
        aria-label="Open Engagement Trace & Argument Tree"
      >
        <span class="collapsed-tab-icon">🎓</span>
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
    <!-- Full Gutter Header with Three Tabs & Collapse Control -->
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
          class:active={activeTab === 'trace'}
          onclick={() => onSelectTab('trace')}
        >
          <span class="tab-icon">🎓</span>
          <span class="tab-label">Trace</span>
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
          {focusedBlockId}
          {focusedBlockTitle}
          {openExhibitTitle}
          {onSendMessage}
          {onRequestHint}
          {onCommitCapsule}
          isBusy={isAgentBusy}
        />
      {:else if activeTab === 'trace'}
        <EngagementTraceView {...traceProps} />
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
</style>
