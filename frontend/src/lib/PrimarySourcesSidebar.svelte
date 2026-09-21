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
        page: s.page || s.pageNum || null,
        section: s.section || '',
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
      } else if (!docMap.get(docKey).source_url && src.source_url) {
        docMap.get(docKey).source_url = src.source_url;
      }
      docMap.get(docKey).sections.push(src);
    }
    return Array.from(docMap.values());
  });

  let selectedDocIndex = $state(0);
  let activeDoc = $derived(
    (documents[selectedDocIndex]?.source_url ? documents[selectedDocIndex] : null) ||
    documents.find((d) => d.source_url) ||
    documents[selectedDocIndex] ||
    documents[0] ||
    null
  );

  // Search State
  let pdfViewerRef = $state(null);
  let initialViewerPage = $state(1);
  let matchInfo = $state({ current: 0, total: 0 });
  let searchQuery = $state('');
  let activeSearchTerm = $state('');
  let iframeKey = $state(1);

  function handleMatchesChange(info) {
    if (!info) return;
    if (
      matchInfo.current !== info.current ||
      matchInfo.total !== info.total ||
      matchInfo.pageNum !== info.pageNum ||
      matchInfo.sectionTitle !== info.sectionTitle
    ) {
      matchInfo = info;
    }
  }

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
  }

  let displayDomain = $derived(
    assignment?.domain ||
    assignment?.published?.domain ||
    assignment?.spec?.domain ||
    ''
  );

  let displayDepartment = $derived(
    assignment?.department ||
    assignment?.published?.department ||
    assignment?.spec?.department ||
    (courseTitle && courseTitle.toLowerCase().includes('department') ? courseTitle : '') ||
    (displayDomain ? `Department of ${displayDomain}` : '')
  );

  let displayCourse = $derived(
    assignment?.course_title ||
    assignment?.published?.course_title ||
    assignment?.spec?.course_title ||
    courseTitle ||
    assignment?.title ||
    assignment?.published?.title ||
    'Academic Inquiry'
  );

  let parsedCasePrompt = $derived.by(() => {
    const raw = assignment?.task?.prompt || assignment?.published?.task?.prompt || assignment?.prompt || '';
    if (!raw) {
      return { narrative: '', sections: [] };
    }

    // Split by markdown headings starting with '### '
    const parts = raw.split(/\n(?=###\s+)/);
    const narrative = parts[0].replace(/^###\s+.*?\n/, '').trim();
    const sections = [];

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;
      const lines = part.split('\n');
      const headingLine = lines[0].replace(/^###\s+/, '').trim();
      const bodyLines = lines.slice(1);

      const items = [];
      let calloutText = '';
      let isTable = false;
      let isMetricGrid = false;

      for (const line of bodyLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (
          trimmed.toLowerCase().startsWith('the catch:') ||
          trimmed.toLowerCase().startsWith('note:') ||
          trimmed.toLowerCase().startsWith('constraint:')
        ) {
          calloutText = trimmed;
          continue;
        }

        // Detect bullet or numbered items: '• ', '- ', '1. '
        const bulletMatch = trimmed.match(/^([•\-\*]|\d+\.)\s*(.*)$/);
        if (bulletMatch) {
          const itemText = bulletMatch[2].trim();

          // Pipe-separated table row: 'col1 | col2 | col3'
          if (itemText.includes('|')) {
            isTable = true;
            const cols = itemText.split('|').map((c) => c.trim());
            items.push({ type: 'row', cols });
          }
          // Metric key-value card: 'Value — Label' or 'Value - Label'
          else if (itemText.includes('—') || itemText.includes(' - ')) {
            isMetricGrid = true;
            const sep = itemText.includes('—') ? '—' : ' - ';
            const [val, ...rest] = itemText.split(sep);
            items.push({ type: 'metric', value: val.trim(), label: rest.join(sep).trim() });
          }
          // Standard bullet item
          else {
            items.push({ type: 'bullet', text: itemText });
          }
        } else {
          items.push({ type: 'text', text: trimmed });
        }
      }

      sections.push({
        title: headingLine,
        isTable,
        isMetricGrid: isMetricGrid && !isTable,
        items,
        calloutText,
      });
    }

    return {
      narrative,
      sections,
    };
  });

  let displaySourcesList = $derived(
    assignment?.source_pack ||
    assignment?.published?.source_pack ||
    sources ||
    []
  );

  let displayRubricList = $derived(
    assignment?.public_rubric ||
    assignment?.published?.public_rubric ||
    assignment?.spec?.rubric ||
    []
  );

  let displayGoalsList = $derived(
    assignment?.learning_goals ||
    assignment?.published?.learning_goals ||
    []
  );

  let displayChecklist = $derived(
    assignment?.completion_checklist ||
    assignment?.published?.completion_checklist ||
    []
  );

  let displayRequirements = $derived(
    assignment?.task?.requirements ||
    assignment?.published?.task?.requirements ||
    []
  );

  function printAssignmentSheet() {
    const sheet = document.querySelector('.academic-sheet');
    if (!sheet) {
      window.print();
      return;
    }

    let printFrame = document.getElementById('print-brief-frame');
    if (printFrame) {
      printFrame.remove();
    }
    printFrame = document.createElement('iframe');
    printFrame.id = 'print-brief-frame';
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    printFrame.style.visibility = 'hidden';
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentDocument || printFrame.contentWindow.document;
    const assignmentTitle = assignment?.published?.title || assignment?.title || 'Academic Assignment Brief';

    frameDoc.open();
    frameDoc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${assignmentTitle}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #111827;
      font-family: "Georgia", Georgia, "Times New Roman", serif;
      font-size: 11px;
      line-height: 1.42;
    }
    .academic-sheet {
      width: 100%;
      max-width: 100%;
      background: #ffffff;
      padding: 0;
      margin: 0;
    }
    .sheet-page {
      position: relative;
      box-sizing: border-box;
      background: #ffffff;
    }
    .sheet-page-1 {
      page-break-after: always;
      break-after: page;
      padding-bottom: 2mm;
    }
    .sheet-page-2 {
      page-break-before: always;
      break-before: page;
      padding-top: 2mm;
    }
    .sheet-page-break {
      page-break-before: always;
      break-before: page;
      height: 0;
      margin: 0;
      padding: 0;
      border: none;
      visibility: hidden;
    }
    .sheet-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .inst-logo {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 1.2px;
      color: #475569;
    }
    .inst-course {
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 2px;
    }
    .inst-dept {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 10.5px;
      color: #64748b;
      margin-top: 1px;
    }
    .sheet-meta {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 9.5px;
      color: #475569;
      line-height: 1.45;
      text-align: right;
    }
    .sheet-meta span {
      font-weight: 700;
      color: #0f172a;
    }
    .sheet-title-block {
      margin-bottom: 10px;
    }
    .sheet-title-block h1 {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 3px;
      line-height: 1.2;
    }
    .sheet-purpose {
      font-size: 11px;
      font-style: italic;
      color: #475569;
      margin: 0;
      line-height: 1.4;
    }
    .sheet-section {
      margin-bottom: 11px;
      page-break-inside: avoid;
    }
    .sheet-sec-heading {
      display: flex;
      align-items: center;
      gap: 6px;
      border-bottom: 1.5px solid #0f172a;
      padding-bottom: 3px;
      margin-bottom: 7px;
    }
    .sec-num {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 9px;
      font-weight: 800;
      background: #0f172a;
      color: #ffffff;
      padding: 1px 5px;
      border-radius: 2px;
      letter-spacing: 0.5px;
    }
    .sheet-sec-title {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      color: #0f172a;
      margin: 0;
    }
    .sheet-narrative-text {
      font-size: 11px;
      line-height: 1.45;
      color: #1e293b;
      margin: 0 0 8px;
    }
    .sub-sec-title {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 10px;
      font-weight: 700;
      color: #334155;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin: 6px 0 4px;
    }
    .economics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 8px;
    }
    .metric-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 5px 7px;
    }
    .metric-label {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 9px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
    }
    .metric-val {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      margin: 1px 0;
    }
    .metric-note {
      font-size: 8.5px;
      color: #475569;
      line-height: 1.25;
    }
    .sheet-table {
      width: 100%;
      border-collapse: collapse;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 9.5px;
      margin-bottom: 8px;
    }
    .sheet-table th, .sheet-table td {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      vertical-align: middle;
      text-align: left;
    }
    .sheet-table th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .badge-accent {
      font-weight: 700;
      color: #0369a1;
    }
    .text-muted-sm {
      color: #475569;
      font-size: 9px;
    }
    .survey-boundary-block {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 8px;
    }
    .survey-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-left: 3px solid #0284c7;
      border-radius: 4px;
      padding: 5px 8px;
    }
    .survey-hdr {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 9.5px;
    }
    .sample-tag {
      font-size: 8.5px;
      color: #64748b;
    }
    .survey-list {
      list-style: none;
      padding: 0;
      margin: 0;
      font-size: 9px;
      line-height: 1.35;
      color: #334155;
    }
    .constraint-callout {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-left: 3px solid #d97706;
      border-radius: 4px;
      padding: 5px 8px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .callout-badge {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 8.5px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #92400e;
    }
    .constraint-callout p {
      margin: 2px 0 0;
      font-size: 9.5px;
      font-weight: 600;
      color: #78350f;
      line-height: 1.3;
    }
    .ground-rules-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 6px 8px;
    }
    .rules-title {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 9.5px;
      font-weight: 700;
      color: #0f172a;
      text-transform: uppercase;
      margin-bottom: 4px;
      letter-spacing: 0.3px;
    }
    .rules-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 10px;
    }
    .rule-item {
      display: flex;
      align-items: flex-start;
      gap: 5px;
      font-size: 9px;
      line-height: 1.35;
      color: #334155;
    }
    .rule-index {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 8px;
      font-weight: 800;
      background: #e2e8f0;
      color: #334155;
      border-radius: 50%;
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 1px;
    }
    /* Page 2 Elements */
    .page-continuation-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1.5px solid #0f172a;
      padding-bottom: 4px;
      margin-bottom: 10px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 9.5px;
      font-weight: 700;
      color: #475569;
    }
    .page-num-pill {
      background: #0f172a;
      color: #ffffff;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 8.5px;
    }
    .frameworks-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 8px;
    }
    .framework-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-left: 3px solid #475569;
      border-radius: 4px;
      padding: 5px 7px;
    }
    .fw-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
    }
    .fw-sec {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 8.5px;
      font-weight: 800;
      color: #0f172a;
      background: #e2e8f0;
      padding: 0 4px;
      border-radius: 2px;
    }
    .fw-concept {
      font-size: 8px;
      font-weight: 600;
      color: #64748b;
    }
    .fw-title {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 9.5px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 2px;
    }
    .fw-app {
      font-size: 8.5px;
      line-height: 1.35;
      color: #475569;
    }
    .sheet-rubric-table {
      width: 100%;
      border-collapse: collapse;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 9px;
      margin-bottom: 8px;
    }
    .sheet-rubric-table th, .sheet-rubric-table td {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      vertical-align: top;
      text-align: left;
    }
    .sheet-rubric-table th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      font-size: 8.5px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .sheet-rubric-table tr {
      page-break-inside: avoid;
    }
    .weight-tag {
      display: inline-block;
      font-size: 8.5px;
      font-weight: 800;
      background: #e2e8f0;
      color: #1e293b;
      padding: 0 4px;
      border-radius: 2px;
      margin-left: 3px;
    }
    .crit-sub {
      font-size: 8px;
      color: #64748b;
      margin-top: 1px;
      line-height: 1.25;
    }
    .lvl-title {
      font-weight: 700;
      display: block;
      color: #0f172a;
      font-size: 8.5px;
      margin-bottom: 1px;
    }
    .lvl-desc {
      font-size: 8px;
      color: #475569;
      line-height: 1.3;
    }
    .goals-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 10px;
      margin-bottom: 8px;
    }
    .goal-item {
      display: flex;
      align-items: flex-start;
      gap: 5px;
      font-size: 8.5px;
      line-height: 1.35;
      color: #334155;
    }
    .goal-check {
      color: #15803d;
      font-weight: bold;
      font-size: 9px;
      flex-shrink: 0;
    }
    .integrity-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-left: 3px solid #0f172a;
      border-radius: 4px;
      padding: 6px 8px;
    }
    .integrity-title {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 9px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 2px;
    }
    .integrity-text {
      font-size: 8.5px;
      line-height: 1.35;
      color: #475569;
      margin-bottom: 6px;
    }
    .sign-block {
      display: flex;
      justify-content: space-between;
      border-top: 1px dashed #cbd5e1;
      padding-top: 4px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 8.5px;
      color: #64748b;
    }
    .no-print {
      display: none !important;
    }
  </style>
</head>
<body>
  <article class="academic-sheet">
    ${sheet.innerHTML}
  </article>
</body>
</html>`);
    frameDoc.close();

    setTimeout(() => {
      try {
        printFrame.contentWindow.focus();
        printFrame.contentWindow.print();
      } catch (e) {
        console.error('Frame print failed, falling back to window.print():', e);
        window.print();
      }
    }, 300);
  }

  function printSourcePdf() {
    if (!activeDoc?.source_url) return;
    let printFrame = document.getElementById('print-pdf-source-frame');
    if (printFrame) {
      printFrame.remove();
    }
    printFrame = document.createElement('iframe');
    printFrame.id = 'print-pdf-source-frame';
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    printFrame.style.visibility = 'hidden';
    document.body.appendChild(printFrame);

    let hasPrinted = false;
    const triggerPrint = () => {
      if (hasPrinted) return;
      hasPrinted = true;
      try {
        printFrame.contentWindow.focus();
        printFrame.contentWindow.print();
      } catch {
        window.open(activeDoc.source_url, '_blank');
      }
    };

    printFrame.onload = triggerPrint;
    printFrame.src = activeDoc.source_url;
    // Timeout fallback if onload doesn't trigger for PDF plugin
    setTimeout(triggerPrint, 1200);
  }

  function switchToSource(sourceTitle, src = null) {
    if (sourceTitle) {
      const idx = documents.findIndex((d) => d.title === sourceTitle);
      if (idx >= 0) selectedDocIndex = idx;
    }
    activeTab = 'sources';

    const targetPage = src?.page || src?.pageNum || null;
    if (targetPage) {
      initialViewerPage = targetPage;
      setTimeout(() => {
        pdfViewerRef?.scrollToPage(targetPage);
      }, 120);
    } else if (src?.citation) {
      setTimeout(() => {
        pdfViewerRef?.scrollToCitation(src.citation);
      }, 120);
    }
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
        onclick={() => { activeTab = 'assignment'; onToggleCollapse(false); }}
        title="Open Assignment Brief"
        aria-label="Open Assignment Brief"
      >
        <span class="collapsed-tab-icon">📋</span>
      </button>

      <button
        type="button"
        class="collapsed-tab-btn"
        class:active={activeTab === 'sources'}
        onclick={() => { activeTab = 'sources'; onToggleCollapse(false); }}
        title="Open Primary Sources"
        aria-label="Open Primary Sources"
      >
        <span class="collapsed-tab-icon">📕</span>
      </button>

      <button
        type="button"
        class="btn-expand-sidebar"
        onclick={() => onToggleCollapse(false)}
        title="Expand Primary Sources"
        aria-label="Expand Primary Sources"
      >
        ▶
      </button>

      <div
        class="vertical-title"
        onclick={() => onToggleCollapse(false)}
        role="button"
        tabindex="0"
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggleCollapse(false); }}
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
            title="Save Handout as PDF / Print Brief"
            aria-label="Save Handout as PDF / Print Brief"
          >
            <span style="font-size: 13px;">🖨️</span>
          </button>
        {:else if activeDoc?.source_url}
          <!-- Print PDF Source Document -->
          <button
            type="button"
            class="btn-header-action"
            onclick={printSourcePdf}
            title="Print PDF Document"
            aria-label="Print PDF Document"
          >
            <span style="font-size: 13px;">🖨️</span>
          </button>
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

        <!-- Collapse to Left Toggle (matching Socratic Gutter's collapse toggle) -->
        <button
          type="button"
          class="btn-collapse-toggle"
          onclick={() => onToggleCollapse(true)}
          title="Collapse sources to left"
          aria-label="Collapse sources to left"
        >
          ◀
        </button>
      </div>
    </div>

    {#if activeTab === 'assignment'}
      <!-- TAB 1: ACADEMIC ASSIGNMENT BRIEF (Printable Handout Format) -->
      <div class="assignment-scroll-container">
        <article class="academic-sheet print-target">
          <!-- PAGE 1 OF 2: CASE BRIEF & OPERATIONAL DATA -->
          <div class="sheet-page sheet-page-1">
            <!-- Sheet Header -->
            <header class="sheet-header">
              <div class="sheet-institution">
                <div class="inst-logo">FIOSRA ACADEMIC LMS</div>
                <div class="inst-course">{displayCourse}</div>
                {#if displayDepartment}
                  <div class="inst-dept">{displayDepartment}</div>
                {/if}
              </div>
              <div class="sheet-meta">
                {#if displayDomain}
                  <div><span>Domain:</span> {displayDomain}</div>
                {/if}
                <div><span>Deliverable:</span> {assignment?.task?.deliverable || assignment?.published?.task?.deliverable || 'Argumentative Work'}</div>
                {#if assignment?.task?.scope || assignment?.published?.task?.scope}
                  <div><span>Scope:</span> {assignment?.task?.scope || assignment?.published?.task?.scope}</div>
                {/if}
                <div><span>Academic Term:</span> Current Active Session</div>
              </div>
            </header>

            <!-- Title Block -->
            <div class="sheet-title-block">
              <h1>{assignment?.published?.title || assignment?.title || 'Assignment Brief'}</h1>
              {#if assignment?.purpose || assignment?.published?.purpose}
                <p class="sheet-purpose">{assignment?.purpose || assignment?.published?.purpose}</p>
              {/if}
            </div>

            <!-- Section I: Case Narrative & Operational Data -->
            <section class="sheet-section">
              <div class="sheet-sec-heading">
                <span class="sec-num">SECTION I</span>
                <h2 class="sheet-sec-title">Case Narrative &amp; Prompt Specification</h2>
              </div>
              {#if parsedCasePrompt.narrative}
                <p class="sheet-narrative-text">{parsedCasePrompt.narrative}</p>
              {/if}

              <!-- Dynamic Exhibits Parsed from Case Prompt -->
              {#each parsedCasePrompt.sections as sec}
                <div class="sub-sec-title">{sec.title}</div>
                {#if sec.isMetricGrid}
                  <div class="economics-grid">
                    {#each sec.items as m}
                      <div class="metric-card">
                        <div class="metric-val">{m.value}</div>
                        <div class="metric-note">{m.label}</div>
                      </div>
                    {/each}
                  </div>
                {:else if sec.isTable}
                  <table class="sheet-table">
                    <tbody>
                      {#each sec.items as row}
                        <tr>
                          {#each row.cols as col, cIdx}
                            <td class:badge-accent={cIdx === 1} class:text-muted-sm={cIdx > 1}>
                              {#if cIdx === 0}<strong>{col}</strong>{:else}{col}{/if}
                            </td>
                          {/each}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                {:else}
                  <div class="survey-boundary-block">
                    <div class="survey-box" style="grid-column: span {sec.calloutText ? 1 : 2};">
                      <ul class="survey-list">
                        {#each sec.items as it}
                          <li>• {it.text}</li>
                        {/each}
                      </ul>
                    </div>
                    {#if sec.calloutText}
                      <div class="constraint-callout">
                        <span class="callout-badge">CASE NOTE &amp; BOUNDARY</span>
                        <p>{sec.calloutText}</p>
                      </div>
                    {/if}
                  </div>
                {/if}
              {/each}

              <!-- Ground Rules & Strategic Requirements -->
              {#if displayRequirements.length > 0}
                <div class="ground-rules-box">
                  <div class="rules-title">Strategic Mandate &amp; Deliverable Requirements:</div>
                  <div class="rules-grid">
                    {#each displayRequirements as rule, rIdx}
                      <div class="rule-item">
                        <span class="rule-index">{rIdx + 1}</span>
                        <span class="rule-text">{rule}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </section>
          </div>

          <!-- EXPLICIT PAGE BREAK FOR 2-PAGE PRINT HANDOUT -->
          <div class="sheet-page-break"></div>

          <!-- PAGE 2 OF 2: SOURCES, RUBRIC & INTEGRITY -->
          <div class="sheet-page sheet-page-2">
            <!-- Header for Page 2 -->
            <div class="page-continuation-header">
              <span>{displayCourse}{assignment?.published?.title && displayCourse !== assignment.published.title ? ` — ${assignment.published.title}` : ''}</span>
              <span class="page-num-pill">Page 2 of 2</span>
            </div>

            <!-- Section II: Assigned Primary Sources & Frameworks -->
            {#if displaySourcesList.length > 0}
              <section class="sheet-section">
                <div class="sheet-sec-heading">
                  <span class="sec-num">SECTION II</span>
                  <h2 class="sheet-sec-title">Assigned Primary Sources &amp; Theoretical Materials</h2>
                </div>
                <div class="frameworks-grid">
                  {#each displaySourcesList as src, sIdx}
                    <div class="framework-card">
                      <div class="fw-top">
                        <span class="fw-sec">{src.section || `Source ${sIdx + 1}`}</span>
                        {#if src.page}
                          <span class="fw-concept">Page {src.page}</span>
                        {/if}
                      </div>
                      <div class="fw-title">{src.title}</div>
                      {#if src.citation}
                        <div class="crit-sub">{src.citation}</div>
                      {/if}
                      {#if src.relevance_guidance}
                        <div class="fw-app"><strong>Guidance:</strong> {src.relevance_guidance}</div>
                      {/if}
                      <div class="src-action-row no-print">
                        <button
                          type="button"
                          class="btn-open-source-pdf"
                          onclick={() => switchToSource(src.title, src)}
                        >
                          📕 Read in PDF Viewer ↗
                        </button>
                      </div>
                    </div>
                  {/each}
                </div>
              </section>
            {/if}

            <!-- Section III: Evaluation Rubric Criteria (100% Total) -->
            {#if displayRubricList.length > 0}
              <section class="sheet-section">
                <div class="sheet-sec-heading">
                  <span class="sec-num">SECTION III</span>
                  <h2 class="sheet-sec-title">Evaluation Rubric Criteria (100% Total)</h2>
                </div>
                <table class="sheet-rubric-table">
                  <thead>
                    <tr>
                      <th style="width: 26%;">Criterion &amp; Weight</th>
                      <th style="width: 24%;">Developing</th>
                      <th style="width: 25%;">Secure / Merit</th>
                      <th style="width: 25%;">Strong / Distinction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each displayRubricList as crit}
                      <tr>
                        <td>
                          <strong>{crit.title}</strong>
                          {#if crit.weight}
                            <span class="weight-tag">{crit.weight}%</span>
                          {/if}
                          {#if crit.description}
                            <div class="crit-sub">{crit.description}</div>
                          {/if}
                        </td>
                        {#if crit.levels && crit.levels.length >= 3}
                          {#each crit.levels.slice(0, 3) as lvl}
                            <td>
                              <span class="lvl-title">{lvl.label}</span>
                              <span class="lvl-desc">{lvl.description}</span>
                            </td>
                          {/each}
                        {:else if crit.levels && crit.levels.length > 0}
                          {#each crit.levels as lvl}
                            <td>
                              <span class="lvl-title">{lvl.label}</span>
                              <span class="lvl-desc">{lvl.description}</span>
                            </td>
                          {/each}
                        {:else}
                          <td colspan="3" class="lvl-desc">{crit.description || 'Assessed according to course standards.'}</td>
                        {/if}
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </section>
            {/if}

            <!-- Section IV: Learning Goals -->
            {#if displayGoalsList.length > 0}
              <section class="sheet-section">
                <div class="sheet-sec-heading">
                  <span class="sec-num">SECTION IV</span>
                  <h2 class="sheet-sec-title">Milestone Learning Goals</h2>
                </div>
                <div class="goals-grid">
                  {#each displayGoalsList as goal}
                    <div class="goal-item">
                      <span class="goal-check">✓</span>
                      <span class="goal-text">{goal}</span>
                    </div>
                  {/each}
                </div>
              </section>
            {/if}

            <!-- Section V: Academic Integrity Notice & Readiness Checklist -->
            <footer class="sheet-footer">
              {#if displayChecklist.length > 0}
                <div class="ground-rules-box" style="margin-bottom: 8px;">
                  <div class="rules-title">Submission Readiness Checklist:</div>
                  <div class="rules-grid">
                    {#each displayChecklist as item}
                      <div class="rule-item">
                        <span class="rule-index">◻</span>
                        <span class="rule-text">{item}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
              <div class="integrity-card">
                <div class="integrity-title">
                  <span>🔒 Academic Integrity &amp; Original Authorship Notice</span>
                </div>
                <div class="integrity-text">
                  {assignment?.integrity_notice || assignment?.published?.integrity_notice || 'Your educator evaluates the final submission. All calculations, analysis, and arguments must represent your original reasoning. Cite assigned course frameworks where theoretical support is invoked.'}
                </div>
                <div class="sign-block">
                  <div class="sign-line">Candidate Signature: ____________________________________</div>
                  <div class="sign-line">Submission Date: ____________________</div>
                </div>
              </div>
            </footer>
          </div>
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
            initialPage={initialViewerPage}
            {onQuoteEvidence}
            onMatchesChange={handleMatchesChange}
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
              <span class="match-count" title={matchInfo.sectionTitle ? `Page ${matchInfo.pageNum} · ${matchInfo.sectionTitle}` : `Page ${matchInfo.pageNum}`}>
                p. {matchInfo.pageNum || 1}{matchInfo.sectionTitle ? ` · ${matchInfo.sectionTitle}` : ''} ({matchInfo.current + 1} of {matchInfo.total})
              </span>
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
    background: var(--color-obsidian, #f8f8f5);
    border-right: 1px solid var(--color-graphite-border, #e2e4dc);
    position: relative;
    overflow: hidden;
    transition: width 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  :global([data-theme="dark"]) .evidentiary-well {
    background: var(--color-obsidian, #121418);
    border-color: var(--color-graphite-border, #262a33);
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
    border-bottom: 1px solid var(--color-graphite-border, #e2e4dc);
    background: var(--color-graphite, #ffffff);
    backdrop-filter: blur(8px);
    flex-shrink: 0;
    z-index: 10;
  }

  :global([data-theme="dark"]) .well-header {
    background: var(--color-bone-surface, #1e2229);
    border-color: var(--color-graphite-border, #262a33);
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

  .btn-collapse-toggle {
    background: transparent;
    border: 1px solid var(--color-graphite-border, #cbd5e1);
    border-radius: 4px;
    color: var(--color-slate-subtle, #64748b);
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.7rem;
    transition: all 0.15s ease;
  }

  :global([data-theme="dark"]) .btn-collapse-toggle {
    border-color: #30363d;
    color: #8b949e;
  }

  .btn-collapse-toggle:hover {
    color: var(--color-aurora, #0284c7);
    border-color: var(--color-aurora, #0284c7);
    background: rgba(2, 132, 199, 0.08);
  }

  .btn-expand-sidebar {
    background: transparent;
    border: 1px solid var(--color-graphite-border, #cbd5e1);
    border-radius: 4px;
    color: var(--color-slate-subtle, #64748b);
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.72rem;
    margin-top: 4px;
    transition: all 0.15s ease;
  }

  :global([data-theme="dark"]) .btn-expand-sidebar {
    border-color: #30363d;
    color: #8b949e;
  }

  .btn-expand-sidebar:hover {
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
    background: var(--color-obsidian, #f8f8f5);
    position: relative;
  }

  :global([data-theme="dark"]) .pdf-reader-frame-container {
    background: var(--color-obsidian, #121418);
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
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--color-slate-subtle, #475569);
    flex-shrink: 0;
    max-width: 280px;
  }

  :global([data-theme="dark"]) .search-match-nav {
    background: rgba(255, 255, 255, 0.08);
    color: #94a3b8;
  }

  .match-count {
    padding: 0 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
    background: var(--color-obsidian, #f8f8f5);
    padding: 20px 24px 60px 24px;
  }

  :global([data-theme="dark"]) .assignment-scroll-container {
    background: var(--color-obsidian, #121418);
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

  .btn-open-source-pdf {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
    font-weight: 600;
    border-radius: 4px;
    padding: 3px 8px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s ease;
    background: rgba(2, 132, 199, 0.1);
    color: #0284c7;
    border-color: rgba(2, 132, 199, 0.25);
  }

  .btn-open-source-pdf:hover {
    background: #0284c7;
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
    border: 1px solid var(--color-graphite-border, #e2e4dc);
    padding: 7px 8px;
    vertical-align: top;
    text-align: left;
  }

  .sheet-rubric-table th {
    background: var(--color-bone-muted, #f4f5f0);
    color: var(--color-heading, #111827);
    font-weight: 700;
  }

  .weight-tag {
    display: inline-block;
    background: var(--color-graphite-hover, #e8eae3);
    color: var(--color-heading, #111827);
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

  .sheet-page {
    position: relative;
    box-sizing: border-box;
    background: #ffffff;
  }

  .sheet-page-break {
    border-top: 2px dashed #cbd5e1;
    margin: 32px 0 28px;
    position: relative;
    text-align: center;
  }

  .sheet-page-break::after {
    content: 'PAGE BREAK (PAGE 2 OF 2 BEGINS)';
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.8px;
    color: #94a3b8;
    background: #ffffff;
    padding: 0 12px;
    position: relative;
    top: -8px;
  }

  .sheet-sec-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1.5px solid #0f172a;
    padding-bottom: 4px;
    margin-bottom: 12px;
  }

  .sec-num {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 10px;
    font-weight: 800;
    background: #0f172a;
    color: #ffffff;
    padding: 2px 6px;
    border-radius: 3px;
    letter-spacing: 0.5px;
  }

  .sheet-narrative-text {
    font-size: 13.5px;
    line-height: 1.65;
    color: #1e293b;
    margin: 0 0 14px;
  }

  .sub-sec-title {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
    font-weight: 700;
    color: #334155;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 12px 0 6px;
  }

  .economics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 14px;
  }

  .metric-card {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 8px 10px;
  }

  .metric-label {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 9.5px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
  }

  .metric-val {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 16px;
    font-weight: 800;
    color: #0f172a;
    margin: 2px 0;
  }

  .metric-note {
    font-size: 9.5px;
    color: #475569;
    line-height: 1.35;
  }

  .sheet-table {
    width: 100%;
    border-collapse: collapse;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
    margin-bottom: 14px;
  }

  .sheet-table th, .sheet-table td {
    border: 1px solid #cbd5e1;
    padding: 6px 8px;
    vertical-align: middle;
    text-align: left;
  }

  .sheet-table th {
    background: #f1f5f9;
    color: #0f172a;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.3px;
  }

  .badge-accent {
    font-weight: 700;
    color: #0284c7;
  }

  .text-muted-sm {
    color: #64748b;
    font-size: 10.5px;
  }

  .survey-boundary-block {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 14px;
  }

  .survey-box {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-left: 3px solid #0284c7;
    border-radius: 6px;
    padding: 8px 12px;
  }

  .survey-hdr {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
  }

  .sample-tag {
    font-size: 9.5px;
    color: #64748b;
  }

  .survey-list {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    color: #334155;
  }

  .constraint-callout {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-left: 3px solid #d97706;
    border-radius: 6px;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .callout-badge {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.5px;
    color: #92400e;
  }

  .constraint-callout p {
    margin: 4px 0 0;
    font-size: 11px;
    font-weight: 600;
    color: #78350f;
    line-height: 1.4;
  }

  .ground-rules-box {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }

  .rules-title {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
    font-weight: 700;
    color: #0f172a;
    text-transform: uppercase;
    margin-bottom: 8px;
    letter-spacing: 0.4px;
  }

  .rules-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 14px;
  }

  .rule-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 11px;
    line-height: 1.45;
    color: #334155;
  }

  .rule-index {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 9.5px;
    font-weight: 800;
    background: #e2e8f0;
    color: #334155;
    border-radius: 50%;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .page-continuation-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1.5px solid #0f172a;
    padding-bottom: 6px;
    margin-bottom: 14px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
    font-weight: 700;
    color: #475569;
  }

  .page-num-pill {
    background: #0f172a;
    color: #ffffff;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 9.5px;
  }

  .frameworks-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 14px;
  }

  .framework-card {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-left: 3px solid #475569;
    border-radius: 6px;
    padding: 8px 10px;
  }

  .fw-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .fw-sec {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 9.5px;
    font-weight: 800;
    color: #0f172a;
    background: #e2e8f0;
    padding: 1px 5px;
    border-radius: 3px;
  }

  .fw-concept {
    font-size: 9px;
    font-weight: 600;
    color: #64748b;
  }

  .fw-title {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 3px;
  }

  .fw-app {
    font-size: 10px;
    line-height: 1.45;
    color: #475569;
  }

  .goals-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 14px;
    margin-bottom: 14px;
  }

  .goal-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 10.5px;
    line-height: 1.45;
    color: #334155;
  }

  .goal-check {
    color: #15803d;
    font-weight: bold;
    font-size: 11px;
    flex-shrink: 0;
  }

  .integrity-card {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-left: 3px solid #0f172a;
    border-radius: 6px;
    padding: 10px 12px;
    margin-top: 10px;
  }

  .integrity-title {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 4px;
  }

  .integrity-text {
    font-size: 10.5px;
    line-height: 1.45;
    color: #475569;
    margin-bottom: 8px;
  }

  .sign-block {
    display: flex;
    justify-content: space-between;
    border-top: 1px dashed #cbd5e1;
    padding-top: 6px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 10px;
    color: #64748b;
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
      overflow: visible !important;
      height: auto !important;
    }
    :global(.workspace-header),
    :global(.workspace-topbar),
    :global(.top-nav-bar),
    :global(.workbench-col-canvas),
    :global(.workbench-col-gutter),
    :global(.workbench-resizer-handle),
    :global(.canvas-tab-wrapper),
    :global(.collapsed-sidebar-strip),
    .well-header,
    .no-print,
    .doc-switcher-bar,
    .pdf-reader-frame-container,
    .bottom-ai-search-anchor {
      display: none !important;
    }
    :global(.student-workspace-shell),
    :global(.workspace-viewport),
    :global(.workspace-content-body),
    :global(.in-situ-workbench-grid),
    :global(.workbench-col-sources),
    .evidentiary-well {
      display: block !important;
      position: static !important;
      width: 100% !important;
      height: auto !important;
      overflow: visible !important;
      border: none !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
    }
    .assignment-scroll-container {
      overflow: visible !important;
      height: auto !important;
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
