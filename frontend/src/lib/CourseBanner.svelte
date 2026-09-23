<script>
  let {
    course = null,
    enrolledCount = 0,
    courseId = '',
    onAddModule,
  } = $props();

  let designerHref = $derived(
    courseId ? `#/designer?course_id=${encodeURIComponent(courseId)}` : '#/designer'
  );

  let showSyllabusModal = $state(false);

  let syllabusLabel = $derived.by(() => {
    const raw = course?.syllabus_context || '';
    if (!raw) return 'Curriculum initialized';
    if (raw.toLowerCase().includes('openstax')) return 'OpenStax Principles of Marketing';
    if (raw.length > 36) return raw.substring(0, 32) + '…';
    return raw;
  });
</script>

<div class="course-banner">
  <div class="banner-left">
    <div class="banner-meta">
      <span class="meta-tag">{(course?.domain || 'ACADEMIC').toUpperCase()} CURRICULUM</span>
      <span class="meta-sep">•</span>
      <span style="color: var(--color-horizon-bright);">COURSE WORKSPACE</span>
      <span class="meta-sep">•</span>
      <span>{enrolledCount} ENROLLED STUDENTS</span>
    </div>

    <h1 class="course-h1">{course?.title || 'Course Workspace'}</h1>

    <div class="banner-indicators">
      <div class="indicator-chip">
        <span class="chip-icon">📖</span>
        <span class="chip-label">Syllabus Grounding:</span>
        <button
          type="button"
          class="chip-link-btn"
          onclick={() => showSyllabusModal = true}
          title="Click to view full syllabus grounding details"
        >
          {syllabusLabel} ℹ️
        </button>
      </div>
      <div class="indicator-chip">
        <span class="chip-icon">🧬</span>
        <span class="chip-label">Curriculum sequence:</span>
        <span class="chip-val">{course?.modules?.length || 0} Modules configured</span>
      </div>
    </div>
  </div>

  <div class="banner-right">
    <button type="button" class="btn btn-secondary" onclick={onAddModule}>
      + Add Module
    </button>
    <a href={designerHref} class="btn btn-primary">
      + Co-Pilot New Assignment
    </a>
  </div>
</div>

{#if showSyllabusModal}
  <div class="syllabus-backdrop" onclick={() => showSyllabusModal = false} onkeydown={(e) => e.key === 'Escape' && (showSyllabusModal = false)} role="presentation">
    <div
      class="syllabus-modal"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Syllabus Grounding Attribution"
      tabindex="-1"
    >
      <div class="modal-header">
        <h3>📖 Grounded Syllabus Context &amp; Attribution</h3>
        <button type="button" class="modal-close" onclick={() => showSyllabusModal = false}>✕</button>
      </div>
      <div class="modal-body">
        <p>{course?.syllabus_context || 'Curriculum initialized in PostgreSQL & Neo4j'}</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary btn-sm" onclick={() => showSyllabusModal = false}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .course-banner {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--fio-radius-lg);
    padding: 22px 28px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    position: relative;
    overflow: hidden;
  }

  .course-banner::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background: linear-gradient(180deg, var(--color-horizon-blue), var(--color-aurora));
  }

  .banner-left {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .banner-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--color-slate-light);
  }

  .meta-tag {
    letter-spacing: 0.4px;
  }

  .meta-sep {
    color: var(--color-slate-muted);
  }

  .course-h1 {
    font-family: var(--font-brand);
    font-size: 24px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 0;
    line-height: 1.25;
  }

  .banner-indicators {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 2px;
  }

  .indicator-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--color-slate-light);
    background: var(--pill-bg);
    padding: 4px 10px;
    border-radius: var(--fio-radius-xs);
    border: 1px solid var(--pill-border);
  }

  .chip-icon {
    font-size: 13px;
  }

  .chip-label {
    font-weight: 500;
    color: var(--color-slate-muted);
  }

  .chip-val {
    color: var(--color-slate-bright);
    font-weight: 500;
  }

  .banner-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .chip-link-btn {
    background: none;
    border: none;
    color: var(--color-horizon-bright);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    padding: 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .chip-link-btn:hover {
    color: #3d55e0;
  }

  .syllabus-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
  }

  .syllabus-modal {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--fio-radius-lg);
    max-width: 680px;
    width: 100%;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-graphite-border);
    background: var(--color-obsidian);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 15px;
    color: var(--color-heading);
  }

  .modal-close {
    background: none;
    border: none;
    color: var(--color-slate-light);
    cursor: pointer;
    font-size: 16px;
  }

  .modal-body {
    padding: 20px;
    max-height: 60vh;
    overflow-y: auto;
  }

  .modal-body p {
    color: var(--color-slate-light);
    font-size: 13.5px;
    line-height: 1.6;
    margin: 0;
    white-space: pre-wrap;
  }

  .modal-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--color-graphite-border);
    background: var(--color-obsidian);
    display: flex;
    justify-content: flex-end;
  }
</style>
