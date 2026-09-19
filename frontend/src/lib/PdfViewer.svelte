<script>
  import { onMount, tick, untrack } from 'svelte';
  import * as pdfjsLib from 'pdfjs-dist';
  import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
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
  if (pdfjsLib.VerbosityLevel) {
    pdfjsLib.GlobalWorkerOptions.verbosity = pdfjsLib.VerbosityLevel.ERRORS;
  }

  let {
    url = '',
    title = 'Document',
    searchTerm = '',
    onQuoteEvidence = () => null,
    onMatchesChange = () => null,
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

  let lastMatchesReport = { current: -1, total: -1 };
  $effect(() => {
    const cur = currentMatchIndex;
    const tot = searchMatches.length;
    if (lastMatchesReport.current !== cur || lastMatchesReport.total !== tot) {
      lastMatchesReport = { current: cur, total: tot };
      untrack(() => {
        onMatchesChange({ current: cur, total: tot });
      });
    }
  });

  // Selection tooltip state
  let selectionTooltip = $state({
    visible: false,
    text: '',
    x: 0,
    y: 0,
  });

  // In-memory text index: Map<pageNum, { pageNum, fullText, lowerText }>
  const pageIndexMap = new Map();
  let currentlyMarkedPages = new Set();
  let searchDebounceTimer = null;

  $effect(() => {
    if (url) {
      loadPdf(url);
    }
  });

  $effect(() => {
    if (pdfDoc && searchTerm !== undefined) {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        executeSemanticSearch(searchTerm);
      }, 120);
    }
  });

  async function loadPdf(pdfUrl) {
    if (!pdfUrl) return;
    isLoading = true;
    loadError = null;
    renderedPages.clear();
    pageIndexMap.clear();
    currentlyMarkedPages.clear();
    searchMatches = [];
    currentMatchIndex = 0;

    try {
      const loadingTask = pdfjsLib.getDocument({
        url: pdfUrl,
        verbosity: pdfjsLib.VerbosityLevel?.ERRORS ?? 0,
      });
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
    pageIndexMap.clear();
    currentlyMarkedPages.clear();

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      await renderPage(pageNum);
    }

    if (searchTerm) {
      executeSemanticSearch(searchTerm);
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

        // 3. Build In-Memory Text Index for instant (<1ms) semantic retrieval
        const rawStrings = textContent.items.map((it) => it.str || '');
        const fullText = rawStrings.join(' ');
        pageIndexMap.set(pageNum, {
          pageNum,
          fullText,
          lowerText: fullText.toLowerCase(),
        });
      } catch (textErr) {
        console.warn(`Text layer skipped for page ${pageNum}:`, textErr);
      }
    } catch (err) {
      console.warn(`Failed rendering page ${pageNum}:`, err);
    }
  }

  // Semantic query parser & historical domain knowledge ontology
  function expandSemanticQuery(rawQuery) {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'as', 'is', 'was', 'were', 'are', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'how', 'what', 'why', 'where',
      'which', 'who', 'when', 'that', 'this', 'these', 'those', 'can', 'could',
      'would', 'should', 'about', 'into', 'over', 'under', 'between', 'through'
    ]);

    const clean = (rawQuery || '').trim().toLowerCase();
    if (!clean) return { exactPhrase: '', clusters: [], allTerms: [] };

    const words = clean
      .split(/[\s,+/&|?.:;!"'()]+/)
      .map((w) => w.replace(/[^a-z0-9]/g, '').trim())
      .filter((w) => w.length >= 2 && !stopWords.has(w));

    // Domain concept ontology for Indian & medieval history
    const domainOntology = {
      agrarian: ['agriculture', 'agricultural', 'peasant', 'peasantry', 'revenue', 'cultivation', 'land', 'crop', 'ryot', 'zamindar', 'jagirdar', 'soil', 'irrigation'],
      agriculture: ['agrarian', 'agricultural', 'cultivation', 'peasant', 'crop', 'land', 'revenue'],
      peasant: ['peasantry', 'cultivator', 'ryot', 'agrarian', 'tenant', 'village'],
      revenue: ['tax', 'taxation', 'fiscal', 'settlement', 'tribute', 'tithe', 'assessment'],

      temple: ['shrine', 'devasthana', 'brahmadeya', 'monastery', 'patronage', 'endowment', 'deity', 'matha', 'mandapa', 'gopuram'],
      endowment: ['endowments', 'patronage', 'grant', 'grants', 'donation', 'donations', 'revenue', 'brahmadeya', 'inam', 'waqf'],
      endowments: ['endowment', 'patronage', 'grant', 'grants', 'donation', 'donations', 'revenue', 'brahmadeya'],
      patronage: ['endowment', 'donation', 'royal', 'king', 'benefaction', 'temple'],

      corporate: ['guild', 'guilds', 'shreni', 'assembly', 'assemblies', 'association', 'merchant', 'traders'],
      assembly: ['assemblies', 'sabha', 'samiti', 'ur', 'nadu', 'ganas', 'council', 'panchayat'],
      assemblies: ['assembly', 'sabha', 'samiti', 'ur', 'nadu', 'ganas', 'councils'],
      guild: ['guilds', 'shreni', 'merchants', 'traders', 'nigama', 'corporation'],
      guilds: ['guild', 'shreni', 'merchants', 'traders', 'nigama'],

      trade: ['commerce', 'merchant', 'merchants', 'routes', 'route', 'maritime', 'port', 'ports', 'caravan', 'market', 'goods', 'spices'],
      economy: ['economic', 'revenue', 'fiscal', 'trade', 'commerce', 'monetary', 'coinage', 'currency'],
      economic: ['economy', 'revenue', 'fiscal', 'trade', 'commerce', 'market'],

      feudal: ['feudalism', 'vassal', 'samanta', 'chieftain', 'aristocracy', 'tributary', 'decentralized', 'fief'],
      feudalism: ['feudal', 'vassal', 'samanta', 'chieftain', 'aristocracy', 'tributary'],
      monarchy: ['king', 'monarch', 'sovereignty', 'statecraft', 'empire', 'dynasty', 'royal', 'rajya'],
      state: ['polity', 'administration', 'governance', 'dynasty', 'empire', 'kingdom'],

      chola: ['cholas', 'tanjore', 'thanjavur', 'rajaraja', 'rajendra', 'coromandel', 'kaveri'],
      mughal: ['mughals', 'akbar', 'babur', 'humayun', 'shah jahan', 'aurangzeb', 'mansabdari', 'subah'],
      gupta: ['guptas', 'samudragupta', 'chandragupta', 'classical', 'magadha'],
      maratha: ['marathas', 'shivaji', 'peshwa', 'deccan', 'swarajya'],
      sultanate: ['delhi sultanate', 'mamluk', 'khalji', 'tughlaq', 'lodhi', 'sultan'],
    };

    const clusters = [];
    const allTerms = new Set();

    if (words.length > 1) {
      allTerms.add(clean);
    }

    for (const word of words) {
      const cluster = new Set([word]);
      allTerms.add(word);

      if (domainOntology[word]) {
        for (const syn of domainOntology[word]) {
          cluster.add(syn);
          allTerms.add(syn);
        }
      }

      if (word.endsWith('ies')) cluster.add(word.slice(0, -3) + 'y');
      if (word.endsWith('s') && !word.endsWith('ss')) cluster.add(word.slice(0, -1));
      if (word.endsWith('ing')) cluster.add(word.slice(0, -3));
      if (word.endsWith('ed')) cluster.add(word.slice(0, -2));

      clusters.push(Array.from(cluster));
    }

    return {
      exactPhrase: clean,
      clusters,
      allTerms: Array.from(allTerms),
    };
  }

  // Lightning-fast in-memory semantic search across all pages
  async function executeSemanticSearch(rawQuery) {
    const clean = (rawQuery || '').trim();
    if (!clean || !pdfDoc) {
      clearHighlights();
      searchMatches = [];
      currentMatchIndex = 0;
      return;
    }

    const { exactPhrase, clusters } = expandSemanticQuery(clean);

    // 1. Scan in-memory cache directly (takes ~1ms in RAM)
    const scoredPages = [];
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const pageData = pageIndexMap.get(pageNum);
      if (!pageData) continue;

      const pText = pageData.lowerText;
      let score = 0;
      let satisfiedClusters = 0;
      const matchedTermsOnPage = new Set();

      // Exact phrase match gives highest confidence
      if (exactPhrase && pText.includes(exactPhrase)) {
        score += 200;
        matchedTermsOnPage.add(exactPhrase);
      }

      // Concept cluster matches
      for (const cluster of clusters) {
        let clusterMatched = false;
        for (const term of cluster) {
          if (pText.includes(term)) {
            matchedTermsOnPage.add(term);
            clusterMatched = true;
            score += 15;
          }
        }
        if (clusterMatched) satisfiedClusters++;
      }

      // High synergy bonus when page unites multiple concept pillars
      if (clusters.length > 1 && satisfiedClusters >= 2) {
        score += satisfiedClusters * 60;
      }

      if (score > 0) {
        scoredPages.push({
          pageNum,
          score,
          satisfiedClusters,
          matchedTerms: Array.from(matchedTermsOnPage),
        });
      }
    }

    // Sort pages by semantic relevance score descending
    scoredPages.sort((a, b) => b.score - a.score || a.pageNum - b.pageNum);

    // 2. Targeted DOM highlighting: ONLY mutate pages that have matches
    clearHighlights();

    const allMatches = [];
    // Highlight matched pages (up to top 25 pages to maintain 60fps)
    const pagesToHighlight = scoredPages.slice(0, 25);
    for (const pageEntry of pagesToHighlight) {
      const pageMatches = highlightPageMatches(pageEntry.pageNum, pageEntry.matchedTerms);
      if (pageMatches.length > 0) {
        allMatches.push(...pageMatches);
        currentlyMarkedPages.add(pageEntry.pageNum);
      }
    }

    searchMatches = allMatches;
    currentMatchIndex = 0;

    if (allMatches.length > 0) {
      scrollToMatch(0);
    }
  }

  // Targeted DOM highlight on a single page
  function highlightPageMatches(pageNum, terms) {
    const pageEl = document.getElementById(`pdf-page-${pageNum}`);
    if (!pageEl) return [];
    const textLayer = pageEl.querySelector('.textLayer');
    if (!textLayer) return [];

    const escapedTerms = terms
      .map((t) => t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
      .filter(Boolean);

    if (escapedTerms.length === 0) return [];

    const splitRegex = new RegExp('(' + escapedTerms.join('|') + ')', 'gi');
    const checkRegex = new RegExp('^(?:' + escapedTerms.join('|') + ')$', 'i');

    const spans = Array.from(textLayer.querySelectorAll('span'));
    const pageMatches = [];

    for (const span of spans) {
      const text = span.textContent;
      if (!text) continue;
      if (!terms.some((t) => text.toLowerCase().includes(t))) continue;

      const parts = text.split(splitRegex);
      if (parts.length <= 1) continue;

      span.innerHTML = '';
      for (const part of parts) {
        if (checkRegex.test(part)) {
          const mark = document.createElement('mark');
          mark.className = 'pdf-search-mark';
          mark.textContent = part;
          span.appendChild(mark);

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
    return pageMatches;
  }

  // Targeted teardown: only reset pages that were previously marked
  function clearHighlights() {
    if (!pagesContainer) return;
    for (const pageNum of currentlyMarkedPages) {
      const pageEl = document.getElementById(`pdf-page-${pageNum}`);
      if (!pageEl) continue;
      const marks = pageEl.querySelectorAll('.pdf-search-mark');
      const parents = new Set();
      marks.forEach((m) => {
        if (m.parentNode) parents.add(m.parentNode);
      });
      parents.forEach((p) => {
        p.textContent = p.textContent;
      });
    }
    currentlyMarkedPages.clear();
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
  <!-- Main Scrollable PDF Viewport (Clean paper look matching Assignment Brief) -->
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
    background: #e5e7eb;
    overflow: hidden;
  }

  :global([data-theme="dark"]) .pdf-viewer-root {
    background: #090d13;
  }

  /* Viewport Scroll: exact same feel as assignment brief scroll container */
  .pdf-viewport-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: auto;
    padding: 20px 24px 80px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: #e5e7eb;
  }

  :global([data-theme="dark"]) .pdf-viewport-scroll {
    background: #090d13;
  }

  .pdf-pages-stack {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-items: center;
  }

  /* Each Page Wrapper (Clean paper style matching .academic-sheet) */
  :global(.pdf-page-wrapper) {
    position: relative;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    background: #ffffff;
    border-radius: 4px;
    overflow: hidden;
    border: none !important;
  }

  :global([data-theme="dark"]) :global(.pdf-page-wrapper) {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    border: none !important;
  }

  :global(.pdf-page-canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* Search Term Highlights inside Text Layer (Subtle Academic Wash) */
  :global(.pdf-search-mark) {
    background: rgba(245, 158, 11, 0.16) !important;
    color: inherit !important;
    padding: 0 1px;
    border-radius: 2px;
    box-shadow: none !important;
    font-weight: normal !important;
    transition: background 0.15s ease;
  }

  :global(.pdf-search-mark.current-search-match) {
    background: rgba(217, 119, 6, 0.28) !important;
    color: inherit !important;
    border-bottom: 2px solid #d97706 !important;
    border-radius: 2px 2px 0 0;
    box-shadow: none !important;
    font-weight: 500 !important;
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
