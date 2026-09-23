<script>
  import { onMount, tick, untrack, onDestroy } from 'svelte';
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
    initialPage = 1,
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

  let lastMatchesReport = { current: -1, total: -1, pageNum: -1, sectionTitle: '' };
  $effect(() => {
    const cur = currentMatchIndex;
    const tot = searchMatches.length;
    const activeMatch = searchMatches[cur] || null;
    const pageNum = activeMatch?.pageNum || 0;
    const sectionTitle = activeMatch?.sectionTitle || '';
    if (
      lastMatchesReport.current !== cur ||
      lastMatchesReport.total !== tot ||
      lastMatchesReport.pageNum !== pageNum ||
      lastMatchesReport.sectionTitle !== sectionTitle
    ) {
      lastMatchesReport = { current: cur, total: tot, pageNum, sectionTitle };
      untrack(() => {
        onMatchesChange({
          current: cur,
          total: tot,
          pageNum,
          sectionTitle,
          snippet: activeMatch?.text?.slice(0, 140) || '',
        });
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

  // Paragraph-level Reverse / Inverted Index State
  // paragraphsMap: Map<paraId, { paraId, pageNum, text, spans, tokens }>
  const paragraphsMap = new Map();
  // invertedIndex: Map<token, Array<{ paraId, pageNum, tf }>>
  const invertedIndex = new Map();
  // docFrequency: Map<token, number>
  const docFrequency = new Map();
  let totalParagraphCount = 0;
  let pdfOutline = [];
  let pdfHeadings = [];
  let activeHighlightedSpans = [];
  let searchDebounceTimer = null;
  let pageObserver = null;

  onDestroy(() => {
    if (pageObserver) {
      pageObserver.disconnect();
      pageObserver = null;
    }
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  const HISTORICAL_ANCHORS = {
    mughal: ['mughal', 'akbar', 'babur', 'humayun', 'shah jahan', 'aurangzeb', 'jahangir'],
    chola: ['chola', 'rajaraja', 'rajendra', 'coromandel', 'kaveri'],
    gupta: ['gupta', 'samudragupta', 'chandragupta'],
    sultanate: ['sultanate', 'delhi', 'khalji', 'tughlaq', 'mamluk', 'lodhi'],
    maratha: ['maratha', 'shivaji', 'peshwa'],
    british: ['british', 'east india company', 'raj', 'colonial'],
    ancient: ['bce', 'magadha', 'vedic', 'harappa', 'indus valley', 'mauryan', 'ashoka'],
  };

  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'as', 'is', 'was', 'were', 'are', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'how', 'what', 'why', 'where',
    'which', 'who', 'when', 'that', 'this', 'these', 'those', 'can', 'could',
    'would', 'should', 'about', 'into', 'over', 'under', 'between', 'through',
    'it', 'its', 'their', 'they', 'them', 'he', 'she', 'his', 'her', 'we', 'our',
    'during'
  ]);

  // Historical domain ontology for conceptual expansion in the inverted index
  const DOMAIN_ONTOLOGY = {
    trade: ['commerce', 'merchant', 'maritime', 'route', 'port', 'caravan', 'market', 'good', 'spic', 'bazaar'],
    commerce: ['trade', 'merchant', 'market', 'caravan', 'rout'],
    merchant: ['trade', 'commerce', 'guild', 'shreni', 'trader'],
    network: ['route', 'trade', 'caravan', 'system', 'connect'],
    agrarian: ['agricultur', 'peasant', 'cultivat', 'revenue', 'land', 'crop', 'ryot', 'zamindar', 'jagirdar', 'soil', 'irrigat'],
    agricultur: ['agrarian', 'cultivat', 'peasant', 'crop', 'land', 'revenue'],
    peasant: ['peasantry', 'cultivat', 'ryot', 'agrarian', 'tenant', 'villag'],
    revenue: ['tax', 'fiscal', 'settlement', 'tribut', 'assess'],
    temple: ['shrine', 'devasthana', 'brahmadeya', 'monaster', 'patronag', 'endow', 'mandapa', 'gopuram'],
    endow: ['patronag', 'grant', 'donat', 'revenue', 'brahmadeya', 'inam', 'waqf'],
    corporate: ['guild', 'shreni', 'assembl', 'associat', 'merchant'],
    assembl: ['sabha', 'samiti', 'ur', 'nadu', 'gana', 'council'],
    guild: ['shreni', 'merchant', 'trader', 'nigama', 'corporat'],
    chola: ['tanjore', 'thanjavur', 'rajaraja', 'rajendra', 'coromandel', 'kaveri'],
    mughal: ['akbar', 'babur', 'humayun', 'shah jahan', 'aurangzeb', 'mansabdari', 'subah'],
    gupta: ['samudragupta', 'chandragupta', 'classical', 'magadha'],
    maratha: ['shivaji', 'peshwa', 'deccan', 'swarajya'],
    sultanate: ['delhi', 'mamluk', 'khalji', 'tughlaq', 'lodhi', 'sultan'],
  };

  function tokenizeAndStem(text) {
    if (!text) return [];
    const rawWords = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

    return rawWords.map((w) => {
      if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
      if (w.endsWith('sses')) return w.slice(0, -2);
      if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
      if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
      if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
      if (w.endsWith('ment') && w.length > 6) return w.slice(0, -4);
      return w;
    });
  }

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

  async function parsePdfOutline(doc) {
    const sections = [];
    try {
      const rawOutline = await doc.getOutline();
      if (!rawOutline || !rawOutline.length) return sections;

      async function traverse(items) {
        for (const item of items) {
          let pageNum = null;
          if (item.dest) {
            let dest = item.dest;
            if (typeof dest === 'string') {
              dest = await doc.getDestination(dest);
            }
            if (Array.isArray(dest) && dest[0]) {
              try {
                const pageIdx = await doc.getPageIndex(dest[0]);
                pageNum = pageIdx + 1;
              } catch (e) {
                // Ignore destination resolution failures
              }
            }
          }
          if (pageNum && item.title) {
            sections.push({ title: item.title.trim(), pageNum });
          }
          if (item.items && item.items.length) {
            await traverse(item.items);
          }
        }
      }
      await traverse(rawOutline);
      sections.sort((a, b) => a.pageNum - b.pageNum);
    } catch (err) {
      console.warn('Could not extract PDF outline:', err);
    }
    return sections;
  }

  function getSectionTitleForPage(pageNum) {
    if (pdfOutline && pdfOutline.length > 0) {
      let current = '';
      for (const sec of pdfOutline) {
        if (sec.pageNum <= pageNum) {
          current = sec.title;
        } else {
          break;
        }
      }
      if (current) return current;
    }
    if (pdfHeadings && pdfHeadings.length > 0) {
      let current = '';
      for (const h of pdfHeadings) {
        if (h.pageNum <= pageNum) {
          current = h.title;
        } else {
          break;
        }
      }
      if (current) return current;
    }
    return '';
  }

  function clearReverseIndex() {
    paragraphsMap.clear();
    invertedIndex.clear();
    docFrequency.clear();
    pdfHeadings = [];
    totalParagraphCount = 0;
    activeHighlightedSpans = [];
  }

  async function loadPdf(pdfUrl) {
    if (!pdfUrl) return;
    isLoading = true;
    loadError = null;
    renderedPages.clear();
    clearReverseIndex();
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

      // Extract outline bookmarks asynchronously
      pdfOutline = await parsePdfOutline(pdfDoc);

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
    if (pageObserver) {
      pageObserver.disconnect();
      pageObserver = null;
    }
    pagesContainer.innerHTML = '';
    renderedPages.clear();
    clearReverseIndex();

    let defaultWidth = 800;
    let defaultHeight = 1100;
    try {
      const p1 = await pdfDoc.getPage(1);
      const vp = p1.getViewport({ scale });
      defaultWidth = vp.width;
      defaultHeight = vp.height;
    } catch (e) {}

    const frag = document.createDocumentFragment();
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'pdf-page-wrapper';
      pageWrapper.id = `pdf-page-${pageNum}`;
      pageWrapper.dataset.pageNum = String(pageNum);
      pageWrapper.style.width = `${defaultWidth}px`;
      pageWrapper.style.minHeight = `${defaultHeight}px`;
      frag.appendChild(pageWrapper);
    }
    pagesContainer.appendChild(frag);

    const scrollContainer = pagesContainer.closest('.pdf-viewport-scroll') || null;

    pageObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const p = parseInt(entry.target.dataset.pageNum, 10);
          if (!isNaN(p) && !renderedPages.has(p)) {
            renderPage(p, entry.target);
          }
        }
      }
    }, {
      root: scrollContainer,
      rootMargin: '600px 0px',
    });

    for (const child of pagesContainer.children) {
      pageObserver.observe(child);
    }

    const startPage = (initialPage && initialPage >= 1 && initialPage <= numPages) ? initialPage : 1;
    await renderPage(startPage);
    if (startPage > 1) {
      await scrollToPage(startPage);
    }

    if (searchTerm) {
      executeSemanticSearch(searchTerm);
    }
  }

  function segmentPageIntoParagraphs(textContent, spans, pageNum) {
    const items = textContent.items || [];
    const paragraphs = [];
    let curSpans = [];
    let curText = '';
    let lastY = null;

    let spanIdx = 0;
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      const hasContent = it.str && it.str.length > 0;
      // In PDF.js TextLayer, only items with non-empty str create a DOM <span>
      const span = hasContent ? (spans[spanIdx++] || null) : null;
      const str = (it.str || '').trim();
      if (!str) continue;

      const y = it.transform ? it.transform[5] : 0;
      // In PDF space, reading advances down the page (decreasing Y).
      // Standard line height is ~12-14pt. Break paragraph only if line gap > 20pt or upward jump.
      const isNew = lastY !== null && (lastY - y > 20 || lastY - y < -5);

      if (isNew && curSpans.length > 0) {
        if (curText.trim().length >= 25) {
          paragraphs.push({
            paraId: `p${pageNum}_${paragraphs.length + 1}`,
            pageNum,
            text: curText.trim(),
            spans: [...curSpans],
          });
        }
        curSpans = [];
        curText = '';
      }

      if (span) curSpans.push(span);
      curText += (curText ? ' ' : '') + str;
      lastY = y;
    }

    if (curSpans.length > 0 && curText.trim().length >= 25) {
      paragraphs.push({
        paraId: `p${pageNum}_${paragraphs.length + 1}`,
        pageNum,
        text: curText.trim(),
        spans: [...curSpans],
      });
    }

    return paragraphs;
  }

  function indexParagraph(para) {
    const tokens = tokenizeAndStem(para.text);
    para.tokens = tokens;
    paragraphsMap.set(para.paraId, para);
    totalParagraphCount++;

    const termCounts = new Map();
    for (const t of tokens) {
      termCounts.set(t, (termCounts.get(t) || 0) + 1);
    }

    // Square root document length normalization
    const lengthNorm = Math.sqrt(tokens.length) || 1.0;
    for (const [t, count] of termCounts.entries()) {
      const tf = count / lengthNorm;
      if (!invertedIndex.has(t)) {
        invertedIndex.set(t, []);
      }
      invertedIndex.get(t).push({
        paraId: para.paraId,
        pageNum: para.pageNum,
        tf,
      });
      docFrequency.set(t, (docFrequency.get(t) || 0) + 1);
    }
  }

  async function renderPage(pageNum, existingWrapper = null) {
    if (!pdfDoc || !pagesContainer || renderedPages.has(pageNum)) return;
    renderedPages.add(pageNum);

    try {
      const page = await pdfDoc.getPage(pageNum);
      if (!pagesContainer) return;
      const viewport = page.getViewport({ scale });

      const pageWrapper = existingWrapper || document.getElementById(`pdf-page-${pageNum}`);
      if (!pageWrapper) return;
      pageWrapper.style.width = `${viewport.width}px`;
      pageWrapper.style.minHeight = `${viewport.height}px`;

      // 1. Render Canvas
      let canvas = pageWrapper.querySelector('canvas.pdf-page-canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'pdf-page-canvas';
        pageWrapper.appendChild(canvas);
      }
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: context, viewport }).promise;

      // 2. Render TextLayer (enables text selection and search highlighting)
      try {
        let textLayerDiv = pageWrapper.querySelector('div.textLayer');
        if (!textLayerDiv) {
          textLayerDiv = document.createElement('div');
          textLayerDiv.className = 'textLayer';
          pageWrapper.appendChild(textLayerDiv);
        }
        textLayerDiv.innerHTML = '';
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;

        const textContent = await page.getTextContent();

        // Detect in-document section headings from large font items (h >= 13)
        for (const it of textContent.items) {
          if (it.height >= 13 && it.str && it.str.trim().length >= 4) {
            const title = it.str.trim();
            if (!/^\d+$/.test(title) && !pdfHeadings.some((h) => h.pageNum === pageNum && h.title === title)) {
              pdfHeadings.push({ pageNum, title });
            }
          }
        }
        pdfHeadings.sort((a, b) => a.pageNum - b.pageNum);

        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport: viewport,
        });
        await textLayer.render();

        // 3. Segment into Paragraphs and Build In-Memory Inverted Index
        const spans = Array.from(textLayerDiv.querySelectorAll('span'));
        const pageParas = segmentPageIntoParagraphs(textContent, spans, pageNum);
        for (const p of pageParas) {
          indexParagraph(p);
        }
      } catch (textErr) {
        console.warn(`Text layer skipped for page ${pageNum}:`, textErr);
      }
    } catch (err) {
      renderedPages.delete(pageNum);
      console.warn(`Failed rendering page ${pageNum}:`, err);
    }
  }

  // Fast In-Memory TF-IDF Semantic Search over Paragraph Inverted Index
  async function executeSemanticSearch(rawQuery) {
    const clean = (rawQuery || '').trim();
    if (!clean || !pdfDoc || totalParagraphCount === 0) {
      clearHighlights();
      searchMatches = [];
      currentMatchIndex = 0;
      return;
    }

    const qTokens = tokenizeAndStem(clean);
    if (qTokens.length === 0) {
      clearHighlights();
      searchMatches = [];
      currentMatchIndex = 0;
      return;
    }

    // 1. Mandatory Historical Anchor Gating: detect anchor in query (e.g. Mughal, Chola, Gupta)
    let activeAnchorTerms = null;
    for (const [key, cluster] of Object.entries(HISTORICAL_ANCHORS)) {
      if (qTokens.some((t) => cluster.includes(t) || t === key)) {
        activeAnchorTerms = new Set(cluster);
        break;
      }
    }

    const N = Math.max(totalParagraphCount, 1);
    const queryTermWeights = new Map();

    for (const t of qTokens) {
      const df = docFrequency.get(t) || 0;
      // Probabilistic BM25 / Lucene-style IDF
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      queryTermWeights.set(t, { idf: Math.max(idf, 0.2), isPrimary: true });

      // Domain ontology expansion (synonyms at 0.5 discount)
      const synonyms = DOMAIN_ONTOLOGY[t] || [];
      for (const syn of synonyms) {
        if (!queryTermWeights.has(syn) && docFrequency.has(syn)) {
          const synDf = docFrequency.get(syn) || 0;
          const synIdf = Math.log(1 + (N - synDf + 0.5) / (synDf + 0.5));
          queryTermWeights.set(syn, { idf: Math.max(synIdf, 0.2) * 0.5, isPrimary: false, parentTerm: t });
        }
      }
    }

    // Accumulate scores across postings in inverted index
    const paraScores = new Map();

    for (const [term, meta] of queryTermWeights.entries()) {
      const postings = invertedIndex.get(term);
      if (!postings) continue;

      for (const post of postings) {
        if (!paraScores.has(post.paraId)) {
          paraScores.set(post.paraId, {
            paraId: post.paraId,
            pageNum: post.pageNum,
            score: 0,
            primaryMatched: new Set(),
            matchedTokens: new Set(),
          });
        }
        const entry = paraScores.get(post.paraId);
        entry.score += post.tf * meta.idf;
        entry.matchedTokens.add(term);
        if (meta.isPrimary) {
          entry.primaryMatched.add(term);
        } else if (meta.parentTerm) {
          entry.primaryMatched.add(meta.parentTerm);
        }
      }
    }

    if (paraScores.size === 0) {
      clearHighlights();
      searchMatches = [];
      currentMatchIndex = 0;
      return;
    }

    const primaryCount = qTokens.length;
    const candidates = [];

    for (const entry of paraScores.values()) {
      const para = paragraphsMap.get(entry.paraId);
      if (!para) continue;

      // Ignore bibliography, references, and citations pages (typically p >= 53)
      if (entry.pageNum >= 53) continue;

      const pLower = para.text.toLowerCase();

      // Mandatory Anchor Gate: if user query mentions an anchor (e.g. Mughal), paragraph MUST contain it!
      if (activeAnchorTerms) {
        const hasAnchor = Array.from(activeAnchorTerms).some((term) => pLower.includes(term));
        if (!hasAnchor) continue; // Completely filter out non-anchor eras (e.g. 480 BCE Magadha)
      }

      const matchedCount = entry.primaryMatched.size;

      // Co-occurrence synergy boost: paragraphs uniting multiple distinct query concepts dominate
      if (primaryCount > 1) {
        if (matchedCount >= 2) {
          entry.score *= (1.0 + (matchedCount - 1) * 0.75);
        } else if (primaryCount >= 3 && matchedCount === 1) {
          entry.score *= 0.35;
        }
      }

      candidates.push(entry);
    }

    // Sort descending by relevance score
    candidates.sort((a, b) => b.score - a.score || a.pageNum - b.pageNum);

    const topScore = candidates[0]?.score || 0;
    // Dynamic relevance threshold: keep top results that are within 35% of top score
    const threshold = Math.max(topScore * 0.35, 0.4);
    const filtered = candidates.filter((c) => c.score >= threshold).slice(0, 5);

    // Map candidate paragraphs to rich search matches with section titles
    const matches = filtered.map((c) => {
      const para = paragraphsMap.get(c.paraId);
      const sectionTitle = getSectionTitleForPage(c.pageNum);
      return {
        paraId: c.paraId,
        pageNum: c.pageNum,
        score: c.score,
        text: para?.text || '',
        spans: para?.spans || [],
        sectionTitle: sectionTitle || (c.pageNum ? `Page ${c.pageNum}` : ''),
      };
    });

    clearHighlights();
    searchMatches = matches;
    currentMatchIndex = 0;

    if (matches.length > 0) {
      highlightMatch(0);
    }
  }

  // Whole-Paragraph Scholastic Highlighting
  function highlightMatch(index) {
    clearHighlights();
    const match = searchMatches[index];
    if (!match) return;

    const para = paragraphsMap.get(match.paraId);
    if (!para || !para.spans) return;

    for (const span of para.spans) {
      span.classList.add('pdf-passage-highlight');
      activeHighlightedSpans.push(span);
    }

    // Smooth scroll the highlighted paragraph into center view
    if (para.spans[0]) {
      para.spans[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Non-destructive highlight teardown
  function clearHighlights() {
    for (const span of activeHighlightedSpans) {
      span.classList.remove('pdf-passage-highlight', 'current-search-match');
    }
    activeHighlightedSpans = [];
  }

  export function nextMatch() {
    if (searchMatches.length === 0) return;
    currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
    highlightMatch(currentMatchIndex);
  }

  export function prevMatch() {
    if (searchMatches.length === 0) return;
    currentMatchIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    highlightMatch(currentMatchIndex);
  }

  export async function scrollToPage(targetPage) {
    if (!targetPage || !pdfDoc) return;
    const p = Math.min(Math.max(1, targetPage), numPages);
    currentPage = p;
    await renderPage(p);
    await tick();
    const el = document.getElementById(`pdf-page-${p}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  export async function scrollToCitation(citation) {
    if (!citation || !pdfDoc) return;
    // 1. Check section number (§1.2, §9.1, §12.1, §13.1, §17.2)
    const secMatch = citation.match(/§\s*(\d+(?:\.\d+)?)/);
    if (secMatch && pdfOutline.length > 0) {
      const secNum = secMatch[1];
      const found = pdfOutline.find((b) => b.title.startsWith(secNum) || b.title.includes(` ${secNum} `) || b.title.includes(`${secNum}.`));
      if (found && found.pageNum) {
        await scrollToPage(found.pageNum);
        return;
      }
    }
    // 2. Check title match in outline bookmarks
    if (pdfOutline.length > 0) {
      const lower = citation.toLowerCase();
      const found = pdfOutline.find((b) => lower.includes(b.title.toLowerCase()) || b.title.toLowerCase().split(' ').some(w => w.length > 4 && lower.includes(w)));
      if (found && found.pageNum) {
        await scrollToPage(found.pageNum);
        return;
      }
    }
    // 3. Check page number (pp. 18 or p. 18)
    const pageMatch = citation.match(/pp?\.?\s*(\d+)/i);
    if (pageMatch) {
      const bookPage = parseInt(pageMatch[1], 10);
      const target = (numPages > 100 && bookPage < numPages - 14) ? bookPage + 14 : bookPage;
      await scrollToPage(target);
    }
  }

  export async function scrollToSection(sectionTitle) {
    if (!sectionTitle || !pdfDoc) return;
    return await scrollToCitation(sectionTitle);
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
    background: var(--color-obsidian, #f8f8f5);
    overflow: hidden;
  }

  :global([data-theme="dark"]) .pdf-viewer-root {
    background: var(--color-obsidian, #121418);
  }

  /* Viewport Scroll: exact same feel as assignment brief and canvas scroll container */
  .pdf-viewport-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: auto;
    padding: 20px 24px 80px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--color-obsidian, #f8f8f5);
  }

  :global([data-theme="dark"]) .pdf-viewport-scroll {
    background: var(--color-obsidian, #121418);
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

  /* Whole-Paragraph Scholastic Highlighting inside Text Layer (Smooth Continuous Wash) */
  :global(.pdf-passage-highlight) {
    background-color: rgba(216, 154, 58, 0.24) !important;
    color: transparent !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    outline: none !important;
    transition: background-color 0.15s ease;
  }

  :global([data-theme="dark"]) :global(.pdf-passage-highlight) {
    background-color: rgba(216, 154, 58, 0.32) !important;
    color: transparent !important;
    box-shadow: none !important;
  }

  /* Search Term Highlights inside Text Layer (Subtle Academic Wash) */
  :global(.pdf-search-mark) {
    background: rgba(216, 154, 58, 0.16) !important;
    color: inherit !important;
    padding: 0 1px;
    border-radius: 2px;
    box-shadow: none !important;
    font-weight: normal !important;
    transition: background 0.15s ease;
  }

  :global(.pdf-search-mark.current-search-match) {
    background: rgba(79, 107, 255, 0.28) !important;
    color: inherit !important;
    border-bottom: 2px solid #4f6bff !important;
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
    background: #7b61ff;
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
    color: #32373c;
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
    background: #7b61ff;
    color: #ffffff;
    padding: 8px 16px;
    border-radius: 6px;
    text-decoration: none;
    font-size: 0.8rem;
    font-weight: 600;
  }
</style>
