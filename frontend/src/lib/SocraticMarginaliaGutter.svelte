<script>
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
    onEscalateToAgent = () => null,
    onAssumptionAction = async () => null,
    isBusy = false,
    notice = '',
  } = $props();

  let replyInputs = $state({});
  let expandedAssumptions = $state({});
  let containerEl = $state(null);

  function toggleAssumptionOptions(probeId) {
    expandedAssumptions[probeId] = !expandedAssumptions[probeId];
  }

  async function handleAssumptionClick(probe, action) {
    expandedAssumptions[probe.probe_id] = false;
    await onAssumptionAction(probe, action);
  }

  const focusTypeLabels = {
    direct_observation: { label: 'Direct Observation', icon: '🔍', color: 'var(--color-aurora, #0284c7)' },
    warrant: { label: 'Warrant Required', icon: '⚖️', color: 'var(--color-amber, #d97706)' },
    causal_bridge: { label: 'Causal Bridge', icon: '🌉', color: 'var(--color-signal-green, #10b981)' },
    alternative_explanation: { label: 'Alternative Hypothesis', icon: '🔄', color: 'var(--color-horizon-blue, #3b82f6)' },
    qualification: { label: 'Nuance & Scope', icon: '🎯', color: 'var(--color-slate-light, #64748b)' },
  };

  let blockIndexMap = $derived.by(() => {
    const map = new Map();
    (documentBlocks || []).forEach((b, idx) => {
      if (b.block_id) map.set(b.block_id, idx);
    });
    return map;
  });

  // Probes belonging to the currently focused paragraph
  let focusedBlockProbes = $derived.by(() => {
    if (!focusedBlockId) return [];
    return probes.filter((p) => p && p.status !== 'dismissed' && p.block_id === focusedBlockId);
  });

  // Visible probes: prioritize active focused paragraph at top, then status, then document reading order
  let visibleProbes = $derived.by(() => {
    const list = probes.filter((p) => p && p.status !== 'dismissed');
    return list.sort((a, b) => {
      // 1. Probes for the currently focused paragraph always float to the top
      if (focusedBlockId) {
        const aActive = a.block_id === focusedBlockId;
        const bActive = b.block_id === focusedBlockId;
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
      }

      // 2. Status: offered first, then deferred, then responded
      const order = { offered: 1, deferred: 2, responded: 3 };
      const statusDiff = (order[a.status] || 99) - (order[b.status] || 99);
      if (statusDiff !== 0) return statusDiff;

      // 3. Document reading order
      const aIdx = blockIndexMap.get(a.block_id) ?? 999;
      const bIdx = blockIndexMap.get(b.block_id) ?? 999;
      return aIdx - bIdx;
    });
  });

  let activeProbeCount = $derived(
    visibleProbes.filter((p) => p.status === 'offered').length
  );

  let currentBlockProbe = $derived(
    focusedBlockId ? visibleProbes.find((p) => p.block_id === focusedBlockId) : null
  );

  // Auto-scroll the matching card into view inside the gutter without dislodging anything
  $effect(() => {
    if (focusedBlockId && containerEl) {
      const card = containerEl.querySelector(`[data-probe-block-id="${focusedBlockId}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  });

  async function handleFormSubmit(e, probeId) {
    e.preventDefault();
    const text = (replyInputs[probeId] || '').trim();
    if (!probeId || text.length < 5 || isBusy) return;
    replyInputs[probeId] = '';
    await onRespond(probeId, text);
  }

  async function handleDismiss(probeId) {
    if (isBusy) return;
    await onDismiss(probeId);
  }

  async function handleDefer(probeId) {
    if (isBusy) return;
    await onDefer(probeId);
  }
</script>

<aside class="marginalia-gutter" bind:this={containerEl} aria-label="Socratic Marginalia Gutter">
  <div class="gutter-header">
    <div class="gutter-title">
      <span class="gutter-icon">🧠</span>
      <span>Socratic Marginalia</span>
    </div>
    {#if activeProbeCount > 0}
      <span class="probe-count-pill">{activeProbeCount} active</span>
    {:else if visibleProbes.length > 0}
      <span class="probe-count-pill subtle">All resolved</span>
    {/if}
  </div>

  {#if notice}
    <div class="gutter-notice" role="status">
      <span>ℹ️</span> <span>{notice}</span>
    </div>
  {/if}

  <!-- Contextual status banner indicating current block alignment -->
  {#if focusedBlockId}
    <div class="focus-context-banner" class:has-probe={focusedBlockProbes.length > 0}>
      {#if focusedBlockProbes.length > 0}
        <span class="context-icon">🎯</span>
        <span class="context-text">
          {focusedBlockProbes.length === 1 ? '1 inquiry' : `${focusedBlockProbes.length} inquiries`} for active paragraph
        </span>
      {:else}
        <span class="context-icon">✍️</span>
        <span class="context-text">Active paragraph · No inquiries yet (state a claim or reason to prompt a Socratic nudge)</span>
      {/if}
    </div>
  {/if}

  <div class="gutter-stream">
    {#if visibleProbes.length > 0}
      {#each visibleProbes as probe (probe.probe_id)}
        {@const focusInfo = focusTypeLabels[probe.focus_type] || { label: probe.focus_type || 'Inquiry', icon: '❓', color: 'var(--color-aurora)' }}
        {@const isTargeted = (focusedBlockId && probe.block_id === focusedBlockId) || probe.probe_id === activeProbeId}

        <div
          class="probe-card"
          data-probe-block-id={probe.block_id}
          class:is-active-target={isTargeted}
          class:status-responded={probe.status === 'responded'}
          class:status-deferred={probe.status === 'deferred'}
        >
          <!-- Card Header: Focus badge, concept badge, and active status -->
          <div class="probe-card-header">
            <span class="focus-badge" style:--focus-color={focusInfo.color}>
              <span class="focus-icon">{focusInfo.icon}</span>
              <span>{focusInfo.label}</span>
            </span>

            {#if probe.concept_label || probe.concept_id}
              <span class="kc-badge" title={probe.concept_id}>
                {probe.concept_label || probe.concept_id}
              </span>
            {/if}

            {#if probe.confidence_stance}
              <span class="scholastic-stance-tag">{probe.confidence_stance}</span>
            {/if}

            {#if probe.scaffolding_rung !== undefined && probe.scaffolding_rung > 0}
              <span class="scholastic-rung-tag">Rung {probe.scaffolding_rung}</span>
            {/if}

            {#if isTargeted}
              <span class="current-block-tag">
                <span class="dot-pulse"></span>
                <span>Active Block</span>
              </span>
            {/if}
          </div>

          <!-- Claim Anchor Excerpt (clickable jump to canvas block) -->
          {#if probe.claim_text}
            <button
              type="button"
              class="claim-anchor"
              onclick={() => onSelectBlock(probe.block_id)}
              title="Click to jump to this paragraph in the canvas"
            >
              <span class="anchor-pin">📌</span>
              <span class="anchor-quote">
                "{probe.claim_text.length > 95 ? probe.claim_text.slice(0, 95) + '…' : probe.claim_text}"
              </span>
              <span class="anchor-jump">Jump ↗</span>
            </button>
          {/if}

          <!-- Subtle Scholarly Assumption Note (Quiet, text-first affordance) -->
          {#if probe.assumption || probe.implicit_premise}
            {@const assumptionText = probe.assumption || probe.implicit_premise}
            <div class="scholarly-assumption-note">
              <span class="assumption-lead">Assumes:</span>
              <button
                type="button"
                class="assumption-toggle"
                onclick={() => toggleAssumptionOptions(probe.probe_id)}
                title="Click to examine assumption"
              >
                “{assumptionText}”
                <span class="assumption-affordance">· examine ▾</span>
              </button>

              {#if expandedAssumptions[probe.probe_id]}
                <div class="assumption-options-row">
                  <button type="button" class="btn-assumption-opt" onclick={() => handleAssumptionClick(probe, 'defend')}>
                    Defend premise
                  </button>
                  <button type="button" class="btn-assumption-opt" onclick={() => handleAssumptionClick(probe, 'test_sources')}>
                    Test in sources
                  </button>
                  <button type="button" class="btn-assumption-opt" onclick={() => handleAssumptionClick(probe, 'concede')}>
                    Concede &amp; revise
                  </button>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Inquiry Question -->
          <div class="probe-question">
            <p>{probe.question}</p>
          </div>

          <!-- Inquiry Response State -->
          {#if probe.status === 'responded'}
            <div class="probe-resolved-box">
              <div class="resolved-badge">
                <span>✅</span>
                <strong>Epistemic Pivot Captured</strong>
              </div>
              {#if probe.response_text}
                <p class="resolved-text">"{probe.response_text}"</p>
              {/if}
            </div>
          {:else if probe.status === 'deferred'}
            <div class="probe-deferred-box">
              <div class="deferred-badge">
                <span>⏳</span>
                <span>Postponed for later revision</span>
              </div>
              <button
                type="button"
                class="btn-resume"
                onclick={() => handleDefer(probe.probe_id)}
                disabled={isBusy}
              >
                Reopen Inquiry
              </button>
            </div>
          {:else}
            <div class="probe-canvas-hint">
              <span>💡</span>
              <small>Rewrite in the Canvas to resolve, or explain your reasoning:</small>
            </div>

            <form class="probe-reply-form" onsubmit={(e) => handleFormSubmit(e, probe.probe_id)}>
              <textarea
                bind:value={replyInputs[probe.probe_id]}
                placeholder="Clarify evidence, scope, or causal link..."
                rows="3"
                disabled={isBusy}
                aria-label="Socratic explanation response"
              ></textarea>

              <div class="probe-form-actions">
                <button
                  type="submit"
                  class="btn-respond"
                  disabled={isBusy || !(replyInputs[probe.probe_id] && replyInputs[probe.probe_id].trim().length >= 5)}
                >
                  {isBusy ? 'Submitting...' : 'Submit Explanation'}
                </button>

                <div class="secondary-actions">
                  <button
                    type="button"
                    class="btn-text"
                    onclick={() => handleDefer(probe.probe_id)}
                    disabled={isBusy}
                    title="Defer inquiry for later"
                  >
                    Later
                  </button>
                  <button
                    type="button"
                    class="btn-text"
                    onclick={() => handleDismiss(probe.probe_id)}
                    disabled={isBusy}
                    title="Dismiss inquiry"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </form>
          {/if}

          <!-- Scholarly Card Footer: Subtle Footnote Escalation -->
          <div class="card-scholastic-footer">
            <button
              type="button"
              class="escalation-footnote-btn"
              onclick={() => onEscalateToAgent(probe)}
              title="Discuss this paragraph in depth with the Socratic Tutor"
            >
              Discuss in depth with tutor ↗
            </button>
          </div>
        </div>
      {/each}
    {:else}
      <div class="empty-gutter-state">
        <div class="empty-icon">✨</div>
        <p class="empty-text">Your writing flow is uninterrupted.</p>
        <small class="empty-subtext">
          As you articulate claims and anchor evidence, targeted Socratic challenges will anchor here beside your arguments.
        </small>
      </div>
    {/if}
  </div>
</aside>

<style>
  .marginalia-gutter {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 16px 14px;
    background: rgba(255, 255, 255, 0.02);
    border-left: 1px solid var(--color-graphite-border);
    position: relative;
    overflow-y: auto;
    overflow-x: hidden;
    box-sizing: border-box;
  }

  .gutter-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 12px;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--color-graphite-border);
    flex-shrink: 0;
  }

  .gutter-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-slate-bright);
  }

  .gutter-icon { font-size: 1rem; }

  .probe-count-pill {
    font-size: 0.72rem;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--color-aurora-glow, rgba(2, 132, 199, 0.15));
    color: var(--color-aurora, #0284c7);
    border: 1px solid rgba(2, 132, 199, 0.28);
    font-weight: 600;
  }

  .probe-count-pill.subtle {
    background: rgba(5, 150, 105, 0.12);
    color: var(--color-signal-green, #10b981);
    border-color: rgba(5, 150, 105, 0.25);
  }

  .gutter-notice {
    font-size: 0.8rem;
    padding: 8px 10px;
    border-radius: 6px;
    background: rgba(2, 132, 199, 0.08);
    border: 1px solid rgba(2, 132, 199, 0.2);
    color: var(--color-slate-light);
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .focus-context-banner {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.75rem;
    padding: 6px 10px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.03);
    border: 1px solid var(--color-graphite-border);
    color: var(--color-slate-subtle);
    margin-bottom: 12px;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  :global([data-theme="dark"]) .focus-context-banner {
    background: rgba(255, 255, 255, 0.03);
  }

  .focus-context-banner.has-probe {
    background: rgba(2, 132, 199, 0.08);
    border-color: rgba(2, 132, 199, 0.28);
    color: var(--color-aurora, #0284c7);
    font-weight: 500;
  }

  .gutter-stream {
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
    min-height: 0;
  }

  .probe-card {
    background: var(--color-graphite-card, #ffffff);
    border: 1px solid var(--color-graphite-border);
    border-radius: 10px;
    padding: 15px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    transition: transform 0.15s ease, border-color 0.2s ease, box-shadow 0.2s ease;
    display: flex;
    flex-direction: column;
  }

  :global([data-theme="dark"]) .probe-card {
    background: rgba(30, 36, 46, 0.95);
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
  }

  .probe-card:hover {
    border-color: rgba(2, 132, 199, 0.35);
  }

  .probe-card.is-active-target {
    border-color: var(--color-aurora, #0284c7);
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.35), 0 6px 18px rgba(2, 132, 199, 0.12);
  }

  .probe-card.status-responded {
    border-color: rgba(5, 150, 105, 0.35);
    background: rgba(5, 150, 105, 0.02);
  }

  .probe-card.status-deferred {
    opacity: 0.75;
    border-style: dashed;
  }

  .probe-card-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 7px;
    margin-bottom: 10px;
  }

  .focus-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--focus-color, var(--color-aurora));
    background: rgba(2, 132, 199, 0.08);
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid rgba(2, 132, 199, 0.18);
  }

  .kc-badge {
    font-size: 0.7rem;
    padding: 2px 6px;
    background: rgba(0, 0, 0, 0.04);
    border: 1px solid var(--color-graphite-border);
    border-radius: 4px;
    color: var(--color-slate-light);
    font-family: var(--font-mono, monospace);
  }

  :global([data-theme="dark"]) .kc-badge {
    background: rgba(255, 255, 255, 0.05);
  }

  .current-block-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--color-aurora, #0284c7);
    margin-left: auto;
    background: rgba(2, 132, 199, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .dot-pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-aurora, #0284c7);
    animation: pulseGlow 1.8s infinite;
  }

  @keyframes pulseGlow {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(1.3); }
  }

  .claim-anchor {
    display: flex;
    align-items: baseline;
    gap: 6px;
    background: rgba(0, 0, 0, 0.03);
    border: 1px dashed var(--color-graphite-border);
    border-radius: 6px;
    padding: 5px 8px;
    margin-bottom: 10px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
    width: 100%;
    box-sizing: border-box;
  }

  :global([data-theme="dark"]) .claim-anchor {
    background: rgba(255, 255, 255, 0.04);
  }

  .claim-anchor:hover {
    background: rgba(2, 132, 199, 0.08);
    border-color: rgba(2, 132, 199, 0.35);
  }

  .anchor-pin {
    font-size: 0.78rem;
    flex-shrink: 0;
  }

  .anchor-quote {
    font-size: 0.76rem;
    font-style: italic;
    color: var(--color-slate-light);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .anchor-jump {
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--color-aurora, #0284c7);
    flex-shrink: 0;
    letter-spacing: 0.02em;
  }

  .probe-question {
    font-size: 0.9rem;
    line-height: 1.45;
    color: var(--color-heading, var(--color-slate-bright));
    margin-bottom: 12px;
    font-weight: 500;
  }

  .probe-question p { margin: 0; }

  .probe-canvas-hint {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 0.76rem;
    color: var(--color-slate-subtle);
    margin-bottom: 8px;
    line-height: 1.35;
  }

  .probe-reply-form textarea {
    width: 100%;
    box-sizing: border-box;
    font-family: var(--font-ui, sans-serif);
    font-size: 0.84rem;
    line-height: 1.4;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid var(--color-graphite-border);
    background: var(--color-bone-muted, #f8f8f5);
    color: var(--color-slate-bright);
    resize: vertical;
    transition: border-color 0.15s ease;
  }

  :global([data-theme="dark"]) .probe-reply-form textarea {
    background: rgba(18, 22, 29, 0.8);
    border-color: rgba(255, 255, 255, 0.12);
  }

  .probe-reply-form textarea:focus {
    outline: none;
    border-color: var(--color-aurora);
    box-shadow: 0 0 0 2px var(--color-aurora-glow);
  }

  .probe-form-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
  }

  .btn-respond {
    background: var(--color-aurora, #0284c7);
    color: #ffffff;
    border: none;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .btn-respond:hover:not(:disabled) {
    background: var(--color-aurora-bright, #0369a1);
  }

  .btn-respond:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .secondary-actions {
    display: flex;
    gap: 6px;
  }

  .btn-text {
    background: none;
    border: none;
    font-size: 0.76rem;
    color: var(--color-slate-subtle);
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
  }

  .btn-text:hover:not(:disabled) {
    color: var(--color-slate-bright);
    background: rgba(0, 0, 0, 0.05);
  }

  :global([data-theme="dark"]) .btn-text:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
  }

  .probe-resolved-box {
    background: rgba(5, 150, 105, 0.08);
    border: 1px solid rgba(5, 150, 105, 0.25);
    border-radius: 6px;
    padding: 9px 11px;
  }

  .resolved-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    color: var(--color-signal-green-text, #065f46);
    margin-bottom: 4px;
  }

  :global([data-theme="dark"]) .resolved-badge {
    color: #34d399;
  }

  .resolved-text {
    font-size: 0.8rem;
    font-style: italic;
    color: var(--color-slate-light);
    margin: 0;
  }

  .probe-deferred-box {
    background: rgba(245, 158, 11, 0.08);
    border: 1px dashed rgba(245, 158, 11, 0.3);
    border-radius: 6px;
    padding: 9px 11px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .deferred-badge {
    font-size: 0.76rem;
    color: var(--color-amber, #d97706);
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .btn-resume {
    background: none;
    border: 1px solid rgba(245, 158, 11, 0.4);
    color: var(--color-amber, #d97706);
    border-radius: 4px;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 3px 8px;
    cursor: pointer;
  }

  .btn-resume:hover {
    background: rgba(245, 158, 11, 0.15);
  }

  .empty-gutter-state {
    padding: 32px 14px;
    text-align: center;
    background: rgba(0, 0, 0, 0.02);
    border: 1px dashed var(--color-graphite-border);
    border-radius: 8px;
    margin-top: 12px;
  }

  :global([data-theme="dark"]) .empty-gutter-state {
    background: rgba(255, 255, 255, 0.02);
  }

  .empty-icon { font-size: 1.8rem; margin-bottom: 8px; }
  .empty-text { font-size: 0.88rem; font-weight: 600; color: var(--color-slate-bright); margin: 0 0 6px 0; }
  .empty-subtext { font-size: 0.78rem; color: var(--color-slate-subtle); line-height: 1.4; display: block; }

  /* Subtle Scholastic Additions */
  .scholastic-stance-tag {
    font-size: 10px;
    font-family: var(--font-mono, monospace);
    color: var(--color-slate-muted);
    background: rgba(0, 0, 0, 0.04);
    border: 1px solid var(--color-graphite-border);
    padding: 1px 6px;
    border-radius: 4px;
    letter-spacing: 0.02em;
  }

  :global([data-theme="dark"]) .scholastic-stance-tag {
    background: rgba(255, 255, 255, 0.04);
  }

  .scholastic-rung-tag {
    font-size: 10px;
    font-family: var(--font-mono, monospace);
    color: var(--color-horizon-blue, #d97706);
    background: rgba(217, 119, 6, 0.08);
    border: 1px solid rgba(217, 119, 6, 0.2);
    padding: 1px 6px;
    border-radius: 4px;
  }

  .scholarly-assumption-note {
    margin: 8px 0;
    padding: 6px 10px;
    background: rgba(217, 119, 6, 0.04);
    border-left: 2px solid var(--color-horizon-blue, #d97706);
    border-radius: 0 4px 4px 0;
    font-size: 0.78rem;
    line-height: 1.4;
  }

  .assumption-lead {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
    color: var(--color-slate-muted);
    margin-right: 4px;
  }

  .assumption-toggle {
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    font-size: inherit;
    font-style: italic;
    color: var(--color-slate-light);
    cursor: pointer;
    text-align: left;
    display: inline;
  }

  .assumption-toggle:hover {
    color: var(--color-heading);
    text-decoration: underline;
  }

  .assumption-affordance {
    font-style: normal;
    font-size: 0.7rem;
    color: var(--color-horizon-blue, #d97706);
    margin-left: 4px;
  }

  .assumption-options-row {
    display: flex;
    gap: 6px;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px dashed var(--color-graphite-border);
  }

  .btn-assumption-opt {
    background: none;
    border: 1px solid var(--color-graphite-border);
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 0.7rem;
    font-family: var(--font-ui);
    color: var(--color-slate-light);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-assumption-opt:hover {
    background: var(--color-graphite-hover);
    color: var(--color-heading);
    border-color: var(--color-horizon-blue, #d97706);
  }

  .card-scholastic-footer {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(0, 0, 0, 0.04);
    display: flex;
    justify-content: flex-end;
  }

  :global([data-theme="dark"]) .card-scholastic-footer {
    border-top-color: rgba(255, 255, 255, 0.04);
  }

  .escalation-footnote-btn {
    background: none;
    border: none;
    padding: 0;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    color: var(--color-slate-muted);
    cursor: pointer;
    transition: color 0.15s ease;
  }

  .escalation-footnote-btn:hover {
    color: var(--color-horizon-blue, #d97706);
    text-decoration: underline;
  }
</style>
