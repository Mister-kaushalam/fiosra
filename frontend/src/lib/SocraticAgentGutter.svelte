<script>
  let {
    sessionId = '',
    assignment = null,
    currentRung = 0,
    turns = [],
    chatSessions = [],
    activeChatSessionId = '',
    onNewChatSession = () => null,
    onSwitchChatSession = () => null,
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
  let textareaEl = $state(null);
  let isThreadMenuOpen = $state(false);

  let activeSessionTitle = $derived.by(() => {
    const found = chatSessions.find((cs) => cs.id === activeChatSessionId);
    return found ? found.title : 'Consultation';
  });


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
    if (textareaEl) {
      textareaEl.focus();
    }
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
  <!-- Socratic Consultation Thread Bar -->
  <div class="consultation-thread-bar">
    <div class="thread-dropdown-wrapper">
      <button
        type="button"
        id="consultation-thread-btn"
        class="btn-thread-select"
        class:is-active={isThreadMenuOpen}
        onclick={() => isThreadMenuOpen = !isThreadMenuOpen}
        title="Switch Socratic consultation thread"
        aria-expanded={isThreadMenuOpen}
      >
        <span class="thread-icon" aria-hidden="true">💬</span>
        <span class="thread-title">{activeSessionTitle}</span>
        <span class="thread-turn-count">({Math.floor(turns.length / 2)} {Math.floor(turns.length / 2) === 1 ? 'turn' : 'turns'})</span>
        <span class="thread-chevron" aria-hidden="true">{isThreadMenuOpen ? '▴' : '▾'}</span>
      </button>

      {#if isThreadMenuOpen}
        <button type="button" class="thread-dropdown-backdrop" onclick={() => isThreadMenuOpen = false} aria-label="Close consultation thread menu"></button>
        <div class="thread-dropdown-menu" role="menu">
          <div class="thread-menu-header">Consultation Threads</div>
          <div class="thread-menu-list">
            {#each chatSessions as cs (cs.id)}
              <button
                type="button"
                class="thread-menu-item"
                class:selected={cs.id === activeChatSessionId}
                onclick={() => { onSwitchChatSession(cs.id); isThreadMenuOpen = false; }}
                role="menuitem"
              >
                <div class="thread-item-title">{cs.title}</div>
                <div class="thread-item-meta">{Math.floor(cs.turns.length / 2)} exchanges · {new Date(cs.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </button>
            {/each}
          </div>
          <div class="thread-menu-footer">
            <button
              type="button"
              id="new-consultation-btn"
              class="btn-new-consultation"
              onclick={() => { onNewChatSession(); isThreadMenuOpen = false; }}
            >
              <span class="plus-icon">＋</span>
              <span>New Consultation</span>
            </button>
          </div>
        </div>
      {/if}
    </div>

    <button
      type="button"
      id="quick-new-thread-btn"
      class="btn-quick-new-thread"
      onclick={onNewChatSession}
      title="Start a new consultation thread"
    >
      <span>＋ New Chat</span>
    </button>
  </div>

  <!-- Subtle Scholastic Co-Presence Rule -->
  <div class="scholastic-copresence-strip">
    <div class="copresence-node focus-node">
      <span class="copresence-dot">●</span>
      <span class="copresence-label">Focus:</span>
      <span class="copresence-value" title={focusedBlockTitle || ''}>
        {focusedBlockTitle || (focusedBlockId ? `Paragraph (${focusedBlockId.slice(0, 6)})` : 'Canvas Drafting')}
      </span>
    </div>
    {#if openExhibitTitle}
      <span class="copresence-divider">·</span>
      <div class="copresence-node exhibit-node">
        <span class="copresence-icon">📕</span>
        <span class="copresence-value" title={openExhibitTitle}>{openExhibitTitle}</span>
      </div>
    {/if}
  </div>

  <!-- Messages Scroll Area -->
  <div class="agent-messages" bind:this={messagesContainer}>
    {#if turns.length === 0}
      <div class="agent-scholastic-empty">
        <div class="empty-scholastic-header">
          <div class="empty-avatar">🏛️</div>
          <h4 class="empty-title">Socratic Seminar Consultation</h4>
          <p class="empty-desc">
            Test competing hypotheses, unpack implicit premises, and formulate grounded causal warrants with your Socratic tutor.
          </p>
        </div>
      </div>
    {:else}
      {#each turns as turn}
        {#if turn.role === 'student'}
          <div class="msg-bubble-wrap student-wrap">
            <div class="msg-bubble student-msg">
              <div class="msg-content">{turn.text}</div>
            </div>
          </div>
        {:else}
          <div class="msg-bubble-wrap tutor-wrap">
            <div class="msg-bubble tutor-msg" class:deflected={turn.is_adversarial}>
              <div class="tutor-header-row">
                <div class="tutor-badge">
                  <span class="tutor-avatar">🏛️</span>
                  <span class="author-name">Socratic Tutor</span>
                </div>
                {#if turn.hint_rung > 0}
                  <span class="hint-tag">💡 Rung {turn.hint_rung}</span>
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

              <!-- Suggested Inquiries: Sleek interactive prompt chips -->
              {#if turn.prompt_launchers && turn.prompt_launchers.length > 0}
                <div class="discussion-starters-block in-thread">
                  <div class="starters-eyebrow">
                    <span>💡</span> Suggested Inquiries
                  </div>
                  <div class="starters-list">
                    {#each turn.prompt_launchers as launcher}
                      <button
                        type="button"
                        class="btn-scholastic-starter"
                        onclick={() => handleSelectStarter(launcher.prompt || launcher.title)}
                        disabled={isBusy}
                        title={launcher.prompt || launcher.title}
                      >
                        <span class="starter-label">{launcher.title || launcher.prompt}</span>
                        <span class="starter-arrow">→</span>
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Learner Metacognitive Radar (rendered ONLY when concept data exists) -->
              {#if (turn.radar?.target_concept) || (turn.thoughts?.diagnosed_kc)}
                {@const concept = turn.radar?.target_concept || turn.thoughts?.diagnosed_kc}
                {@const stance = turn.radar?.epistemic_stance || turn.thoughts?.stance}
                <div class="scholastic-radar-rule">
                  <span class="radar-dot"></span>
                  <span class="radar-concept">{concept}</span>
                  {#if stance}
                    <span class="radar-sep">·</span>
                    <span class="radar-stance">{stance}</span>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    {/if}

    {#if isBusy}
      <div class="msg-bubble-wrap tutor-wrap">
        <div class="tutor-typing-indicator">
          <span class="tutor-avatar-mini">🏛️</span>
          <span>Thinking with you...</span>
          <div class="typing-dots">
            <span></span><span></span><span></span>
          </div>
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
        <span class="hint-icon">💡</span>
        <span>Request Socratic Hint</span>
        <span class="hint-pill-sub">{currentRung < 3 ? `(Rung ${currentRung + 1})` : '(Max)'}</span>
      </button>
    </div>

    <form class="agent-input-dock" onsubmit={handleSend}>
      <textarea
        bind:this={textareaEl}
        bind:value={inputMessage}
        placeholder="Discuss your thesis, test a premise, or explore evidence..."
        rows="1"
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
        title="Send message"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
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

  .consultation-thread-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 12px;
    background: var(--color-obsidian, #f8f8f5);
    border-bottom: 1px solid var(--color-graphite-border, #e2e4dc);
    flex-shrink: 0;
    gap: 8px;
    position: relative;
    z-index: 15;
  }

  :global([data-theme="dark"]) .consultation-thread-bar {
    background: var(--color-surface-subtle, #181b20);
    border-color: var(--color-graphite-border, #2a2e36);
  }

  .thread-dropdown-wrapper {
    position: relative;
    min-width: 0;
  }

  .btn-thread-select {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--color-graphite, #ffffff);
    border: 1px solid var(--color-graphite-border, #e2e4dc);
    border-radius: 6px;
    padding: 4px 9px;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--color-heading, #121418);
    cursor: pointer;
    transition: all 0.15s ease;
    max-width: 200px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  }

  :global([data-theme="dark"]) .btn-thread-select {
    background: #1e2229;
    color: var(--color-heading, #f0f2f5);
    border-color: #2a2e36;
  }

  .btn-thread-select:hover,
  .btn-thread-select.is-active {
    border-color: var(--color-aurora, #0284c7);
    background: var(--color-graphite-hover, #f1f2ed);
  }

  .thread-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .thread-turn-count {
    color: var(--color-slate-subtle, #8a909d);
    font-size: 0.68rem;
    font-weight: 500;
  }

  .thread-chevron {
    font-size: 0.62rem;
    color: var(--color-slate-subtle, #8a909d);
  }

  .thread-dropdown-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 99;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    outline: none;
    cursor: default;
  }

  .thread-dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    width: 240px;
    background: var(--color-graphite, #ffffff);
    border: 1px solid var(--color-graphite-border, #e2e4dc);
    border-radius: 8px;
    box-shadow: 0 10px 25px -4px rgba(0, 0, 0, 0.14);
    z-index: 100;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  :global([data-theme="dark"]) .thread-dropdown-menu {
    background: #1e2229;
    border-color: #2a2e36;
    box-shadow: 0 10px 25px -4px rgba(0, 0, 0, 0.45);
  }

  .thread-menu-header {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-slate-muted, #646a78);
    padding: 9px 12px;
    border-bottom: 1px solid var(--color-graphite-border, #e2e4dc);
    background: var(--color-obsidian, #f8f8f5);
  }

  :global([data-theme="dark"]) .thread-menu-header {
    background: #16191f;
    border-color: #2a2e36;
  }

  .thread-menu-list {
    max-height: 200px;
    overflow-y: auto;
    padding: 5px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .thread-menu-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 7px 9px;
    border-radius: 5px;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s ease;
    width: 100%;
  }

  .thread-menu-item:hover {
    background: var(--color-graphite-hover, #f1f2ed);
  }

  :global([data-theme="dark"]) .thread-menu-item:hover {
    background: #2a2e36;
  }

  .thread-menu-item.selected {
    background: rgba(2, 132, 199, 0.08);
  }

  .thread-item-title {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--color-heading, #121418);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
  }

  .thread-item-meta {
    font-size: 0.66rem;
    color: var(--color-slate-muted, #646a78);
    margin-top: 2px;
  }

  .thread-menu-footer {
    padding: 7px 9px;
    border-top: 1px solid var(--color-graphite-border, #e2e4dc);
    background: var(--color-obsidian, #f8f8f5);
  }

  :global([data-theme="dark"]) .thread-menu-footer {
    background: #16191f;
    border-color: #2a2e36;
  }

  .btn-new-consultation {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 9px;
    border-radius: 5px;
    border: 1px dashed var(--color-aurora, #0284c7);
    background: rgba(2, 132, 199, 0.05);
    color: var(--color-aurora, #0284c7);
    font-size: 0.74rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-new-consultation:hover {
    background: rgba(2, 132, 199, 0.12);
  }

  .btn-quick-new-thread {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 9px;
    border-radius: 6px;
    border: 1px solid var(--color-graphite-border, #e2e4dc);
    background: var(--color-graphite, #ffffff);
    color: var(--color-aurora, #0284c7);
    font-size: 0.73rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  }

  :global([data-theme="dark"]) .btn-quick-new-thread {
    background: #1e2229;
    border-color: #2a2e36;
  }

  .btn-quick-new-thread:hover {
    background: rgba(2, 132, 199, 0.08);
    border-color: var(--color-aurora, #0284c7);
  }

  .scholastic-copresence-strip {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--color-bone-muted, #f4f5f0);
    border-bottom: 1px solid var(--color-graphite-border, #e2e4dc);
    padding: 5px 12px;
    font-size: 0.72rem;
    color: var(--color-slate-muted, #64748b);
    flex-shrink: 0;
    overflow: hidden;
  }

  :global([data-theme="dark"]) .scholastic-copresence-strip {
    background: rgba(255, 255, 255, 0.02);
    border-color: var(--color-graphite-border, #262a33);
  }

  .copresence-node {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .focus-node {
    flex: 1;
  }

  .exhibit-node {
    flex-shrink: 0;
    max-width: 140px;
  }

  .copresence-dot {
    font-size: 8px;
    color: var(--color-signal-green, #10b981);
    flex-shrink: 0;
  }

  .copresence-label {
    font-weight: 600;
    color: var(--color-slate-light, #475569);
    flex-shrink: 0;
  }

  :global([data-theme="dark"]) .copresence-label {
    color: #94a3b8;
  }

  .copresence-value {
    color: var(--color-heading, #111827);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global([data-theme="dark"]) .copresence-value {
    color: #e2e8f0;
  }

  .copresence-divider {
    color: var(--color-graphite-border, #cbd5e1);
  }

  .agent-messages {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .agent-scholastic-empty {
    padding: 36px 16px;
    margin: auto 0;
    text-align: center;
  }

  .empty-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(2, 132, 199, 0.1);
    border: 1px solid rgba(2, 132, 199, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
    margin: 0 auto 12px auto;
  }

  .empty-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--color-heading, #111827);
    margin: 0 0 6px 0;
  }

  .empty-desc {
    font-size: 0.78rem;
    color: var(--color-slate-muted, #64748b);
    line-height: 1.5;
    max-width: 310px;
    margin: 0 auto;
  }

  /* Bubble Wraps */
  .msg-bubble-wrap {
    display: flex;
    width: 100%;
  }

  .student-wrap {
    justify-content: flex-end;
  }

  .tutor-wrap {
    justify-content: flex-start;
  }

  .student-msg {
    max-width: 84%;
    background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
    color: #ffffff;
    padding: 9px 13px;
    border-radius: 16px 16px 4px 16px;
    box-shadow: 0 2px 6px rgba(2, 132, 199, 0.2);
  }

  .student-msg .msg-content {
    font-size: 0.85rem;
    line-height: 1.48;
    color: #ffffff;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .tutor-msg {
    max-width: 95%;
    width: 100%;
    background: var(--color-graphite, #ffffff);
    border: 1px solid var(--color-graphite-border, #e2e4dc);
    border-radius: 14px;
    padding: 13px 15px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  :global([data-theme="dark"]) .tutor-msg {
    background: #1a1e26;
    border-color: #2a2f3a;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  }

  .tutor-msg.deflected {
    border-color: rgba(217, 119, 6, 0.35);
    background: rgba(217, 119, 6, 0.04);
  }

  .tutor-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 9px;
  }

  .tutor-badge {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .tutor-avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(2, 132, 199, 0.1);
    border: 1px solid rgba(2, 132, 199, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    flex-shrink: 0;
  }

  .author-name {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--color-heading, #111827);
  }

  :global([data-theme="dark"]) .author-name {
    color: #f1f5f9;
  }

  .hint-tag {
    font-size: 0.68rem;
    font-weight: 600;
    background: rgba(217, 119, 6, 0.12);
    color: #b45309;
    border: 1px solid rgba(217, 119, 6, 0.25);
    padding: 1px 7px;
    border-radius: 12px;
  }

  :global([data-theme="dark"]) .hint-tag {
    color: #f59e0b;
    border-color: rgba(245, 158, 11, 0.3);
  }

  .tutor-msg .msg-content {
    font-size: 0.86rem;
    line-height: 1.58;
    color: var(--color-heading, #1f2937);
    white-space: pre-wrap;
    word-break: break-word;
  }

  :global([data-theme="dark"]) .tutor-msg .msg-content {
    color: #e2e8f0;
  }

  /* Action Capsules */
  .action-capsules-wrap {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .action-capsule-slip {
    background: rgba(217, 119, 6, 0.05);
    border: 1px solid rgba(217, 119, 6, 0.24);
    border-radius: 8px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  :global([data-theme="dark"]) .action-capsule-slip {
    background: rgba(217, 119, 6, 0.09);
    border-color: rgba(217, 119, 6, 0.3);
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
    font-size: 0.77rem;
    font-style: italic;
    color: var(--color-slate-light, #475569);
    line-height: 1.38;
  }

  :global([data-theme="dark"]) .capsule-quote {
    color: #cbd5e1;
  }

  .btn-capsule-transfer {
    align-self: flex-end;
    background: #d97706;
    border: none;
    border-radius: 5px;
    padding: 3px 9px;
    font-size: 0.72rem;
    font-weight: 600;
    color: #ffffff;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .btn-capsule-transfer:hover {
    background: #b45309;
  }

  /* Discussion Starters / Suggested Inquiries */
  .discussion-starters-block {
    margin-top: 13px;
    padding-top: 11px;
    border-top: 1px solid var(--color-graphite-border, #f0f0ea);
  }

  :global([data-theme="dark"]) .discussion-starters-block {
    border-top-color: #2a2f3a;
  }

  .starters-eyebrow {
    font-size: 0.71rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-slate-subtle, #64748b);
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 8px;
  }

  .starters-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .btn-scholastic-starter {
    background: rgba(2, 132, 199, 0.04);
    border: 1px solid rgba(2, 132, 199, 0.18);
    border-radius: 8px;
    padding: 8px 12px;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
    cursor: pointer;
    transition: all 0.18s ease;
    box-shadow: 0 1px 2px rgba(2, 132, 199, 0.04);
  }

  :global([data-theme="dark"]) .btn-scholastic-starter {
    background: rgba(2, 132, 199, 0.08);
    border-color: rgba(2, 132, 199, 0.28);
  }

  .btn-scholastic-starter:hover:not(:disabled) {
    background: rgba(2, 132, 199, 0.11);
    border-color: rgba(2, 132, 199, 0.45);
  }

  .btn-scholastic-starter:focus-visible {
    outline: 2px solid var(--color-aurora, #0284c7);
    outline-offset: 1px;
  }

  .starter-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--color-heading, #0f172a);
    line-height: 1.4;
    flex: 1;
    word-break: break-word;
  }

  :global([data-theme="dark"]) .starter-label {
    color: #f1f5f9;
  }

  .starter-arrow {
    color: var(--color-aurora, #0284c7);
    font-size: 0.85rem;
    font-weight: 700;
    flex-shrink: 0;
    transition: transform 0.18s ease;
  }

  .btn-scholastic-starter:hover:not(:disabled) .starter-arrow {
    transform: translateX(3px);
  }

  /* Metacognitive Progress Rule */
  .scholastic-radar-rule {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.7rem;
    color: var(--color-slate-muted, #64748b);
  }

  :global([data-theme="dark"]) .scholastic-radar-rule {
    border-top-color: rgba(255, 255, 255, 0.06);
  }

  .radar-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-signal-green, #10b981);
    flex-shrink: 0;
  }

  .radar-concept {
    font-weight: 600;
    color: var(--color-heading, #334155);
  }

  :global([data-theme="dark"]) .radar-concept {
    color: #cbd5e1;
  }

  /* Typing Indicator */
  .tutor-typing-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.76rem;
    color: var(--color-slate-subtle, #64748b);
    font-style: italic;
    padding: 6px 12px;
    background: var(--color-graphite, #ffffff);
    border: 1px solid var(--color-graphite-border, #e2e4dc);
    border-radius: 12px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  }

  :global([data-theme="dark"]) .tutor-typing-indicator {
    background: #1a1e26;
    border-color: #2a2f3a;
  }

  .tutor-avatar-mini {
    font-size: 13px;
  }

  .typing-dots span {
    display: inline-block;
    width: 4px;
    height: 4px;
    background: var(--color-aurora, #0284c7);
    border-radius: 50%;
    margin-right: 2px;
    animation: typing 1.4s infinite ease-in-out both;
  }

  .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
  .typing-dots span:nth-child(2) { animation-delay: -0.16s; }

  @keyframes typing {
    0%, 80%, 100% { transform: scale(0); }
    40% { transform: scale(1); }
  }

  /* Agent Footer / Input Dock */
  .agent-footer {
    padding: 10px 14px 14px 14px;
    background: var(--color-obsidian, #f8f8f5);
    border-top: 1px solid var(--color-graphite-border, #e2e4dc);
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }

  :global([data-theme="dark"]) .agent-footer {
    background: var(--color-surface-subtle, #181b20);
    border-color: var(--color-graphite-border, #2a2e36);
  }

  .hints-row {
    display: flex;
    justify-content: flex-start;
  }

  .btn-hint {
    background: rgba(217, 119, 6, 0.08);
    border: 1px solid rgba(217, 119, 6, 0.28);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 0.73rem;
    font-weight: 600;
    color: #b45309;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  :global([data-theme="dark"]) .btn-hint {
    background: rgba(217, 119, 6, 0.15);
    border-color: rgba(245, 158, 11, 0.3);
    color: #f59e0b;
  }

  .btn-hint:hover:not(:disabled) {
    background: rgba(217, 119, 6, 0.16);
    border-color: #d97706;
  }

  .hint-pill-sub {
    font-size: 0.68rem;
    opacity: 0.85;
  }

  .agent-input-dock {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--color-graphite, #ffffff);
    border: 1px solid var(--color-graphite-border, #cbd5e1);
    border-radius: 12px;
    padding: 6px 8px 6px 12px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
    transition: all 0.18s ease;
  }

  :global([data-theme="dark"]) .agent-input-dock {
    background: #1e2229;
    border-color: #2a2f38;
  }

  .agent-input-dock:focus-within {
    border-color: var(--color-aurora, #0284c7);
    box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
  }

  .agent-input-dock textarea {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-size: 0.84rem;
    font-family: var(--font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    color: var(--color-heading, #111827);
    resize: none;
    min-height: 22px;
    max-height: 120px;
    line-height: 1.45;
    padding: 2px 0;
  }

  :global([data-theme="dark"]) .agent-input-dock textarea {
    color: #f1f5f9;
  }

  .btn-send {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--color-aurora, #0284c7);
    color: #ffffff;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .btn-send:hover:not(:disabled) {
    background: #0369a1;
    transform: scale(1.04);
  }

  .btn-send:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    transform: none;
  }
</style>
