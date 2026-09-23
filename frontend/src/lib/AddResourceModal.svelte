<script>
  import Modal from './Modal.svelte';

  let {
    isOpen = false,
    courseId = '',
    targetModule = null,
    onClose,
    onSuccess,
  } = $props();

  let mode = $state('text'); // 'text' | 'pdf' | 'link'
  let isSubmitting = $state(false);
  let feedbackMessage = $state('');
  let feedbackType = $state('error'); // 'error' | 'success'

  // Text Form Fields
  let textTitle = $state('');
  let textType = $state('primary_source');
  let textContent = $state('');

  // PDF Form Fields
  let fileInput = $state(null);
  let fileTitle = $state('');

  // Link Form Fields
  let linkUrl = $state('');
  let linkTitle = $state('');
  let linkContent = $state('');

  $effect(() => {
    if (isOpen) {
      feedbackMessage = '';
      mode = 'text';
      textTitle = '';
      textContent = '';
      fileTitle = '';
      linkUrl = '';
      linkTitle = '';
      linkContent = '';
    }
  });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!courseId || !targetModule?.module_id) {
      feedbackType = 'error';
      feedbackMessage = 'No target module selected.';
      return;
    }

    isSubmitting = true;
    feedbackMessage = '';

    try {
      let res;
      if (mode === 'text') {
        if (!textTitle.trim() || !textContent.trim()) {
          throw new Error('Please fill in material title and excerpt content.');
        }

        res = await fetch(`/courses/${courseId}/modules/${targetModule.module_id}/resources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: textTitle.trim(),
            content: textContent.trim(),
            resource_type: textType,
            source_url: null,
            module_id: targetModule.module_id,
          }),
        });
      } else if (mode === 'pdf') {
        if (!fileInput?.files || fileInput.files.length === 0) {
          throw new Error('Please select a document file (.pdf, .txt, .md).');
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        if (fileTitle.trim()) {
          formData.append('title', fileTitle.trim());
        }

        res = await fetch(`/courses/${courseId}/modules/${targetModule.module_id}/resources/upload`, {
          method: 'POST',
          body: formData,
        });
      } else if (mode === 'link') {
        if (!linkUrl.trim() || !linkTitle.trim()) {
          throw new Error('Please fill in the external URL and a source title.');
        }

        res = await fetch(`/courses/${courseId}/modules/${targetModule.module_id}/resources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: linkTitle.trim(),
            content: linkContent.trim() || `Reference link: ${linkUrl.trim()}`,
            resource_type: 'external_link',
            source_url: linkUrl.trim(),
            module_id: targetModule.module_id,
          }),
        });
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server returned HTTP ${res.status}`);
      }

      onSuccess?.();
      onClose?.();
    } catch (err) {
      feedbackType = 'error';
      feedbackMessage = err.message || 'Failed to ingest resource.';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<Modal {isOpen} title="📚 Attach a source to this module" width="640px" {onClose}>
  <div class="modal-description">
    Attach the reading, excerpt, or source students should use. For public links, Fiosra retrieves readable page text automatically, then records the source link and knowledge-component mapping for review before publishing.
  </div>

  <div class="target-module-pill">
    Target Module: {targetModule?.title || 'Curriculum Unit'}
  </div>

  <!-- Mode Selector Tabs -->
  <div class="resource-tabs">
    <button
      type="button"
      class="resource-tab-btn {mode === 'text' ? 'active' : ''}"
      onclick={() => (mode = 'text')}
    >
      ✍️ Paste Text / Excerpt
    </button>
    <button
      type="button"
      class="resource-tab-btn {mode === 'pdf' ? 'active' : ''}"
      onclick={() => (mode = 'pdf')}
    >
      📄 Upload PDF / Doc
    </button>
    <button
      type="button"
      class="resource-tab-btn {mode === 'link' ? 'active' : ''}"
      onclick={() => (mode = 'link')}
    >
      🔗 External URL Link
    </button>
  </div>

  <form onsubmit={handleSubmit} class="resource-form">
    {#if mode === 'text'}
      <div class="field-group">
        <label for="text-title">Material Title <span style="color: var(--color-rose);">*</span></label>
        <input
          id="text-title"
          type="text"
          bind:value={textTitle}
          placeholder="e.g. Sir John Marshall 1931 Mohenjo-daro Excavation Report"
          required
        />
      </div>

      <div class="field-group">
        <label for="text-type">Resource Classification</label>
        <select id="text-type" bind:value={textType}>
          <option value="primary_source">Primary Source Excerpt</option>
          <option value="document">Secondary Scholarly Analysis / Reading Notes</option>
        </select>
      </div>

      <div class="field-group">
        <label for="text-content">Content / Excerpt Text (Markdown supported) <span style="color: var(--color-rose);">*</span></label>
        <textarea
          id="text-content"
          rows="6"
          bind:value={textContent}
          placeholder="Paste historical excerpt, excavation report, or study notes..."
          required
        ></textarea>
      </div>
    {:else if mode === 'pdf'}
      <div class="field-group">
        <label for="doc-file">Select Document File (.pdf, .txt, .md) <span style="color: var(--color-rose);">*</span></label>
        <div class="upload-dropzone">
          <div style="font-size: 32px; margin-bottom: 8px;">📑</div>
          <input
            id="doc-file"
            type="file"
            bind:this={fileInput}
            accept=".pdf,.txt,.md,.markdown"
            required
          />
          <div class="upload-hint">
            Text will be extracted and attached to this module for source-grounded assignment design.
          </div>
        </div>
      </div>

      <div class="field-group">
        <label for="file-title">Document Display Title (Optional)</label>
        <input
          id="file-title"
          type="text"
          bind:value={fileTitle}
          placeholder="Defaults to file name if left blank"
        />
      </div>
    {:else if mode === 'link'}
      <div class="field-group">
        <label for="link-url">External URL <span style="color: var(--color-rose);">*</span></label>
        <input
          id="link-url"
          type="url"
          bind:value={linkUrl}
          placeholder="https://asi.nic.in/indus-valley-excavations"
          required
        />
      </div>

      <div class="field-group">
        <label for="link-title">Resource Title <span style="color: var(--color-rose);">*</span></label>
        <input
          id="link-title"
          type="text"
          bind:value={linkTitle}
          placeholder="e.g. Archaeological Survey of India: Mohenjo-daro Archive"
          required
        />
      </div>

      <div class="field-group">
        <label for="link-summary">Teaching notes or preferred excerpt <span style="color: var(--color-slate-muted);">(optional)</span></label>
        <textarea
          id="link-summary"
          rows="4"
          bind:value={linkContent}
          placeholder="Add the material students should examine or the source details you want the assignment to cite..."
        ></textarea>
      </div>
    {/if}

    {#if feedbackMessage}
      <div class="feedback-banner {feedbackType}">
        {feedbackMessage}
      </div>
    {/if}

    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick={onClose}>
        Cancel
      </button>
      <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
        <span>{isSubmitting ? '⏳ Attaching source…' : 'Attach source to module'}</span>
      </button>
    </div>
  </form>
</Modal>

<style>
  .modal-description {
    font-size: 13px;
    color: var(--color-slate-light);
    line-height: 1.5;
  }

  .target-module-pill {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-horizon-bright);
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.25);
    padding: 6px 12px;
    border-radius: var(--fio-radius-xs);
  }

  .resource-tabs {
    display: flex;
    gap: 8px;
    background: var(--color-obsidian);
    padding: 4px;
    border-radius: var(--fio-radius-sm);
    border: 1px solid var(--color-graphite-border);
  }

  .resource-tab-btn {
    flex: 1;
    padding: 8px 12px;
    background: transparent;
    border: none;
    color: var(--color-slate-light);
    border-radius: var(--fio-radius-xs);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
  }

  .resource-tab-btn.active {
    background: rgba(59, 130, 246, 0.2);
    color: #ffffff;
    border: 1px solid rgba(59, 130, 246, 0.4);
  }

  .resource-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  label {
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--color-slate-light);
  }

  input[type='text'],
  input[type='url'],
  select,
  textarea {
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    color: var(--color-slate-bright);
    padding: 10px 14px;
    border-radius: var(--fio-radius-sm);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s ease;
  }

  input:focus,
  select:focus,
  textarea:focus {
    border-color: var(--color-horizon-bright);
  }

  .upload-dropzone {
    border: 2px dashed var(--color-graphite-border);
    border-radius: var(--fio-radius-sm);
    padding: 20px;
    text-align: center;
    background: var(--color-obsidian);
  }

  .upload-hint {
    font-size: 11.5px;
    color: var(--color-slate-muted);
    margin-top: 8px;
  }

  .feedback-banner {
    font-size: 12px;
    padding: 8px 12px;
    border-radius: var(--fio-radius-xs);
  }

  .feedback-banner.error {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    border-top: 1px solid var(--color-graphite-border);
    padding-top: 16px;
  }
</style>
