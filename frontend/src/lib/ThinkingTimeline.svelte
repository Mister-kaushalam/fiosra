<script>
  /**
   * ThinkingTimeline — Light-theme diagrammatic timeline.
   * Features a left-aligned stage column (Framing, Exploration, Assumption testing),
   * a luminous spinal axis with branch connectors, and crisp light cards.
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
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return timestamp;
    }
  }

  function getNodeStage(node) {
    if (node.stage) return node.stage;
    const kind = (node.kind || '').toLowerCase();
    if (kind === 'premise') return 'Framing';
    if (kind === 'exploration' || kind === 'canvas_section_saved') return 'Exploration';
    if (kind === 'challenge' || kind.includes('probe')) return 'Friction';
    if (kind === 'struggle') return 'Deliberation';
    if (kind === 'pivot' || kind === 'draft_revised') return 'Assumption testing';
    if (kind === 'evidence') return 'Evidence grounding';
    if (kind === 'synthesis') return 'Synthesis';
    if (kind === 'submitted' || kind.includes('submit')) return 'Submission';
    if (kind === 'assignment_opened') return 'Framing';
    if (kind.includes('source')) return 'Exploration';
    if (kind.includes('tutor') || kind.includes('prompt')) return 'Deliberation';
    return 'Exploration';
  }

  function getNodeEyebrow(node) {
    if (node.eyebrow) return node.eyebrow;
    const kind = (node.kind || '').toLowerCase();
    if (kind === 'premise') return 'FRAMING';
    if (kind === 'exploration' || kind === 'canvas_section_saved') return 'EXPLORATION';
    if (kind === 'challenge') return 'SOCRATIC CHALLENGE';
    if (kind === 'struggle') return 'DELIBERATION';
    if (kind === 'pivot' || kind === 'draft_revised') return 'ASSUMPTION TESTING';
    if (kind === 'evidence') return 'EVIDENCE GROUNDING';
    if (kind === 'synthesis') return 'SYNTHESIS';
    if (kind === 'submitted' || kind.includes('submit')) return 'FINAL SUBMISSION';
    if (kind === 'assignment_opened') return 'INITIALIZATION';
    if (kind.includes('source')) return 'SOURCE INQUIRY';
    if (kind.includes('tutor') || kind.includes('prompt')) return 'SOCRATIC DIALOGUE';
    return (node.kind || 'EVENT').toUpperCase().replace(/_/g, ' ');
  }
</script>

<div class="thinking-timeline-root" aria-label="Thinking Timeline">
  {#if nodes.length === 0}
    <div class="timeline-empty">
      <span class="empty-icon">🧠</span>
      <p>No events recorded yet.</p>
      <p class="empty-hint">Start writing in the canvas to build your reasoning path.</p>
    </div>
  {:else}
    <div class="timeline-container">
      {#each nodes as node, index (index)}
        {@const isPivot = node.kind === 'pivot' || node.kind === 'draft_revised' || !!node.diff}
        {@const isExpanded = expandedNodeIndex === index}
        {@const stage = getNodeStage(node)}
        {@const eyebrow = getNodeEyebrow(node)}

        <div class="timeline-row" class:is-pivot={isPivot} class:is-expanded={isExpanded}>
          <!-- 1. Left Stage Column -->
          <div class="stage-col">
            <span class="stage-label">{stage}</span>
          </div>

          <!-- 2. Center Spine Axis Column -->
          <div class="spine-col">
            <!-- Continuous vertical line -->
            <div
              class="spine-line"
              class:is-first={index === 0}
              class:is-last={index === nodes.length - 1}
            ></div>
            <!-- Luminous Glowing Node Dot -->
            <div
              class="spine-node-dot"
              class:is-pivot={isPivot}
              class:is-submitted={node.kind === 'submitted'}
            >
              <div class="dot-inner-core"></div>
            </div>
            <!-- Horizontal Branch Connector Stem -->
            <div class="spine-branch-connector"></div>
          </div>

          <!-- 3. Right Card Column -->
          <div class="card-col">
            <div
              class="timeline-card"
              class:card-pivot={isPivot}
              class:card-expanded={isExpanded}
              onclick={() => onNodeClick(index)}
              role="button"
              tabindex="0"
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNodeClick(index); }}
            >
              <div class="card-meta-row">
                <span class="card-eyebrow">{eyebrow}</span>
                {#if node.timestamp}
                  <span class="card-time">{relativeTime(node.timestamp)}</span>
                {/if}
              </div>

              <!-- Main label / statement -->
              <div class="card-headline">
                {node.label}
              </div>

              <!-- Assumption Testing Diff View (Exact Match to Reference Diagram) -->
              {#if showDiff && isPivot && node.diff}
                <div class="diff-evolution-container">
                  <!-- Prior Claim Card (Struck through) -->
                  {#if node.diff.before}
                    <div class="diff-card prior-card">
                      <div class="diff-card-eyebrow">PRIOR HYPOTHESIS</div>
                      <s class="diff-struck-text">{node.diff.before}</s>
                    </div>
                  {/if}

                  <!-- Directional Connector Arrow -->
                  <div class="diff-arrow-stem">
                    <span class="diff-arrow-icon">↓</span>
                  </div>

                  <!-- Grounded Revised Claim Card -->
                  {#if node.diff.after}
                    <div class="diff-card grounded-card">
                      <div class="diff-card-eyebrow">GROUNDED REVISION</div>
                      <div class="diff-grounded-text">{node.diff.after}</div>
                    </div>
                  {/if}
                </div>
              {:else if showContent && node.content && node.content !== node.label}
                <div class="card-content-body" class:collapsed={!isExpanded && node.content.length > 200}>
                  {node.content}
                </div>
                {#if node.content.length > 200}
                  <div class="card-toggle-hint">
                    {isExpanded ? 'Show less ▴' : 'Show full text ▾'}
                  </div>
                {/if}
              {/if}

              {#if node.insight}
                <div class="card-insight-callout">
                  <span class="insight-badge">INSIGHT</span>
                  <span class="insight-text">{node.insight}</span>
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .thinking-timeline-root {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 12px 4px 32px 0;
    box-sizing: border-box;
    background: transparent;
  }

  /* Empty state */
  .timeline-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 48px 16px;
    text-align: center;
  }
  .empty-icon { font-size: 32px; opacity: 0.6; }
  .timeline-empty p {
    margin: 0;
    color: #64748b;
    font-size: 13px;
    line-height: 1.5;
  }
  .empty-hint {
    font-size: 11px !important;
    color: #94a3b8;
  }

  /* Timeline Container */
  .timeline-container {
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 100%;
  }

  /* Timeline Row: 3 columns (Stage | Spine | Card) */
  .timeline-row {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    position: relative;
    min-height: 58px;
  }

  /* Column 1: Stage Label (Left) */
  .stage-col {
    flex: 0 0 96px;
    width: 96px;
    padding-top: 14px;
    padding-right: 12px;
    text-align: right;
    box-sizing: border-box;
  }

  .stage-label {
    font-size: 11px;
    font-weight: 600;
    color: #475569;
    letter-spacing: -0.2px;
    line-height: 1.3;
    display: inline-block;
  }

  .timeline-row.is-pivot .stage-label {
    color: #4338ca;
    font-weight: 700;
  }

  /* Column 2: Spine Axis (Center) */
  .spine-col {
    flex: 0 0 24px;
    width: 24px;
    position: relative;
    display: flex;
    justify-content: center;
  }

  /* Continuous vertical spinal line */
  .spine-line {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 2px;
    background: #c7d2fe; /* Light indigo/blue line */
    z-index: 1;
  }

  .spine-line.is-first {
    top: 20px;
  }

  .spine-line.is-last {
    bottom: calc(100% - 20px);
  }

  /* Glowing Node Dot */
  .spine-node-dot {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #ffffff;
    border: 2.5px solid #4f46e5;
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.18);
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .dot-inner-core {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: #4f46e5;
  }

  .spine-node-dot.is-pivot {
    border-color: #4338ca;
    box-shadow: 0 0 0 5px rgba(67, 56, 202, 0.22);
  }

  .spine-node-dot.is-pivot .dot-inner-core {
    background: #4338ca;
  }

  .spine-node-dot.is-submitted {
    border-color: #059669;
    box-shadow: 0 0 0 4px rgba(5, 150, 105, 0.2);
  }

  .spine-node-dot.is-submitted .dot-inner-core {
    background: #059669;
  }

  /* Horizontal Branch Connector Stem */
  .spine-branch-connector {
    position: absolute;
    top: 19px;
    left: 50%;
    width: 12px;
    height: 1.5px;
    background: #818cf8;
    z-index: 1;
  }

  /* Column 3: Card Body (Right) */
  .card-col {
    flex: 1;
    min-width: 0;
    padding-left: 2px;
    padding-bottom: 20px;
    box-sizing: border-box;
  }

  /* Card */
  .timeline-card {
    background: #ffffff;
    border: 1px solid #e0e7ff;
    border-radius: 8px;
    padding: 12px 14px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 3px 10px rgba(99, 102, 241, 0.04);
    cursor: pointer;
    transition: all 0.18s ease;
    text-align: left;
    width: 100%;
    box-sizing: border-box;
  }

  .timeline-card:hover {
    border-color: #c7d2fe;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05), 0 6px 16px rgba(99, 102, 241, 0.08);
  }

  .timeline-card.card-pivot {
    border-color: #c7d2fe;
    background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
  }

  .card-meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .card-eyebrow {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #4338ca;
  }

  .card-time {
    font-size: 10px;
    color: #94a3b8;
    font-weight: 500;
  }

  .card-headline {
    font-size: 12.5px;
    font-weight: 600;
    color: #0f172a;
    line-height: 1.45;
  }

  /* Diff Evolution Container (Exact Diagram Representation) */
  .diff-evolution-container {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .diff-card {
    border-radius: 6px;
    padding: 10px 12px;
    box-sizing: border-box;
  }

  .diff-card-eyebrow {
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: 4px;
  }

  /* Prior Claim (Warm paper look with strikethrough) */
  .diff-card.prior-card {
    background: #faf8f5;
    border: 1px solid #e7e1d4;
  }

  .diff-card.prior-card .diff-card-eyebrow {
    color: #9a3412;
  }

  .diff-struck-text {
    font-size: 12px;
    line-height: 1.55;
    color: #78716c;
    text-decoration: line-through;
    text-decoration-color: #ef4444;
    text-decoration-thickness: 1.5px;
    display: block;
    font-style: italic;
  }

  /* Directional Arrow Stem */
  .diff-arrow-stem {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 18px;
    margin: -1px 0;
  }

  .diff-arrow-icon {
    color: #4f46e5;
    font-size: 14px;
    font-weight: 800;
    line-height: 1;
  }

  /* Grounded Claim (Crisp elevated card) */
  .diff-card.grounded-card {
    background: #ffffff;
    border: 1.5px solid #c7d2fe;
    box-shadow: 0 2px 6px rgba(79, 70, 229, 0.08);
  }

  .diff-card.grounded-card .diff-card-eyebrow {
    color: #15803d;
  }

  .diff-grounded-text {
    font-size: 12.5px;
    line-height: 1.55;
    color: #0f172a;
    font-weight: 500;
  }

  /* Content Text */
  .card-content-body {
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.55;
    color: #334155;
    border-left: 2px solid #e2e8f0;
    padding-left: 8px;
    overflow-wrap: anywhere;
  }

  .card-content-body.collapsed {
    max-height: 62px;
    overflow: hidden;
    position: relative;
    mask-image: linear-gradient(180deg, #000 60%, transparent);
  }

  .card-toggle-hint {
    font-size: 10px;
    color: #6366f1;
    font-weight: 600;
    margin-top: 4px;
  }

  /* Insight callout */
  .card-insight-callout {
    margin-top: 8px;
    padding: 6px 10px;
    background: #eef2ff;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #3730a3;
  }

  .insight-badge {
    font-size: 8.5px;
    font-weight: 800;
    letter-spacing: 0.5px;
    background: #4f46e5;
    color: #ffffff;
    padding: 1px 4px;
    border-radius: 3px;
  }

  .insight-text {
    font-style: italic;
    line-height: 1.4;
  }
</style>
