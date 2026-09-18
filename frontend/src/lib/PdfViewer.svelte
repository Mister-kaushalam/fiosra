<script>
  import { onMount, tick } from 'svelte';
  import * as pdfjsLib from 'pdfjs-dist';
  import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
  import 'pdfjs-dist/web/pdf_viewer.css';

  if (typeof Promise.try !== 'function') {
    Promise.try = function (fn, ...args) {
      return new Promise((resolve) => resolve(fn(...args)));
    };
  }

  // Safari / WebKit polyfill: ReadableStream async iterator for pdfjs text layer
  if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
    ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
      const reader = this.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) return;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    };
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

  let {
    url = '',
    title = 'Document',
    searchTerm = '',
    onQuoteEvidence = () => null,
  } = $props();

  let pdfDoc = $state(null);
  let numPages = $state(0);
  let currentPage = $state(1);
  let scale = $state(1.15);
  let isLoading = $state(true);
  let loadError = $state(null);

  let pagesContainer = $state(null);
  let renderedPages = new Set();
  let searchMatches = $state([]);
  let currentMatchIndex = $state(0);

  // Selection tooltip state
  let selectionTooltip = $state({
    visible: false,
    text: '',
    x: 0,
    y: 0,
  });

  $effect(() => {
    if (url) {
      loadPdf(url);
    }
  });

  $effect(() => {
    if (pdfDoc && searchTerm !== undefined) {
      executeSearch(searchTerm);
    }
  });

  async function loadPdf(pdfUrl) {
    if (!pdfUrl) return;
    isLoading = true;
    loadError = null;
    renderedPages.clear();
    searchMatches = [];
    currentMatchIndex = 0;

    try {
      const loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
      pdfDoc = await loadingTask.promise;
      numPages = pdfDoc.numPages;
      currentPage = 1;
      isLoading = false;
      await tick();
      renderAllPages();
    } catch (err) {
      console.error('Failed to load PDF with PDF.js:', err);
      loadError = err.message || 'Failed to load PDF.';
      isLoading = false;
    }
  }

  async function renderAllPages() {
    if (!pdfDoc || !pagesContainer) return;
    pagesContainer.innerHTML = '';
    renderedPages.clear();

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      await renderPage(pageNum);
    }

    if (searchTerm) {
      executeSearch(searchTerm);
    }
  }

  async function renderPage(pageNum) {
    if (!pdfDoc || !pagesContainer) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'pdf-page-wrapper';
      pageWrapper.id = `pdf-page-${pageNum}`;
      pageWrapper.style.width = `${viewport.width}px`;
      pageWrapper.style.height = `${viewport.height}px`;

      // 1. Render Canvas
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      pageWrapper.appendChild(canvas);

      await page.render({ canvasContext: context, viewport }).promise;

      // Always append the rendered canvas to DOM immediately
      pagesContainer.appendChild(pageWrapper);
      renderedPages.add(pageNum);

      // 2. Render TextLayer (enables text selection and search highlighting)
      try {
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;
        pageWrapper.appendChild(textLayerDiv);

        const textContent = await page.getTextContent();
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport: viewport,
        });
        await textLayer.render();
      } catch (textErr) {
        console.warn(`Text layer skipped for page ${pageNum}:`, textErr);
      }
    } catch (err) {
      console.warn(`Failed rendering page ${pageNum}:`, err);
    }
  }

  // Real in-document search across pages with smart multi-term / concept fallback
  async function executeSearch(query) {
    clearHighlights();
    const raw = (query || '').trim();
    if (!raw || !pdfDoc) {
      searchMatches = [];
      currentMatchIndex = 0;
      return;
    }

    const q = raw.toLowerCase();

    // 1. Check if exact phrase exists anywhere across pages
    let termsToSearch = [q];
    let isFallback = false;
    let exactMatchesFound = false;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const pageEl = document.getElementById(`pdf-page-${pageNum}`);
      if (!pageEl) continue;
      const textLayer = pageEl.querySelector('.textLayer');
      if (!textLayer) continue;
      if (textLayer.textContent.toLowerCase().includes(q)) {
        exactMatchesFound = true;
        break;
      }
    }

    // 2. If exact phrase not found, fall back to meaningful keywords & concept stems
    if (!exactMatchesFound) {
      const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'about', 'under', 'between', 'through']);
      const rawWords = raw
        .toLowerCase()
        .split(/[\s,+/&|]+/)
        .map(w => w.replace(/[^a-z0-9]/g, '').trim())
        .filter(w => w.length >= 3 && !stopWords.has(w));

      const expandedTerms = new Set(rawWords);
      for (const w of rawWords) {
        if (w === 'agrarian') { expandedTerms.add('agricultural'); expandedTerms.add('agriculture'); }
        if (w === 'economy' || w === 'economic') { expandedTerms.add('economy'); expandedTerms.add('economic'); }
        if (w === 'endowments' || w === 'endowment') { expandedTerms.add('endowment'); expandedTerms.add('temple'); }
        if (w === 'assemblies' || w === 'assembly') { expandedTerms.add('assemblies'); expandedTerms.add('assembly'); expandedTerms.add('guild'); }
        if (w === 'trade' || w === 'routes' || w === 'route') { expandedTerms.add('trade'); expandedTerms.add('route'); }
      }

      if (expandedTerms.size > 0) {
        termsToSearch = Array.from(expandedTerms);
        isFallback = true;
      }
    }

    // 3. Highlight matches across all pages
    const escapedTerms = termsToSearch
      .map(t => t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
      .filter(Boolean);

    if (escapedTerms.length === 0) {
      searchMatches = [];
      currentMatchIndex = 0;
      return;
    }

    const splitRegex = new RegExp('(' + escapedTerms.join('|') + ')', 'gi');
    const checkRegex = new RegExp('^(?:' + escapedTerms.join('|') + ')$', 'i');

    const pageMatchesMap = new Map();

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const pageEl = document.getElementById(`pdf-page-${pageNum}`);
      if (!pageEl) continue;
      const textLayer = pageEl.querySelector('.textLayer');
      if (!textLayer) continue;

      const pageLower = textLayer.textContent.toLowerCase();
      const hasAny = termsToSearch.some(t => pageLower.includes(t));
      if (!hasAny) continue;

      const spans = Array.from(textLayer.querySelectorAll('span'));
      const pageMatches = [];
      const pageTerms = new Set();

      for (const span of spans) {
        const text = span.textContent;
        if (!text) continue;

        if (!termsToSearch.some(t => text.toLowerCase().includes(t))) continue;

        const parts = text.split(splitRegex);
        if (parts.length <= 1) continue;

        span.innerHTML = '';
        for (const part of parts) {
          if (checkRegex.test(part)) {
            const mark = document.createElement('mark');
            mark.className = 'pdf-search-mark';
            mark.textContent = part;
            span.appendChild(mark);

            const matchedTermLower = part.toLowerCase();
            pageTerms.add(matchedTermLower);
            pageMatches.push({
              pageNum,
              markEl: mark,
              text: part,
              matchedTerm: part,
            });
          } else if (part) {
            span.appendChild(document.createTextNode(part));
          }
        }
      }

      if (pageMatches.length > 0) {
        pageMatchesMap.set(pageNum, {
          pageNum,
          matches: pageMatches,
          distinctTermsCount: pageTerms.size,
        });
      }
    }

    // 4. Sort pages: pages containing the highest number of distinct search terms come first!
    const sortedPageEntries = Array.from(pageMatchesMap.values()).sort((a, b) => {
      if (b.distinctTermsCount !== a.distinctTermsCount) {
        return b.distinctTermsCount - a.distinctTermsCount;
      }
      return a.pageNum - b.pageNum;
    });

    const allMatches = [];
    for (const entry of sortedPageEntries) {
      allMatches.push(...entry.matches);
    }

    searchMatches = allMatches;
    currentMatchIndex = 0;

    if (allMatches.length > 0) {
      scrollToMatch(0);
    }
  }

  function clearHighlights() {
    if (!pagesContainer) return;
    const marks = pagesContainer.querySelectorAll('.pdf-search-mark');
    const parents = new Set();
    marks.forEach((mark) => {
      if (mark.parentNode) parents.add(mark.parentNode);
    });
    parents.forEach((parent) => {
      parent.textContent = parent.textContent; // Resets innerHTML to clean text
    });
  }

  export function nextMatch() {
    if (searchMatches.length === 0) return;
    currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
    scrollToMatch(currentMatchIndex);
  }

  export function prevMatch() {
    if (searchMatches.length === 0) return;
    currentMatchIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    scrollToMatch(currentMatchIndex);
  }

  function scrollToMatch(index) {
    const match = searchMatches[index];
    if (!match) return;

    // Update active mark styling
    if (pagesContainer) {
      const allMarks = pagesContainer.querySelectorAll('.pdf-search-mark');
      allMarks.forEach((m) => {
        m.classList.remove('current-search-match');
      });
    }

    if (match.markEl) {
      match.markEl.classList.add('current-search-match');
      match.markEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const pageEl = document.getElementById(`pdf-page-${match.pageNum}`);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  function handleMouseUp() {
    if (typeof window === 'undefined') return;
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';

    if (text.length >= 8) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      selectionTooltip = {
        visible: true,
        text,
        x: rect.left + rect.width / 2,
        y: rect.top - 12,
      };
    } else {
      selectionTooltip.visible = false;
    }
  }

  function quoteSelection() {
    if (!selectionTooltip.text) return;
    onQuoteEvidence({
      quoteText: selectionTooltip.text,
      sourceTitle: title,
      author: title,
      sourceUrl: url,
    });
    selectionTooltip.visible = false;
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
    }
  }

  function zoomIn() {
    if (scale >= 2.0) return;
    scale = Math.min(2.0, scale + 0.15);
    renderAllPages();
  }

  function zoomOut() {
    if (scale <= 0.7) return;
    scale = Math.max(0.7, scale - 0.15);
    renderAllPages();
  }
</script>

<div class="pdf-viewer-root" onmouseup={handleMouseUp} role="region" aria-label="PDF Document Viewer">
  <!-- Top Utility Bar (Zoom & Match Navigation) -->
  <div class="pdf-toolbar">
    <div class="pdf-toolbar-left">
      <span class="toolbar-page-badge">{numPages} {numPages === 1 ? 'page' : 'pages'}</span>
      {#if searchMatches.length > 0}
        <div class="toolbar-search-nav">
          <span class="match-count">
            Match {currentMatchIndex + 1} of {searchMatches.length}
          </span>
          <button type="button" class="btn-nav" onclick={prevMatch} title="Previous match (↑)">↑</button>
          <button type="button" class="btn-nav" onclick={nextMatch} title="Next match (↓)">↓</button>
        </div>
      {:else if searchTerm.trim() && !isLoading}
        <span class="no-match-notice">No matches for "{searchTerm}"</span>
      {/if}
    </div>

    <div class="pdf-toolbar-right">
      <button type="button" class="btn-zoom" onclick={zoomOut} title="Zoom out">−</button>
      <span class="zoom-level">{Math.round(scale * 100)}%</span>
      <button type="button" class="btn-zoom" onclick={zoomIn} title="Zoom in">+</button>
    </div>
  </div>

  <!-- Main Scrollable PDF Viewport -->
  <div class="pdf-viewport-scroll">
    {#if isLoading}
      <div class="pdf-loading-state">
        <div class="spinner"></div>
        <p>Rendering {title}...</p>
      </div>
    {:else if loadError}
      <div class="pdf-error-state">
        <p>Could not render PDF directly: {loadError}</p>
        <a href={url} target="_blank" rel="noopener noreferrer" class="btn-fallback-open">
          Open in New Window ↗
        </a>
      </div>
    {/if}

    <div bind:this={pagesContainer} class="pdf-pages-stack"></div>
  </div>

  <!-- Floating Highlight to Insert Evidence Tooltip -->
  {#if selectionTooltip.visible}
    <div
      class="pdf-selection-tooltip"
      style:left={`${selectionTooltip.x}px`}
      style:top={`${selectionTooltip.y}px`}
    >
      <button
        type="button"
        class="btn-insert-selection"
        onclick={quoteSelection}
      >
        <span>➕</span> Insert as Evidence into Canvas
      </button>
    </div>
  {/if}
</div>

<style>
  .pdf-viewer-root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    position: relative;
    background: #525659;
    overflow: hidden;
  }

  .pdf-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    background: #323639;
    color: #f1f5f9;
    font-size: 0.75rem;
    border-bottom: 1px solid #202224;
    flex-shrink: 0;
    z-index: 10;
  }

  .pdf-toolbar-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .toolbar-page-badge {
    background: rgba(255, 255, 255, 0.12);
    padding: 2px 7px;
    border-radius: 4px;
    font-weight: 600;
  }

  .toolbar-search-nav {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(245, 158, 11, 0.2);
    border: 1px solid rgba(245, 158, 11, 0.4);
    padding: 2px 6px;
    border-radius: 4px;
    color: #fef08a;
  }

  .match-count {
    font-weight: 700;
    font-size: 0.72rem;
  }

  .btn-nav {
    background: transparent;
    border: 1px solid rgba(245, 158, 11, 0.5);
    border-radius: 3px;
    color: inherit;
    font-size: 0.7rem;
    padding: 1px 5px;
    cursor: pointer;
  }

  .btn-nav:hover {
    background: rgba(245, 158, 11, 0.4);
  }

  .no-match-notice {
    color: #94a3b8;
    font-size: 0.72rem;
  }

  .pdf-toolbar-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-zoom {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: #ffffff;
    border-radius: 4px;
    width: 22px;
    height: 22px;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-zoom:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .zoom-level {
    font-size: 0.72rem;
    color: #cbd5e1;
    min-width: 38px;
    text-align: center;
  }

  /* Viewport Scroll */
  .pdf-viewport-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: auto;
    padding: 16px 12px 90px 12px; /* Bottom padding clearance for bottom search bar */
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .pdf-pages-stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
  }

  /* Each Page Wrapper */
  :global(.pdf-page-wrapper) {
    position: relative;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    background: #ffffff;
    border-radius: 2px;
    overflow: hidden;
  }

  :global(.pdf-page-canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* Search Term Highlights inside Text Layer */
  :global(.pdf-search-mark) {
    background: #fef08a !important;
    color: #854d0e !important;
    padding: 1px 2px;
    border-radius: 2px;
    box-shadow: 0 0 0 1px #eab308;
    font-weight: bold;
  }

  :global(.pdf-search-mark.current-search-match) {
    background: #f59e0b !important;
    color: #ffffff !important;
    box-shadow: 0 0 0 2px #b45309, 0 2px 8px rgba(245, 158, 11, 0.6);
  }

  /* Selection Tooltip */
  .pdf-selection-tooltip {
    position: fixed;
    transform: translate(-50%, -100%);
    z-index: 1000;
    filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.3));
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translate(-50%, -90%); }
    to { opacity: 1; transform: translate(-50%, -100%); }
  }

  .btn-insert-selection {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #0f172a;
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 7px 14px;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transition: all 0.15s ease;
  }

  .btn-insert-selection:hover {
    background: #0284c7;
    transform: scale(1.03);
  }

  /* Loading and Error States */
  .pdf-loading-state,
  .pdf-error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: #e2e8f0;
    text-align: center;
    gap: 12px;
  }

  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: #38bdf8;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .btn-fallback-open {
    background: #0284c7;
    color: #ffffff;
    padding: 8px 16px;
    border-radius: 6px;
    text-decoration: none;
    font-size: 0.8rem;
    font-weight: 600;
  }
</style>
