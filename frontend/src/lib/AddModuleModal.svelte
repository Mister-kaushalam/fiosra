<script>
  import Modal from './Modal.svelte';

  let {
    isOpen = false,
    courseId = '',
    nextPosition = 1,
    onClose,
    onSuccess,
  } = $props();

  let title = $state('');
  let description = $state('');
  let objectives = $state([]);
  let objectiveDraft = $state('');
  let isSubmitting = $state(false);
  let feedbackMessage = $state('');

  $effect(() => {
    if (isOpen) {
      title = '';
      description = '';
      objectives = [];
      objectiveDraft = '';
      feedbackMessage = '';
    }
  });

  function addObjective() {
    const candidate = objectiveDraft.trim();
    if (candidate && !objectives.includes(candidate)) objectives = [...objectives, candidate];
    objectiveDraft = '';
  }

  function removeObjective(objective) {
    objectives = objectives.filter((item) => item !== objective);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!courseId || !title.trim()) return;

    const selectedObjectives = [...objectives];
    if (objectiveDraft.trim() && !selectedObjectives.includes(objectiveDraft.trim())) {
      selectedObjectives.push(objectiveDraft.trim());
    }
    isSubmitting = true;
    feedbackMessage = '';
    try {
      const response = await fetch(`/courses/${courseId}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          learning_objectives: selectedObjectives,
          position: nextPosition,
        }),
      });
      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.detail || `Server returned HTTP ${response.status}`);
      }
      onSuccess?.();
      onClose?.();
    } catch (error) {
      feedbackMessage = error.message || 'Failed to add module.';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<Modal {isOpen} title="🗺️ Add Curriculum Unit Module" width="580px" {onClose}>
  <p class="modal-intro">
    Define the next learning unit. Clear objectives, attached sources, and a student-ready task form the module readiness checklist.
  </p>

  <form onsubmit={handleSubmit} class="module-form">
    <div class="field-group">
      <label for="mod-title">Module Title <span style="color: var(--color-rose);">*</span></label>
      <input id="mod-title" type="text" bind:value={title} placeholder="e.g. Unit 01: Urban infrastructure as historical evidence" required />
    </div>

    <div class="field-group">
      <label for="mod-desc">Pedagogical Scope &amp; Summary</label>
      <textarea id="mod-desc" rows="3" bind:value={description} placeholder="What will students investigate, what sources matter, and what should they be able to explain?"></textarea>
    </div>

    <div class="field-group">
      <label for="mod-obj">Learning Objectives</label>
      <div class="objective-entry">
        <input id="mod-obj" type="text" bind:value={objectiveDraft} onkeydown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addObjective(); } }} placeholder="e.g. Distinguish observation from historical inference" />
        <button type="button" class="btn btn-secondary" onclick={addObjective}>Add</button>
      </div>
      {#if objectives.length}
        <div class="objective-chips" aria-label="Learning objectives">
          {#each objectives as objective}
            <span>{objective}<button type="button" aria-label={`Remove ${objective}`} onclick={() => removeObjective(objective)}>×</button></span>
          {/each}
        </div>
      {:else}
        <p class="field-helper">Add objectives one at a time to make the learning purpose explicit.</p>
      {/if}
    </div>

    {#if feedbackMessage}<div class="feedback-banner error">{feedbackMessage}</div>{/if}

    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick={onClose}>Cancel</button>
      <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
        <span>{isSubmitting ? 'Creating module…' : '+ Add Unit to Curriculum'}</span>
      </button>
    </div>
  </form>
</Modal>

<style>
  .modal-intro { font-size: 13px; color: var(--color-slate-light); line-height: 1.5; }
  .module-form { display: flex; flex-direction: column; gap: 16px; }
  .field-group { display: flex; flex-direction: column; gap: 6px; }
  label { font-size: 11.5px; font-weight: 700; text-transform: uppercase; color: var(--color-slate-light); }
  input[type='text'], textarea { background: var(--color-obsidian); border: 1px solid var(--color-graphite-border); color: var(--color-slate-bright); padding: 10px 14px; border-radius: var(--fio-radius-sm); font-size: 13px; outline: none; transition: border-color 0.15s ease; }
  input:focus, textarea:focus { border-color: var(--color-horizon-bright); }
  .objective-entry { display: flex; gap: 8px; }
  .objective-entry input { flex: 1; }
  .objective-entry .btn { flex: 0 0 auto; }
  .objective-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .objective-chips span { align-items: center; background: rgba(59,130,246,.12); border: 1px solid rgba(59,130,246,.25); border-radius: 999px; color: var(--color-slate-bright); display: flex; font-size: 11px; gap: 4px; padding: 4px 7px 4px 9px; }
  .objective-chips button { background: none; border: 0; color: var(--color-slate-light); cursor: pointer; font-size: 14px; line-height: 1; padding: 0; }
  .field-helper { color: var(--color-slate-muted); font-size: 11px; line-height: 1.4; margin: 0; }
  .feedback-banner.error { font-size: 12px; padding: 8px 12px; border-radius: var(--fio-radius-xs); background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
  .form-actions { display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid var(--color-graphite-border); padding-top: 16px; }
</style>
