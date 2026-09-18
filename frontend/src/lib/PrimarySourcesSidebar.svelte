<script>
  import PdfViewer from './PdfViewer.svelte';

  let {
    sources = [],
    courseId = '',
    onQuoteEvidence = () => null,
    isCollapsed = false,
    isExpanded = true,
    onToggleCollapse = () => null,
    onToggleExpand = () => null,
  } = $props();

  // Parse and group sources into documents
  let displaySources = $derived.by(() => {
    if (sources && sources.length > 0) {
      return sources.map((s, idx) => ({
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
  let searchQuery = $state('');
  let activeSearchTerm = $state('');
  let iframeKey = $state(1);

  // PDF URL with search term anchor (triggers native browser PDF search & highlight)
  let pdfViewerUrl = $derived.by(() => {
    if (!activeDoc?.source_url) return '';
    const base = activeDoc.source_url;
    const q = activeSearchTerm.trim();
    if (q) {
      return `${base}#search=${encodeURIComponent(q)}&toolbar=1&navpanes=0`;
    }
    return `${base}#toolbar=1&navpanes=0`;
  });

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

  // Quick concept suggestion chips
  const quickSearchSuggestions = [
    'Trade routes',
    'Agrarian economy',
    'Temple endowments',
    'Corporate assemblies',
    'Chola dynasty',
    'Mughal administration',
  ];
</script>

<aside
  class="evidentiary-well"
  class:collapsed={isCollapsed}
  class:expanded={isExpanded}
  aria-label="Primary Source Document Reader"
>
  <!-- Header Bar -->
  <div class="well-header">
    <div class="well-title-group">
      <span class="well-icon">📕</span>
      <div class="well-meta-info">
        <h3 class="well-title">Document Reader</h3>
        {#if activeDoc}
          <span class="well-subtitle" title={activeDoc.title}>
            {activeDoc.title}
          </span>
        {/if}
      </div>
    </div>

    <div class="well-header-actions">
      <!-- Open PDF External Fullscreen -->
      {#if activeDoc?.source_url}
        <a
          href={activeDoc.source_url}
          target="_blank"
          rel="noopener noreferrer"
          class="btn-header-action"
          title="Open PDF in new window"
        >
          Fullscreen ↗
        </a>
      {/if}

      <!-- Expand / Compact Width Toggle -->
      <button
        type="button"
        class="btn-header-action"
        onclick={onToggleExpand}
        title={isExpanded ? 'Compact sidebar' : 'Expand sidebar for reading'}
      >
        {isExpanded ? '⤡ Compact' : '⤢ Expand'}
      </button>

      <!-- Collapse Sidebar Toggle -->
      <button
        type="button"
        class="btn-header-action btn-collapse"
        onclick={onToggleCollapse}
        title={isCollapsed ? 'Open reader' : 'Collapse reader'}
      >
        {isCollapsed ? '▶' : '◀'}
      </button>
    </div>
  </div>

  {#if !isCollapsed}
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
          url={activeDoc.source_url}
          title={activeDoc.title}
          searchTerm={activeSearchTerm}
          {onQuoteEvidence}
        />
      {:else}
        <div class="empty-doc-view">
          <span class="empty-icon">📜</span>
          <p>No PDF attached to this assignment.</p>
        </div>
      {/if}
    </div>

    <!-- Anchored Bottom AI Search Bar -->
    <div class="bottom-ai-search-anchor">
      <!-- Quick Search Concept Chips -->
      <div class="quick-chips-row">
        {#each quickSearchSuggestions as chip}
          <button
            type="button"
            class="btn-quick-chip"
            class:active={activeSearchTerm.toLowerCase() === chip.toLowerCase()}
            onclick={() => { searchQuery = chip; performSearch(); }}
          >
            {chip}
          </button>
        {/each}
      </div>

      <!-- Search Input Container -->
      <form
        class="search-input-form"
        onsubmit={(e) => { e.preventDefault(); performSearch(); }}
      >
        <span class="search-sparkle-icon">✨</span>
        <input
          type="text"
          class="ai-search-input"
          placeholder="Search in PDF... e.g. 'Chola' or 'agrarian'"
          bind:value={searchQuery}
        />
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
    padding: 10px 14px;
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

  .well-title-group {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .well-icon {
    font-size: 1.15rem;
    flex-shrink: 0;
  }

  .well-meta-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .well-title {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-slate-bright, #0f172a);
    margin: 0;
    line-height: 1.2;
  }

  :global([data-theme="dark"]) .well-title {
    color: #f0f6fc;
  }

  .well-subtitle {
    font-size: 0.74rem;
    color: var(--color-slate-subtle, #64748b);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
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
    padding: 4px 8px;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
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

  .btn-collapse {
    padding: 4px 6px;
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
    background: #525659;
    position: relative;
    padding-bottom: 74px; /* clearance for bottom search bar */
  }

  /* Anchored Bottom AI Search Bar */
  .bottom-ai-search-anchor {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 8px 12px 10px 12px;
    background: rgba(255, 255, 255, 0.98);
    border-top: 1px solid var(--color-graphite-border, #e2e8f0);
    backdrop-filter: blur(10px);
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.06);
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 50;
  }

  :global([data-theme="dark"]) .bottom-ai-search-anchor {
    background: rgba(13, 17, 23, 0.98);
    border-color: #30363d;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.3);
  }

  .quick-chips-row {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .btn-quick-chip {
    background: rgba(2, 132, 199, 0.08);
    border: 1px solid rgba(2, 132, 199, 0.2);
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--color-aurora, #0284c7);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .btn-quick-chip.active {
    background: var(--color-aurora, #0284c7);
    color: #ffffff;
  }

  .btn-quick-chip:hover {
    background: var(--color-aurora, #0284c7);
    color: #ffffff;
  }

  .search-input-form {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--color-surface, #ffffff);
    border: 1px solid var(--color-graphite-border, #cbd5e1);
    border-radius: 999px;
    padding: 3px 6px 3px 12px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
    transition: all 0.2s ease;
  }

  :global([data-theme="dark"]) .search-input-form {
    background: #161b22;
    border-color: #30363d;
  }

  .search-input-form:focus-within {
    border-color: var(--color-aurora, #0284c7);
    box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
  }

  .search-sparkle-icon {
    font-size: 0.95rem;
    color: #f59e0b;
  }

  .ai-search-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 0.78rem;
    color: var(--color-slate-bright, #0f172a);
  }

  :global([data-theme="dark"]) .ai-search-input {
    color: #f0f6fc;
  }

  .ai-search-input::placeholder {
    color: var(--color-slate-subtle, #94a3b8);
  }

  .btn-input-clear {
    background: transparent;
    border: none;
    color: var(--color-slate-subtle, #94a3b8);
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0 4px;
  }

  .btn-submit-search {
    background: var(--color-aurora, #0284c7);
    color: #ffffff;
    border: none;
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s ease;
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
</style>
