<script>
  import { onMount } from 'svelte';
  import { getStudentId, routeParams } from '../lib/session.js';

  let courseId = $state('');
  let course = $state(null);
  let activeDocKey = $state('young');
  let enrolledCourses = $state([]);
  let clippedFeedback = $state('');
  let isLoading = $state(true);

  const corpusDocuments = [
    {
      key: 'young',
      author: 'Arthur Young',
      work: 'Travels in France during the Years 1787, 1788, and 1789',
      date: 'July 1789 Excerpt',
      sha: '4f98...e1b2',
      kc: 'KC_HIST_SOURCE_PROVENANCE',
      provenance: 'First-hand observational journal by an English agrarian economist traveling through French provinces on the eve of the Great Fear.',
      synopsis: 'Young recorded meticulous empirical accounts of peasant impoverishment, feudal dues, and the stark contrast between productive land and crushing fiscal liabilities.',
      passage: 'The abuses attending the levy of the taille and the corvée are of a magnitude that foreigners can scarcely conceive. The nobility and clergy are exempt from the former; and the whole weight falls upon the peasantry, who are crushed beneath the load while privileged orders enjoy the fruits of fertile land without contributing a sol to the public treasury.',
      pedagogicalPrompt: 'How does Young\'s status as an English agrarian reformer influence his attribution of peasant misery to tax structure rather than poor harvests?',
    },
    {
      key: 'sieyes',
      author: 'Abbé Emmanuel-Joseph Sieyès',
      work: 'Qu\'est-ce que le Tiers-État? (What is the Third Estate?)',
      date: 'January 1789',
      sha: '9ac3...77d1',
      kc: 'KC_HIST_SOVEREIGNTY_SYNTHESIS',
      provenance: 'Political pamphlet published pseudonymously in Paris; became the ideological blueprint for transforming the Estates-General into the National Assembly.',
      synopsis: 'Sieyès issued the definitive political manifesto arguing that the Third Estate constituted a complete nation in itself, and that aristocratic privileges were foreign parasites on the body politic.',
      passage: 'What is the Third Estate? Everything. What has it been heretofore in the political order? Nothing. What does it demand? To become something. If the privileged order were removed, the nation would not be something less, but something more.',
      pedagogicalPrompt: 'Does Sieyès define nationhood by historical legal precedent or by productive economic contribution? What claims does he refute?',
    },
    {
      key: 'necker',
      author: 'Jacques Necker',
      work: 'Compte Rendu au Roi (Report to the King)',
      date: 'February 1781',
      sha: 'db81...00f4',
      kc: 'KC_HIST_FISCAL_ANALYSIS',
      provenance: 'Official royal fiscal account published for public distribution; unprecedented disclosure of the French Monarchy\'s state budget.',
      synopsis: 'Necker presented a deceptive surplus in ordinary revenue while obscuring the catastrophic extraordinary war debt incurred to fund the American Revolutionary War.',
      passage: 'A state whose credit is sound can find resources in extraordinary crises; but when mystery shrouds finances, distrust multiplies and rates become ruinous. Transparency is the only durable pledge of sovereign honor.',
      pedagogicalPrompt: 'Why was the publication of royal revenue accounts considered revolutionary in 1781? What structural debt burdens was Necker attempting to hide?',
    },
  ];

  let liveDocuments = $state([]);

  onMount(async () => {
    const params = routeParams();
    courseId = params.get('course_id') || '';
    const studentId = getStudentId();

    try {
      const res = await fetch(`/courses/enrolled?student_id=${encodeURIComponent(studentId)}`);
      if (res.ok) {
        enrolledCourses = await res.json();
        if (!courseId && enrolledCourses.length > 0) {
          courseId = enrolledCourses[0].course_id;
        }
      }

      if (courseId) {
        const [cRes, docRes] = await Promise.all([
          fetch(`/courses/${encodeURIComponent(courseId)}`),
          fetch(`/courses/${encodeURIComponent(courseId)}/documents`),
        ]);
        if (cRes.ok) course = await cRes.json();
        if (docRes && docRes.ok) {
          const docs = await docRes.json();
          if (Array.isArray(docs) && docs.length > 0) {
            liveDocuments = docs;
            activeDocKey = docs[0].document_id;
          }
        }
      }
    } catch (err) {
      console.error('Failed to load primary sources:', err);
    } finally {
      isLoading = false;
    }
  });

  let allDisplayDocuments = $derived.by(() => {
    if (liveDocuments && liveDocuments.length > 0) {
      return liveDocuments.map((doc, idx) => ({
        key: doc.document_id,
        author: doc.title,
        work: doc.filename,
        date: `Grounded Source Document · ${(doc.file_size / 1024).toFixed(1)} KB`,
        sha: doc.document_id.slice(0, 8),
        kc: 'KC_COURSE_PRIMARY_EVIDENCE',
        provenance: `Authentic grounded course reading material (${doc.chunks_count || 1} semantic sections mapped).`,
        synopsis: `Official course reading document uploaded for this curriculum workspace.`,
        passage: `Primary source material stored in authentic PDF format: ${doc.filename}.`,
        pedagogicalPrompt: `Examine this primary source document and extract relevant warrants and claims.`,
        downloadUrl: doc.download_url,
      }));
    }
    return corpusDocuments;
  });

  let activeDoc = $derived(allDisplayDocuments.find((d) => d.key === activeDocKey) || allDisplayDocuments[0]);

  function clipExcerpt(doc) {
    const citation = `${doc.author}, ${doc.work} (${doc.date}): "${doc.passage}"`;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('fiosra_clipped_passage', citation);
    }
    clippedFeedback = `Clipped quote from ${doc.author} to Reasoning Canvas!`;
    setTimeout(() => {
      clippedFeedback = '';
    }, 4000);
  }
</script>

<div class="sources-page">
  <main class="sources-container">

    <!-- Header -->
    <header class="sources-header">
      <div class="header-text">
        <div class="header-breadcrumbs">
          <a href="#/student/portal" class="crumb-link">All Courses</a>
          <span class="crumb-separator">/</span>
          <a href={`#/student/home?course_id=${encodeURIComponent(courseId)}`} class="crumb-link">
            {course?.title || 'Course Map'}
          </a>
          <span class="crumb-separator">/</span>
          <span class="crumb-current">Primary Sources</span>
        </div>
        <h1 class="sources-title">Grounded Corpus & Primary Source Reader</h1>
        <p class="sources-sub">
          Assigned historical texts and archival evidence for <strong>{course?.title || 'Course'}</strong>. Use 1-click clipping to anchor claims in authentic primary citations.
        </p>
      </div>

      <div class="header-actions">
        <a 
          href={`#/student?course_id=${encodeURIComponent(courseId)}`} 
          class="btn btn-primary"
          style="padding: 10px 20px; font-size: 13px;"
        >
          ✍️ Resume Reasoning Canvas →
        </a>
      </div>
    </header>

    {#if clippedFeedback}
      <div class="clip-feedback-banner">
        <span>✓ {clippedFeedback}</span>
        <a href={`#/student?course_id=${encodeURIComponent(courseId)}`} class="clip-jump-link">
          Open Canvas to Cite →
        </a>
      </div>
    {/if}

    <!-- Corpus Layout Grid -->
    <div class="reader-layout">
      <!-- Left Document Sidebar -->
      <aside class="corpus-sidebar">
        <div class="sidebar-label">Course Source Repository</div>
        <div class="doc-list">
          {#each allDisplayDocuments as doc (doc.key)}
            <button
              class="doc-selector-btn"
              class:active={activeDocKey === doc.key}
              onclick={() => activeDocKey = doc.key}
            >
              <div class="doc-btn-top">
                <span class="doc-author">{doc.author}</span>
                <span class="doc-date">{doc.date}</span>
              </div>
              <div class="doc-work-title">{doc.work}</div>
            </button>
          {/each}
        </div>

        <div class="sidebar-guide">
          <span class="guide-icon">💡</span>
          <p class="guide-text">
            <strong>Socratic Tip:</strong> Evaluating document provenance and author bias increases your <em>Autonomy Rating</em> and reduces reliance on educator hints.
          </p>
        </div>
      </aside>

      <!-- Right Source Viewer -->
      <section class="document-viewer">
        <div class="doc-header-card">
          <div class="doc-meta-col">
            <span class="doc-kcid">{activeDoc.kc}</span>
            <h2 class="doc-title">{activeDoc.author}: {activeDoc.work}</h2>
            <div class="doc-submeta">
              <span>Date: <strong>{activeDoc.date}</strong></span>
              <span class="meta-dot">•</span>
              <span class="hash-tag">SHA-256: {activeDoc.sha}</span>
            </div>
            {#if activeDoc.downloadUrl}
              <div style="margin-top: 10px;">
                <a
                  href={activeDoc.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: var(--radius-xs); background: rgba(56, 189, 248, 0.15); color: var(--color-horizon-bright); border: 1px solid rgba(56, 189, 248, 0.4); text-decoration: none;"
                  title="Open authentic source document in new browser tab"
                >
                  <span>📕</span> Open Authentic Source Document (PDF ↗)
                </a>
              </div>
            {/if}
          </div>

          <button
            class="btn btn-primary clip-action-btn"
            onclick={() => clipExcerpt(activeDoc)}
          >
            📎 Clip Excerpt to Canvas
          </button>
        </div>

        <!-- Provenance & Historical Context -->
        <div class="provenance-box">
          <h3 class="provenance-title">Provenance & Historical Background</h3>
          <p class="provenance-desc">{activeDoc.provenance}</p>
          <p class="synopsis-desc">{activeDoc.synopsis}</p>
        </div>

        <!-- Text Passage -->
        <div class="passage-box">
          <div class="passage-label">ARCHIVAL PASSAGE EXCERPT</div>
          <blockquote class="passage-quote">
            "{activeDoc.passage}"
          </blockquote>
        </div>

        <!-- Pedagogical Socratic Question -->
        <div class="socratic-prompt-box">
          <span class="prompt-icon">🤔</span>
          <div>
            <h4 class="prompt-title">Guiding Epistemic Inquiry</h4>
            <p class="prompt-text">{activeDoc.pedagogicalPrompt}</p>
          </div>
        </div>

        <!-- Bottom Action Strip -->
        <div class="viewer-footer">
          <div class="footer-note">
            Ready to integrate this evidence into your claim structure?
          </div>
          <div style="display: flex; gap: 10px;">
            <button
              class="btn btn-secondary"
              onclick={() => clipExcerpt(activeDoc)}
              style="font-size: 12.5px; padding: 8px 16px;"
            >
              📎 Clip to Canvas
            </button>
            <a
              href={`#/student?course_id=${encodeURIComponent(courseId)}`}
              class="btn btn-primary"
              style="font-size: 12.5px; padding: 8px 18px;"
            >
              Open Reasoning Canvas →
            </a>
          </div>
        </div>
      </section>
    </div>

  </main>
</div>

<style>
  .sources-page {
    background-color: var(--color-obsidian);
    min-height: calc(100vh - 56px);
    color: var(--color-slate-bright);
  }

  .sources-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 24px 80px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  /* Header */
  .sources-header {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-lg);
    padding: 24px 28px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    box-shadow: var(--shadow-sm);
  }

  .header-breadcrumbs {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--color-slate-muted);
    margin-bottom: 6px;
  }

  .crumb-link {
    color: var(--color-horizon-blue);
    text-decoration: none;
    transition: opacity 0.15s ease;
  }
  .crumb-link:hover {
    text-decoration: underline;
  }

  .crumb-separator {
    color: var(--color-slate-subtle);
  }

  .crumb-current {
    color: var(--color-slate-bright);
  }

  .sources-title {
    font-family: var(--font-brand);
    font-size: 24px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 0;
  }

  .sources-sub {
    font-size: 13px;
    color: var(--color-slate-light);
    margin: 4px 0 0;
    line-height: 1.5;
  }

  /* Clip Feedback */
  .clip-feedback-banner {
    background: var(--color-signal-green-bg);
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: var(--color-signal-green-text);
    padding: 12px 20px;
    border-radius: var(--radius-md);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
    font-weight: 600;
    animation: fadeIn 0.2s ease;
  }

  .clip-jump-link {
    color: var(--color-signal-green-dark);
    font-size: 12px;
    font-weight: 700;
    text-decoration: underline;
  }

  /* Grid Layout */
  .reader-layout {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 24px;
  }

  /* Sidebar */
  .corpus-sidebar {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-md);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: fit-content;
  }

  .sidebar-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--color-slate-muted);
  }

  .doc-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .doc-selector-btn {
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: all 0.15s ease;
    font-family: var(--font-ui);
    color: inherit;
  }

  .doc-selector-btn:hover {
    border-color: var(--color-horizon-blue);
    background: var(--color-graphite-hover);
  }

  .doc-selector-btn.active {
    border-color: var(--color-horizon-blue);
    background: var(--color-horizon-glow);
    border-left: 3px solid var(--color-horizon-blue);
  }

  .doc-btn-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .doc-author {
    font-size: 12px;
    font-weight: 700;
    color: var(--color-heading);
  }

  .doc-date {
    font-size: 11px;
    color: var(--color-slate-muted);
  }

  .doc-work-title {
    font-size: 11.5px;
    color: var(--color-slate-light);
    line-height: 1.4;
  }

  .sidebar-guide {
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    display: flex;
    gap: 10px;
  }

  .guide-icon {
    font-size: 16px;
    line-height: 1.2;
  }

  .guide-text {
    font-size: 11.5px;
    color: var(--color-slate-muted);
    line-height: 1.45;
    margin: 0;
  }

  /* Document Viewer */
  .document-viewer {
    background: var(--color-graphite);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-md);
    padding: 28px 32px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    box-shadow: var(--shadow-sm);
  }

  .doc-header-card {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    border-bottom: 1px solid var(--color-graphite-border);
    padding-bottom: 20px;
  }

  .doc-meta-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .doc-kcid {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.6px;
    color: var(--color-horizon-bright);
    text-transform: uppercase;
  }

  .doc-title {
    font-family: var(--font-brand);
    font-size: 20px;
    font-weight: 700;
    color: var(--color-heading);
    margin: 0;
  }

  .doc-submeta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--color-slate-muted);
  }

  .meta-dot {
    color: var(--color-slate-subtle);
  }

  .hash-tag {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-slate-subtle);
  }

  .clip-action-btn {
    font-size: 12.5px;
    padding: 9px 18px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Provenance */
  .provenance-box {
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    border-radius: var(--radius-sm);
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .provenance-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-slate-muted);
    margin: 0;
  }

  .provenance-desc {
    font-size: 13px;
    color: var(--color-slate-light);
    line-height: 1.55;
    margin: 0;
  }

  .synopsis-desc {
    font-size: 12.5px;
    color: var(--color-slate-muted);
    line-height: 1.5;
    margin: 0;
  }

  /* Archival Passage */
  .passage-box {
    background: var(--color-obsidian);
    border: 1px solid var(--color-graphite-border);
    border-left: 4px solid var(--color-horizon-blue);
    border-radius: var(--radius-sm);
    padding: 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .passage-label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--color-horizon-bright);
  }

  .passage-quote {
    font-family: var(--font-brand);
    font-size: 16px;
    line-height: 1.65;
    color: var(--color-heading);
    margin: 0;
    font-style: italic;
  }

  /* Socratic prompt */
  .socratic-prompt-box {
    background: var(--color-aurora-glow);
    border: 1px solid rgba(2, 132, 199, 0.25);
    border-radius: var(--radius-sm);
    padding: 16px 20px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .prompt-icon {
    font-size: 20px;
    line-height: 1;
  }

  .prompt-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--color-aurora-bright);
    margin: 0 0 4px;
  }

  .prompt-text {
    font-size: 12.5px;
    color: var(--color-slate-light);
    line-height: 1.5;
    margin: 0;
  }

  /* Footer */
  .viewer-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--color-graphite-border);
    padding-top: 20px;
    flex-wrap: wrap;
    gap: 14px;
  }

  .footer-note {
    font-size: 12.5px;
    color: var(--color-slate-muted);
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 860px) {
    .reader-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
