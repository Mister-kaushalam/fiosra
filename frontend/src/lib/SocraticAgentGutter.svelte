<script>
  let {
    sessionId = '',
    assignment = null,
    currentRung = 0,
    turns = [],
    onSendMessage = async () => null,
    onRequestHint = async () => null,
    isBusy = false,
  } = $props();

  let inputMessage = $state('');
  let messagesContainer = $state(null);

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
  <!-- Pedagogical Notice -->
  <div class="pedagogical-banner">
    <span class="banner-icon">💡</span>
    <span class="banner-text">
      Macro dialogue & conceptual debate. Your primary claims and evidence belong on the Canvas.
    </span>
  </div>

  <!-- Messages Scroll Area -->
  <div class="agent-messages" bind:this={messagesContainer}>
    {#if turns.length === 0}
      <div class="agent-empty-state">
        <div class="empty-robot">🤖</div>
        <h4 class="empty-title">Ready to explore your central thesis</h4>
        <p class="empty-desc">
          Ask a question about your essay structure, or request a Socratic hint to test your historical causation reasoning.
        </p>
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
              <span class="author-name">🤖 Fiosra Socratic Tutor</span>
              {#if turn.hint_rung > 0}
                <span class="hint-tag">Rung {turn.hint_rung}</span>
              {/if}
            </div>
            <div class="msg-content">{turn.text}</div>

            {#if turn.thoughts && Object.keys(turn.thoughts).length > 0}
              <details class="tutor-thoughts">
                <summary>Cognitive Diagnosis</summary>
                <pre>{JSON.stringify(turn.thoughts, null, 2)}</pre>
              </details>
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

  .pedagogical-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(2, 132, 199, 0.08);
    border-bottom: 1px solid rgba(2, 132, 199, 0.18);
    padding: 8px 14px;
    font-size: 0.74rem;
    color: var(--color-slate-light, #64748b);
    line-height: 1.35;
    flex-shrink: 0;
  }

  .banner-icon { font-size: 0.9rem; flex-shrink: 0; }

  .agent-messages {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .agent-empty-state {
    padding: 36px 14px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: auto 0;
  }

  .empty-robot {
    font-size: 2.2rem;
    margin-bottom: 10px;
  }

  .empty-title {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--color-slate-bright, #0f172a);
    margin: 0 0 6px 0;
  }

  :global([data-theme="dark"]) .empty-title {
    color: #f1f5f9;
  }

  .empty-desc {
    font-size: 0.76rem;
    color: var(--color-slate-subtle, #64748b);
    line-height: 1.45;
    max-width: 280px;
    margin: 0;
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
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--color-aurora, #0284c7);
    margin-bottom: 5px;
  }

  .hint-tag {
    font-size: 0.65rem;
    background: rgba(2, 132, 199, 0.1);
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 500;
  }

  .tutor-thoughts {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px dashed var(--color-graphite-border, #e2e8f0);
    font-size: 0.72rem;
    color: var(--color-slate-subtle, #64748b);
  }

  .tutor-thoughts summary {
    cursor: pointer;
  }

  .tutor-thoughts pre {
    margin: 6px 0 0 0;
    padding: 6px;
    background: rgba(0, 0, 0, 0.04);
    border-radius: 4px;
    overflow-x: auto;
    font-family: var(--font-mono, monospace);
    font-size: 0.68rem;
  }

  .tutor-typing-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.78rem;
    color: var(--color-slate-subtle, #64748b);
    padding: 6px 10px;
  }

  .typing-dots {
    display: flex;
    gap: 4px;
  }

  .typing-dots span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-aurora, #0284c7);
    animation: bounceDot 1.2s infinite ease-in-out;
  }

  .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
  .typing-dots span:nth-child(3) { animation-delay: 0.4s; }

  @keyframes bounceDot {
    0%, 80%, 100% { transform: scale(0); }
    40% { transform: scale(1); }
  }

  .agent-footer {
    padding: 10px 14px 14px;
    border-top: 1px solid var(--color-graphite-border, #e2e8f0);
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.02);
  }

  .hints-row {
    display: flex;
    justify-content: flex-start;
  }

  .btn-hint {
    display: flex;
    align-items: center;
    gap: 5px;
    background: var(--color-bone-muted, #f4f5f0);
    border: 1px solid var(--color-graphite-border, #cbd5e1);
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-slate-bright, #0f172a);
    padding: 4px 9px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  :global([data-theme="dark"]) .btn-hint {
    background: rgba(30, 36, 46, 0.8);
    border-color: rgba(255, 255, 255, 0.1);
    color: #f1f5f9;
  }

  .btn-hint:hover:not(:disabled) {
    background: var(--color-aurora-glow, rgba(2, 132, 199, 0.1));
    border-color: var(--color-aurora, #0284c7);
    color: var(--color-aurora, #0284c7);
  }

  .btn-hint:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .agent-input-form {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }

  .agent-input-form textarea {
    flex: 1;
    font-family: var(--font-ui, sans-serif);
    font-size: 0.82rem;
    line-height: 1.4;
    padding: 7px 10px;
    border-radius: 6px;
    border: 1px solid var(--color-graphite-border, #cbd5e1);
    background: var(--color-bone-muted, #f8f8f5);
    color: var(--color-slate-bright, #0f172a);
    resize: none;
    box-sizing: border-box;
    transition: border-color 0.15s ease;
  }

  :global([data-theme="dark"]) .agent-input-form textarea {
    background: rgba(18, 22, 29, 0.85);
    border-color: rgba(255, 255, 255, 0.12);
    color: #f1f5f9;
  }

  .agent-input-form textarea:focus {
    outline: none;
    border-color: var(--color-aurora, #0284c7);
  }

  .btn-send {
    background: var(--color-aurora, #0284c7);
    color: #ffffff;
    border: none;
    border-radius: 6px;
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.88rem;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease;
  }

  .btn-send:hover:not(:disabled) {
    background: var(--color-aurora-bright, #0369a1);
  }

  .btn-send:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
