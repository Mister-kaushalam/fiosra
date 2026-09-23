<script>
  let {
    isOpen = false,
    onClose = () => null,
    sessionId = '',
    assignment = null,
    currentRung = 0,
    turns = [],
    onSendMessage = async () => null,
    onRequestHint = async () => null,
    isBusy = false,
  } = $props();

  let inputMessage = $state('');
  let messagesContainer = $state();

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
    }, 50);
  }

  $effect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  });
</script>

{#if isOpen}
  <div class="drawer-backdrop" onclick={onClose} role="presentation"></div>
  <aside class="socratic-dialogue-drawer" aria-label="Socratic Macro Dialogue Drawer">
    <div class="drawer-header">
      <div class="drawer-header-left">
        <span class="drawer-robot-icon">🤖</span>
        <div>
          <h3 class="drawer-title">Socratic Copilot</h3>
          <span class="drawer-sub">Macro Dialogue & Conceptual Outlining</span>
        </div>
      </div>
      <div class="drawer-header-right">
        <span class="rung-pill">Rung {currentRung} / 3</span>
        <button
          type="button"
          class="btn-close-drawer"
          onclick={onClose}
          aria-label="Close drawer"
        >
          ✕
        </button>
      </div>
    </div>

    <div class="pedagogical-banner">
      <span>💡</span>
      <small>Use this dialogue for high-level outlining and conceptual debate. Your primary claims and evidence belong on the Canvas.</small>
    </div>

    <div class="drawer-messages" bind:this={messagesContainer}>
      {#if turns.length === 0}
        <div class="drawer-empty-state">
          <p><strong>Ready to explore your central thesis.</strong></p>
          <p>Ask a question about your essay structure, or request a Socratic probe on your target knowledge components.</p>
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
                <span>🤖 Fiosra Socratic Tutor</span>
                {#if turn.hint_rung > 0}
                  <span class="hint-tag">Scaffolding Rung {turn.hint_rung}</span>
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

    <div class="drawer-footer">
      <div class="drawer-hints-bar">
        <button
          type="button"
          class="btn-hint"
          onclick={handleHint}
          disabled={isBusy || currentRung >= 3}
          title="Monotonically advance the Socratic scaffolding ladder"
        >
          <span>💡</span> Request Socratic Hint {currentRung < 3 ? `(Rung ${currentRung + 1})` : '(Max)'}
        </button>
      </div>

      <form class="drawer-input-form" onsubmit={handleSend}>
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
  </aside>
{/if}

<style>
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(2px);
    z-index: 9998;
    animation: fadeIn 0.2s ease;
  }

  .socratic-dialogue-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(520px, 92vw);
    background: var(--color-graphite, #ffffff);
    border-left: 1px solid var(--color-graphite-border);
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.25);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    animation: slideLeft 0.25s cubic-bezier(0.2, 0, 0, 1);
  }

  :global([data-theme="dark"]) .socratic-dialogue-drawer {
    background: rgba(22, 27, 34, 0.98);
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-graphite-border);
  }

  .drawer-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .drawer-robot-icon { font-size: 1.4rem; }

  .drawer-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-heading, var(--color-slate-bright));
  }

  .drawer-sub {
    font-size: 0.76rem;
    color: var(--color-slate-subtle);
  }

  .drawer-header-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .rung-pill {
    font-size: 0.74rem;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--color-aurora-glow);
    color: var(--color-aurora);
    border: 1px solid rgba(123, 97, 255, 0.2);
  }

  .btn-close-drawer {
    background: none;
    border: 1px solid var(--color-graphite-border);
    border-radius: 6px;
    padding: 4px 8px;
    cursor: pointer;
    color: var(--color-slate-subtle);
    font-size: 0.85rem;
  }

  .btn-close-drawer:hover {
    color: var(--color-slate-bright);
    background: rgba(0, 0, 0, 0.05);
  }

  .pedagogical-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(123, 97, 255, 0.06);
    border-bottom: 1px solid rgba(123, 97, 255, 0.15);
    padding: 8px 18px;
    font-size: 0.78rem;
    color: var(--color-slate-light);
  }

  .drawer-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .drawer-empty-state {
    padding: 40px 10px;
    text-align: center;
    color: var(--color-slate-subtle);
    font-size: 0.88rem;
    line-height: 1.5;
  }

  .msg-bubble {
    max-width: 88%;
    padding: 12px 14px;
    border-radius: 10px;
    font-size: 0.88rem;
    line-height: 1.45;
  }

  .student-msg {
    align-self: flex-end;
    background: var(--color-aurora);
    color: #ffffff;
    border-bottom-right-radius: 2px;
  }

  .student-msg .msg-author {
    font-size: 0.7rem;
    font-weight: 600;
    opacity: 0.8;
    margin-bottom: 4px;
    text-align: right;
  }

  .tutor-msg {
    align-self: flex-start;
    background: var(--color-bone-muted, #f4f5f0);
    border: 1px solid var(--color-graphite-border);
    color: var(--color-slate-bright);
    border-bottom-left-radius: 2px;
  }

  :global([data-theme="dark"]) .tutor-msg {
    background: rgba(30, 36, 46, 0.8);
  }

  .tutor-msg.deflected {
    border-color: rgba(79, 107, 255, 0.4);
    background: rgba(79, 107, 255, 0.08);
  }

  .tutor-msg .msg-author {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--color-aurora);
    margin-bottom: 6px;
  }

  .hint-tag {
    font-size: 0.68rem;
    background: rgba(123, 97, 255, 0.1);
    padding: 1px 6px;
    border-radius: 4px;
  }

  .tutor-thoughts {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px dashed var(--color-graphite-border);
    font-size: 0.74rem;
    color: var(--color-slate-subtle);
  }

  .tutor-thoughts summary {
    cursor: pointer;
  }

  .tutor-thoughts pre {
    margin: 6px 0 0 0;
    padding: 6px;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
    overflow-x: auto;
    font-family: var(--fio-font-mono, monospace);
  }

  .tutor-typing-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    color: var(--color-slate-subtle);
    padding: 8px 12px;
  }

  .typing-dots {
    display: flex;
    gap: 4px;
  }

  .typing-dots span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-aurora);
    animation: bounce 1.2s infinite ease-in-out;
  }

  .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
  .typing-dots span:nth-child(3) { animation-delay: 0.4s; }

  .drawer-footer {
    padding: 12px 18px 16px;
    border-top: 1px solid var(--color-graphite-border);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .drawer-hints-bar {
    display: flex;
    justify-content: flex-start;
  }

  .btn-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--color-bone-muted, #f4f5f0);
    border: 1px solid var(--color-graphite-border);
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--color-slate-bright);
    padding: 4px 10px;
    cursor: pointer;
  }

  .btn-hint:hover:not(:disabled) {
    background: var(--color-aurora-glow);
    border-color: var(--color-aurora);
    color: var(--color-aurora);
  }

  .btn-hint:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .drawer-input-form {
    display: flex;
    gap: 10px;
    align-items: flex-end;
  }

  .drawer-input-form textarea {
    flex: 1;
    font-family: var(--font-ui, sans-serif);
    font-size: 0.86rem;
    line-height: 1.4;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--color-graphite-border);
    background: var(--color-bone-muted, #f8f8f5);
    color: var(--color-slate-bright);
    resize: none;
  }

  :global([data-theme="dark"]) .drawer-input-form textarea {
    background: rgba(18, 22, 29, 0.8);
  }

  .btn-send {
    background: var(--color-aurora);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    cursor: pointer;
  }

  .btn-send:hover:not(:disabled) {
    background: var(--color-aurora-bright);
  }

  .btn-send:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideLeft {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0); }
    40% { transform: scale(1); }
  }
</style>
