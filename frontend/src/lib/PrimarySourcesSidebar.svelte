<script>
  import PdfViewer from './PdfViewer.svelte';

  let {
    sources = [],
    assignment = null,
    courseTitle = 'Department of Historical Studies',
    courseId = '',
    onQuoteEvidence = () => null,
    isCollapsed = false,
    isExpanded = true,
    onToggleCollapse = () => null,
    onToggleExpand = () => null,
  } = $props();

  // Active tab inside sidebar: 'assignment' | 'sources'
  let activeTab = $state('sources');

  // Parse and group sources into documents
  let displaySources = $derived.by(() => {
    const list = sources || [];
    if (list.length > 0) {
      return list.map((s, idx) => ({
        source_id: s.source_id || s.id || `src_${idx + 1}`,
        author: s.author || s.citation || s.title || 'Primary Source',
        title: s.title || s.source_title || `Document ${idx + 1}`,
        date: s.date || 'Assigned Document',
        provenance: s.provenance || s.citation || '',
        passage: s.passage || s.excerpt || s.text || '',
        hidden_context: s.hidden_context || s.synopsis || s.relevance_guidance || '',
        target_kc: s.target_kc || s.kc || 'KC_EVIDENCE',
        source_url: s.source_url || s.url || s.download_url || null,
        relevance_guidance: s.relevance_guidance || '',
      }));
    }
    return [];
  });

  // Group by document title
  let documents = $derived.by(() => {
    const docMap = new Map();
    for (const src of displaySources) {
      const docKey = src.title || 'Course Reading';
      if (!docMap.has(docKey)) {
        docMap.set(docKey, {
          title: docKey,
          author: src.author,
          source_url: src.source_url,
          sections: [],
        });
      }
      docMap.get(docKey).sections.push(src);
    }
    return Array.from(docMap.values());
  });

  let selectedDocIndex = $state(0);
  let activeDoc = $derived(documents[selectedDocIndex] || documents[0] || null);

  // Search State
  let pdfViewerRef = $state(null);
  let matchInfo = $state({ current: 0, total: 0 });
  let searchQuery = $state('');
  let activeSearchTerm = $state('');
  let iframeKey = $state(1);

  function performSearch() {
    const q = searchQuery.trim();
    if (!q) {
      activeSearchTerm = '';
      iframeKey += 1;
      return;
    }
    activeSearchTerm = q;
    iframeKey += 1;
  }

  function clearSearch() {
    searchQuery = '';
    activeSearchTerm = '';
    iframeKey += 1;
  }

  function printAssignmentSheet() {
    window.print();
  }

  function switchToSource(sourceTitle) {
    if (sourceTitle) {
      const idx = documents.findIndex((d) => d.title === sourceTitle);
      if (idx >= 0) selectedDocIndex = idx;
    }
    activeTab = 'sources';
  }
</script>

<aside
  class="evidentiary-well"
  class:collapsed={isCollapsed}
  class:expanded={isExpanded}
  aria-label="Assignment Specification & Primary Sources"
>
  {#if isCollapsed}
    <!-- Collapsed Slim Sidebar Strip with Vertical Tabs -->
    <div class="collapsed-sidebar-strip">
      <button
        type="button"
        class="collapsed-tab-btn"
        class:active={activeTab === 'assignment'}
        onclick={() => { activeTab = 'assignment'; onToggleExpand(); }}
        title="Open Assignment Brief"
        aria-label="Open Assignment Brief"
      >
        <span class="collapsed-tab-icon">📋</span>
      </button>

      <button
        type="button"
        class="collapsed-tab-btn"
        class:active={activeTab === 'sources'}
        onclick={() => { activeTab = 'sources'; onToggleExpand(); }}
        title="Open Primary Sources"
        aria-label="Open Primary Sources"
      >
        <span class="collapsed-tab-icon">📕</span>
      </button>

      <button
        type="button"
        class="btn-collapsed-expand"
        onclick={onToggleExpand}
        title="Expand Document Reader"
        aria-label="Expand Document Reader"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 3 21 3 21 9"></polyline>
          <polyline points="9 21 3 21 3 15"></polyline>
          <line x1="21" y1="3" x2="14" y2="10"></line>
          <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
      </button>

      <div
        class="vertical-title"
        onclick={onToggleExpand}
        role="button"
        tabindex="0"
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggleExpand(); }}
      >
        {activeTab === 'assignment' ? 'ASSIGNMENT BRIEF' : 'PRIMARY SOURCES'}
      </div>
    </div>
  {:else}
    <!-- Header Bar with Dual Tabs & Controls -->
    <div class="well-header">
      <div class="sidebar-tabs-nav" role="tablist">
        <button
          type="button"
          class="sidebar-tab-btn"
          class:active={activeTab === 'assignment'}
          onclick={() => activeTab = 'assignment'}
          role="tab"
          aria-selected={activeTab === 'assignment'}
        >
          <span class="tab-icon">📋</span>
          <span class="tab-label">Assignment Brief</span>
        </button>

        <button
          type="button"
          class="sidebar-tab-btn"
          class:active={activeTab === 'sources'}
          onclick={() => activeTab = 'sources'}
          role="tab"
          aria-selected={activeTab === 'sources'}
        >
          <span class="tab-icon">📕</span>
          <span class="tab-label">Primary Sources</span>
          {#if documents.length > 0}
            <span class="tab-pill-badge">{documents.length}</span>
          {/if}
        </button>
      </div>

      <div class="well-header-actions">
        {#if activeTab === 'assignment'}
          <!-- Print / Save as PDF Button -->
          <button
            type="button"
            class="btn-header-action"
            onclick={printAssignmentSheet}
            title="Save as PDF / Print Assignment"
            aria-label="Save as PDF / Print Assignment"
          >
            <span style="font-size: 13px;">🖨️</span>
          </button>
        {:else if activeDoc?.source_url}
          <!-- Open PDF External Fullscreen -->
          <a
            href={activeDoc.source_url}
            target="_blank"
            rel="noopener noreferrer"
            class="btn-header-action"
            title="Full screen in new tab"
            aria-label="Full screen in new tab"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 3 21 3 21 9"></polyline>
              <polyline points="9 21 3 21 3 15"></polyline>
              <line x1="21" y1="3" x2="14" y2="10"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          </a>
        {/if}

        <!-- Expand / Collapse to sidebar Toggle -->
        <button
          type="button"
          class="btn-header-action"
          onclick={onToggleExpand}
          title={isExpanded ? 'Collapse to sidebar' : 'Expand to max width'}
          aria-label={isExpanded ? 'Collapse to sidebar' : 'Expand to max width'}
        >
          {#if isExpanded}
            <!-- Collapse Symbol -->
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 14 10 14 10 20"></polyline>
              <polyline points="20 10 14 10 14 4"></polyline>
              <line x1="14" y1="10" x2="21" y2="3"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          {:else}
            <!-- Expand Symbol -->
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 3 21 3 21 9"></polyline>
              <polyline points="9 21 3 21 3 15"></polyline>
              <line x1="21" y1="3" x2="14" y2="10"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          {/if}
        </button>
      </div>
    </div>

    {#if activeTab === 'assignment'}
      <!-- TAB 1: ACADEMIC ASSIGNMENT BRIEF (Printable Handout Format) -->
      <div class="assignment-scroll-container">
        <div class="pdf-control-bar no-print">
          <div class="pdf-info">
            <span class="pdf-info-tag">📄 Academic Handout</span>
            <small>Ready to distribute or save as PDF via your browser print dialog.</small>
          </div>
          <button type="button" class="btn-print-action" onclick={printAssignmentSheet}>
            🖨️ Save as PDF / Print
          </button>
        </div>

        <article class="academic-sheet print-target">
          <!-- Sheet Header -->
          <header class="sheet-header">
            <div class="sheet-institution">
              <div class="inst-logo">FIOSRA ACADEMIC LMS</div>
              <div class="inst-course">{courseTitle || 'Department of Historical Studies'}</div>
            </div>
            <div class="sheet-meta">
              <div><span>Domain:</span> {assignment?.domain || 'Historical Inquiry'}</div>
              <div><span>Deliverable:</span> {assignment?.task?.deliverable || 'Argumentative Essay'}</div>
              <div><span>Scope:</span> {assignment?.task?.scope || 'Course scope'}</div>
            </div>
          </header>

          <!-- Title Block -->
          <div class="sheet-title-block">
            <h1>{assignment?.title || 'Milestone Assignment'}</h1>
            {#if assignment?.purpose}
              <p class="sheet-purpose">{assignment.purpose}</p>
            {/if}
          </div>

          <!-- Section I: Task Inquiries & Instructions -->
          <section class="sheet-section">
            <h2 class="sheet-sec-title">I. Task Inquiries &amp; Instructions</h2>
            <p class="sheet-task-prompt">{assignment?.task?.prompt || 'Explore the assigned historical materials to build your central thesis and argument.'}</p>
            {#if assignment?.task?.requirements && assignment.task.requirements.length > 0}
              <ul class="sheet-requirements">
                {#each assignment.task.requirements as req}
                  <li>{req}</li>
                {/each}
              </ul>
            {/if}
          </section>

          <!-- Section II: Assigned Primary Source Materials -->
          <section class="sheet-section">
            <h2 class="sheet-sec-title">II. Assigned Primary Source Materials</h2>
            <div class="sheet-sources-table">
              {#each (assignment?.source_pack || sources || []) as src, idx}
                <div class="sheet-source-row">
                  <div class="src-meta">
                    <strong>Source {idx + 1}: {src.title || `Reading ${idx + 1}`}</strong>
                    {#if src.relevance_guidance}
                      <span class="src-guide">{src.relevance_guidance}</span>
                    {/if}
                  </div>
                  {#if src.excerpt || src.passage}
                    <blockquote class="src-excerpt">"{src.excerpt || src.passage}"</blockquote>
                  {/if}
                  <div class="src-action-row no-print">
                    <button
                      type="button"
                      class="btn-open-source-pdf"
                      onclick={() => switchToSource(src.title)}
                    >
                      📕 Read in PDF Viewer ↗
                    </button>
                    {#if onQuoteEvidence && (src.excerpt || src.passage)}
                      <button
                        type="button"
                        class="btn-quote-source"
                        onclick={() => onQuoteEvidence({ text: src.excerpt || src.passage, title: src.title, page: 1 })}
                      >
                        ✍️ Quote to Canvas
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </section>

          <!-- Section III: Evaluation Rubric Criteria (100%) -->
          {#if assignment?.public_rubric && assignment.public_rubric.length > 0}
            <section class="sheet-section">
              <h2 class="sheet-sec-title">III. Evaluation Rubric Criteria (100%)</h2>
              <table class="sheet-rubric-table">
                <thead>
                  <tr>
                    <th style="width: 28%;">Criterion &amp; Weight</th>
                    <th style="width: 24%;">Developing</th>
                    <th style="width: 24%;">Secure</th>
                    <th style="width: 24%;">Strong</th>
                  </tr>
                </thead>
                <tbody>
                  {#each assignment.public_rubric as crit}
                    <tr>
                      <td>
                        <strong>{crit.title}</strong>
                        {#if crit.weight}
                          <span class="weight-tag">{crit.weight}%</span>
                        {/if}
                        {#if crit.concept_label || crit.concept_id}
                          <div class="sheet-concept-tag">⚡ {crit.concept_label || crit.concept_id}</div>
                        {/if}
                        {#if crit.description}
                          <div class="crit-sub">{crit.description}</div>
                        {/if}
                      </td>
                      {#each (crit.levels || []) as lvl}
                        <td>
                          <span class="lvl-title">{lvl.label}:</span>
                          <span class="lvl-desc">{lvl.description}</span>
                        </td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </section>
          {/if}

          <!-- Section IV: Learning Goals -->
          {#if assignment?.learning_goals && assignment.learning_goals.length > 0}
            <section class="sheet-section">
              <h2 class="sheet-sec-title">IV. Milestone Learning Goals</h2>
              <ul class="sheet-goals-list">
                {#each assignment.learning_goals as goal}
                  <li>✓ {goal}</li>
                {/each}
              </ul>
            </section>
          {/if}

          <!-- Section V: Readiness Checklist & Honor Notice -->
          <section class="sheet-section">
            <h2 class="sheet-sec-title">V. Readiness Checklist &amp; Honor Notice</h2>
            {#if assignment?.completion_checklist && assignment.completion_checklist.length > 0}
              <ul class="sheet-checklist">
                {#each assignment.completion_checklist as item}
                  <li>◻ {item}</li>
                {/each}
              </ul>
            {/if}
            <footer class="sheet-footer">
              <div class="sheet-integrity-statement">
                <strong>🔒 Academic Integrity Notice:</strong> {assignment?.integrity_notice || 'Your educator evaluates the final submission. Use course materials responsibly and cite sources.'}
              </div>
            </footer>
          </section>
        </article>
      </div>
    {:else}
      <!-- TAB 2: PRIMARY SOURCES PDF VIEWER -->
      <!-- Document Switcher (if more than 1 document) -->
      {#if documents.length > 1}
        <div class="doc-switcher-bar">
          {#each documents as doc, idx}
            <button
              type="button"
              class="btn-doc-tab"
              class:active={selectedDocIndex === idx}
              onclick={() => { selectedDocIndex = idx; clearSearch(); }}
            >
              📕 {doc.title}
            </button>
          {/each}
        </div>
      {/if}

      <!-- Direct PDF Viewer Body with PDF.js and text search highlighting -->
      <div class="pdf-reader-frame-container">
        {#if activeDoc?.source_url}
          <PdfViewer
            bind:this={pdfViewerRef}
            url={activeDoc.source_url}
            title={activeDoc.title}
            searchTerm={activeSearchTerm}
            {onQuoteEvidence}
            onMatchesChange={(info) => matchInfo = info}
          />
        {:else}
          <div class="empty-doc-view">
            <span class="empty-icon">📜</span>
            <p>No PDF attached to this assignment.</p>
          </div>
        {/if}
      </div>

      <!-- Floating Bottom AI Semantic Search Bar (Clean Pill, No Rectangular Shelf) -->
      <div class="bottom-ai-search-anchor">
        <form
          class="search-input-form"
          onsubmit={(e) => { e.preventDefault(); performSearch(); }}
        >
          <span class="search-sparkle-icon">✨</span>
          <input
            type="text"
            class="ai-search-input"
            placeholder="Search document... e.g. 'temple endowments' or 'agrarian expansion'"
            bind:value={searchQuery}
          />
          {#if matchInfo.total > 0}
            <div class="search-match-nav">
              <span class="match-count">{matchInfo.current + 1} of {matchInfo.total}</span>
              <button
                type="button"
                class="btn-match-arrow"
                onclick={() => pdfViewerRef?.prevMatch()}
                title="Previous match (↑)"
              >
                ↑
              </button>
              <button
                type="button"
                class="btn-match-arrow"
                onclick={() => pdfViewerRef?.nextMatch()}
                title="Next match (↓)"
              >
                ↓
              </button>
            </div>
          {/if}
          {#if searchQuery}
            <button
              type="button"
              class="btn-input-clear"
              onclick={clearSearch}
              title="Clear search"
            >
              ✕
            </button>
          {/if}
          <button
            type="submit"
            class="btn-submit-search"
            disabled={!searchQuery.trim()}
            title="Search in PDF"
          >
            Search
          </button>
        </form>
      </div>
    {/if}
  {/if}
</aside>

<style>
  .evidentiary-well {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: var(--color-obsidian, #ffffff);
    border-right: 1px solid var(--color-graphite-border, #e2e8f0);
    position: relative;
    overflow: hidden;
    transition: width 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  :global([data-theme="dark"]) .evidentiary-well {
    background: #0d1117;
    border-color: #30363d;
  }

  .evidentiary-well.collapsed {
    width: 48px;
    overflow: hidden;
  }

  /* Header */
  .well-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--color-graphite-border, #e2e8f0);
    background: rgba(248, 250, 252, 0.95);
    backdrop-filter: blur(8px);
    flex-shrink: 0;
    z-index: 10;
  }

  :global([data-theme="dark"]) .well-header {
    background: rgba(22, 27, 34, 0.95);
    border-color: #30363d;
  }

  /* Dual Sidebar Tabs */
  .sidebar-tabs-nav {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(0, 0, 0, 0.04);
    padding: 2px;
    border-radius: 8px;
  }

  :global([data-theme="dark"]) .sidebar-tabs-nav {
    background: rgba(255, 255, 255, 0.06);
  }

  .sidebar-tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 6px;
    border: none;
    background: transparent;
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--color-slate-subtle, #64748b);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  :global([data-theme="dark"]) .sidebar-tab-btn {
    color: #8b949e;
  }

  .sidebar-tab-btn:hover {
    color: var(--color-slate-bright, #0f172a);
  }

  :global([data-theme="dark"]) .sidebar-tab-btn:hover {
    color: #f0f6fc;
  }

  .sidebar-tab-btn.active {
    background: #ffffff;
    color: var(--color-aurora, #0284c7);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  :global([data-theme="dark"]) .sidebar-tab-btn.active {
    background: #21262d;
    color: #38bdf8;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .tab-icon {
    font-size: 0.85rem;
  }

  .tab-pill-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(2, 132, 199, 0.12);
    color: var(--color-aurora, #0284c7);
    font-size: 0.68rem;
    font-weight: 700;
    padding: 0 5px;
    border-radius: 999px;
    min-width: 16px;
    height: 16px;
  }

  :global([data-theme="dark"]) .tab-pill-badge {
    background: rgba(56, 189, 248, 0.18);
    color: #38bdf8;
  }

  .well-header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .btn-header-action {
    background: transparent;
    border: 1px solid var(--color-graphite-border, #cbd5e1);
    color: var(--color-slate-subtle, #475569);
    border-radius: 6px;
    padding: 5px;
    width: 28px;
    height: 28px;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  :global([data-theme="dark"]) .btn-header-action {
    border-color: #30363d;
    color: #8b949e;
  }

  .btn-header-action:hover {
    background: rgba(2, 132, 199, 0.08);
    color: var(--color-aurora, #0284c7);
    border-color: var(--color-aurora, #0284c7);
  }

  /* Collapsed Slim Sidebar Strip */
  .collapsed-sidebar-strip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 12px 0;
    height: 100%;
    width: 48px;
    cursor: pointer;
    background: rgba(0, 0, 0, 0.02);
    user-select: none;
    box-sizing: border-box;
  }

  :global([data-theme="dark"]) .collapsed-sidebar-strip {
    background: rgba(255, 255, 255, 0.02);
  }

  .collapsed-tab-btn {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .collapsed-tab-btn:hover {
    background: rgba(2, 132, 199, 0.08);
    border-color: var(--color-graphite-border, #cbd5e1);
  }

  .collapsed-tab-btn.active {
    background: var(--color-surface, #ffffff);
    border-color: var(--color-aurora, #0284c7);
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }

  :global([data-theme="dark"]) .collapsed-tab-btn.active {
    background: #21262d;
    border-color: #38bdf8;
  }

  .collapsed-tab-icon {
    font-size: 1rem;
  }

  .btn-collapsed-expand {
    background: transparent;
    border: 1px solid var(--color-graphite-border, #cbd5e1);
    border-radius: 4px;
    color: var(--color-slate-subtle, #64748b);
    width: 26px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  :global([data-theme="dark"]) .btn-collapsed-expand {
    border-color: #30363d;
    color: #8b949e;
  }

  .btn-collapsed-expand:hover {
    color: var(--color-aurora, #0284c7);
    border-color: var(--color-aurora, #0284c7);
    background: rgba(2, 132, 199, 0.08);
  }

  .vertical-title {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    transform: rotate(180deg);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--color-slate-subtle, #94a3b8);
    margin-top: 10px;
  }

  .vertical-title:hover {
    color: var(--color-aurora, #0284c7);
  }

  /* Document Switcher */
  .doc-switcher-bar {
    display: flex;
    gap: 4px;
    padding: 6px 12px;
    background: rgba(0, 0, 0, 0.02);
    border-bottom: 1px solid var(--color-graphite-border, #e2e8f0);
    overflow-x: auto;
    flex-shrink: 0;
  }

  .btn-doc-tab {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-slate-subtle, #64748b);
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-doc-tab.active {
    background: var(--color-surface, #ffffff);
    color: var(--color-aurora, #0284c7);
    border-color: var(--color-graphite-border, #cbd5e1);
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }

  /* PDF Frame Container */
  .pdf-reader-frame-container {
    width: 100%;
    flex: 1;
    min-height: 0;
    background: #e5e7eb;
    position: relative;
  }

  :global([data-theme="dark"]) .pdf-reader-frame-container {
    background: #090d13;
  }

  /* Floating Bottom AI Search Pill (Zero Unnecessary Borders or Boxes) */
  .bottom-ai-search-anchor {
    position: absolute;
    bottom: 20px;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    padding: 0 20px;
    pointer-events: none;
    z-index: 50;
  }

  .search-input-form {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    max-width: 520px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 999px;
    padding: 5px 8px 5px 14px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  :global([data-theme="dark"]) .search-input-form {
    background: rgba(22, 27, 34, 0.94);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }

  .search-input-form:focus-within {
    border-color: var(--color-aurora, #0284c7);
    box-shadow: 0 12px 36px rgba(2, 132, 199, 0.18), 0 0 0 3px rgba(2, 132, 199, 0.15);
  }

  .search-sparkle-icon {
    font-size: 0.95rem;
    color: #f59e0b;
    flex-shrink: 0;
  }

  .ai-search-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 0.78rem;
    color: var(--color-slate-bright, #0f172a);
    min-width: 0;
  }

  :global([data-theme="dark"]) .ai-search-input {
    color: #f0f6fc;
  }

  .ai-search-input::placeholder {
    color: var(--color-slate-subtle, #94a3b8);
  }

  .search-match-nav {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: rgba(0, 0, 0, 0.05);
    padding: 2px 6px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--color-slate-subtle, #475569);
    flex-shrink: 0;
  }

  :global([data-theme="dark"]) .search-match-nav {
    background: rgba(255, 255, 255, 0.08);
    color: #94a3b8;
  }

  .match-count {
    padding: 0 4px;
    white-space: nowrap;
  }

  .btn-match-arrow {
    background: transparent;
    border: none;
    color: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    transition: background 0.12s ease;
  }

  .btn-match-arrow:hover {
    background: rgba(0, 0, 0, 0.08);
    color: var(--color-aurora, #0284c7);
  }

  :global([data-theme="dark"]) .btn-match-arrow:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #38bdf8;
  }

  .btn-input-clear {
    background: transparent;
    border: none;
    color: var(--color-slate-subtle, #94a3b8);
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .btn-input-clear:hover {
    color: var(--color-slate-bright, #0f172a);
  }

  .btn-submit-search {
    background: var(--color-aurora, #0284c7);
    color: #ffffff;
    border: none;
    border-radius: 999px;
    padding: 5px 14px;
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .btn-submit-search:hover:not(:disabled) {
    background: #0369a1;
  }

  .btn-submit-search:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .empty-doc-view {
    text-align: center;
    padding: 40px 20px;
    color: #cbd5e1;
  }

  .empty-icon {
    font-size: 2rem;
    display: block;
    margin-bottom: 8px;
  }

  /* -------------------------------------------------------------
     ACADEMIC ASSIGNMENT BRIEF SHEET (Paper Look)
     ------------------------------------------------------------- */
  .assignment-scroll-container {
    flex: 1;
    overflow-y: auto;
    background: #e5e7eb;
    padding: 20px 24px 60px 24px;
  }

  :global([data-theme="dark"]) .assignment-scroll-container {
    background: #090d13;
  }

  .pdf-control-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    background: #ffffff;
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid #d1d5db;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  }

  :global([data-theme="dark"]) .pdf-control-bar {
    background: #161b22;
    border-color: #30363d;
  }

  .pdf-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .pdf-info-tag {
    font-size: 0.75rem;
    font-weight: 700;
    color: #1f2937;
  }

  :global([data-theme="dark"]) .pdf-info-tag {
    color: #f0f6fc;
  }

  .pdf-info small {
    font-size: 0.7rem;
    color: #6b7280;
  }

  :global([data-theme="dark"]) .pdf-info small {
    color: #8b949e;
  }

  .btn-print-action {
    background: var(--color-aurora, #0284c7);
    color: #ffffff;
    border: none;
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .btn-print-action:hover {
    background: #0369a1;
  }

  .academic-sheet {
    background: #ffffff;
    color: #1f2937;
    border-radius: 6px;
    padding: 36px 40px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
    font-family: "Georgia", serif;
    max-width: 800px;
    margin: 0 auto;
    box-sizing: border-box;
  }

  .sheet-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #111827;
    padding-bottom: 14px;
    margin-bottom: 20px;
  }

  .inst-logo {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1px;
    color: #4b5563;
  }

  .inst-course {
    font-size: 15px;
    font-weight: bold;
    color: #111827;
    margin-top: 2px;
  }

  .sheet-meta {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
    color: #4b5563;
    line-height: 1.5;
    text-align: right;
  }

  .sheet-meta span {
    font-weight: bold;
    color: #111827;
  }

  .sheet-title-block {
    margin-bottom: 22px;
  }

  .sheet-title-block h1 {
    font-size: 22px;
    font-weight: 800;
    color: #111827;
    margin: 0 0 6px;
    line-height: 1.25;
  }

  .sheet-purpose {
    font-size: 13.5px;
    font-style: italic;
    color: #4b5563;
    margin: 0;
    line-height: 1.5;
  }

  .sheet-section {
    margin-bottom: 22px;
  }

  .sheet-sec-title {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: #111827;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 4px;
    margin: 0 0 10px;
  }

  .sheet-task-prompt {
    font-size: 13.5px;
    line-height: 1.6;
    color: #1f2937;
    margin: 0;
  }

  .sheet-requirements, .sheet-goals-list, .sheet-checklist {
    font-size: 12.5px;
    line-height: 1.6;
    color: #374151;
    padding-left: 20px;
    margin: 8px 0 0;
  }

  .sheet-goals-list, .sheet-checklist {
    list-style: none;
    padding-left: 4px;
  }

  .sheet-sources-table {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .sheet-source-row {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-left: 3px solid #374151;
    border-radius: 4px;
    padding: 10px 12px;
  }

  .src-meta strong {
    font-size: 12.5px;
    color: #111827;
    display: block;
  }

  .src-guide {
    font-size: 11.5px;
    color: #6b7280;
    font-style: italic;
    display: block;
    margin-top: 2px;
  }

  .src-excerpt {
    font-size: 12px;
    line-height: 1.5;
    color: #374151;
    margin: 6px 0;
    padding-left: 8px;
    border-left: 2px solid #cbd5e1;
  }

  .src-action-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  .btn-open-source-pdf, .btn-quote-source {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
    font-weight: 600;
    border-radius: 4px;
    padding: 3px 8px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s ease;
  }

  .btn-open-source-pdf {
    background: rgba(2, 132, 199, 0.1);
    color: #0284c7;
    border-color: rgba(2, 132, 199, 0.25);
  }

  .btn-open-source-pdf:hover {
    background: #0284c7;
    color: #ffffff;
  }

  .btn-quote-source {
    background: rgba(16, 185, 129, 0.1);
    color: #059669;
    border-color: rgba(16, 185, 129, 0.25);
  }

  .btn-quote-source:hover {
    background: #059669;
    color: #ffffff;
  }

  .sheet-rubric-table {
    width: 100%;
    border-collapse: collapse;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11.5px;
    margin-top: 8px;
  }

  .sheet-rubric-table th, .sheet-rubric-table td {
    border: 1px solid #e5e7eb;
    padding: 7px 8px;
    vertical-align: top;
    text-align: left;
  }

  .sheet-rubric-table th {
    background: #f3f4f6;
    color: #111827;
    font-weight: 700;
  }

  .weight-tag {
    display: inline-block;
    background: #e5e7eb;
    color: #111827;
    font-size: 10px;
    font-weight: bold;
    padding: 1px 4px;
    border-radius: 3px;
    margin-left: 4px;
  }

  .crit-sub {
    font-size: 10.5px;
    color: #6b7280;
    margin-top: 3px;
  }

  .sheet-concept-tag {
    display: inline-block;
    font-size: 9.5px;
    font-weight: 700;
    color: #6d28d9;
    background: #f3e8ff;
    border: 1px solid #e9d5ff;
    padding: 1px 4px;
    border-radius: 3px;
    margin-top: 3px;
  }

  .lvl-title {
    font-weight: 700;
    display: block;
    color: #111827;
    font-size: 10.5px;
    margin-bottom: 2px;
  }

  .lvl-desc {
    font-size: 10.5px;
    color: #4b5563;
    line-height: 1.35;
  }

  .sheet-footer {
    border-top: 1px solid #e5e7eb;
    margin-top: 16px;
    padding-top: 10px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
    color: #6b7280;
  }

  /* -------------------------------------------------------------
     PRINT STYLESHEET (@media print)
     ------------------------------------------------------------- */
  @media print {
    :global(body), :global(html) {
      background: #ffffff !important;
      color: #000000 !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    :global(.top-nav-bar),
    :global(.workspace-topbar),
    :global(.workbench-col-canvas),
    :global(.workbench-col-gutter),
    .well-header,
    .no-print,
    .bottom-ai-search-anchor {
      display: none !important;
    }
    .evidentiary-well {
      width: 100% !important;
      border: none !important;
      background: #ffffff !important;
    }
    .assignment-scroll-container {
      overflow: visible !important;
      padding: 0 !important;
      background: #ffffff !important;
    }
    .academic-sheet {
      box-shadow: none !important;
      border: none !important;
      padding: 0 !important;
      max-width: 100% !important;
    }
  }
</style>
