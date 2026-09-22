<script>
  /**
   * ThinkingTimeline — Minimal vertical timeline component.
   * Renders a chronological list of nodes with icons, timestamps, labels, and content.
   * Used for both Reasoning Trace and Activity Log sub-tabs.
   */
  let {
    nodes = [],
    showContent = true,
    showDiff = false,
    expandedNodeIndex = -1,
    onNodeClick = () => null,
  } = $props();

  function relativeTime(timestamp) {
    if (!timestamp) return '';
    try {
      const d = new Date(timestamp);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return timestamp;
    }
  }
</script>

<div class="thinking-timeline" aria-label="Thinking Timeline">
  {#if nodes.length === 0}
    <div class="timeline-empty">
      <span class="empty-icon">🧠</span>
      <p>No events recorded yet.</p>
      <p class="empty-hint">Start writing in the canvas to build your trace.</p>
    </div>
  {:else}
    {#each nodes as node, index (index)}
      {@const isPivot = node.kind === 'pivot' || node.kind === 'draft_revised'}
      {@const isExpanded = expandedNodeIndex === index}
      <button
        class="timeline-node"
        class:pivot={isPivot}
        class:expanded={isExpanded}
        class:submitted={node.kind === 'submitted'}
        onclick={() => onNodeClick(index)}
        type="button"
      >
        <!-- Connecting line -->
        {#if index < nodes.length - 1}
          <div class="timeline-line"></div>
        {/if}

        <!-- Node dot -->
        <div class="node-dot" class:pivot-dot={isPivot} class:submitted-dot={node.kind === 'submitted'}>
          <span class="node-icon">{node.icon}</span>
        </div>

        <!-- Node content -->
        <div class="node-body">
          <div class="node-header">
            <span class="node-label">{node.label}</span>
            <span class="node-time">{relativeTime(node.timestamp)}</span>
          </div>

          {#if showContent && node.content}
            <blockquote class="node-content">
              {node.content}
            </blockquote>
          {/if}

          {#if showDiff && isPivot && node.diff && isExpanded}
            <div class="node-diff">
              <div class="diff-before">
                <span class="diff-label">Was:</span>
                <span class="diff-text">{node.diff.before}</span>
              </div>
              <div class="diff-after">
                <span class="diff-label">Now:</span>
                <span class="diff-text">{node.diff.after}</span>
              </div>
            </div>
          {/if}

          {#if node.insight}
            <p class="node-insight">{node.insight}</p>
          {/if}
        </div>
      </button>
    {/each}
  {/if}
</div>

<style>
  .thinking-timeline {
    display: flex;
    flex-direction: column;
    padding: 16px 12px 24px;
    position: relative;
  }

  /* Empty state */
  .timeline-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 48px 16px;
    text-align: center;
  }
  .empty-icon { font-size: 32px; opacity: 0.5; }
  .timeline-empty p {
    margin: 0;
    color: var(--color-slate-muted, #94a3b8);
    font-size: 13px;
    line-height: 1.5;
  }
  .empty-hint {
    font-size: 11px !important;
    opacity: 0.7;
  }

  /* Node */
  .timeline-node {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    position: relative;
    padding: 8px 4px 8px 0;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    width: 100%;
    color: inherit;
    transition: background 0.15s ease;
    border-radius: 6px;
  }
  .timeline-node:hover {
    background: rgba(0, 0, 0, 0.025);
  }
  :global([data-theme="dark"]) .timeline-node:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  /* Pivot highlight */
  .timeline-node.pivot {
    border-left: 3px solid #f59e0b;
    padding-left: 8px;
    margin-left: -3px;
  }

  /* Connecting line */
  .timeline-line {
    position: absolute;
    left: 15px;
    top: 32px;
    bottom: -8px;
    width: 1px;
    background: var(--color-graphite-border, #e2e8f0);
  }
  :global([data-theme="dark"]) .timeline-line {
    background: #30363d;
  }

  /* Dot */
  .node-dot {
    flex: 0 0 30px;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-obsidian, #ffffff);
    border: 2px solid var(--color-graphite-border, #e2e8f0);
    z-index: 1;
    transition: all 0.15s ease;
  }
  :global([data-theme="dark"]) .node-dot {
    background: #0d1117;
    border-color: #30363d;
  }
  .node-dot.pivot-dot {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.08);
  }
  .node-dot.submitted-dot {
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.08);
  }
  .node-icon {
    font-size: 13px;
    line-height: 1;
  }

  /* Body */
  .node-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 4px;
  }
  .node-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    justify-content: space-between;
  }
  .node-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-heading, #0f172a);
    line-height: 1.3;
  }
  :global([data-theme="dark"]) .node-label {
    color: #f0f6fc;
  }
  .node-time {
    font-size: 10px;
    color: var(--color-slate-muted, #94a3b8);
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Content blockquote */
  .node-content {
    margin: 2px 0 0;
    padding: 6px 10px;
    border-left: 2px solid var(--color-graphite-border, #e2e8f0);
    color: var(--color-slate-light, #475569);
    font-size: 11.5px;
    line-height: 1.55;
    overflow-wrap: anywhere;
    background: transparent;
  }
  :global([data-theme="dark"]) .node-content {
    color: #8b949e;
    border-color: #30363d;
  }

  /* Diff (before/after) */
  .node-diff {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.02);
    border-radius: 4px;
    border: 1px solid var(--color-graphite-border, #e2e8f0);
  }
  :global([data-theme="dark"]) .node-diff {
    background: rgba(255, 255, 255, 0.02);
    border-color: #30363d;
  }
  .diff-before, .diff-after {
    display: flex;
    gap: 6px;
    font-size: 11px;
    line-height: 1.5;
  }
  .diff-label {
    flex: 0 0 30px;
    font-weight: 700;
    font-size: 10px;
    text-transform: uppercase;
  }
  .diff-before .diff-label { color: #ef4444; }
  .diff-after .diff-label { color: #10b981; }
  .diff-before .diff-text {
    color: var(--color-slate-muted, #94a3b8);
    text-decoration: line-through;
    opacity: 0.7;
  }
  .diff-after .diff-text {
    color: var(--color-heading, #0f172a);
  }
  :global([data-theme="dark"]) .diff-after .diff-text {
    color: #f0f6fc;
  }

  /* Insight */
  .node-insight {
    margin: 2px 0 0;
    font-size: 10.5px;
    color: var(--color-aurora, #0284c7);
    font-style: italic;
    line-height: 1.4;
  }
</style>
