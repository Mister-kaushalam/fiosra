<script>
  let {
    sessionId = '',
    assignment = null,
    currentRung = 0,
    turns = [],
    focusedBlockId = '',
    focusedBlockTitle = '',
    openExhibitTitle = '',
    onSendMessage = async () => null,
    onRequestHint = async () => null,
    onCommitCapsule = async () => null,
    isBusy = false,
  } = $props();

  let inputMessage = $state('');
  let messagesContainer = $state(null);

  const discussionStarters = [
    { label: 'Stress-test my central thesis against counter-evidence', prompt: 'Challenge my central claim with historical counter-arguments from the assigned exhibits.' },
    { label: 'Unpack unstated premises and causal assumptions', prompt: 'What implicit assumptions am I taking for granted in my current argument?' },
    { label: 'Weigh structural debt versus liquidity panic in 1788', prompt: 'How do sovereign credit debt and the short-term banking panic compare as primary causes of the crisis?' },
    { label: 'Construct causal warrant connecting Exhibit A to my claim', prompt: 'How does Necker\'s Compte Rendu data logically warrant my conclusion about crown solvency?' }
  ];

  async function handleSend(e) {
    e?.preventDefault();
    if (!inputMessage.trim() || isBusy) return;
    const msg = inputMessage.trim();
    inputMessage = '';
    await onSendMessage(msg, false);
    scrollToBottom();
  }

  async function handleHint() {
    if (isBusy) return;
    await onRequestHint();
    scrollToBottom();
  }

  function handleSelectStarter(prompt) {
    if (isBusy) return;
    inputMessage = prompt;
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }, 60);
  }

  $effect(() => {
    if (turns.length > 0) {
      scrollToBottom();
    }
  });
</script>

<div class="socratic-agent-panel" aria-label="Socratic Copilot Agent">
  <!-- Subtle Scholastic Co-Presence Rule -->
  <div class="scholastic-copresence-strip">
    <span class="copresence-node">
      <span class="copresence-dot">●</span>
      <span class="copresence-text">Active: <strong>{focusedBlockTitle || (focusedBlockId ? `Paragraph (${focusedBlockId.slice(0, 6)})` : 'Canvas Drafting')}</strong></span>
    </span>
    {#if openExhibitTitle}
      <span class="copresence-divider">·</span>
      <span class="copresence-node">
        <span class="copresence-text">Exhibit: <em>{openExhibitTitle}</em></span>
      </span>
    {/if}
  </div>

  <!-- Messages Scroll Area -->
  <div class="agent-messages" bind:this={messagesContainer}>
    {#if turns.length === 0}
      <div class="agent-scholastic-empty">
        <div class="empty-scholastic-header">
          <span class="empty-icon-subtle">🏛️</span>
          <h4 class="empty-title">Seminar Consultation</h4>
          <p class="empty-desc">
            Test competing hypotheses, unpack implicit premises, and formulate grounded causal warrants with your Socratic tutor.
          </p>
        </div>

        <div class="discussion-starters-block">
          <span class="starters-eyebrow">Suggested seminar inquiries:</span>
          <div class="starters-list">
            {#each discussionStarters as starter}
              <button
                type="button"
                class="btn-scholastic-starter"
                onclick={() => handleSelectStarter(starter.prompt)}
                disabled={isBusy}
              >
                <span class="starter-symbol">§</span>
                <span class="starter-label">{starter.label}</span>
              </button>
            {/each}
          </div>
        </div>
      </div>
    {:else}
      {#each turns as turn}
        {#if turn.role === 'student'}
          <div class="msg-bubble student-msg">
            <div class="msg-author">You</div>
            <div class="msg-content">{turn.text}</div>
          </div>
        {:else}
          <div class="msg-bubble tutor-msg" class:deflected={turn.is_adversarial}>
            <div class="msg-author">
              <span class="author-name">Socratic Tutor</span>
              {#if turn.hint_rung > 0}
                <span class="hint-tag">Rung {turn.hint_rung}</span>
              {/if}
            </div>
            <div class="msg-content">{turn.text}</div>

            <!-- Action Capsules: Quiet, student-owned transfer affordances -->
            {#if turn.action_capsules && turn.action_capsules.length > 0}
              <div class="action-capsules-wrap">
                {#each turn.action_capsules as capsule}
                  <div class="action-capsule-slip">
                    <div class="capsule-lead">
                      <span class="capsule-icon">✍️</span>
                      <span class="capsule-quote">“{capsule.suggested_student_text || capsule.text_payload || ''}”</span>
                    </div>
                    <button
                      type="button"
                      class="btn-capsule-transfer"
                      onclick={() => onCommitCapsule(capsule)}
                      title="Transfer your formulated insight directly into the Canvas draft"
                    >
                      {capsule.label || 'Transfer to Paragraph ↗'}
                    </button>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Learner Metacognitive Radar (Quiet Scholarly Progress Rule) -->
            {#if turn.radar || (turn.thoughts && turn.thoughts.diagnosed_kc)}
              {@const radar = turn.radar || {
                target_concept: turn.thoughts?.diagnosed_kc || 'Historical Causation',
                epistemic_stance: turn.thoughts?.stance || 'Evaluating Evidence',
                milestone_summary: turn.thoughts?.milestone || 'Synthesizing primary warrant'
              }}
              <div class="scholastic-radar-rule">
                <span class="radar-dot"></span>
                <span class="radar-concept">{radar.target_concept}</span>
                <span class="radar-sep">·</span>
                <span class="radar-stance">{radar.epistemic_stance}</span>
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    {/if}

    {#if isBusy}
      <div class="tutor-typing-indicator">
        <span>Thinking with you...</span>
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    {/if}
  </div>

  <!-- Action & Input Footer -->
  <div class="agent-footer">
    <div class="hints-row">
      <button
        type="button"
        class="btn-hint"
        onclick={handleHint}
        disabled={isBusy || currentRung >= 3}
        title="Advance the Socratic scaffolding ladder"
      >
        <span>💡</span> Request Socratic Hint {currentRung < 3 ? `(Rung ${currentRung + 1})` : '(Max)'}
      </button>
    </div>

    <form class="agent-input-form" onsubmit={handleSend}>
      <textarea
        bind:value={inputMessage}
        placeholder="Discuss your thesis or counter-perspective..."
        rows="2"
        disabled={isBusy}
        onkeydown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
      ></textarea>
      <button
        type="submit"
        class="btn-send"
        disabled={isBusy || !inputMessage.trim()}
        aria-label="Send message"
      >
        ➤
      </button>
    </form>
  </div>
</div>

<style>
  .socratic-agent-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    width: 100%;
    background: transparent;
    overflow: hidden;
  }

  .scholastic-copresence-strip {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.02);
    border-bottom: 1px solid var(--color-graphite-border);
    padding: 7px 14px;
    font-size: 0.72rem;
    color: var(--color-slate-muted);
    flex-shrink: 0;
    font-family: var(--font-ui);
  }

  :global([data-theme="dark"]) .scholastic-copresence-strip {
    background: rgba(255, 255, 255, 0.02);
  }

  .copresence-node {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .copresence-dot {
    font-size: 6px;
    color: var(--color-signal-green, #059669);
  }

  .copresence-text strong {
    color: var(--color-heading);
    font-weight: 600;
  }

  .copresence-divider {
    color: var(--color-graphite-border);
  }

  .agent-messages {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .agent-scholastic-empty {
    padding: 24px 10px;
    margin: auto 0;
  }

  .empty-scholastic-header {
    text-align: center;
    margin-bottom: 20px;
  }

  .empty-icon-subtle {
    font-size: 1.6rem;
    opacity: 0.75;
    display: inline-block;
    margin-bottom: 6px;
  }

  .empty-title {
    font-size: 0.92rem;
    font-weight: 600;
    font-family: var(--font-brand);
    color: var(--color-heading);
    margin: 0 0 6px 0;
  }

  .empty-desc {
    font-size: 0.76rem;
    color: var(--color-slate-muted);
    line-height: 1.45;
    max-width: 320px;
    margin: 0 auto;
  }

  .discussion-starters-block {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--color-graphite-border);
  }

  .starters-eyebrow {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-slate-subtle);
    display: block;
    margin-bottom: 8px;
    font-family: var(--font-mono);
  }

  .starters-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .btn-scholastic-starter {
    background: none;
    border: 1px solid var(--color-graphite-border);
    border-radius: 6px;
    padding: 7px 10px;
    text-align: left;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: var(--font-ui);
  }

  .btn-scholastic-starter:hover {
    background: var(--color-graphite-hover);
    border-color: var(--color-horizon-blue, #d97706);
  }

  .starter-symbol {
    color: var(--color-horizon-blue, #d97706);
    font-size: 0.8rem;
    font-family: var(--font-mono);
    flex-shrink: 0;
    margin-top: 1px;
  }

  .starter-label {
    font-size: 0.75rem;
    color: var(--color-slate-light);
    line-height: 1.35;
  }

  .btn-scholastic-starter:hover .starter-label {
    color: var(--color-heading);
  }

  .msg-bubble {
    max-width: 90%;
    padding: 10px 12px;
    border-radius: 9px;
    font-size: 0.84rem;
    line-height: 1.42;
  }

  .student-msg {
    align-self: flex-end;
    background: var(--color-aurora, #0284c7);
    color: #ffffff;
    border-bottom-right-radius: 2px;
  }

  .student-msg .msg-author {
    font-size: 0.68rem;
    font-weight: 600;
    opacity: 0.85;
    margin-bottom: 3px;
    text-align: right;
  }

  .tutor-msg {
    align-self: flex-start;
    background: var(--color-bone-muted, #f4f5f0);
    border: 1px solid var(--color-graphite-border, #e2e8f0);
    color: var(--color-slate-bright, #0f172a);
    border-bottom-left-radius: 2px;
  }

  :global([data-theme="dark"]) .tutor-msg {
    background: rgba(30, 36, 46, 0.85);
    border-color: rgba(255, 255, 255, 0.08);
    color: #f1f5f9;
  }

  .tutor-msg.deflected {
    border-color: rgba(217, 119, 6, 0.35);
    background: rgba(217, 119, 6, 0.08);
  }

  .tutor-msg .msg-author {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--color-slate-light, #475569);
    margin-bottom: 4px;
  }

  :global([data-theme="dark"]) .tutor-msg .msg-author {
    color: #94a3b8;
  }

  .hint-tag {
    font-size: 0.62rem;
    background: rgba(217, 119, 6, 0.15);
    color: var(--color-horizon-bright, #b45309);
    border: 1px solid rgba(217, 119, 6, 0.3);
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 600;
  }

  /* Action Capsules (Margin slip style) */
  .action-capsules-wrap {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .action-capsule-slip {
    background: rgba(217, 119, 6, 0.05);
    border: 1px solid rgba(217, 119, 6, 0.25);
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  :global([data-theme="dark"]) .action-capsule-slip {
    background: rgba(217, 119, 6, 0.08);
  }

  .capsule-lead {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .capsule-icon {
    font-size: 0.8rem;
    flex-shrink: 0;
  }

  .capsule-quote {
    font-size: 0.76rem;
    font-style: italic;
    color: var(--color-slate-light);
    line-height: 1.35;
  }

  .btn-capsule-transfer {
    align-self: flex-end;
    background: none;
    border: 1px solid var(--color-horizon-blue, #d97706);
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 0.72rem;
    font-weight: 500;
    font-family: var(--font-ui);
    color: var(--color-horizon-blue, #d97706);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-capsule-transfer:hover {
    background: var(--color-horizon-blue, #d97706);
    color: #ffffff;
  }

  /* Learner Metacognitive Progress Rule */
  .scholastic-radar-rule {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(0, 0, 0, 0.05);
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.68rem;
    font-family: var(--font-mono);
    color: var(--color-slate-muted);
  }

  :global([data-theme="dark"]) .scholastic-radar-rule {
    border-top-color: rgba(255, 255, 255, 0.05);
  }

  .radar-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-signal-green, #059669);
  }

  .radar-concept {
    font-weight: 600;
  }

  .tutor-typing-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    color: var(--color-slate-subtle, #64748b);
    font-style: italic;
    padding: 4px 0;
  }

  .typing-dots span {
    display: inline-block;
    width: 4px;
    height: 4px;
    background: var(--color-slate-subtle, #64748b);
    border-radius: 50%;
    animation: typing 1.4s infinite ease-in-out both;
  }

  .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
  .typing-dots span:nth-child(2) { animation-delay: -0.16s; }

  @keyframes typing {
    0%, 80%, 100% { transform: scale(0); }
    40% { transform: scale(1); }
  }

  .agent-footer {
    padding: 10px 14px;
    background: rgba(0, 0, 0, 0.02);
    border-top: 1px solid var(--color-graphite-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }

  :global([data-theme="dark"]) .agent-footer {
    background: rgba(255, 255, 255, 0.02);
  }

  .hints-row {
    display: flex;
    justify-content: flex-start;
  }

  .btn-hint {
    background: none;
    border: 1px dashed var(--color-graphite-border);
    border-radius: 5px;
    padding: 3px 8px;
    font-size: 0.72rem;
    color: var(--color-slate-muted);
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-hint:hover:not(:disabled) {
    border-color: var(--color-horizon-blue, #d97706);
    color: var(--color-horizon-blue, #d97706);
    background: rgba(217, 119, 6, 0.04);
  }

  .agent-input-form {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }

  .agent-input-form textarea {
    flex: 1;
    background: var(--color-graphite-card, #ffffff);
    border: 1px solid var(--color-graphite-border, #cbd5e1);
    border-radius: 6px;
    padding: 7px 10px;
    font-size: 0.8rem;
    font-family: var(--font-ui);
    color: var(--color-heading);
    resize: none;
    outline: none;
    transition: border-color 0.15s ease;
  }

  :global([data-theme="dark"]) .agent-input-form textarea {
    background: var(--color-graphite-card, #1e2229);
    border-color: var(--color-graphite-border, #2a2f38);
    color: var(--color-bone);
  }

  .agent-input-form textarea:focus {
    border-color: var(--color-horizon-blue, #d97706);
  }

  .btn-send {
    background: var(--color-horizon-blue, #d97706);
    color: #ffffff;
    border: none;
    border-radius: 6px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease;
    font-size: 0.75rem;
  }

  .btn-send:hover:not(:disabled) {
    background: var(--color-horizon-bright, #b45309);
  }

  .btn-send:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
