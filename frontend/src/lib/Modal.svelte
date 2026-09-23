<script>
  let { isOpen = false, title = '', width = '600px', onClose, children } = $props();

  function handleKeydown(e) {
    if (e.key === 'Escape' && isOpen) {
      onClose?.();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={() => onClose?.()}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-box" style="width: {width};" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <div class="modal-title">{title}</div>
        <button type="button" class="btn btn-secondary btn-icon" onclick={() => onClose?.()}>
          ✕
        </button>
      </div>

      <div class="modal-body">
        {@render children?.()}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--modal-overlay-bg);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .modal-box {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--fio-radius-lg);
    max-width: 92vw;
    padding: 28px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    box-shadow: var(--fio-shadow-lg);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--color-graphite-border);
    padding-bottom: 14px;
  }

  .modal-title {
    font-family: var(--font-brand);
    font-size: 18px;
    font-weight: 700;
    color: var(--color-heading);
  }

  .btn-icon {
    padding: 4px 8px;
    font-size: 13px;
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
</style>
