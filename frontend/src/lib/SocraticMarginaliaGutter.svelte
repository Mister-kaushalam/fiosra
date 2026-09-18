<script>
  let {
    probes = [],
    activeProbeId = '',
    focusedBlockId = '',
    focusedBlockOffsetTop = 0,
    onRespond = async () => null,
    onDismiss = async () => null,
    onDefer = async () => null,
    isBusy = false,
    notice = '',
  } = $props();

  let responseInput = $state('');
  let internalSelectedProbeId = $state('');

  const focusTypeLabels = {
    direct_observation: { label: 'Direct Observation', icon: '🔍', color: 'var(--color-aurora)' },
    warrant: { label: 'Warrant Required', icon: '⚖️', color: 'var(--color-amber)' },
    causal_bridge: { label: 'Causal Bridge', icon: '🌉', color: 'var(--color-signal-green)' },
    alternative_explanation: { label: 'Alternative Hypothesis', icon: '🔄', color: 'var(--color-horizon-blue)' },
    qualification: { label: 'Nuance & Scope', icon: '🎯', color: 'var(--color-slate-light)' },
  };

  // Determine active probe: priority to focused block's probe, then selected probe, then first offered probe
  let effectiveProbe = $derived.by(() => {
    if (focusedBlockId) {
      const blockProbe = probes.find((p) => p.block_id === focusedBlockId && p.status !== 'dismissed');
      if (blockProbe) return blockProbe;
    }
    if (internalSelectedProbeId) {
      const match = probes.find((p) => p.probe_id === internalSelectedProbeId);
      if (match) return match;
    }
    if (activeProbeId) {
      const match = probes.find((p) => p.probe_id === activeProbeId);
      if (match) return match;
    }
    return probes.find((p) => p.status === 'offered' || p.status === 'deferred') || probes[0] || null;
  });

  // Calculate vertical alignment coordinate smoothly clamped to the gutter
  let gutterTranslateY = $derived.by(() => {
    if (!focusedBlockOffsetTop || focusedBlockOffsetTop < 0) return 0;
    return Math.max(0, focusedBlockOffsetTop - 24);
  });

  async function handleFormSubmit(e) {
    e.preventDefault();
    if (!effectiveProbe || !responseInput.trim() || isBusy) return;
    const text = responseInput.trim();
    responseInput = '';
    await onRespond(effectiveProbe.probe_id, text);
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

<aside class="marginalia-gutter" aria-label="Socratic Marginalia Gutter">
  <div class="gutter-header">
    <div class="gutter-title">
      <span class="gutter-icon">🧠</span>
      <span>Socratic Marginalia</span>
    </div>
    {#if probes.length > 0}
      <span class="probe-count-pill">{probes.filter(p => p.status === 'offered').length} active</span>
    {/if}
  </div>

  {#if notice}
    <div class="gutter-notice" role="status">
      <span>ℹ️</span> {notice}
    </div>
  {/if}

  <div 
    class="gutter-track"
    style:transform={`translateY(${gutterTranslateY}px)`}
  >
    {#if effectiveProbe}
      {@const focusInfo = focusTypeLabels[effectiveProbe.focus_type] || { label: effectiveProbe.focus_type || 'Inquiry', icon: '❓', color: 'var(--color-aurora)' }}
      
      <div class="probe-card" class:responded={effectiveProbe.status === 'responded'}>
        <div class="probe-card-header">
          <span class="focus-badge" style:--focus-color={focusInfo.color}>
            <span class="focus-icon">{focusInfo.icon}</span>
            <span>{focusInfo.label}</span>
          </span>
          {#if effectiveProbe.concept_label || effectiveProbe.concept_id}
            <span class="kc-badge" title={effectiveProbe.concept_id}>
              {effectiveProbe.concept_label || effectiveProbe.concept_id}
            </span>
          {/if}
        </div>

        <div class="probe-question">
          <p>{effectiveProbe.question}</p>
        </div>

        {#if effectiveProbe.status === 'responded'}
          <div class="probe-resolved-box">
            <div class="resolved-badge">
              <span>✅</span>
              <strong>Epistemic Pivot Captured</strong>
            </div>
            {#if effectiveProbe.response_text}
              <p class="resolved-text">"{effectiveProbe.response_text}"</p>
            {/if}
          </div>
        {:else}
          <div class="probe-canvas-hint">
            <span>💡</span>
            <small>Rewrite your sentence in the Canvas to resolve this inquiry, or answer below:</small>
          </div>

          <form class="probe-reply-form" onsubmit={handleFormSubmit}>
            <textarea
              bind:value={responseInput}
              placeholder="Explain your reasoning or cite an exhibit..."
              rows="3"
              disabled={isBusy}
              aria-label="Socratic explanation response"
            ></textarea>

            <div class="probe-form-actions">
              <button
                type="submit"
                class="btn-respond"
                disabled={isBusy || responseInput.trim().length < 5}
              >
                {isBusy ? 'Submitting...' : 'Submit Explanation'}
              </button>
              
              <div class="secondary-actions">
                <button
                  type="button"
                  class="btn-text"
                  onclick={() => handleDefer(effectiveProbe.probe_id)}
                  disabled={isBusy}
                  title="Defer probe for 5 minutes"
                >
                  Later
                </button>
                <button
                  type="button"
                  class="btn-text"
                  onclick={() => handleDismiss(effectiveProbe.probe_id)}
                  disabled={isBusy}
                  title="Dismiss probe"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </form>
        {/if}
      </div>
    {:else}
      <div class="empty-gutter-state">
        <div class="empty-icon">✨</div>
        <p class="empty-text">Your writing flow is uninterrupted.</p>
        <small class="empty-subtext">As you articulate claims and anchor evidence, targeted Socratic challenges will appear here beside your text.</small>
      </div>
    {/if}

    <!-- Collapsed other probes list if multiple exist -->
    {#if probes.length > 1}
      <div class="probe-switcher">
        <span class="switcher-label">Other Inquiries:</span>
        <div class="switcher-list">
          {#each probes as p}
            {#if p.probe_id !== effectiveProbe?.probe_id}
              <button
                type="button"
                class="switcher-item"
                class:active={p.probe_id === activeProbeId}
                onclick={() => { internalSelectedProbeId = p.probe_id; }}
              >
                <span class="switcher-dot" class:responded={p.status === 'responded'}></span>
                <span class="switcher-q">{p.question.slice(0, 48)}...</span>
              </button>
            {/if}
          {/each}
        </div>
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
  }

  .gutter-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 12px;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--color-graphite-border);
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
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--color-aurora-glow);
    color: var(--color-aurora);
    border: 1px solid rgba(2, 132, 199, 0.25);
    font-weight: 500;
  }

  .gutter-notice {
    font-size: 0.8rem;
    padding: 8px 10px;
    border-radius: 6px;
    background: rgba(2, 132, 199, 0.08);
    border: 1px solid rgba(2, 132, 199, 0.2);
    color: var(--color-slate-light);
    margin-bottom: 12px;
  }

  .gutter-track {
    transition: transform 0.25s cubic-bezier(0.2, 0, 0, 1);
    will-change: transform;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .probe-card {
    background: var(--color-graphite-card, #ffffff);
    border: 1px solid rgba(2, 132, 199, 0.35);
    border-radius: 10px;
    padding: 16px;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(2, 132, 199, 0.12);
    transition: all 0.2s ease;
  }

  :global([data-theme="dark"]) .probe-card {
    background: rgba(30, 36, 46, 0.95);
    border-color: rgba(2, 132, 199, 0.4);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  }

  .probe-card.responded {
    border-color: rgba(5, 150, 105, 0.4);
    box-shadow: 0 4px 18px rgba(5, 150, 105, 0.1);
  }

  .probe-card-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
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
    padding: 3px 7px;
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

  .probe-question {
    font-size: 0.92rem;
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
    font-size: 0.78rem;
    color: var(--color-slate-subtle);
    margin-bottom: 10px;
    line-height: 1.35;
  }

  .probe-reply-form textarea {
    width: 100%;
    box-sizing: border-box;
    font-family: var(--font-ui, sans-serif);
    font-size: 0.85rem;
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
    margin-top: 10px;
  }

  .btn-respond {
    background: var(--color-aurora);
    color: #ffffff;
    border: none;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .btn-respond:hover:not(:disabled) {
    background: var(--color-aurora-bright);
  }

  .btn-respond:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .secondary-actions {
    display: flex;
    gap: 6px;
  }

  .btn-text {
    background: none;
    border: none;
    font-size: 0.78rem;
    color: var(--color-slate-subtle);
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
  }

  .btn-text:hover:not(:disabled) {
    color: var(--color-slate-bright);
    background: rgba(0, 0, 0, 0.05);
  }

  .probe-resolved-box {
    background: rgba(5, 150, 105, 0.08);
    border: 1px solid rgba(5, 150, 105, 0.25);
    border-radius: 6px;
    padding: 10px;
  }

  .resolved-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--color-signal-green-text, #065f46);
    margin-bottom: 6px;
  }

  .resolved-text {
    font-size: 0.82rem;
    font-style: italic;
    color: var(--color-slate-light);
    margin: 0;
  }

  .empty-gutter-state {
    padding: 32px 14px;
    text-align: center;
    background: rgba(0, 0, 0, 0.02);
    border: 1px dashed var(--color-graphite-border);
    border-radius: 8px;
  }

  .empty-icon { font-size: 1.8rem; margin-bottom: 8px; }
  .empty-text { font-size: 0.88rem; font-weight: 600; color: var(--color-slate-bright); margin: 0 0 6px 0; }
  .empty-subtext { font-size: 0.78rem; color: var(--color-slate-subtle); line-height: 1.4; display: block; }

  .probe-switcher {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--color-graphite-border);
  }

  .switcher-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-slate-subtle);
    display: block;
    margin-bottom: 6px;
  }

  .switcher-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .switcher-item {
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    background: none;
    border: 1px solid transparent;
    padding: 5px 8px;
    border-radius: 4px;
    font-size: 0.78rem;
    color: var(--color-slate-light);
    cursor: pointer;
  }

  .switcher-item:hover {
    background: rgba(0, 0, 0, 0.04);
    color: var(--color-slate-bright);
  }

  .switcher-item.active {
    background: rgba(2, 132, 199, 0.08);
    border-color: rgba(2, 132, 199, 0.2);
    color: var(--color-aurora);
    font-weight: 500;
  }

  .switcher-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-aurora);
    flex-shrink: 0;
  }

  .switcher-dot.responded {
    background: var(--color-signal-green);
  }
</style>
